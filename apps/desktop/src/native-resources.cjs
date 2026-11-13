'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');const {verified}=require('./owned-process.cjs');
const windowsBrowserSource=require('./windows-browser-source.json');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
class NativeResources{
 constructor(root,{windowsCheck}={}){this.root=root;this.windowsCheck=windowsCheck;}
 inspect({allowUnvalidatedWindows=false}={}){
  if(process.platform==='win32'&&process.arch==='x64')return this.inspectWindows(allowUnvalidatedWindows);
  if(process.platform!=='darwin'||process.arch!=='arm64')throw Error('WINDOWS_NATIVE_RUNTIME_VALIDATION_REQUIRED');
  const mcp=JSON.parse(fs.readFileSync(path.join(this.root,'mcp-build.json'))),supervisor=JSON.parse(fs.readFileSync(path.join(this.root,'supervisor-build.json'))),browser=JSON.parse(fs.readFileSync(path.join(this.root,'browser-build.json')));
  if(mcp.protocol!=='social-lead-desktop-mcp-v1'||[mcp,supervisor,browser].some(m=>m.platform!==process.platform||m.arch!==process.arch)||browser.version!=='148.0.7778.215'||browser.binary!=='Chromium.app/Contents/MacOS/Chromium')throw Error('NATIVE_MANIFEST_UNVERIFIED');
  const base=path.join(this.root,'Chromium.app');const seen=new Set();
  const walk=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name),rel=path.relative(base,file).split(path.sep).join('/');if(e.isDirectory()){walk(file);continue;}const expected=browser.files[rel];if(!expected)throw Error('UNEXPECTED_BROWSER_RESOURCE');if(e.isSymbolicLink()){const target=fs.readlinkSync(file);if(target!==expected.link||path.isAbsolute(target)||!fs.realpathSync(file).startsWith(base+path.sep))throw Error('BROWSER_LINK_CHANGED');}else if(!e.isFile()||fs.statSync(file).size!==expected.size||hash(file)!==expected.sha256||fs.statSync(file).mode&0o022)throw Error('BROWSER_RESOURCE_CHANGED');seen.add(rel);}};walk(base);if(seen.size!==Object.keys(browser.files).length)throw Error('BROWSER_RESOURCE_MISSING');
  return {binary:verified(path.join(this.root,'desktop-mcp'),mcp.binary),binaryHash:mcp.binary,helper:verified(path.join(this.root,'desktop-supervisor'),supervisor.binary),helperHash:supervisor.binary,browser:path.join(this.root,browser.binary)};
 }
 inspectWindows(allowUnvalidated=false){
  if(typeof this.windowsCheck!=='function')throw Error('WINDOWS_ACL_CHECK_REQUIRED');
  const read=name=>JSON.parse(fs.readFileSync(path.join(this.root,name))),mcp=read('mcp-build.json'),browser=read('browser-build.json'),helperRoot=path.dirname(this.root),supervisor=JSON.parse(fs.readFileSync(path.join(helperRoot,'windows-build.json')));
  if(mcp.platform!=='win32'||mcp.arch!=='x64'||mcp.protocol!=='social-lead-desktop-mcp-v1'||browser.platform!=='win32'||browser.arch!=='x64'||browser.version!==windowsBrowserSource.version||browser.binary!=='browser/chrome.exe'||browser.archiveSha256!==windowsBrowserSource.archiveSha256)throw Error('NATIVE_MANIFEST_UNVERIFIED');
  const seen=new Set(),base=path.join(this.root,'browser');const walk=dir=>{this.windowsCheck(dir,true);for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name),rel=path.relative(base,file).split(path.sep).join('/'),stat=fs.lstatSync(file);if(stat.isSymbolicLink())throw Error('WINDOWS_BROWSER_REPARSE_POINT');if(e.isDirectory()){walk(file);continue;}const expected=browser.files[rel];if(!e.isFile()||stat.nlink!==1||!expected||stat.size!==expected.size||hash(file)!==expected.sha256)throw Error('BROWSER_RESOURCE_CHANGED');this.windowsCheck(file,false);seen.add(rel);}};walk(base);if(seen.size!==Object.keys(browser.files).length)throw Error('BROWSER_RESOURCE_MISSING');
  const binary=verified(path.join(this.root,'desktop-mcp.exe'),mcp.binary),helper=verified(path.join(helperRoot,'windows-host.exe'),supervisor.binary);this.windowsCheck(binary,false);this.windowsCheck(helper,false);
  if(!allowUnvalidated){const proof=read('windows-validation.json'),license=path.join(this.root,'BROWSER-LICENSES.txt');if(proof.protocol!=='desktop-windows-offline-validation-v1'||proof.platform!=='win32'||proof.arch!=='x64'||proof.mcp!==mcp.binary||proof.helper!==supervisor.binary||proof.browserManifest!==hash(path.join(this.root,'browser-build.json'))||proof.licenses!==hash(license)||!['privateAcl','localKeyDerivation','ownedTree','localPage','noExternalCalls'].every(k=>proof[k]===true))throw Error('WINDOWS_NATIVE_RUNTIME_VALIDATION_REQUIRED');}
  return {binary,binaryHash:mcp.binary,helper,helperHash:supervisor.binary,browser:path.join(this.root,browser.binary)};
 }
 status(){try{this.inspect();return {ready:true,reason:'PACKAGED_NATIVE_RESOURCES_VERIFIED'};}catch{return {ready:false,reason:process.platform==='win32'?'WINDOWS_NATIVE_RUNTIME_VALIDATION_REQUIRED':'PACKAGED_NATIVE_RESOURCES_UNAVAILABLE'};}}
}
module.exports={NativeResources};
