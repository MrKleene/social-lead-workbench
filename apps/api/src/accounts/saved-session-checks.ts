import {ConflictException,ForbiddenException,NotFoundException} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import type {Db} from '../common/db';
import {requireAdmin,type Actor} from '../auth/security';
import type {DeviceService,ExecutionPermit} from '../devices/device.service';
import type {LoginRuntime,SessionDriver} from './login-runtime';
import {sessionHealth} from './session-health';

type Result={state:string;provider:string;verifiedAt:Date|null;retryAt?:Date|null;cached?:boolean};
/** One bounded status-only probe. Never requests a QR or adopts/replaces credentials. */
export class SavedSessionChecks {
 private flights=new Map<string,Promise<Result>>();
 private aborts=new Set<AbortController>();
 constructor(private db:Db,private runtime:LoginRuntime,private devices?:DeviceService){}
 check(actor:Actor,accountId:string,automatic=false):Promise<Result>{
  requireAdmin(actor);
  const existing=this.flights.get(accountId);if(existing){if(automatic)return existing;throw new ConflictException('登录检查正在进行');}
  const pending=this.run(actor,accountId,automatic).finally(()=>this.flights.delete(accountId));
  this.flights.set(accountId,pending);return pending;
 }
 async stop(){for(const abort of this.aborts)abort.abort();await Promise.allSettled(this.flights.values());}
 private async run(actor:Actor,accountId:string,automatic:boolean):Promise<Result>{
  if(!this.runtime.persistent()||!this.runtime.mode()||this.runtime.mode()==='real'&&!this.devices?.enabled())throw new ForbiddenException('本机会话检查需要已批准的持久执行设备');
  const initial=await this.db.platformAccount.findUnique({where:{id:accountId},include:{sessionReference:true}});
  if(!initial||initial.archivedAt||initial.platform!=='XHS')throw new NotFoundException();
  const prior=initial.sessionReference;
  if(!prior||prior.sessionKey!==initial.loginSessionKey||prior.provider!==initial.loginProvider||prior.provider!==this.runtime.mode()||!initial.loginPlatformUserId)throw new ConflictException('没有可信的本机会话引用，请在账号中心核查');
  if(prior.deviceId!==this.runtime.deviceId())return {state:'DEVICE_MISMATCH',provider:prior.provider,verifiedAt:prior.verifiedAt};
  if(initial.status==='RESTRICTED'||prior.state==='RESTRICTED')return {state:'RESTRICTED',provider:prior.provider,verifiedAt:prior.verifiedAt};
  const health=sessionHealth(prior,this.runtime.runtimeId);
  if(health.retryAt){if(!automatic)throw new ConflictException('检查正在进行或短暂退避中');return {state:health.state,provider:prior.provider,verifiedAt:prior.verifiedAt,retryAt:health.retryAt};}
  if(automatic&&!health.checkable)return {state:health.state,provider:prior.provider,verifiedAt:prior.verifiedAt};
  // The same device/account lease is used by collection, so probes cannot share a browser.
  let permit:ExecutionPermit|undefined;
  try{permit=this.devices?.enabled()?await this.devices.acquire(actor,accountId):undefined;}
  catch(error){if(!automatic||error instanceof ForbiddenException)throw error;return {state:'BUSY_OR_DEVICE_UNAVAILABLE',provider:prior.provider,verifiedAt:prior.verifiedAt};}
  const generation=randomUUID(),abort=new AbortController();this.aborts.add(abort);
  const revoke=()=>abort.abort();permit?.signal.addEventListener('abort',revoke,{once:true});if(permit?.signal.aborted)abort.abort();
  let driver:SessionDriver|undefined,timer:NodeJS.Timeout|undefined,timedOut=false;
  try{
   const reserved=await this.db.$transaction(async tx=>{
    if(permit)await this.devices!.lock(tx);
    await tx.$queryRaw`SELECT id FROM "PlatformAccount" WHERE id=${accountId} FOR UPDATE`;
    const account=await tx.platformAccount.findUniqueOrThrow({where:{id:accountId}}),ref=await tx.accountSessionReference.findUniqueOrThrow({where:{accountId}});
    if(account.archivedAt||account.status==='RESTRICTED'||account.version!==initial.version||ref.sessionKey!==prior.sessionKey||ref.deviceId!==prior.deviceId||ref.deviceKeyId!==prior.deviceKeyId)throw new ConflictException('账号或会话已变化，请刷新');
    if(await tx.collectionRun.findFirst({where:{status:{in:['QUEUED','RUNNING']},execution:{path:['accountId'],equals:accountId}}})||await tx.accountLogin.findFirst({where:{accountId,state:{in:['STARTING','WAITING','SAVING']}}}))return false;
    if(ref.checkingUntil&&ref.checkingUntil>new Date())return false;
    if(permit)await this.devices!.assertPermit(tx,permit);
    await tx.accountSessionReference.update({where:{accountId},data:{state:'CHECKING',checkedRuntimeId:generation,checkingUntil:new Date(Date.now()+60_000)}});
    await tx.auditLog.create({data:{actorId:actor.id,entityId:accountId,action:'SAVED_SESSION_CHECK_STARTED',metadata:{purpose:automatic?'collection-preflight':'manual',provider:ref.provider}}});return true;
   });
   if(!reserved)return {state:'BUSY',provider:prior.provider,verifiedAt:prior.verifiedAt};
   timer=setTimeout(()=>{timedOut=true;abort.abort();},45_000);
   let state='CONNECTION_ERROR';
   try{
    state=await this.runtime.inspect(accountId,prior.sessionKey,prior.deviceId,prior.provider,permit?.root);
    if(state==='UNVERIFIED'&&!abort.signal.aborted){
     driver=await this.runtime.openSaved(accountId,prior.sessionKey,abort.signal,permit?.root);
     const status=await driver.status(abort.signal);
     state=status.loggedIn===false?'EXPIRED':status.loggedIn===true?(status.userId===initial.loginPlatformUserId?'VERIFIED':'NEEDS_REVIEW'):'CONNECTION_ERROR';
    }
    if(abort.signal.aborted)state='CONNECTION_ERROR';
   }catch(error){const code=error instanceof Error?error.message:'';state=code==='RATE_LIMITED'?'RATE_LIMITED':code==='RESTRICTED'?'RESTRICTED':'CONNECTION_ERROR';}
   clearTimeout(timer);await driver?.stop().catch(()=>{state='CONNECTION_ERROR';});driver=undefined;
   return await this.db.$transaction(async tx=>{
    if(permit)await this.devices!.lock(tx);
    await tx.$queryRaw`SELECT id FROM "PlatformAccount" WHERE id=${accountId} FOR UPDATE`;
    const account=await tx.platformAccount.findUniqueOrThrow({where:{id:accountId}}),ref=await tx.accountSessionReference.findUniqueOrThrow({where:{accountId}}),user=await tx.user.findUnique({where:{id:actor.id}});
    if(ref.checkedRuntimeId!==generation||ref.sessionKey!==prior.sessionKey||ref.deviceId!==prior.deviceId||ref.deviceKeyId!==prior.deviceKeyId)throw new ConflictException('会话或设备已变化，本次结果已丢弃');
    if(account.archivedAt||account.version!==initial.version||account.loginSessionKey!==prior.sessionKey||account.loginProvider!==prior.provider||account.loginPlatformUserId!==initial.loginPlatformUserId||account.status==='RESTRICTED'||!user?.active||user.role!=='ADMIN'||abort.signal.aborted&&!timedOut)state='UNVERIFIED';
    if(permit)try{await this.devices!.assertPermit(tx,permit);}catch{state='UNVERIFIED';}
    const retryAt=new Date(Date.now()+(state==='VERIFIED'?10_000:state==='RATE_LIMITED'||state==='RESTRICTED'?300_000:30_000));
    const updated=await tx.accountSessionReference.update({where:{accountId},data:{state,checkedRuntimeId:state==='VERIFIED'?this.runtime.runtimeId:null,checkingUntil:retryAt,...(state==='VERIFIED'?{verifiedAt:new Date()}:{})}});
    await tx.auditLog.create({data:{actorId:actor.id,entityId:accountId,action:'SAVED_SESSION_CHECK_RESULT',metadata:{state,provider:prior.provider,purpose:automatic?'collection-preflight':'manual'}}});
    return {state:updated.state,provider:updated.provider,verifiedAt:updated.verifiedAt,retryAt};
   });
  }finally{clearTimeout(timer);abort.abort();await driver?.stop().catch(()=>{});this.aborts.delete(abort);permit?.signal.removeEventListener('abort',revoke);await permit?.release();}
 }
}
