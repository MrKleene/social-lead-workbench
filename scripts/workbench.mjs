// Human-facing lifecycle commands. Never signals stored PIDs or reads database/vault credentials.
import {readFile,lstat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createConnection} from 'node:net';
import {get} from 'node:http';
import platform from '../runtime/platform.cjs';
import {cleanEnvironment} from './real-mcp/core.mjs';
import {processGuard} from './persistent-lock.mjs';
import {askControl} from './workbench-control.mjs';
import {launchDetached} from './persistent-background.mjs';
import {installStopHandlers} from './persistent-lifecycle.mjs';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const pause=ms=>new Promise(ok=>setTimeout(ok,ms));
function parse(args){const command=args.shift();if(!['start','stop','restart','status','dev'].includes(command))throw Error('ARGUMENTS');let name='main',offline=false,fixture=false;for(let i=0;i<args.length;i++){if(args[i]==='--offline')offline=true;else if(args[i]==='--test-fixture')fixture=true;else if(args[i]==='--instance')name=args[++i];else throw Error('ARGUMENTS');}if(!/^[a-z][a-z0-9-]{0,50}$/.test(name)||fixture&&(!offline||!/^acceptance-[a-f0-9-]{36}$/.test(name)))throw Error('ARGUMENTS');return {command,name,offline,fixture};}
async function portOpen(port){return new Promise(ok=>{const s=createConnection({host:'127.0.0.1',port});const finish=v=>{s.destroy();ok(v);};s.setTimeout(600,()=>finish(false));s.once('connect',()=>finish(true));s.once('error',()=>finish(false));});}
// One short-lived loopback connection per probe: no pooled sockets across service shutdown.
async function healthy(port,role){return new Promise(ok=>{
 let settled=false,req;const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);req?.destroy();ok(value);},timer=setTimeout(()=>finish(false),1000);
 req=get({host:'127.0.0.1',port,path:role==='backend'?'/api/health/ready':'/',agent:false},res=>{
  res.on('error',()=>finish(false));if(res.statusCode<200||res.statusCode>=300){finish(false);return;}if(role==='web'){finish(true);return;}
  let body='';res.on('data',part=>{body+=part;if(body.length>4096)finish(false);});res.on('end',()=>{try{finish(JSON.parse(body).database==='ready');}catch{finish(false);}});
 });req.on('error',()=>finish(false));
});}
async function guardFree(directory,role){const name=role==='backend'?'.operation.guard':'.web.guard';try{await lstat(join(directory,name));}catch(e){if(e.code==='ENOENT')return true;throw e;}let g;try{g=await processGuard(root,directory,name);return true;}catch(e){if(e.code==='LOCK_ACTIVE')return false;throw e;}finally{await g?.release();}}
async function state(context,role){const control=await askControl({...context,role}),port=role==='backend'?context.manifest.apiPort:context.manifest.webPort;
 if(control)return {role,state:control.phase,healthy:await healthy(port,role),generation:control.generation,pid:control.pid};
 const open=await portOpen(port),free=await guardFree(context.directory,role);
 return {role,state:open?'legacy-or-unmanaged':free?'stopped':'starting-or-stopping',healthy:open?await healthy(port,role):false};
}
async function states(ctx){return Promise.all(['backend','web'].map(role=>state(ctx,role)));}
async function waitStopped(ctx,role){const until=Date.now()+30000;while(Date.now()<until){const s=await state(ctx,role);if(s.state==='stopped')return;if(s.state==='legacy-or-unmanaged')throw Error('OWNER_CHANGED');await pause(100);}throw Error('STOP_PENDING');}
async function stopAll(ctx){const before=await states(ctx);if(before.some(s=>['legacy-or-unmanaged','starting-or-stopping'].includes(s.state)))throw Error('LEGACY_OR_UNCERTAIN');
 for(const role of ['web','backend']){const old=before.find(s=>s.role===role);if(old.state==='stopped')continue;const reply=await askControl({...ctx,role},'stop');if(!reply||reply.generation!==old.generation)throw Error('OWNER_CHANGED');await waitStopped(ctx,role);}
 console.log('已正常停止网页与 API/采集 worker；数据库、Redis、业务数据、会话与密钥库保留。');
}
async function launchBackend(ctx,args){const child=spawn(process.execPath,['scripts/dev-persistent-background.mjs',...args,'--backend'],{cwd:root,env:cleanEnvironment(process.env),stdio:'inherit'});const code=await new Promise((ok,no)=>{child.once('error',no);child.once('exit',ok);});if(code!==0)throw Error('START_PENDING');}
async function launchWeb(ctx,args){const log=join(ctx.directory,'web-'+randomUUID()+'.log');const child=launchDetached(process.execPath,['scripts/dev-persistent-web.mjs',...args],{cwd:root,log,env:cleanEnvironment(process.env)});let ended=false;child.once('exit',()=>ended=true);child.once('error',()=>ended=true);const until=Date.now()+30000;
 while(Date.now()<until&&!ended){const s=await state(ctx,'web');if(s.state==='running'&&s.healthy)return;await pause(100);}console.error('网页启动未确认，私有日志：'+log);throw Error('START_PENDING');}
async function startAll(ctx,opt){const before=await states(ctx);if(before.some(s=>s.state==='legacy-or-unmanaged')){console.log('旧入口或未受新控制通道管理的服务已占用端口；未启动第二份。先用原终端正常退出，再使用 npm start；不要按旧 PID 或进程名杀进程。');throw Error('LEGACY_OR_UNCERTAIN');}
 if(before.some(s=>!['running','stopped'].includes(s.state)))throw Error('START_PENDING');
 if(before.every(s=>s.state==='running'&&s.healthy)){console.log('工作台已运行；未重复启动。');return;}
 if(before.some(s=>s.state==='running'&&!s.healthy))throw Error('UNHEALTHY');
 const args=[...(opt.offline?['--offline']:[]),'--instance',opt.name];
 if(before[0].state==='stopped')await launchBackend(ctx,[...args,...(opt.fixture?['--test-fixture']:[])]);
 if(before[1].state==='stopped')await launchWeb(ctx,args);
 console.log('工作台已后台就绪：'+`http://127.0.0.1:${ctx.manifest.webPort}`+'；关闭终端不停止，使用 npm stop 正常退出。');
}
async function develop(ctx,opt,release){
 const current=await state(ctx,'web');if(['legacy-or-unmanaged','starting-or-stopping'].includes(current.state))throw Error('LEGACY_OR_UNCERTAIN');
 if(current.state!=='stopped'){const reply=await askControl({...ctx,role:'web'},'stop');if(!reply||reply.generation!==current.generation)throw Error('OWNER_CHANGED');await waitStopped(ctx,'web');}
 const args=[...(opt.offline?['--offline']:[]),'--instance',opt.name];
 const child=spawn(process.execPath,['scripts/dev-persistent-web.mjs',...args],{cwd:root,env:cleanEnvironment(process.env),stdio:'inherit'});let ended=false,interrupted=false;
 const done=new Promise(ok=>{child.once('exit',code=>{ended=true;ok(code??1);});child.once('error',()=>{ended=true;ok(1);});});
 const remove=installStopHandlers(()=>{interrupted=true;child.kill('SIGINT');});
 try{const until=Date.now()+30000;let ready=false;while(Date.now()<until&&!ended&&!interrupted){const s=await state(ctx,'web');if(s.state==='running'&&s.healthy){ready=true;break;}await pause(100);}await release();if(!ready&&!interrupted){child.kill('SIGINT');await done;throw Error('START_PENDING');}if(ready)console.log('前端开发已就绪；Ctrl+C 只停止此前端，API/worker与数据库不受影响。');const code=await done;process.exitCode=interrupted?0:code;}finally{remove();}
}
async function main(){
 if(process.platform!=='darwin')throw Error('MAC_ONLY');const opt=parse(process.argv.slice(2)),directory=join(root,'.local',opt.offline?'persistent-offline':'persistent',opt.name);
 await platform.privateDirectory(directory);await platform.privateFile(join(directory,'instance.json'));const m=JSON.parse(await readFile(join(directory,'instance.json'),'utf8'));
 if(m.kind!=='crm-persistent-v1'||m.root!==root||m.name!==opt.name||m.mode!==(opt.offline?'offline':'real')||m.fixture!==opt.fixture||!/^[a-f0-9-]{36}$/.test(m.id)||![m.apiPort,m.webPort].every(p=>Number.isInteger(p)&&p>=1024&&p<=65535))throw Error('INSTANCE_MISMATCH');
 const ctx={root,directory,instanceId:m.id,manifest:m};
 if(opt.command==='status'){console.log(JSON.stringify({instance:opt.name,url:`http://127.0.0.1:${m.webPort}`,services:await states(ctx),database:'独立保留；本命令不读取凭据或启停容器'},null,2));return;}
 const lease=await processGuard(root,directory,'.command.guard');let lost=false;lease.lost.catch(()=>{lost=true;});
 let released=false;const release=async()=>{if(!released){released=true;await lease.release();}};
 try{if(opt.command==='dev'){await develop(ctx,opt,release);return;}if(opt.command==='stop'||opt.command==='restart')await stopAll(ctx);if(lost)throw Error('COMMAND_LOCK_LOST');if(opt.command==='start'||opt.command==='restart')await startAll(ctx,opt);}finally{await release();}
}
main().catch(e=>{const code=['ARGUMENTS','MAC_ONLY','INSTANCE_MISMATCH','LEGACY_OR_UNCERTAIN','OWNER_CHANGED','STOP_PENDING','START_PENDING','UNHEALTHY','COMMAND_LOCK_LOST','LOCK_ACTIVE','CONTROL_IDENTITY','CONTROL_UNSAFE','CONTROL_METADATA','CONTROL_PROTOCOL','CONTROL_TIMEOUT'].includes(e.message)?e.message:'LOCAL_STATE_UNAVAILABLE';console.error('工作台命令未完成：'+code+'。没有清锁、删除数据或向未知 PID 发信号。旧实例需先按原方式正常退出；首次初始化用 npm run dev:persistent。结果未确认时先运行 npm run status，不要反复启动。');process.exitCode=1;});
