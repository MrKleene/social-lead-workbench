'use strict';
const path=require('node:path');
// Build-time only. Explicit caches and isolated directories; no inherited model
// keys, proxy credentials or business service configuration.
function buildEnvironment({platform=process.platform,arch=process.arch,compiler,out,modcache,systemRoot=process.env.SystemRoot||process.env.SYSTEMROOT}){
 if(!((platform==='darwin'&&arch==='arm64')||(platform==='win32'&&arch==='x64')))throw Error('UNREVIEWED_BUILD_HOST');
 const p=platform==='win32'?path.win32:path.posix;
 if(![compiler,out,modcache].every(v=>typeof v==='string'&&p.isAbsolute(v)))throw Error('ABSOLUTE_BUILD_PATHS_REQUIRED');
 const env={GOCACHE:p.join(out,'cache'),GOMODCACHE:modcache,GOPROXY:'off',GOSUMDB:'off',GOTOOLCHAIN:'local',GOWORK:'off',GOENV:'off',GOTELEMETRY:'off',CGO_ENABLED:'0'};
 if(platform==='win32'){
  if(!systemRoot||!p.isAbsolute(systemRoot))throw Error('WINDOWS_SYSTEM_ROOT_REQUIRED');
  Object.assign(env,{SystemRoot:systemRoot,WINDIR:systemRoot,ComSpec:p.join(systemRoot,'System32','cmd.exe'),PATH:p.dirname(compiler)+';'+p.join(systemRoot,'System32'),USERPROFILE:p.join(out,'home'),LOCALAPPDATA:p.join(out,'home','AppData','Local'),TEMP:p.join(out,'tmp'),TMP:p.join(out,'tmp')});
 }else Object.assign(env,{PATH:'/usr/bin:/bin',HOME:p.join(out,'home'),TMPDIR:p.join(out,'tmp')});
 return env;
}
function expectedCompiler(platform=process.platform,arch=process.arch){if(platform==='darwin'&&arch==='arm64')return 'go version go1.27.4 darwin/arm64';if(platform==='win32'&&arch==='x64')return 'go version go1.27.4 windows/amd64';throw Error('UNREVIEWED_BUILD_HOST');}
module.exports={buildEnvironment,expectedCompiler};
