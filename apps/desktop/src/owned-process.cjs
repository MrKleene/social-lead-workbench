'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),{createHash}=require('node:crypto');
function verified(file,digest,allowHardlinks=false){const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||!allowHardlinks&&s.nlink!==1||process.platform!=='win32'&&(s.mode&0o022)||createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==digest)throw Error('NATIVE_RESOURCE_CHANGED');return file;}
const delay=ms=>new Promise(resolve=>{const timer=setTimeout(()=>resolve(false),ms);timer.unref();});
// Internal main-process API only; the renderer can never choose an executable,
// process ID, environment, working directory or helper.
function spawnOwned({helper,helperHash,binary,binaryHash,directory,guard,args,env,onDiagnostic,binaryMayHaveHardlinks=false}){
 if(!(process.platform==='darwin'&&process.arch==='arm64'||process.platform==='win32'&&process.arch==='x64'))throw Error('OWNED_PROCESS_NATIVE_VALIDATION_REQUIRED');
 verified(helper,helperHash);verified(binary,binaryHash,binaryMayHaveHardlinks);
 const windows=process.platform==='win32';
 const child=cp.spawn(helper,windows?['desktop']:[guard,directory,binary,...args],{cwd:directory,env,detached:!windows,windowsHide:true,stdio:windows?['pipe','pipe',onDiagnostic?'pipe':'ignore']:['ignore','pipe',onDiagnostic?'pipe':'ignore','pipe']});const control=windows?child.stdin:child.stdio[3];control.on('error',()=>{});if(windows)control.write(JSON.stringify({operation:'desktop',binary,cwd:directory,guard,args})+'\n');if(onDiagnostic)child.stderr.on('data',onDiagnostic);
 // 把这次拉起的 helper / 浏览器进程号写进会话目录。停止未确认时，下次启动靠它判断
 // 残留进程是否还活着——这是系统自己就能查的事实，不该推给用户去核对。
 const ownerFile=path.join(directory,'.owner.json');
 const markOwner=()=>{try{fs.writeFileSync(ownerFile,JSON.stringify({helper:child.pid,child:childPid}),{mode:0o600});}catch{}};
 markOwner();
 let proven=false,ended=false,exitCode=null,exitSignal=null,childExit=null,childPid=null,stopping,output='';let stoppedResolve,exitResolve;
 const stopped=new Promise(resolve=>stoppedResolve=resolve),exit=new Promise(resolve=>exitResolve=resolve);
 child.stdout.on('data',chunk=>{output+=chunk;let end;while((end=output.indexOf('\n'))>=0){const line=output.slice(0,end).replace(/\r$/,'');output=output.slice(end+1);if(/^STARTED \d+$/.test(line)&&childPid===null){childPid=Number(line.split(' ')[1]);markOwner();}else if(/^STOPPED -?\d+$/.test(line)){childExit=Number(line.split(' ')[1]);proven=true;stoppedResolve(true);}else control.end();}if(output.length>64)control.end();});
 child.once('error',()=>{ended=true;stoppedResolve(false);exitResolve(false);});
 child.once('exit',(code,signal)=>{ended=true;exitCode=code;exitSignal=signal;stoppedResolve(proven);exitResolve(code===0);});
 return {alive:()=>!proven&&!ended,childExit:()=>childExit,ownedPids:()=>[child.pid,childPid].filter(Boolean),helperExit:()=>({code:exitCode,signal:exitSignal,ended}),stop:afterStopped=>stopping??=(async()=>{
  if(!proven&&!ended&&!control.destroyed)control.write('T');
  const proof=await Promise.race([stopped,delay(10000)]);let savedError;
  try{if(proof&&afterStopped)await afterStopped();}catch(error){savedError=error;}
  finally{if(!control.destroyed)control.end('D');}
  const cleaned=await Promise.race([exit,delay(10000)]);if(savedError)throw savedError;return proof&&cleaned&&exitCode===0;
 })()};
}
module.exports={spawnOwned,verified};
