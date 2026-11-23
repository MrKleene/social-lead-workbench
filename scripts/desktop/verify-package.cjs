// Read-only package verification; never opens the application or user data.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const asar=require('@electron/asar'),{getCurrentFuseWire,FuseV1Options}=require('@electron/fuses');
function verifyArchive(archive,expectedFiles){
 // asar paths use the host separator: Windows returns backslashes. Keep each
 // entry in the form the archive's own API accepts, and compare on POSIX paths.
 const raw=asar.listPackage(archive).map(entry=>entry.replace(/^[\\/]+/,'')),posix=s=>s.replaceAll('\\','/');
 const byPath=new Map();for(const entry of raw){let key=entry;try{asar.statFile(archive,key);}catch{key=posix(entry);}byPath.set(posix(entry),key);}
 const entries=raw.map(posix),stat=entry=>asar.statFile(archive,byPath.get(entry)),files=entries.filter(entry=>!stat(entry).files);
 assert.equal(entries.some(e=>/(^|\/)\.env|\.sqlite|\.sealed|cookies/i.test(e)),false,'Package contains runtime/dependency data');
 assert.equal(entries.some(e=>stat(e).link),false,'Package contains a link');
 assert.deepEqual([...files].sort(),[...expectedFiles.keys()].sort(),'Package file set differs from allowlist');
 for(const [file,bytes] of expectedFiles){const actual=asar.extractFile(archive,byPath.get(file));if(file==='package.json')assert.deepEqual(JSON.parse(actual),JSON.parse(bytes),'Package metadata differs');else assert.equal(bytes.equals(actual),true,'Package is stale: '+file);}
 return files.length;
}
async function verifyPackage(app){
 if(!app||!path.isAbsolute(app))throw Error('Pass an absolute packaged app/executable path');
 const resources=app.endsWith('.app')?path.join(app,'Contents/Resources'):path.join(path.dirname(app),'resources'),archive=path.join(resources,'app.asar');
 const root=path.resolve(__dirname,'../..');
 const files=verifyArchive(archive,require('./stage-layout.cjs').packageFiles(root));
 if(!app.endsWith('.app')&&process.platform!=='win32')throw Error('Windows package verification requires native Windows execution');
 const windowsCheck=(file,directory)=>require('../../apps/desktop/src/windows-native.cjs').windowsNative({isPackaged:true,resourcesPath:resources},{operation:directory?'resource-directory':'executable',path:file});
 const nativeVerified=!!new (require('../../apps/desktop/src/native-resources.cjs').NativeResources)(path.join(resources,'native',process.platform+'-'+process.arch),{windowsCheck}).inspect();
 if(nativeVerified)for(const file of ['BROWSER-LICENSES.txt','MCP-LICENSES.txt'])assert.equal(fs.readFileSync(path.join(root,'apps/desktop/dist/native',process.platform+'-'+process.arch,file)).equals(fs.readFileSync(path.join(resources,'native',process.platform+'-'+process.arch,file))),true,'Native license missing or stale');
 const fuses=await getCurrentFuseWire(app),expected={RunAsNode:48,EnableCookieEncryption:48,EnableNodeOptionsEnvironmentVariable:48,EnableNodeCliInspectArguments:48,EnableEmbeddedAsarIntegrityValidation:49,OnlyLoadAppFromAsar:49,GrantFileProtocolExtraPrivileges:48};
 for(const [name,value] of Object.entries(expected))assert.equal(fuses[FuseV1Options[name]],value,'Fuse mismatch: '+name);
 console.log(JSON.stringify({files,asarBytes:fs.statSync(archive).size,forbiddenFiles:0,staleFiles:0,fusesVerified:true,nativeVerified,platform:process.platform,nativeWindowsVerified:process.platform==='win32'&&nativeVerified}));
}
module.exports={verifyArchive,verifyPackage};
if(require.main===module)verifyPackage(process.argv[2]).catch(error=>{console.error(error.message);process.exitCode=1;});
