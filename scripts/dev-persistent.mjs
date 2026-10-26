import platform from '../runtime/platform.cjs';
import {serveControl} from './workbench-control.mjs';
import {supervise,inheritedLease,watchSupervisor} from './persistent-supervision.mjs';
import {lifecycleJournal} from './persistent-journal.mjs';
import {installStopHandlers,ownedChildrenExited} from './persistent-lifecycle.mjs';
import {acquireInstanceLock,lockMessage} from './persistent-lock.mjs';
import {createDocker,StartupError,diagnostic,diagnosticText,saveDiagnostic} from './persistent-diagnostics.mjs';
import {devNull} from 'node:os';
// Persistent local business data. Never imports platform cookies or loads .env.
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile,lstat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:net';
import {PrismaClient} from '@prisma/client';
import argon2 from 'argon2';
import modelVault from '../runtime/model-vault.cjs';
import {cleanEnvironment,preflight} from './real-mcp/core.mjs';
const root=resolve(fileURLToPath(new URL('../',import.meta.url))),args=process.argv.slice(2);
let prepareRecovery=false,offline=false,fixture=false,backendOnly=false,name='main';
for(let i=0;i<args.length;i++){if(args[i]==='--backend')backendOnly=true;else if(args[i]==='--prepare-lock-recovery')prepareRecovery=true;else if(args[i]==='--offline')offline=true;else if(args[i]==='--test-fixture')fixture=true;else if(args[i]==='--instance')name=args[++i];else throw Error('Use --offline or --instance NAME');}
if(!/^[a-z][a-z0-9-]{0,50}$/.test(name)||fixture&&(!offline||!/^acceptance-[a-f0-9-]{36}$/.test(name)))throw Error('Invalid isolated instance');
// Prisma CLI can auto-load .env. Refuse legacy env files without reading them.
for(const path of [join(root,'.env'),join(root,'prisma/.env')]){const stat=await lstat(path).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(stat)throw Error('Legacy .env exists; persistent startup refuses to read it. Review environment separation before continuing.');}
const callerEnvironment={...process.env};delete callerEnvironment.CRM_SUPERVISED_BOOT;delete callerEnvironment.CRM_SUPERVISOR_PID;delete callerEnvironment.CRM_SUPERVISED_LAUNCHER;
const envBase=cleanEnvironment(callerEnvironment);
if(process.platform==='win32'){
 const result=spawnSync(process.execPath,['scripts/build-windows-host.mjs'],{cwd:root,stdio:'inherit'});if(result.status!==0)throw Error('Windows helper unavailable; nothing started');
 await platform.guardCurrentProcess();
}
const directory=join(root,'.local',offline?'persistent-offline':'persistent',name);
if(!offline&&!prepareRecovery)await preflight({root,home:process.env.HOME,session:'persistent-preflight',port:18162,env:envBase});
process.umask(0o077);
const children=[],ownedGroups=new Set(),startedContainers=[];
let journal,supervisorLife,control;const managed=!!process.env.CRM_SUPERVISED_BOOT;const launchId=randomUUID();
process.on('exit',code=>{journal?.record('EXIT',{code});journal?.close();});
let stage='local',runtimeFailure,manifest,secret,lock=false,stopping=false,finish,failed=false,newInstance=false;
const stopped=new Promise(ok=>{finish=ok;});
const safeError=()=>console.error('持久工作台操作失败；数据卷与本地配置保留。请检查依赖、端口和本次运行记录，不要删除或重建已有数据。');
const dockerClient=createDocker(envBase),docker=dockerClient.execute,existsDocker=dockerClient.exists;
async function privateDir(path){await platform.privateDirectory(path,true);}
async function privateFile(path){await platform.privateFile(path);}
async function json(path){await privateFile(path);return JSON.parse(await readFile(path,'utf8'));}
async function freePort(){const s=createServer();await new Promise((ok,no)=>{s.once('error',no);s.listen(0,'127.0.0.1',ok);});const p=s.address().port;await new Promise(ok=>s.close(ok));if([18060,18061].includes(p))return freePort();return p;}
function stopGroup(c){if(c?.pid&&c.exitCode===null&&c.signalCode===null)try{if(process.platform==='win32'||managed||c.interactive)c.kill('SIGTERM');else process.kill(-c.pid,'SIGTERM');}catch{}}
function launch(command,argv,env,{interactive=false,ipc=false,role='local-command'}={}){if(command==='npm')[command,argv]=platform.npmCommand(argv);if(stopping)throw Error('Stopped');const c=spawn(command,argv,{cwd:root,env,detached:process.platform!=='win32'&&!interactive&&!managed,windowsHide:!interactive,stdio:managed?[interactive?'inherit':'ignore',interactive?'inherit':ipc?'ignore':'pipe',interactive?'inherit':ipc?'ignore':'pipe',ipc?'ipc':'ignore',4]:interactive?'inherit':ipc?['ignore','ignore','ignore','ipc']:['ignore','pipe','pipe']});c.interactive=interactive;children.push(c);journal?.record('CHILD_START',{pid:c.pid,role});if(!interactive&&!ipc){c.stdout.on('data',()=>{});c.stderr.on('data',()=>{});}c.done=new Promise(ok=>{c.once('exit',(code,signal)=>{journal?.record('CHILD_EXIT',{pid:c.pid,role,code,signal});ok(code??1);});c.once('error',()=>ok(1));});if(ipc)c.on('message',m=>{if(!Number.isInteger(m?.pid)||m.pid<=1)return;if(m.kind==='OWNED_LOGIN_PROCESS_STARTED')ownedGroups.add(m.pid);if(m.kind==='OWNED_LOGIN_PROCESS_STOPPED')ownedGroups.delete(m.pid);});return c;}
async function command(argv,env,interactive=false){console.log(`本地步骤：${argv.slice(0,4).join(' ')}`);const c=launch(argv[0],argv.slice(1),env,{interactive});const code=await c.done;if(code!==0)throw new StartupError('LOCAL_COMMAND_FAILED',code);}
function resourceLabels(type,id){return JSON.parse(docker(type==='volume'?['volume','inspect','--format','{{json .Labels}}',id]:['inspect','--format','{{json .Config.Labels}}',id]));}
function verifyOwnership(type,id){if(resourceLabels(type,id)?.['crm.persistent.instance']!==manifest.id)throw Error('Resource ownership mismatch');}
function volume(id){if(existsDocker('volume',id)){verifyOwnership('volume',id);return;}if(!newInstance)throw Error('Existing persistent volume missing; refusing to silently create an empty database');docker(['volume','create','--label',`crm.persistent.instance=${manifest.id}`,id]);}
async function container(kind){const spec=manifest[kind],image=kind==='postgres'?'postgres:17':'redis:7-alpine',inner=kind==='postgres'?5432:6379;
 if(existsDocker('container',spec.container)){verifyOwnership('container',spec.container);const mounts=JSON.parse(docker(['inspect','--format','{{json .Mounts}}',spec.container]));if(!mounts.some(m=>m.Type==='volume'&&m.Name===spec.volume))throw Error('Persistent mount mismatch');const ports=JSON.parse(docker(['inspect','--format','{{json .HostConfig.PortBindings}}',spec.container]));if(ports[`${inner}/tcp`]?.[0]?.HostIp!=='127.0.0.1'||Number(ports[`${inner}/tcp`]?.[0]?.HostPort)!==spec.port)throw Error('Port mapping mismatch');if(docker(['inspect','--format','{{.State.Running}}',spec.container])==='true')return;
  docker(['start',spec.container]);startedContainers.push(spec.container);
 }else{
  docker(['run','--detach','--pull=never','--name',spec.container,'--label',`crm.persistent.instance=${manifest.id}`,'-p',`127.0.0.1:${spec.port}:${inner}`,'-v',`${spec.volume}:${kind==='postgres'?'/var/lib/postgresql/data':'/data'}`,...(kind==='postgres'?['-e','POSTGRES_USER=crm','-e',`POSTGRES_DB=${manifest.database}`,'-e','POSTGRES_PASSWORD']:[]),image,...(kind==='redis'?['redis-server','--appendonly','yes']:[])],{POSTGRES_PASSWORD:secret.databasePassword});startedContainers.push(spec.container);
 }
}
installStopHandlers(signal=>{journal?.record('STOP_REQUESTED',{signal});stopping=true;finish();for(const c of children)stopGroup(c);});
for(const stream of [process.stdout,process.stderr])stream.on('error',()=>{journal?.record('OUTPUT_CLOSED');stopping=true;finish();for(const c of children)stopGroup(c);});
// Windows ChildProcess.kill is forceful. Only the owned offline test fixture accepts this IPC stop.
if(process.platform==='win32'&&fixture&&process.connected)process.on('message',m=>{if(m?.kind==='STOP_OWNED_FIXTURE'){stopping=true;finish();for(const c of children)stopGroup(c);}});
try{
 // Do not adopt a symlinked .local or alter existing directory permissions.
 if(process.platform==='win32')await privateDir(join(root,'.local'));else await mkdir(join(root,'.local'),{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e;});const ls=await lstat(join(root,'.local'));if(ls.isSymbolicLink()||!ls.isDirectory())throw Error('Unsafe local directory');
 await privateDir(join(root,'.local',offline?'persistent-offline':'persistent'));await privateDir(directory);
 if(process.platform==='darwin'&&!prepareRecovery&&!managed)process.exit(await supervise({root,directory,args,env:envBase}));
 if(managed){inheritedLease(directory);supervisorLife=watchSupervisor(()=>{stopping=true;finish();process.kill(-process.pid,'SIGTERM');setTimeout(()=>process.kill(-process.pid,'SIGKILL'),3000).unref();});}
 stage='lock';const acquired=await acquireInstanceLock({root,directory,name,mode:offline?'offline':'real',prepareRecovery});
 if(acquired.prepared){
  console.log('已记录本次 Mac 启动标识与原锁/实例配置摘要；没有删除锁、停止服务或读取凭据。请正常保存工作并重启 Mac；Docker 可用后在同一目录运行原启动命令。未重启前不会恢复。');
 }else{
 lock=acquired;journal=lifecycleJournal(directory,launchId);journal.record('START',{pid:process.pid,ppid:process.ppid});if(stopping)throw Error('Stopped');lock.lost.catch(e=>{console.error(lockMessage(e.code)||'系统锁失效');failed=true;stopping=true;finish();for(const c of children)stopGroup(c);});
 if(lock.recovered)console.log('已核验原实例与运行互斥，恢复运行记录；继续使用原数据库及端口。');
 stage='docker';dockerClient.ready();
 stage='images';for(const image of ['postgres:17','redis:7-alpine'])dockerClient.image(image);
 stage='instance';
 try{manifest=await json(join(directory,'instance.json'));}catch(e){if(e.code!=='ENOENT')throw e;
  newInstance=true;const id=randomUUID(),prefix=`crm-persist-${id}`;manifest={kind:'crm-persistent-v1',id,name,root,mode:offline?'offline':'real',fixture,database:fixture?'crm_persistent_test':'crm',apiPort:await freePort(),webPort:await freePort(),deviceId:randomUUID(),postgres:{container:prefix+'-pg',volume:prefix+'-pg-data',port:await freePort()},redis:{container:prefix+'-redis',volume:prefix+'-redis-data',port:await freePort()},createdAt:new Date().toISOString(),fresh:true};
  secret={databasePassword:randomBytes(32).toString('hex')};await writeFile(join(directory,'secret.json'),JSON.stringify(secret),{flag:'wx',mode:0o600});await writeFile(join(directory,'instance.json'),JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600});
 }
 if(manifest.kind!=='crm-persistent-v1'||manifest.root!==root||manifest.name!==name||manifest.mode!==(offline?'offline':'real')||manifest.fixture!==fixture)throw Error('Instance mismatch');
 if(!/^[a-f0-9-]{36}$/.test(manifest.id)||!/^[a-f0-9-]{36}$/.test(manifest.deviceId)||manifest.database!==(fixture?'crm_persistent_test':'crm'))throw Error('Invalid instance metadata');
 for(const p of [manifest.apiPort,manifest.webPort,manifest.postgres?.port,manifest.redis?.port])if(!Number.isInteger(p)||p<1024||p>65535||[18060,18061].includes(p))throw Error('Invalid saved port');
 for(const [kind,suffix] of [['postgres','pg'],['redis','redis']])if(manifest[kind].container!==`crm-persist-${manifest.id}-${suffix}`||manifest[kind].volume!==`crm-persist-${manifest.id}-${suffix}-data`)throw Error('Invalid resource reference');
 if(managed)control=await serveControl({root,directory,instanceId:manifest.id,role:'backend',phase:()=>stopping?'stopping':stage==='services'?'running':'starting',onStop:()=>process.emit('SIGINT')});
 stage='credentials';secret ||=await json(join(directory,'secret.json'));if(!/^[a-f0-9]{64}$/.test(secret.databasePassword))throw Error('Invalid local database credential');
 stage='volumes';volume(manifest.postgres.volume);volume(manifest.redis.volume);
 stage='containers';await container('postgres');await container('redis');
 stage='readiness';for(const [kind,cmd] of [['postgres',['pg_isready','-U','crm','-d',manifest.database]],['redis',['redis-cli','ping']]]){let ready=false;for(let i=0;i<60&&!stopping;i++){if(spawnSync('docker',['exec',manifest[kind].container,...cmd],{stdio:'ignore',timeout:1000}).status===0){ready=true;break;}await new Promise(ok=>setTimeout(ok,200));}if(!ready)throw Error('Readiness timeout');}
 const base=`http://127.0.0.1:${manifest.webPort}`,url=`postgresql://crm:${secret.databasePassword}@127.0.0.1:${manifest.postgres.port}/${manifest.database}?schema=public`;
 const env={...envBase,...(managed?{CRM_SUPERVISED_BOOT:process.env.CRM_SUPERVISED_BOOT}:{}),DATABASE_URL:url,REDIS_URL:`redis://127.0.0.1:${manifest.redis.port}`,DOTENV_CONFIG_PATH:devNull,XHS_MCP_ENABLED:'0',XHS_MCP_LOGIN_ONLY:'0',CRM_ACCOUNT_READ_ENABLED:'1',XHS_ACCOUNT_LOGIN_MODE:manifest.mode,CRM_PROJECT_ROOT:root,CRM_DEVICE_ID:manifest.deviceId,CRM_RUNTIME_ID:randomUUID(),CRM_PERSISTENT:'1',CRM_DEVICE_MANAGEMENT:'1',CRM_INSTANCE_DIRECTORY:directory,XHS_SESSION_ROOT:offline?join(directory,'local-sessions'):join(root,'.local/xhs-qr'),PORT:String(manifest.apiPort),API_HOST:'127.0.0.1',APP_ORIGIN:base,API_PROXY_TARGET:`http://127.0.0.1:${manifest.apiPort}`,COOKIE_SECURE:'false',COLLECTION_QUEUE_NAME:`crm-persist-${manifest.id}`};
 stage='generate';await command(['npm','exec','--no','--','prisma','generate'],env);
 stage='migrate';await command(['npm','exec','--no','--','prisma','migrate','deploy'],env);
 stage='build';for(const workspace of ['@crm/contracts','@crm/api'])await command(['npm','run','build','-w',workspace],env);
 stage='admin';const db=new PrismaClient({datasources:{db:{url}}});let adminCount;try{adminCount=await db.user.count({where:{role:'ADMIN'}});if(!adminCount&&fixture){const password=randomBytes(20).toString('hex'),passwordHash=await argon2.hash(password);await db.user.createMany({data:[{email:'admin@persistent.invalid',name:'离线持久管理员',role:'ADMIN',passwordHash},{email:'sales@persistent.invalid',name:'离线持久销售',role:'SALES',passwordHash}]});console.log(`OFFLINE FIXTURE PASSWORD (memory only): ${password}`);adminCount=1;}}finally{await db.$disconnect();}
 if(!adminCount){if(!process.stdin.isTTY)throw Error('First startup requires interactive administrator initialization');console.log('此持久库尚无 CRM 管理员：现在创建本地工作台账号。邮箱只作登录标识，不发送邮件，与小红书扫码无关。');await command(['npm','exec','--no','--','tsx','scripts/init-user.ts','admin'],env,true);}
 if(adminCount&&!fixture)console.log('已存在 CRM 管理员，跳过创建；网页使用原账号登录。启动器仅检查是否存在启用的管理员，不要求再次输入密码。');
 const checkDb=new PrismaClient({datasources:{db:{url}}});try{if(!await checkDb.user.count({where:{role:'ADMIN',active:true}}))throw Error('Administrator initialization incomplete');}finally{await checkDb.$disconnect();}
 manifest.fresh=false;await writeFile(join(directory,'instance.json'),JSON.stringify(manifest,null,2),{mode:0o600});
 stage='services';const collector=launch(process.execPath,['apps/api/dist/collection/worker.js'],{...env,CRM_MODEL_VAULT_FILE:modelVault.vaultPath(manifest.id)},{ipc:true,role:'collector'});
 const api=launch(process.execPath,['apps/api/dist/main.js'],{...env,CRM_MODEL_VAULT_FILE:modelVault.vaultPath(manifest.id)},{ipc:true,role:'api'});const web=backendOnly?null:launch('npm',['run','dev','-w','@crm/web','--','--port',String(manifest.webPort),'--host','127.0.0.1','--strictPort'],env,{role:'web'});
 for(const c of [api,web,collector].filter(Boolean))c.done.then(code=>{if(!stopping){failed=true;runtimeFailure=new StartupError('SERVICE_EXITED',code);}finish();});
 await writeFile(join(directory,'running.json'),JSON.stringify({pid:process.pid,controllerPid:managed?process.ppid:process.pid,launcherPid:managed?Number(process.env.CRM_SUPERVISED_LAUNCHER):process.pid,backendOnly,launchId,lifecycleLog:journal.file,mode:manifest.mode,preview:base,api:env.API_PROXY_TARGET,deviceId:manifest.deviceId,instanceId:manifest.id,containers:[manifest.postgres.container,manifest.redis.container]},null,2),{mode:0o600});
 console.log(`PERSISTENT ${manifest.mode.toUpperCase()} workbench: ${base}`);console.log(`Instance: ${directory}`);console.log('Business data and device references survive Ctrl+C. No automatic platform request. Existing administrators are never replaced.');
 await stopped;if(runtimeFailure)throw runtimeFailure;
 }
}catch(e){
 safeError();const report=diagnostic(e,stage);
 const recoveryCommand=`npm run dev:persistent -- ${offline?'--offline ':''}${name==='main'?'':`--instance ${name} `}--prepare-lock-recovery`;
 const detail=lockMessage(e?.code)?.replace('npm run dev:persistent -- --prepare-lock-recovery',recoveryCommand);
 if(detail)report.message=detail;
 console.error(diagnosticText(report));
 if(lock)try{await saveDiagnostic(directory,report);}catch{console.error('未能写入脱敏失败记录；请保留上面的错误代码和阶段。');}
 if(e?.code==='EEXIST')console.error('实例已被占用或锁文件存在；没有覆盖。请检查原启动终端。');process.exitCode=1;
}
finally{
 stopping=true;for(const pid of process.platform==='win32'||managed?[]:ownedGroups)try{process.kill(-pid,'SIGTERM');}catch{}
 for(const c of children)stopGroup(c);if(children.length)await new Promise(ok=>setTimeout(ok,1800));
 for(const pid of process.platform==='win32'||managed?[]:ownedGroups)try{process.kill(-pid,'SIGKILL');}catch{}
 for(const c of children)if(process.platform!=='win32'&&c.exitCode===null&&c.signalCode===null&&c.pid)try{if(managed)c.kill('SIGKILL');else process.kill(-c.pid,'SIGKILL');}catch{}
 const childrenExited=await ownedChildrenExited(children);
 if(!childrenExited){process.exitCode=1;console.error(diagnosticText(diagnostic(new StartupError('LOCK_CLEANUP_INCOMPLETE'),'cleanup')));}
 // Database/Redis have an independent lifetime. Never stop or remove them on app exit.
 if(lock){try{if(childrenExited)await writeFile(join(directory,'stopped.json'),JSON.stringify({stoppedAt:new Date().toISOString(),dataVolumesRetained:true,platformSessionsRetained:true}),{mode:0o600});}catch{process.exitCode=1;console.error('退出记录写入失败；数据保留。');}finally{try{await lock.release({preserve:!childrenExited});}catch{process.exitCode=1;console.error('锁释放失败；原锁/数据保留，下一次启动仍需验证。');}}}
 await control?.close();
 journal?.record(childrenExited&&process.exitCode!==1?'CLEANUP_COMPLETE':'CLEANUP_INCOMPLETE');
 if(failed)process.exitCode=1;
 console.log(!childrenExited?'未能确认本次子进程退出；实例锁保留。':children.length||startedContainers.length?'Stopped owned processes. Persistent containers/volumes, business data and local session references retained.':'本次没有启动或停止业务进程/容器；原实例、数据与端口保留。');
 supervisorLife?.destroy();
 if(process.platform==='win32')process.exit(process.exitCode||0); // guardian EOF closes the entire owned job, including orphaned grandchildren
}
