import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {createServer} from 'node:net';
import platform from '../runtime/platform.cjs';
import {buildInstanceLock} from './build-instance-lock.mjs';
const digest=b=>createHash('sha256').update(b).digest('hex');
const uuid=s=>typeof s==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(s);
export class LockError extends Error {constructor(code){super(code);this.code=code;}}
async function optional(path){try{await platform.privateFile(path);return await readFile(path);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function atomic(path,value){const temporary=path+'.'+randomUUID()+'.tmp';await writeFile(temporary,JSON.stringify(value),{flag:'wx',mode:0o600});try{await rename(temporary,path);}finally{await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}}
async function guard(root,directory){
 let binary;try{binary=buildInstanceLock(root);}catch{throw new LockError('LOCK_HELPER_BUILD_FAILED');}
 const child=spawn(binary,[join(directory,'.operation.guard')],{stdio:['pipe','pipe','ignore'],env:platform.minimalEnvironment()});child.stdin.on('error',()=>{});
 let released=false;const ended=new Promise(ok=>{child.once('exit',ok);child.once('error',()=>ok(74));});
 const lost=ended.then(()=>{if(!released)throw new LockError('LOCK_GUARD_LOST');});lost.catch(()=>{});
 let bootId;try{bootId=await new Promise((ok,no)=>{let text='';const timer=setTimeout(()=>{child.kill();no(new LockError('LOCK_GUARD_TIMEOUT'));},10000);const fail=code=>{clearTimeout(timer);no(new LockError(code===73?'LOCK_ACTIVE':'LOCK_GUARD_FAILED'));};child.once('error',()=>fail(74));child.once('exit',fail);child.stdout.on('data',b=>{text+=b;if(text.length>200){child.kill();return fail(74);}if(!text.includes('\n'))return;try{const data=JSON.parse(text);if(!uuid(data.bootId))throw Error();clearTimeout(timer);ok(data.bootId);}catch{fail(74);}});});}catch(e){released=true;child.stdin.end();await ended;throw e;}
 return {bootId,lost,async release(){released=true;child.stdin.end();await ended;}};
}
// A missing PID or closed HTTP port is never proof that a detached worker exited.
// Recovery proof is a different OS boot plus a byte-identical, explicit witness.
export function recoveryProven(lock,witness,bootId,lockBytes,manifestBytes){
 if(!uuid(bootId))return false;
 if(lock.kind==='crm-persistent-lock-v2'&&uuid(lock.token)&&uuid(lock.bootId)&&lock.bootId!==bootId)return true;
 return witness?.kind==='crm-lock-reboot-witness-v1'&&uuid(witness.bootId)&&witness.bootId!==bootId&&witness.lockHash===digest(lockBytes)&&witness.manifestHash===digest(manifestBytes);
}
async function freePorts(ports){
 const servers=[];try{for(const port of ports){if(!Number.isInteger(port)||port<1024||port>65535)throw new LockError('LOCK_METADATA_INVALID');const server=createServer();servers.push(server);await new Promise((ok,no)=>{server.once('error',()=>no(new LockError('LOCK_SERVICE_OCCUPIED')));server.listen({host:'127.0.0.1',port,exclusive:true},ok);});}}finally{await Promise.all(servers.map(s=>new Promise(ok=>{if(s.listening)s.close(ok);else ok();})));}
}
export async function acquireInstanceLock({root,directory,name,mode,prepareRecovery=false}){
 const file=join(directory,'operation.lock');
 // Keep existing non-Mac behavior; no unverified cross-platform recovery claim.
 if(process.platform!=='darwin'){
  if(prepareRecovery)throw new LockError('LOCK_RECOVERY_MAC_ONLY');
  const token=randomUUID();await writeFile(file,JSON.stringify({pid:process.pid,token,startedAt:new Date().toISOString()}),{flag:'wx',mode:0o600});
  return {lost:new Promise(()=>{}),async release(){const value=JSON.parse(await readFile(file));if(value.token!==token)throw new LockError('LOCK_CHANGED');await unlink(file);}};
 }
 const owned=await guard(root,directory);let token;
 try{
  const bytes=await optional(file);
  if(prepareRecovery&&!bytes)throw new LockError('LOCK_NOT_PRESENT');
  if(bytes){
   let old;try{old=JSON.parse(bytes);}catch{throw new LockError('LOCK_METADATA_INVALID');}
   const manifestBytes=await optional(join(directory,'instance.json'));if(!manifestBytes)throw new LockError('LOCK_METADATA_INVALID');
   const manifest=JSON.parse(manifestBytes);if(manifest.root!==root||manifest.name!==name||manifest.mode!==mode||manifest.kind!=='crm-persistent-v1')throw new LockError('LOCK_METADATA_INVALID');
   if(prepareRecovery){
    // Does not stop anything or alter the real lock. Reboot is still required.
    await atomic(join(directory,'lock-recovery.json'),{kind:'crm-lock-reboot-witness-v1',bootId:owned.bootId,lockHash:digest(bytes),manifestHash:digest(manifestBytes)});
    await owned.release();return {prepared:true};
   }
   const witnessBytes=await optional(join(directory,'lock-recovery.json'));let witness;try{witness=witnessBytes?JSON.parse(witnessBytes):null;}catch{throw new LockError('LOCK_METADATA_INVALID');}
   if(!recoveryProven(old,witness,owned.bootId,bytes,manifestBytes))throw new LockError('LOCK_REBOOT_PROOF_REQUIRED');
   await freePorts([manifest.apiPort,manifest.webPort]);
   // Compare again immediately before replacing, never unlink/recreate a gap.
   if(!bytes.equals(await readFile(file))||!manifestBytes.equals(await readFile(join(directory,'instance.json'))))throw new LockError('LOCK_CHANGED');
  }
  token=randomUUID();const record={kind:'crm-persistent-lock-v2',pid:process.pid,token,bootId:owned.bootId,startedAt:new Date().toISOString()};
  if(bytes)await atomic(file,record);else await writeFile(file,JSON.stringify(record),{flag:'wx',mode:0o600});
  return {lost:owned.lost,recovered:!!bytes,async release(){try{const current=JSON.parse(await readFile(file));if(current.token!==token)throw new LockError('LOCK_CHANGED');await unlink(file);}finally{await owned.release();}}};
 }catch(e){await owned.release();throw e;}
}
export function lockMessage(code){return ({
 LOCK_HELPER_BUILD_FAILED:'本机锁助手编译失败；需要已安装的Swift工具链，未安装软件或修改原实例。',
 LOCK_GUARD_FAILED:'无法取得或校验系统锁/启动标识；原锁保留，不会猜测恢复。',
 LOCK_GUARD_TIMEOUT:'系统锁助手超时；原锁保留，未启动业务服务。',
 LOCK_METADATA_INVALID:'锁或原实例元数据不完整/不匹配；未创建替代实例，请保留文件检查。',
 LOCK_ACTIVE:'已有启动器持有系统锁；本次未启动或停止任何服务。请在原启动终端正常退出。',
 LOCK_REBOOT_PROOF_REQUIRED:'锁的归属无法确证，未删除。可先运行 npm run dev:persistent -- --prepare-lock-recovery，按提示重启 Mac 后再运行原启动命令；保留同一实例、数据库和端口。',
 LOCK_SERVICE_OCCUPIED:'已取得重启证据，但原 API 或网页端口仍被占用；未覆盖锁或停止服务。',
 LOCK_CHANGED:'实例锁或运行配置发生变化，恢复已停止；未覆盖其他运行。',
 LOCK_NOT_PRESENT:'没有待恢复的实例锁；未创建实例或启动服务。',
 LOCK_GUARD_LOST:'系统锁守护意外退出；正在停止本次自有服务，保留数据。'
 })[code]||null;}
