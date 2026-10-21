import {spawn} from 'node:child_process';
import {fstatSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {Socket} from 'node:net';
import {buildSupervisor} from './build-persistent-supervisor.mjs';
import {installStopHandlers} from './persistent-lifecycle.mjs';
export function inheritedLease(directory){
 if(!process.env.CRM_SUPERVISED_BOOT)return null;
 if(process.platform!=='darwin'||!/^[a-f0-9-]{36}$/i.test(process.env.CRM_SUPERVISED_BOOT))throw Error('SUPERVISOR_PROTOCOL');
 const fd=fstatSync(4),path=lstatSync(join(directory,'.operation.guard'));
 if(!fd.isFile()||path.isSymbolicLink()||fd.ino!==path.ino||fd.dev!==path.dev||fd.uid!==process.getuid()||(fd.mode&0o077))throw Error('SUPERVISOR_LEASE_MISMATCH');
 return {bootId:process.env.CRM_SUPERVISED_BOOT.toLowerCase()};
}
export function watchSupervisor(onLoss){const life=new Socket({fd:5,readable:true,writable:false});life.on('end',onLoss);life.on('error',onLoss);life.resume();life.unref();return life;}
export async function supervise({root,directory,args,env}){
 const child=spawn(buildSupervisor(root),[join(directory,'.operation.guard'),process.execPath,'scripts/dev-persistent.mjs',...args],{cwd:root,env,detached:true,stdio:['inherit','inherit','inherit','pipe']});
 const stop=()=>{child.stdio[3].end();};child.stdio[3].on('error',()=>{});
 const remove=installStopHandlers(stop);const ended=new Promise((ok,no)=>{child.once('exit',code=>ok(code??1));child.once('error',no);});
 try{const code=await ended;if(code===73)console.error('LOCK_ACTIVE: 原后台仍持有系统运行锁；没有启动第二组服务。');return code===73?1:code;}finally{remove();}
}
