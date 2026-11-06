'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');const {verified}=require('./owned-process.cjs');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
class NativeResources{
 constructor(root){this.root=root;}
 inspect(){
  if(process.platform!=='darwin'||process.arch!=='arm64')throw Error('WINDOWS_NATIVE_RUNTIME_VALIDATION_REQUIRED');
  const mcp=JSON.parse(fs.readFileSync(path.join(this.root,'mcp-build.json'))),supervisor=JSON.parse(fs.readFileSync(path.join(this.root,'supervisor-build.json'))),browser=JSON.parse(fs.readFileSync(path.join(this.root,'browser-build.json')));
  if(mcp.protocol!=='social-lead-desktop-mcp-v1'||[mcp,supervisor,browser].some(m=>m.platform!==process.platform||m.arch!==process.arch)||browser.version!=='148.0.7778.215'||browser.binary!=='Chromium.app/Contents/MacOS/Chromium')throw Error('NATIVE_MANIFEST_UNVERIFIED');
  const base=path.join(this.root,'Chromium.app');const seen=new Set();
  const walk=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name),rel=path.relative(base,file).split(path.sep).join('/');if(e.isDirectory()){walk(file);continue;}const expected=browser.files[rel];if(!expected)throw Error('UNEXPECTED_BROWSER_RESOURCE');if(e.isSymbolicLink()){const target=fs.readlinkSync(file);if(target!==expected.link||path.isAbsolute(target)||!fs.realpathSync(file).startsWith(base+path.sep))throw Error('BROWSER_LINK_CHANGED');}else if(!e.isFile()||fs.statSync(file).size!==expected.size||hash(file)!==expected.sha256||fs.statSync(file).mode&0o022)throw Error('BROWSER_RESOURCE_CHANGED');seen.add(rel);}};walk(base);if(seen.size!==Object.keys(browser.files).length)throw Error('BROWSER_RESOURCE_MISSING');
  return {binary:verified(path.join(this.root,'desktop-mcp'),mcp.binary),binaryHash:mcp.binary,helper:verified(path.join(this.root,'desktop-supervisor'),supervisor.binary),helperHash:supervisor.binary,browser:path.join(this.root,browser.binary)};
 }
 status(){try{this.inspect();return {ready:true,reason:'PACKAGED_NATIVE_RESOURCES_VERIFIED'};}catch{return {ready:false,reason:process.platform==='win32'?'WINDOWS_NATIVE_RUNTIME_VALIDATION_REQUIRED':'PACKAGED_NATIVE_RESOURCES_UNAVAILABLE'};}}
}
module.exports={NativeResources};
