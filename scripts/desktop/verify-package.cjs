// Read-only package verification; never opens the application or user data.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const asar=require('@electron/asar'),{getCurrentFuseWire,FuseV1Options}=require('@electron/fuses');
(async()=>{
 const app=process.argv[2];if(!app||!path.isAbsolute(app))throw Error('Pass an absolute packaged app/executable path');
 const resources=app.endsWith('.app')?path.join(app,'Contents/Resources'):path.join(path.dirname(app),'resources'),archive=path.join(resources,'app.asar');
 const entries=asar.listPackage(archive).map(s=>s.slice(1)),files=entries.filter(e=>!asar.statFile(archive,e).files);
 assert.equal(entries.some(e=>/node_modules|(^|\/)\.env|\.sqlite|\.sealed|cookies/i.test(e)),false,'Package contains runtime/dependency data');
 assert.equal(entries.some(e=>asar.statFile(archive,e).link),false,'Package contains a link');
 const root=path.resolve(__dirname,'../..');
 for(const file of files){if(file==='package.json')continue;assert.equal(['apps/desktop/src/','apps/web/dist-desktop/','runtime/local/'].some(prefix=>file.startsWith(prefix)),true,'File outside desktop allowlist');assert.equal(fs.existsSync(path.join(root,file)),true,'Unexpected package file');assert.equal(fs.readFileSync(path.join(root,file)).equals(asar.extractFile(archive,file)),true,'Package is stale: '+file);}
 const fuses=await getCurrentFuseWire(app),expected={RunAsNode:48,EnableCookieEncryption:49,EnableNodeOptionsEnvironmentVariable:48,EnableNodeCliInspectArguments:48,EnableEmbeddedAsarIntegrityValidation:49,OnlyLoadAppFromAsar:49,GrantFileProtocolExtraPrivileges:48};
 for(const [name,value] of Object.entries(expected))assert.equal(fuses[FuseV1Options[name]],value,'Fuse mismatch: '+name);
 console.log(JSON.stringify({files:files.length,asarBytes:fs.statSync(archive).size,forbiddenFiles:0,staleFiles:0,fusesVerified:true,platform:process.platform,nativeWindowsVerified:false}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
