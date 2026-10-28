'use strict';
const path=require('node:path'),os=require('node:os'),fs=require('node:fs'),fsp=require('node:fs/promises'),cp=require('node:child_process'),crypto=require('node:crypto');
const windowsTools=require('./windows-tools.json');
const projectRoot=path.resolve(__dirname,'..');
function platformCapability(platform=process.platform,arch=process.arch,release=os.release()){
 const mac=platform==='darwin'&&arch==='arm64',win=platform==='win32'&&arch==='x64'&&/^10\.0\./.test(release)&&Number(release.split('.')[2])>=22000;
 return {os:platform==='darwin'?'macOS':platform==='win32'?'Windows':platform,supported:mac||win,adapter:mac?'mac-local-v1':win?'windows-local-v1':'unsupported',remote:false,validation:win?'IMPLEMENTED_PENDING_WINDOWS_VALIDATION':mac?'MAC_OFFLINE_VERIFIED':'UNSUPPORTED'};
}
function isWithin(base,target,platform=process.platform){const p=platform==='win32'?path.win32:path.posix;const rel=p.relative(base,target);return !!rel&&!rel.startsWith('..'+p.sep)&&rel!=='..'&&!p.isAbsolute(rel);}
function windowsPath(value){
 if(typeof value!=='string'||value.length>240||! /^[A-Za-z]:\\/.test(value)||value.includes('/')||/[\x00-\x1f<>"|?*]/.test(value)||value.slice(2).includes(':'))throw Error('WINDOWS_LOCAL_PATH_REQUIRED');
 if(path.win32.normalize(value)!==value||value.slice(3).split('\\').some(x=>!x||/[. ]$/.test(x)||/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(x)))throw Error('WINDOWS_UNSAFE_PATH');return value;
}
const helper=()=>path.join(projectRoot,'apps/api/dist/native/windows-host.exe');
function windowsCall(request){
 if(process.platform!=='win32'||!platformCapability().supported)throw Error('WINDOWS_11_X64_REQUIRED');
 const binary=helper(),s=fs.lstatSync(binary);if(!s.isFile()||s.isSymbolicLink())throw Error('WINDOWS_HELPER_MISSING');
 const r=cp.spawnSync(binary,[],{input:JSON.stringify(request)+'\n',encoding:'utf8',env:minimalEnvironment(),maxBuffer:32768,timeout:15000,windowsHide:true});
 if(r.status!==0)throw Error('WINDOWS_HOST_CHECK_FAILED');const data=JSON.parse(r.stdout);if(typeof data.value!=='string')throw Error('WINDOWS_HOST_PROTOCOL');return data.value;
}
function windowsDataRoot(){return windowsPath(windowsCall({operation:'info'}));}
async function privateDirectory(value,create=false){
 if(process.platform==='win32'){windowsPath(value);if(!create)await fsp.lstat(value);windowsCall({operation:'directory',path:value,create});return;}
 if(create)await fsp.mkdir(value,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e;});
 const s=await fsp.lstat(value);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o077)||await fsp.realpath(value)!==value)throw Error('UNSAFE_PRIVATE_DIRECTORY');
}
async function privateFile(value){const s=await fsp.lstat(value);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1)throw Error('UNSAFE_PRIVATE_FILE');if(process.platform==='win32')windowsCall({operation:'file',path:windowsPath(value)});else if(s.uid!==process.getuid()||(s.mode&0o077))throw Error('UNSAFE_PRIVATE_FILE');return s;}
async function executableFile(value){const s=await fsp.lstat(value);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1)throw Error('UNSAFE_EXECUTABLE');if(process.platform==='win32')windowsCall({operation:'executable',path:windowsPath(value)});else if(s.uid!==process.getuid()||(s.mode&0o022))throw Error('UNSAFE_EXECUTABLE');return s;}
function minimalEnvironment(env=process.env){
 const allowed=['HOME','PATH','TMPDIR','LANG','LC_ALL','TERM','SYSTEMROOT','WINDIR','USERPROFILE','LOCALAPPDATA','APPDATA','TEMP','TMP','COMSPEC'];const result={};
 for(const key of allowed){const matches=Object.keys(env).filter(k=>k.toUpperCase()===key);if(matches.length>1)throw Error('DUPLICATE_ENVIRONMENT_KEY');if(matches.length&&env[matches[0]])result[key]=env[matches[0]];}
 return result;
}
function npmCommand(args,env=process.env,platform=process.platform){
 if(platform!=='win32')return ['npm',args];
 // Run npm's JS entry directly: never interpolate paths into cmd.exe.
 const cli=env.npm_execpath;if(!cli||!path.win32.isAbsolute(cli)||!/[\\/]npm-cli\.js$/i.test(cli))throw Error('Start with npm run dev:persistent in native Windows Node');
 return [process.execPath,[cli,...args]];
}
function spawnOwned(binary,args,options={}){
 if(process.platform==='darwin'&&process.env.CRM_SUPERVISED_BOOT){
  const directory=process.env.CRM_INSTANCE_DIRECTORY;if(!directory||!path.isAbsolute(directory))throw Error('SUPERVISED_INSTANCE_REQUIRED');
  const child=cp.spawn(path.join(projectRoot,'apps/api/dist/native/persistent-supervisor'),[path.join(directory,'.operation.guard'),binary,...args],{...options,env:{...options.env,CRM_SUPERVISED_BOOT:process.env.CRM_SUPERVISED_BOOT},detached:true,stdio:['ignore','ignore','ignore','pipe',4]});
  child.supervised=true;child.stdio[3].on('error',()=>{});return child;
 }
 if(process.platform!=='win32')return cp.spawn(binary,args,{...options,detached:true});
 windowsPath(binary);const child=cp.spawn(helper(),['supervise'],{...options,detached:false,windowsHide:true,stdio:['pipe','ignore','ignore']});
 child.stdin.on('error',()=>{});child.stdin.write(JSON.stringify({operation:'supervise',binary,args,cwd:options.cwd})+'\n');return child;
}
function stopOwned(child,signal='SIGTERM'){if(!child?.pid)return;try{if(child.supervised){if(!child.stdio[3].destroyed)child.stdio[3].write(signal==='SIGKILL'?'K':'T');}else if(process.platform==='win32')child.kill();else process.kill(-child.pid,signal);}catch{}}
async function guardCurrentProcess(){
 if(process.platform!=='win32')return;
 const child=cp.spawn(helper(),['guard'],{stdio:['pipe','pipe','ignore'],windowsHide:true});child.stdin.on('error',()=>{});child.stdin.write(JSON.stringify({operation:'guard',pid:process.pid})+'\n');
 await new Promise((ok,no)=>{const timer=setTimeout(()=>{child.kill();no(Error('WINDOWS_JOB_GUARD_TIMEOUT'));},10000);child.once('error',e=>{clearTimeout(timer);no(e);});child.once('exit',()=>{clearTimeout(timer);no(Error('WINDOWS_JOB_GUARD_FAILED'));});let response='';child.stdout.on('data',data=>{response+=data;if(response.length>4096){child.kill();clearTimeout(timer);return no(Error('WINDOWS_JOB_GUARD_FAILED'));}if(!response.includes('\n'))return;clearTimeout(timer);try{if(JSON.parse(response).value!=='ready')throw Error();ok();}catch{child.kill();no(Error('WINDOWS_JOB_GUARD_FAILED'));}});});
 // stdin EOF when Node exits closes the owned job and its descendants. No service or scheduled task.
 child.unref();child.stdin.unref();child.stdout.unref();
}
const reviewed={macMcp:'549ad010337ca8b651257c6397f20cfb592910bfa152448c080a4c3c47ada70c',winMcp:windowsTools.mcpSha256};
const browserVersion='148.0.7778.215';
function toolPlan(home,platform=process.platform,localData){
 if(platform==='win32'){windowsPath(localData);return {mcp:path.win32.join(localData,'SocialLeadWorkbench','tools','xiaohongshu-mcp-windows-amd64.exe'),browserBase:path.win32.join(localData,'xiaohongshu-mcp','browser',browserVersion),hash:reviewed.winMcp};}
 return {mcp:path.join(home,'.local/bin/xiaohongshu-mcp'),browser:path.join(home,'Library/Caches/xiaohongshu-mcp/browser',browserVersion,'Chromium.app/Contents/MacOS/Chromium'),hash:reviewed.macMcp};
}
async function inspectTools(home){
 const p=toolPlan(home,process.platform,process.platform==='win32'?windowsDataRoot():undefined);await executableFile(p.mcp);
 if(crypto.createHash('sha256').update(await fsp.readFile(p.mcp)).digest('hex')!==p.hash)throw Error('MCP_BUILD_REVIEW_REQUIRED');
 if(process.platform==='win32'){
  p.browser=await inspectWindowsBrowser(p.browserBase);return p;
 }
 await executableFile(p.browser);await fsp.access(p.browser,fs.constants.X_OK);return p;
}
// The review record is versioned source, not a request field or a user-provided
// acceptance switch. No download or enrollment can approve a missing review.
async function inspectWindowsBrowser(base,review=windowsTools.browserReview){
 if(review.state!=='approved'||! /^[a-f0-9]{64}$/.test(review.archiveSha256||'')||!Object.keys(review.files||{}).length)throw Error('WINDOWS_BROWSER_REVIEW_REQUIRED: custom upstream browser payload has not been reviewed; no download or fallback');
 const expected=review.files,seen=new Set();let browser;
 async function walk(dir){
  for(const entry of await fsp.readdir(dir,{withFileTypes:true})){
   const value=path.join(dir,entry.name),relative=path.relative(base,value).split(path.sep).join('/');
   if(entry.isSymbolicLink())throw Error('UNSAFE_BROWSER_TREE');
   if(entry.isDirectory()){await walk(value);continue;}
   if(!entry.isFile()||!Object.hasOwn(expected,relative))throw Error('UNREVIEWED_BROWSER_FILE');
   await executableFile(value);
   const digest=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(value))digest.update(chunk);
   if(digest.digest('hex')!==expected[relative])throw Error('BROWSER_BUILD_REVIEW_REQUIRED');seen.add(relative);
   if(entry.name==='chrome.exe'){if(browser)throw Error('AMBIGUOUS_BROWSER_BINARY');browser=value;}
  }
 }
 await walk(base);if(!browser||seen.size!==Object.keys(expected).length)throw Error('INCOMPLETE_BROWSER_BUILD');return browser;
}
module.exports={platformCapability,isWithin,windowsPath,windowsCall,windowsDataRoot,privateDirectory,privateFile,executableFile,minimalEnvironment,npmCommand,spawnOwned,stopOwned,guardCurrentProcess,toolPlan,inspectTools,inspectWindowsBrowser,browserVersion};
