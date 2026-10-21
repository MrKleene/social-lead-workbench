import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import platform from '../runtime/platform.cjs';
import {cleanEnvironment} from './real-mcp/core.mjs';
import {launchDetached} from './persistent-background.mjs';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
async function main(){
 if(process.platform!=='darwin')throw Error('MAC_ONLY');
 const args=process.argv.slice(2);let offline=false,fixture=false,name='main';
 for(let i=0;i<args.length;i++){if(args[i]==='--backend')continue;else if(args[i]==='--offline')offline=true;else if(args[i]==='--test-fixture')fixture=true;else if(args[i]==='--instance')name=args[++i];else throw Error('INVALID_ARGUMENTS');}
 if(!/^[a-z][a-z0-9-]{0,50}$/.test(name)||fixture&&(!offline||!/^acceptance-[a-f0-9-]{36}$/.test(name)))throw Error('INVALID_INSTANCE');
 const directory=join(root,'.local',offline?'persistent-offline':'persistent',name);
 // First-run administrator setup stays in the foreground. Never creates a replacement instance.
 await platform.privateDirectory(directory);const path=join(directory,'instance.json');await platform.privateFile(path);
 const manifest=JSON.parse(await readFile(path,'utf8'));
 if(manifest.kind!=='crm-persistent-v1'||manifest.root!==root||manifest.name!==name||manifest.mode!==(offline?'offline':'real')||manifest.fixture!==fixture||![manifest.webPort,manifest.apiPort].every(p=>Number.isInteger(p)&&p>=1024&&p<=65535))throw Error('INSTANCE_MISMATCH');
 const env=cleanEnvironment(process.env),log=join(directory,'launcher-'+randomUUID()+'.log');
 const child=launchDetached(process.execPath,['scripts/dev-persistent.mjs',...args],{cwd:root,log,env});
 let ended=false;child.once('exit',()=>{ended=true;});child.once('error',()=>{ended=true;});
 console.log(JSON.stringify({kind:'crm-background-requested',pid:child.pid,log,preview:`http://127.0.0.1:${manifest.webPort}`}));
 const end=Date.now()+90000;
 while(Date.now()<end&&!ended){
  try{
   const running=JSON.parse(await readFile(join(directory,'running.json'),'utf8'));
   if((running.launcherPid??running.pid)===child.pid&&running.instanceId===manifest.id){
    const api=await fetch(`http://127.0.0.1:${manifest.apiPort}/api/health/ready`,{signal:AbortSignal.timeout(1000),redirect:'error'});
    const web=args.includes('--backend')?{ok:true}:await fetch(`http://127.0.0.1:${manifest.webPort}/`,{signal:AbortSignal.timeout(1000),redirect:'error'});
    if(api.ok&&(await api.json()).database==='ready'&&web.ok){console.log('独立进程已就绪；关闭本次命令会话不会主动停止它。仍沿用原实例锁保护；没有自动平台请求。');return;}
   }
  }catch{}
  await new Promise(ok=>setTimeout(ok,200));
 }
 console.error(ended?'独立启动器已退出；请查看上方私有日志，保留原锁与数据。':'启动结果尚未确认；没有终止进程。先查看上方私有日志，不要重复启动。');
 process.exitCode=1;
}
main().catch(()=>{console.error('独立启动未完成；只支持已有Mac持久实例。请检查参数/私有目录；首次初始化仍用原前台命令。没有清锁或替换数据。');process.exitCode=1;});
