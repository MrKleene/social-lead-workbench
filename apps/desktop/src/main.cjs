'use strict';
const {app,BrowserWindow,protocol,ipcMain,dialog,screen}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const {LocalDatabase,LocalError}=require('@crm/local-runtime/database');
const {SCHEMA_VERSION}=require('@crm/local-runtime/migrations');
const {CredentialStore}=require('@crm/local-runtime/credentials');
const {LocalService}=require('@crm/local-runtime/service');
const {validateCall}=require('./ipc-policy.cjs');
const {createProtector}=require('./local-crypto.cjs');
const {windowsNative}=require('./windows-native.cjs');
const {LocalRunner}=require('@crm/local-runtime/runner');
const {LocalEvidence}=require('@crm/local-runtime/evidence');
const {definitions:builtinConfigurations}=require('@crm/local-runtime/builtin-configurations');
const evidenceWire=require('./evidence-wire.cjs');
const {LocalAccounts}=require('@crm/local-runtime/accounts');
const {LocalSendExecutor}=require('@crm/local-runtime/send-executor');
const sendWire=require('./send-wire.cjs');
const {inspectAccountRestriction}=require('./inspection-wire.cjs');
const {LocalInboxExecutor}=require('@crm/local-runtime/inbox-executor');
const {DesktopInboxWire}=require('./inbox-wire.cjs');
const {LocalCollectionExecutor}=require('@crm/local-runtime/collection-executor');
const {NativeResources}=require('./native-resources.cjs');
const {DesktopPlatformRuntime}=require('./platform-runtime.cjs');
const {LocalModelExecutor}=require('@crm/local-runtime/model-executor');
const os=require('node:os');
protocol.registerSchemesAsPrivileged([{scheme:'workbench',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
const root=path.resolve(__dirname,'../../..');let window,store,service,runner,accounts,evidence,ticker,smokeDirectory,closing=false,pendingSends=0,forceClose=false,operations=Promise.resolve();
function removeSmokeDirectory(){if(!smokeDirectory)return;const target=smokeDirectory;smokeDirectory=null;try{fs.rmSync(target,{recursive:true,force:true,maxRetries:10,retryDelay:100});}catch{}}
// Separate app identity/data from the existing production workbench.
app.setName('SocialLeadDesktop');
function privateDirectory(p){
 if(process.platform==='win32'){
  windowsNative(app,{operation:'directory',path:p,create:true});
 }else{if(!fs.existsSync(p))fs.mkdirSync(p,{mode:0o700});const s=fs.lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o077))throw Error('PRIVATE_DATA_DIRECTORY_REQUIRED');}
 return fs.realpathSync(p);
}
function confirmPendingSends(){
 if(forceClose||closing||pendingSends<1)return true;
 const choice=dialog.showMessageBoxSync(window,{type:'warning',buttons:['取消发送并关闭','继续发送'],defaultId:1,cancelId:1,noLink:true,title:'还有消息未发送',message:`关闭应用将取消 ${pendingSends} 条未发送消息。`});
 if(choice!==0)return false;
 forceClose=true;pendingSends=0;return true;
}
async function main(){
 if(!['darwin','win32'].includes(process.platform))throw Error('UNSUPPORTED_DESKTOP_PLATFORM');
 const smoke=process.argv.includes('--self-test'),fixtureFlag=process.argv.indexOf('--test-fixture');if(smoke&&fixtureFlag>=0)throw Error('CONFLICTING_TEST_ARGUMENTS');
 const devFlag=process.argv.includes('--dev');if(devFlag&&app.isPackaged)throw Error('DEV_MODE_NOT_ALLOWED_IN_PACKAGED_BUILD');
 const devUrl=devFlag?(process.env.WORKBENCH_DEV_URL||'http://127.0.0.1:5173/'):null,devOrigin=devUrl?new URL(devUrl).origin:null;
 if(smoke){smokeDirectory=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'social-lead-desktop-ui-')));fs.writeFileSync(path.join(smokeDirectory,'.fixture'),'synthetic-only',{mode:0o600});}
 const fixture=smokeDirectory||(fixtureFlag>=0?process.argv[fixtureFlag+1]:null);
 if(fixture&&(app.isPackaged&&!smoke||!path.isAbsolute(fixture)||fs.realpathSync(fixture)!==fixture||path.dirname(fixture)!==fs.realpathSync(os.tmpdir())||!path.basename(fixture).startsWith('social-lead-desktop-ui-')||fs.readFileSync(path.join(fixture,'.fixture'),'utf8')!=='synthetic-only'))throw Error('INVALID_TEST_FIXTURE');
 const parent=fixture?null:process.platform==='win32'?windowsNative(app,{operation:'info'}):app.getPath('appData');
 const data=fixture||privateDirectory(path.join(parent,'SocialLeadDesktop'));app.setPath('userData',data);
 if(!app.requestSingleInstanceLock()){app.quit();return;}
 app.on('second-instance',()=>{window?.show();window?.focus();});
 await app.whenReady();
 // 开发态没有打包产物，Dock 会显示 Electron 默认图标；显式换成本项目的图标。
 if(process.platform==='darwin'&&!app.isPackaged&&app.dock)app.dock.setIcon(path.join(root,'apps/desktop/build/icon.png'));
 const credentials=privateDirectory(path.join(data,'credentials'));
 // 凭据加密用本机派生密钥，不再依赖 Electron safeStorage / 系统钥匙串，理由见 local-crypto.cjs。
 const protector=createProtector({fixture:!!fixture});
 const checkPrivateFile=file=>{if(process.platform==='win32')windowsNative(app,{operation:'file',path:file});};
 // 旧库（迁移 squash 前的 user_version 高于当前基线）无法就地迁移，启动前先探测并让用户重建。
 const userVersion=file=>{try{const fd=fs.openSync(file,'r'),head=Buffer.alloc(100),read=fs.readSync(fd,head,0,100,0);fs.closeSync(fd);if(read<100||head.toString('latin1',0,15)!=='SQLite format 3')return 0;return head.readUInt32BE(60);}catch{return 0;}};
 const databasePath=path.join(data,'workbench.sqlite'),diskVersion=userVersion(databasePath);
 if(diskVersion>SCHEMA_VERSION){const choice=dialog.showMessageBoxSync({type:'warning',buttons:['重建并启动','退出'],defaultId:0,cancelId:1,noLink:true,title:'需要重建数据库',message:`检测到旧版数据库（v${diskVersion}）。`,detail:'重建会清空本机数据，旧文件保留为副本。'});if(choice!==0){app.quit();return;}const stamp=new Date().toISOString().replace(/[:.]/g,'-');for(const suffix of ['','-wal','-shm']){const from=databasePath+suffix;if(fs.existsSync(from))fs.renameSync(from,databasePath+'.v'+diskVersion+'-backup-'+stamp+suffix);}}
 const vault=new CredentialStore(credentials,protector,{checkPrivateFile});store=new LocalDatabase(databasePath,{checkPrivateFile});
 const resources=new NativeResources(app.isPackaged?path.join(process.resourcesPath,'native',process.platform+'-'+process.arch):path.join(root,'apps/desktop/dist/native',process.platform+'-'+process.arch),{windowsCheck:(file,directory)=>windowsNative(app,{operation:directory?'resource-directory':'executable',path:file})});
 // 未打包时把平台 helper 的 stderr 接到主进程终端：扫码/采集/发送失败能直接看到 Go 侧原因
 // （logrus 默认写 stderr）。每次拉起浏览器都有 4-5 行 info，扫码期间每 2 秒一次会把终端刷满，
 // 所以默认只留 warn/error 与扫码相关的几条；WORKBENCH_PLATFORM_LOG=all 放开全部。
 // 打包后一律丢弃，平台日志不进用户环境。
 const verbosePlatformLog=!app.isPackaged&&process.env.WORKBENCH_PLATFORM_LOG==='all';
 const platformDiagnostic=app.isPackaged?undefined:chunk=>{for(const line of String(chunk).split('\n')){const text=line.trim();if(!text||!verbosePlatformLog&&!/level=(?:warning|error|fatal|panic)\b/.test(text)&&!text.includes('扫码'))continue;console.error('[platform] '+text);}};
 const nativeReady=!fixture&&resources.status().ready,platformRuntime=nativeReady?new DesktopPlatformRuntime(privateDirectory(path.join(data,'native-sessions')),resources,vault,{checkPrivateFile,checkPrivateDirectory:directory=>windowsNative(app,{operation:'directory',path:directory,create:false}),onDiagnostic:platformDiagnostic,onUnsafeStop:()=>{store.transaction(()=>{const event=store.audit('RECOVERY','PLATFORM_PROCESS_STOP_UNCONFIRMED','installation');store.db.prepare("INSERT INTO safety_state VALUES('platform',1,?,'PLATFORM_PROCESS_STOP_UNCONFIRMED',?) ON CONFLICT(id) DO UPDATE SET version=version+1,event_id=excluded.event_id,reason=excluded.reason").run(event,store.clock());});setTimeout(()=>{try{reconcilePlatform();}catch{}},4000);}}):{status:()=>({ready:false,reason:fixture?'SYNTHETIC_TEST_MODE':resources.status().reason}),available:()=>false};
 const bindRuntime=()=>{accounts=new LocalAccounts(store,vault,platformRuntime,inspectAccountRestriction);evidence=new LocalEvidence(store,vault,platformRuntime,evidenceWire);service=new LocalService(store,vault,{accounts,diagnostic:new(require('@crm/local-runtime/post-diagnostic').PostDiagnostic)(store,vault,platformRuntime),evidence,capabilities:()=>({review:!fixture,collect:nativeReady,inbox:nativeReady,send:nativeReady})});try{service.ensureBuiltinConfigurations();}catch(error){console.error('BUILTIN_CONFIGURATION_SYNC_FAILED',error?.message||error);}runner=new LocalRunner(store,fixture?{}:{REVIEW:new LocalModelExecutor(store,vault),...(nativeReady?{EVIDENCE:evidence,SEND:new LocalSendExecutor(store,vault,platformRuntime,sendWire),COLLECT:new LocalCollectionExecutor(store,vault,platformRuntime),INBOX:new LocalInboxExecutor(store,platformRuntime,{wireFactory:(endpoint,sender,signal)=>new DesktopInboxWire(endpoint,sender,signal)})}:{})});runner.recoverStartup();};
 const startTicker=()=>{ticker=setInterval(()=>{if(!closing)void runner.tick().catch(()=>{});},1000);ticker.unref();};
 bindRuntime();startTicker();
 // 恢复初始状态：先停 ticker 与在途任务，再清库/凭据/浏览器目录，最后重建运行时。
 // runner.stop() 会把 stopping 置 true 且不可逆，所以必须重绑，不能复用旧实例。
 const clearNativeSessions=()=>{const directory=path.join(data,'native-sessions');if(!fs.existsSync(directory))return;for(const name of fs.readdirSync(directory))fs.rmSync(path.join(directory,name),{recursive:true,force:true});};
 const restoreInitialState=async()=>{
  if(accounts?.attempt)throw new LocalError('RESTORE_REQUIRES_IDLE');
  clearInterval(ticker);ticker=null;await runner?.stop();
  try{await accounts?.close();const result=service.restoreInitialState();clearNativeSessions();return result;}
  finally{bindRuntime();startTicker();}
 };
 // 停止未确认时写下的平台暂停，由系统自己判断是否还成立：会话目录里记着我们拉起的
 // helper / 浏览器进程号（.owner.json），全部不在了就说明确实停住了，直接对账清除。
 // 用户不需要、也无法替系统做这个判断。
 const reconcilePlatform=()=>{try{const state=platformRuntime.reconcileProcessState?platformRuntime.reconcileProcessState():{sessions:0,live:0,settled:false};if(!state.settled||state.live)return {...state,cleared:false};return {...state,cleared:!!service?.reconcilePlatformHold({liveProcesses:0,sessions:state.sessions}).cleared};}catch{return {sessions:0,live:0,settled:false,cleared:false};}};
 reconcilePlatform();
 const web=path.join(root,'apps/web/dist-desktop');
 protocol.handle('workbench',request=>{
  const url=new URL(request.url);if(url.hostname!=='app'||request.method!=='GET')return new Response('',{status:403});
  let rel;try{rel=decodeURIComponent(url.pathname);}catch{return new Response('',{status:400});}
  const target=path.resolve(web,'.'+rel);if(target!==web&&!target.startsWith(web+path.sep))return new Response('',{status:403});
  const file=fs.existsSync(target)&&fs.statSync(target).isFile()?target:path.join(web,'desktop.html');
  const contentType={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'}[path.extname(file)]||'application/octet-stream';
  return new Response(fs.readFileSync(file),{headers:{'content-type':contentType,'content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: https://*.xhscdn.com; font-src 'self'; connect-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'",'x-content-type-options':'nosniff','cache-control':'no-store'}});
 });
 const area=screen.getPrimaryDisplay().workAreaSize;
 const statePath=path.join(data,'window-state.json');
 let saved=null;try{const s=JSON.parse(fs.readFileSync(statePath,'utf8'));if(Number.isInteger(s.width)&&Number.isInteger(s.height))saved=s;}catch{}
 const width=Math.max(960,Math.min(saved?saved.width:1440,area.width-40)),height=Math.max(600,Math.min(saved?saved.height:900,area.height-40));
 window=new BrowserWindow({width,height,minWidth:320,minHeight:520,center:true,show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,devTools:!app.isPackaged}});
 window.on('close',event=>{if(!(window.isMinimized()||window.isMaximized()||window.isFullScreen())){const b=window.getBounds();try{fs.writeFileSync(statePath,JSON.stringify({width:b.width,height:b.height}),{mode:0o600});}catch{}}if(!confirmPendingSends())event.preventDefault();});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',(event,value)=>{const u=new URL(value);const allowed=devOrigin?u.origin===devOrigin:(u.protocol==='workbench:'&&u.hostname==='app'&&!u.port&&!u.username&&!u.password);if(!allowed)event.preventDefault();});
 window.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
 window.webContents.session.setPermissionCheckHandler(()=>false);
 window.webContents.on('will-attach-webview',event=>event.preventDefault());
 window.webContents.session.on('will-download',event=>event.preventDefault());
 ipcMain.handle('workbench:call',async(event,method,input)=>{
  try{validateCall(event,window,method,input,devOrigin);if(closing)throw Error('APP_CLOSING');
   if(method==='reportPendingSends'){pendingSends=Math.max(0,Math.min(999,Number(input?.count)||0));return {ok:true,data:{count:pendingSends}};}
   if(method==='cancelPostDiagnostic')return {ok:true,data:service.cancelPostDiagnostic()};
   if(method==='cancelEvidence')return {ok:true,data:service.cancelEvidence()};
   if(method==='cancelLogin')return {ok:true,data:await service.cancelLogin(input)};
   // 只触发对账：真正清不清由主进程核对进程表决定，渲染层给不了这个判断。
   if(method==='reconcilePlatform')return {ok:true,data:reconcilePlatform()};
   // 恢复初始状态要停掉 ticker 重建运行时，和普通 service 调用不是同一条路径。
   if(method==='restoreInitialState'){const operation=operations.then(()=>restoreInitialState());operations=operation.catch(()=>{});return {ok:true,data:await operation};}
   // 渲染层变更串行执行：同一时刻只有一个本地操作在写库。
   const operation=operations.then(()=>service[method](input));operations=operation.catch(()=>{});return {ok:true,data:await operation};
  }catch(error){const code=typeof error?.code==='string'?error.code:'LOCAL_OPERATION_FAILED';return {ok:false,error:code};}
 });
 if(!smoke)window.once('ready-to-show',()=>window.show());await window.loadURL(devUrl||'workbench://app/');
 if(smoke){
  // Packaged self-test owns a newly created temp directory. It cannot select a
  // user path, read OS credentials, register paid/platform executors or resume work.
  // Electron can resolve loadURL before the preload API is attached; wait for it and
  // for one renderer task turn, otherwise executeJavaScript can hang on a cold start.
  const ready=await window.webContents.executeJavaScript(`new Promise(resolve=>{const deadline=Date.now()+5000;const poll=()=>{if(window.localWorkbench)return resolve(true);if(Date.now()>deadline)return resolve(false);setTimeout(poll,20);};poll();})`);
  if(!ready)throw Error('SELF_TEST_API_UNAVAILABLE');
  const result=await window.webContents.executeJavaScript(`(async()=>{const api=window.localWorkbench;const before=await api.status();if(!before.ok||before.data.credentialsAvailable||before.data.initialized)throw Error('SELF_TEST_ISOLATION');await api.initialize();const saved=await api.saveConfiguration({kind:'KEYWORDS',name:'Synthetic packaged self-test',body:{keywords:['synthetic-only']}});const rows=await api.configurations();if(!saved.ok||!rows.ok||rows.data.length!==${builtinConfigurations.length+1})throw Error('SELF_TEST_LOCAL_FLOW');return {initialized:true,configurations:rows.data.length,builtinConfigurations:${builtinConfigurations.length},credentialsAvailable:false,externalExecutors:false};})()`);
  console.log('DESKTOP_SELF_TEST '+JSON.stringify({...result,platform:process.platform,arch:process.arch,packaged:app.isPackaged}));app.quit();
 }
}
app.on('window-all-closed',()=>app.quit());
app.on('quit',()=>{removeSmokeDirectory();});
app.on('before-quit',event=>{if(!confirmPendingSends()){event.preventDefault();return;}if(closing||!store)return;event.preventDefault();closing=true;clearInterval(ticker);service?.cancelEvidence();service?.cancelPostDiagnostic();void Promise.allSettled([operations,accounts?.close()]).then(async()=>{await runner?.stop();store.close();store=null;removeSmokeDirectory();app.quit();});});
main().catch(error=>{console.error('DESKTOP_START_FAILED',error?.stack||error);if(smokeDirectory){console.error('DESKTOP_SELF_TEST_FAILED');app.quit();return;}if(process.argv.includes('--test-fixture')){app.quit();return;}dialog.showErrorBox('工作台启动失败','本地数据目录、数据库或系统凭据保护不可用。没有连接或修改原工作台数据。');app.quit();});
