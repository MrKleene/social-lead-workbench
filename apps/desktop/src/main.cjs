'use strict';
const {app,BrowserWindow,protocol,ipcMain,safeStorage,dialog}=require('electron');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {LocalDatabase}=require('../../../runtime/local/database.cjs');
const {CredentialStore}=require('../../../runtime/local/credentials.cjs');
const {LocalService}=require('../../../runtime/local/service.cjs');
const {restoreToNewFile}=require('../../../runtime/local/backup.cjs');
const {validateCall}=require('./ipc-policy.cjs');
const {windowsNative}=require('./windows-native.cjs');
const os=require('node:os');
protocol.registerSchemesAsPrivileged([{scheme:'workbench',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
const root=path.resolve(__dirname,'../../..');let window,store,service,closing=false,operations=Promise.resolve();
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
 const fixtureFlag=process.argv.indexOf('--test-fixture'),fixture=fixtureFlag>=0?process.argv[fixtureFlag+1]:null;
 if(fixture&&(app.isPackaged||!path.isAbsolute(fixture)||fs.realpathSync(fixture)!==fixture||path.dirname(fixture)!==fs.realpathSync(os.tmpdir())||!path.basename(fixture).startsWith('social-lead-desktop-ui-')||fs.readFileSync(path.join(fixture,'.fixture'),'utf8')!=='synthetic-only'))throw Error('INVALID_TEST_FIXTURE');
 const parent=fixture?null:process.platform==='win32'?windowsNative(app,{operation:'info'}):app.getPath('appData');
 const data=fixture||privateDirectory(path.join(parent,'SocialLeadDesktop'));app.setPath('userData',data);
 if(!app.requestSingleInstanceLock()){app.quit();return;}
 app.on('second-instance',()=>{window?.show();window?.focus();});
 await app.whenReady();
 const credentials=privateDirectory(path.join(data,'credentials'));privateDirectory(path.join(data,'backups'));privateDirectory(path.join(data,'restores'));
 const protector={available:()=>!fixture&&safeStorage.isEncryptionAvailable()&&(process.platform!=='linux'||safeStorage.getSelectedStorageBackend()!=='basic_text'),encrypt:s=>{if(fixture)throw Error('FIXTURE_NO_OS_SECRETS');return safeStorage.encryptString(s);},decrypt:b=>{if(fixture)throw Error('FIXTURE_NO_OS_SECRETS');return safeStorage.decryptString(b);}};
 const checkPrivateFile=file=>{if(process.platform==='win32')windowsNative(app,{operation:'file',path:file});};
 const vault=new CredentialStore(credentials,protector,{checkPrivateFile});store=new LocalDatabase(path.join(data,'workbench.sqlite'),{checkPrivateFile});service=new LocalService(store,vault);
 const web=path.join(root,'apps/web/dist-desktop');
 protocol.handle('workbench',request=>{
  const url=new URL(request.url);if(url.hostname!=='app'||request.method!=='GET')return new Response('',{status:403});
  let rel;try{rel=decodeURIComponent(url.pathname);}catch{return new Response('',{status:400});}
  const target=path.resolve(web,'.'+rel);if(!target.startsWith(web+path.sep))return new Response('',{status:403});
  const file=fs.existsSync(target)&&fs.statSync(target).isFile()?target:path.join(web,'desktop.html');
  const contentType={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'}[path.extname(file)]||'application/octet-stream';
  return new Response(fs.readFileSync(file),{headers:{'content-type':contentType,'content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'",'x-content-type-options':'nosniff','cache-control':'no-store'}});
 });
 window=new BrowserWindow({width:1180,height:820,minWidth:320,minHeight:520,show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,devTools:!app.isPackaged}});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',(event,value)=>{const u=new URL(value);if(u.protocol!=='workbench:'||u.hostname!=='app'||u.port||u.username||u.password)event.preventDefault();});
 window.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
 window.webContents.session.setPermissionCheckHandler(()=>false);
 window.webContents.on('will-attach-webview',event=>event.preventDefault());
 window.webContents.session.on('will-download',event=>event.preventDefault());
 ipcMain.handle('workbench:call',async(event,method,input)=>{
  try{validateCall(event,window,method,input);if(closing)throw Error('APP_CLOSING');
   // Serialize renderer mutations with backup/restore. No token or secret is sent in URLs.
   const operation=operations.then(async()=>{
    if(method==='backup'){
     const file=path.join(data,'backups',crypto.randomUUID()+'.sqlite'),result=await store.snapshot(file);fs.writeFileSync(file+'.json',JSON.stringify(result),{flag:'wx',mode:0o600});return {saved:true,name:path.basename(file)};
    }
    if(method==='restore'){
     const selected=await dialog.showOpenDialog(window,{title:'选择本地备份（恢复到新副本）',properties:['openFile'],filters:[{name:'SQLite backup',extensions:['sqlite']}]});if(selected.canceled)return {cancelled:true};
     const source=selected.filePaths[0],meta=JSON.parse(fs.readFileSync(source+'.json','utf8')),target=path.join(data,'restores',crypto.randomUUID()+'.sqlite');restoreToNewFile(source,target,meta.sha256);return {restored:true,name:path.basename(target),activated:false};
    }
    return service[method](input);
   });operations=operation.catch(()=>{});return {ok:true,data:await operation};
  }catch(error){const code=typeof error?.code==='string'?error.code:'LOCAL_OPERATION_FAILED';return {ok:false,error:code};}
 });
 window.once('ready-to-show',()=>window.show());await window.loadURL('workbench://app/desktop.html');
}
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',event=>{if(closing||!store)return;event.preventDefault();closing=true;void operations.finally(()=>{store.close();store=null;app.quit();});});
main().catch(()=>{dialog.showErrorBox('工作台启动失败','本地数据目录、数据库或系统凭据保护不可用。没有连接或修改原工作台数据。');app.quit();});
