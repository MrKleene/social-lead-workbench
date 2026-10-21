import {spawn} from 'node:child_process';
import {openSync,closeSync,constants} from 'node:fs';
// Explicit project-local detachment only. No launchd, shell interpolation or login item.
export function launchDetached(command,args,{cwd,log,env}){
 const fd=openSync(log,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 try{
  const child=spawn(command,args,{cwd,env,detached:true,stdio:['ignore',fd,fd]});
  child.on('error',()=>{});child.unref();return child;
 }finally{closeSync(fd);}
}
