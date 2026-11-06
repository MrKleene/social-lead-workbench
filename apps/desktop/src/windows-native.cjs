'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
function windowsNative(app,request){
 if(process.platform!=='win32'||process.arch!=='x64')throw Error('WINDOWS_X64_REQUIRED');
 const directory=app.isPackaged?path.join(process.resourcesPath,'native'):path.resolve(__dirname,'../../api/dist/native');
 const binary=path.join(directory,'windows-host.exe'),stamp=JSON.parse(fs.readFileSync(path.join(directory,'windows-build.json'),'utf8')),stat=fs.lstatSync(binary);
 if(!stat.isFile()||stat.isSymbolicLink()||crypto.createHash('sha256').update(fs.readFileSync(binary)).digest('hex')!==stamp.binary)throw Error('WINDOWS_HELPER_UNVERIFIED');
 const result=cp.spawnSync(binary,[],{input:JSON.stringify(request)+'\n',encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:32768,env:{SystemRoot:process.env.SystemRoot||process.env.SYSTEMROOT,USERPROFILE:process.env.USERPROFILE,LOCALAPPDATA:process.env.LOCALAPPDATA,TEMP:process.env.TEMP,TMP:process.env.TMP}});
 if(result.status!==0)throw Error('WINDOWS_NATIVE_FAILED');const data=JSON.parse(result.stdout);if(typeof data.value!=='string')throw Error('WINDOWS_NATIVE_PROTOCOL');return data.value;
}
module.exports={windowsNative};
