import {windowsCall} from '../../../../runtime/platform.cjs';
import { spawn } from 'node:child_process';
import { lstat, realpath } from 'node:fs/promises';
import { join } from 'node:path';

// OS storage is separate from public device metadata and from platform sessions.
// Only called on explicit approval or to prove an already approved identity.
export async function deviceVault(operation:'put'|'get', deviceId:string, keyId:string, value?:string):Promise<string> {
  if(process.platform==='win32'){
    if(!value)throw Error('DEVICE_VAULT_VALUE_REQUIRED');
    return windowsCall({operation:operation==='put'?'protect':'unprotect',deviceId,keyId,value});
  }
  if(process.platform!=='darwin'||process.arch!=='arm64')throw Error('DEVICE_VAULT_UNSUPPORTED');
  const root=process.env.CRM_PROJECT_ROOT||'',binary=join(root,'apps/api/dist/native/device-vault');
  if(!root.startsWith('/')||await realpath(root)!==root)throw Error('DEVICE_VAULT_UNAVAILABLE');
  const st=await lstat(binary);
  if(!st.isFile()||st.isSymbolicLink()||st.uid!==process.getuid!()||(st.mode&0o022))throw Error('DEVICE_VAULT_UNAVAILABLE');
  return new Promise((resolve,reject)=>{
    const child=spawn(binary,[],{env:{HOME:process.env.HOME,PATH:'/usr/bin:/bin'},stdio:['pipe','pipe','ignore']});
    let output='',finished=false;
    const fail=()=>{if(finished)return;finished=true;clearTimeout(timer);child.kill();reject(Error('DEVICE_VAULT_UNAVAILABLE'));};
    const timer=setTimeout(fail,10000);
    child.on('error',fail);child.stdin.on('error',fail);
    child.stdout.on('data',chunk=>{output+=chunk;if(output.length>16000)fail();});
    child.on('close',code=>{if(finished)return;if(code!==0)return fail();finished=true;clearTimeout(timer);try{const result=JSON.parse(output);if(typeof result.value!=='string')throw Error();resolve(result.value);}catch{reject(Error('DEVICE_VAULT_UNAVAILABLE'));}});
    child.stdin.end(JSON.stringify({operation,deviceId,keyId,...(value?{value}:{})}));
  });
}
