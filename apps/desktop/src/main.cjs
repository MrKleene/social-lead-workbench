'use strict';
const {app,BrowserWindow,protocol,ipcMain,dialog,screen}=require('electron');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {LocalDatabase,LocalError}=require('@crm/local-runtime/database');
const {CredentialStore}=require('@crm/local-runtime/credentials');
const {LocalService}=require('@crm/local-runtime/service');
const {LocalDataManager}=require('@crm/local-runtime/data-manager');
const {validateCall}=require('./ipc-policy.cjs');
const {createProtector}=require('./local-crypto.cjs');
const {windowsNative}=require('./windows-native.cjs');
const {LocalRunner}=require('@crm/local-runtime/runner');
const {LocalEvidence}=require('@crm/local-runtime/evidence');
const evidenceWire=require('./evidence-wire.cjs');
const {LocalAccounts}=require('@crm/local-runtime/accounts');
const {LocalSendExecutor}=require('@crm/local-runtime/send-executor');
const sendWire=require('./send-wire.cjs');
const {LocalInboxExecutor}=require('@crm/local-runtime/inbox-executor');
const {DesktopInboxWire}=require('./inbox-wire.cjs');
const {LocalCollectionExecutor}=require('@crm/local-runtime/collection-executor');
const {NativeResources}=require('./native-resources.cjs');
const {DesktopPlatformRuntime}=require('./platform-runtime.cjs');
const {LocalModelExecutor}=require('@crm/local-runtime/model-executor');
const os=require('node:os');
protocol.registerSchemesAsPrivileged([{scheme:'workbench',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
const root=path.resolve(__dirname,'../../..');let window,store,service,runner,accounts,ticker,smokeDirectory,closing=false,operations=Promise.resolve();
// Separate app identity/data from the existing production workbench.
app.setName('SocialLeadDesktop');
function privateDirectory(p){
 if(process.platform==='win32'){
  windowsNative(app,{operation:'directory',path:p,create:true});
 }else{if(!fs.existsSync(p))fs.mkdirSync(p,{mode:0o700});const s=fs.lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o077))throw Error('PRIVATE_DATA_DIRECTORY_REQUIRED');}
 return fs.realpathSync(p);
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
 const credentials=privateDirectory(path.join(data,'credentials'));privateDirectory(path.join(data,'backups'));privateDirectory(path.join(data,'restores'));privateDirectory(path.join(data,'imports'));
 // 凭据加密用本机派生密钥，不再依赖 Electron safeStorage / 系统钥匙串，理由见 local-crypto.cjs。
 const protector=createProtector({fixture:!!fixture});
 const checkPrivateFile=file=>{if(process.platform==='win32')windowsNative(app,{operation:'file',path:file});};
 const vault=new CredentialStore(credentials,protector,{checkPrivateFile}),dataManager=new LocalDataManager(data,{checkPrivateFile});store=new LocalDatabase(dataManager.activeFile(),{checkPrivateFile});
 const resources=new NativeResources(app.isPackaged?path.join(process.resourcesPath,'native',process.platform+'-'+process.arch):path.join(root,'apps/desktop/dist/native',process.platform+'-'+process.arch),{windowsCheck:(file,directory)=>windowsNative(app,{operation:directory?'resource-directory':'executable',path:file})});
 const nativeReady=!fixture&&resources.status().ready,platformRuntime=nativeReady?new DesktopPlatformRuntime(privateDirectory(path.join(data,'native-sessions')),resources,vault,{checkPrivateFile,checkPrivateDirectory:directory=>windowsNative(app,{operation:'directory',path:directory,create:false}),onUnsafeStop:()=>{store.transaction(()=>{const event=store.audit('RECOVERY','PLATFORM_PROCESS_STOP_UNCONFIRMED','installation');store.db.prepare("INSERT INTO safety_state VALUES('platform',1,?,'PLATFORM_PROCESS_STOP_UNCONFIRMED',?) ON CONFLICT(id) DO UPDATE SET version=version+1,event_id=excluded.event_id,reason=excluded.reason").run(event,store.clock());});setTimeout(()=>{try{reconcilePlatform();}catch{}},4000);}}):{status:()=>({ready:false,reason:fixture?'SYNTHETIC_TEST_MODE':resources.status().reason}),available:()=>false};
 const bindRuntime=()=>{accounts=new LocalAccounts(store,vault,platformRuntime);service=new LocalService(store,vault,{accounts,diagnostic:new(require('@crm/local-runtime/post-diagnostic').PostDiagnostic)(store,vault,platformRuntime),evidence:new LocalEvidence(store,vault,platformRuntime,evidenceWire),capabilities:()=>({review:!fixture,collect:nativeReady,inbox:nativeReady,send:nativeReady})});runner=new LocalRunner(store,fixture?{}:{REVIEW:new LocalModelExecutor(store,vault),...(nativeReady?{SEND:new LocalSendExecutor(store,vault,platformRuntime,sendWire),COLLECT:new LocalCollectionExecutor(store,vault,platformRuntime),INBOX:new LocalInboxExecutor(store,platformRuntime,{wireFactory:(endpoint,sender,signal)=>new DesktopInboxWire(endpoint,sender,signal)})}:{})});runner.recoverStartup();};
 const startTicker=()=>{ticker=setInterval(()=>{if(!closing)void runner.tick().catch(()=>{});},1000);ticker.unref();};
 bindRuntime();startTicker();
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
  return new Response(fs.readFileSync(file),{headers:{'content-type':contentType,'content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'",'x-content-type-options':'nosniff','cache-control':'no-store'}});
 });
 const area=screen.getPrimaryDisplay().workAreaSize;
 const statePath=path.join(data,'window-state.json');
 let saved=null;try{const s=JSON.parse(fs.readFileSync(statePath,'utf8'));if(Number.isInteger(s.width)&&Number.isInteger(s.height))saved=s;}catch{}
 const width=Math.max(960,Math.min(saved?saved.width:1440,area.width-40)),height=Math.max(600,Math.min(saved?saved.height:900,area.height-40));
 window=new BrowserWindow({width,height,minWidth:320,minHeight:520,center:true,show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,devTools:!app.isPackaged}});
 window.on('close',()=>{if(window.isMinimized()||window.isMaximized()||window.isFullScreen())return;const b=window.getBounds();try{fs.writeFileSync(statePath,JSON.stringify({width:b.width,height:b.height}),{mode:0o600});}catch{}});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',(event,value)=>{const u=new URL(value);const allowed=devOrigin?u.origin===devOrigin:(u.protocol==='workbench:'&&u.hostname==='app'&&!u.port&&!u.username&&!u.password);if(!allowed)event.preventDefault();});
 window.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
 window.webContents.session.setPermissionCheckHandler(()=>false);
 window.webContents.on('will-attach-webview',event=>event.preventDefault());
 window.webContents.session.on('will-download',event=>event.preventDefault());
 ipcMain.handle('workbench:call',async(event,method,input)=>{
  try{validateCall(event,window,method,input,devOrigin);if(closing)throw Error('APP_CLOSING');
   if(method==='cancelPostDiagnostic')return {ok:true,data:service.cancelPostDiagnostic()};
   if(method==='cancelEvidence')return {ok:true,data:service.cancelEvidence()};
   if(method==='cancelLogin')return {ok:true,data:await service.cancelLogin(input)};
   // 只触发对账：真正清不清由主进程核对进程表决定，渲染层给不了这个判断。
   if(method==='reconcilePlatform')return {ok:true,data:reconcilePlatform()};
   // Serialize renderer mutations with backup/restore. No token or secret is sent in URLs.
   const operation=operations.then(async()=>{
    if(method==='backup'){
     const file=path.join(data,'backups',crypto.randomUUID()+'.sqlite'),result=await store.snapshot(file);fs.writeFileSync(file+'.json',JSON.stringify(result),{flag:'wx',mode:0o600});return {saved:true,name:path.basename(file)};
    }
    if(method==='restore'){
     const selected=await dialog.showOpenDialog(window,{title:'选择本地备份（恢复到新副本）',properties:['openFile'],filters:[{name:'SQLite backup',extensions:['sqlite']}]});if(selected.canceled)return {cancelled:true};
     const preview=dataManager.restoreFile(selected.filePaths[0]);return {restored:true,name:preview.id,activated:false};
    }
    if(method==='importLegacy'){
     const selected=await dialog.showOpenDialog(window,{title:'选择已导出的旧工作台业务 JSON（导入新副本）',properties:['openFile'],filters:[{name:'Business export',extensions:['json']}]});if(selected.canceled)return {cancelled:true};return {imported:true,preview:dataManager.importFile(selected.filePaths[0])};
    }
    if(method==='dataCopies')return dataManager.list();
    if(method==='activateDataCopy'){
     if(store.active())throw new LocalError('BACKUP_REQUIRES_IDLE');clearInterval(ticker);await runner.stop();
     try{const switched=await dataManager.activate(store,input);store.close();store=switched.store;return switched.result;}
     finally{bindRuntime();startTicker();}
    }
    return service[method](input);
   });operations=operation.catch(()=>{});return {ok:true,data:await operation};
  }catch(error){const code=typeof error?.code==='string'?error.code:'LOCAL_OPERATION_FAILED';return {ok:false,error:code};}
 });
 if(!smoke)window.once('ready-to-show',()=>window.show());await window.loadURL(devUrl||'workbench://app/');
 if(smoke){
  // Packaged self-test owns a newly created temp directory. It cannot select a
  // user path, read OS credentials, register paid/platform executors or resume work.
  const result=await window.webContents.executeJavaScript(`(async()=>{const api=window.localWorkbench;const before=await api.status();if(!before.ok||before.data.credentialsAvailable||before.data.initialized)throw Error('SELF_TEST_ISOLATION');await api.initialize();const saved=await api.saveConfiguration({kind:'KEYWORDS',name:'Synthetic packaged self-test',body:{keywords:['synthetic-only']}});const rows=await api.configurations();const backup=await api.backup();if(!saved.ok||!rows.ok||rows.data.length!==1||!backup.ok)throw Error('SELF_TEST_LOCAL_FLOW');return {initialized:true,configurations:rows.data.length,backup:backup.data.saved,credentialsAvailable:false,externalExecutors:false};})()`);
  console.log('DESKTOP_SELF_TEST '+JSON.stringify({...result,platform:process.platform,arch:process.arch,packaged:app.isPackaged}));app.quit();
 }
}
app.on('window-all-closed',()=>app.quit());
app.on('quit',()=>{if(smokeDirectory)fs.rmSync(smokeDirectory,{recursive:true,force:true});});
app.on('before-quit',event=>{if(closing||!store)return;event.preventDefault();closing=true;clearInterval(ticker);service?.cancelEvidence();service?.cancelPostDiagnostic();void Promise.allSettled([operations,accounts?.close()]).then(async()=>{await runner?.stop();store.close();store=null;if(smokeDirectory)fs.rmSync(smokeDirectory,{recursive:true,force:true});app.quit();});});
main().catch(error=>{console.error('DESKTOP_START_FAILED',error?.stack||error);if(smokeDirectory){console.error('DESKTOP_SELF_TEST_FAILED');app.quit();return;}if(process.argv.includes('--test-fixture')){app.quit();return;}dialog.showErrorBox('工作台启动失败','本地数据目录、数据库或系统凭据保护不可用。没有连接或修改原工作台数据。');app.quit();});
