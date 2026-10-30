import {accountSystemBlock,recordedAccountBlocks} from '../accounts/account-execution-policy';
import {boundAccountNickname} from '../accounts/account-display';
import {randomUUID} from 'node:crypto';
import {sessionHealth} from '../accounts/session-health';
import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Db } from '../common/db';
import { Actor, requireAdmin } from '../auth/security';
import { DeviceService, ExecutionPermit } from '../devices/device.service';
import { LoginRuntime, SessionDriver } from '../accounts/login-runtime';
import { accountReadMode } from './mcp/policy';
import { XhsMcpAdapter } from './adapters/xhs-mcp';
import { ReadFailure } from './contract';
export const readConsent = 'account-read-window-v1';
export const executionSchema = z.object({accountId:z.string().min(1),actorId:z.string().min(1),deviceId:z.string().uuid(),keyId:z.string().uuid(),sessionKey:z.string().uuid(),platformUserId:z.string().min(1),accountVersion:z.number().int(),runtimeId:z.string().min(1),mode:z.enum(['XHS_MCP','XHS_FIXTURE']),consent:z.literal(readConsent)}).strict();
export type ReadExecution = z.infer<typeof executionSchema>;
@Injectable()
export class AccountReadService {
  constructor(@Inject(Db) private db:Db,@Inject(DeviceService) private devices:DeviceService,@Inject(LoginRuntime) private runtime:LoginRuntime){}
  private eligible(a:{platform:string;archivedAt:Date|null;loginProvider:string|null;loginPlatformUserId:string|null;status:string;pauseReason:string|null}) {
    return a.platform==='XHS'&&!a.archivedAt&&a.loginProvider===this.runtime.mode()&&!!a.loginPlatformUserId&&!accountSystemBlock(a);
  }
  async readiness(actor:Actor){
    requireAdmin(actor); const mode=accountReadMode(); const state=await this.devices.status(actor);
    const approved=await this.db.executionDevice.findFirst({where:{enabled:true},select:{id:true,keyId:true}});
    const rows=mode?await this.db.platformAccount.findMany({where:{archivedAt:null,platform:'XHS'},include:{sessionReference:true},orderBy:{createdAt:'asc'}}):[];
    const riskBlocks=await recordedAccountBlocks(this.db,rows.map(a=>a.id));
    return {enabled:!!mode,mode:mode||null,accountBound:true,reason:state.device?.online?'READY':'DEVICE_UNAVAILABLE',lastCheck:null,loginOnly:false,configurationOnly:false,coverage:'WINDOW_ONLY',automaticPolling:false,maxPosts:3,device:state.device,sessionCheckVersion:2,accounts:rows.map(a=>{const health=sessionHealth(a.sessionReference,process.env.CRM_RUNTIME_ID),ref=a.sessionReference,bound=!!ref&&ref.sessionKey===a.loginSessionKey&&ref.provider===a.loginProvider&&ref.deviceId===approved?.id&&ref.deviceKeyId===approved?.keyId,allowed=this.eligible(a)&&!riskBlocks.has(a.id)&&bound;return {id:a.id,label:a.label,loginNickname:bound?boundAccountNickname(a):null,platformUserId:a.loginPlatformUserId,eligible:allowed&&health.taskAllowed,reason:accountSystemBlock(a)||riskBlocks.has(a.id)?'RESTRICTED':ref&&!bound?'NEEDS_REVIEW':health.state==='VERIFIED'?'PREVIOUSLY_VERIFIED':health.state,canCheck:allowed&&health.checkable,retryAt:health.retryAt,verifiedAt:health.verifiedAt};})};
  }
  async authorize(tx:Prisma.TransactionClient,actor:Actor,mode:string,accountId?:string,consent?:string):Promise<ReadExecution>{
    requireAdmin(actor);if(!accountId||consent!==readConsent)throw new BadRequestException('请选择账号并逐次确认本机会话只读用途');
    if(mode!==accountReadMode())throw new ForbiddenException('执行模式不符');
    await tx.$queryRaw`SELECT id FROM "PlatformAccount" WHERE id=${accountId} FOR UPDATE`;
    if(await tx.collectionRun.findFirst({where:{status:{in:['QUEUED','RUNNING']},execution:{path:['accountId'],equals:accountId}}}))throw new ForbiddenException('该账号已有排队或运行任务，请稍后重试');
    if(await tx.deviceExecutionLease.findFirst({where:{accountId,expiresAt:{gt:new Date()}}}))throw new ForbiddenException('账号检查或执行任务进行中，请稍后重试');
    const a=await tx.platformAccount.findUnique({where:{id:accountId},include:{sessionReference:true}}),d=await tx.executionDevice.findFirst({where:{enabled:true}}),u=await tx.user.findUnique({where:{id:actor.id}});
    const ref=a?.sessionReference;
    if(!a||!this.eligible(a)||(await recordedAccountBlocks(tx,[a.id])).has(a.id)||!u?.active||u.role!=='ADMIN'||!d||!ref||!sessionHealth(ref).taskAllowed||ref.deviceId!==d.id||ref.deviceKeyId!==d.keyId||ref.provider!==this.runtime.mode()||ref.sessionKey!==a.loginSessionKey)throw new ForbiddenException('账号、稳定ID或批准会话未就绪；请在账号中心核验，受限或风险待核查账号不可采集');
    return executionSchema.parse({accountId,actorId:actor.id,deviceId:d.id,keyId:d.keyId,sessionKey:ref.sessionKey,platformUserId:a.loginPlatformUserId,accountVersion:a.version,runtimeId:process.env.CRM_RUNTIME_ID,mode,consent});
  }
  async guard(tx:Prisma.TransactionClient,e:ReadExecution,permit?:ExecutionPermit,checkId?:string){
    if(e.runtimeId!==process.env.CRM_RUNTIME_ID||e.mode!==accountReadMode())throw new ReadFailure('AUTHORIZATION_ENDED');
    const a=await tx.platformAccount.findUnique({where:{id:e.accountId},include:{sessionReference:true}}),u=await tx.user.findUnique({where:{id:e.actorId}}),d=await tx.executionDevice.findUnique({where:{id:e.deviceId}}),ref=a?.sessionReference;
    if(!u?.active||u.role!=='ADMIN')throw new ReadFailure('AUTHORIZATION_ENDED');
    if(!d?.enabled||d.keyId!==e.keyId)throw new ReadFailure('DEVICE_UNAVAILABLE');
    if(!a||!this.eligible(a)||(await recordedAccountBlocks(tx,[a.id])).has(a.id)||a.version!==e.accountVersion||a.loginPlatformUserId!==e.platformUserId||!ref||ref.sessionKey!==e.sessionKey||ref.provider!==this.runtime.mode()||ref.deviceId!==e.deviceId||ref.deviceKeyId!==e.keyId||!['VERIFIED','UNVERIFIED','CONNECTION_ERROR'].includes(ref.state))throw new ReadFailure('ACCOUNT_CHANGED');
    if(checkId&&ref.checkedRuntimeId!==checkId)throw new ReadFailure('ACCOUNT_CHANGED');
    if(permit)try{await this.devices.assertPermit(tx,permit);}catch{throw new ReadFailure('DEVICE_UNAVAILABLE');}
  }
  async open(value:unknown,cancelled:()=>Promise<boolean>=async()=>false,taskId?:string){
    const e=executionSchema.parse(value),checkId=`${e.runtimeId}:task:${taskId||randomUUID()}`;await this.guard(this.db,e);
    const actor=await this.db.user.findUniqueOrThrow({where:{id:e.actorId}});
    let permit:ExecutionPermit;try{permit=await this.devices.acquire(actor,e.accountId);}catch{throw new ReadFailure('DEVICE_UNAVAILABLE');}
    const abort=new AbortController(),revoke=()=>abort.abort();permit.signal.addEventListener('abort',revoke,{once:true});if(permit.signal.aborted)abort.abort();
    let driver:SessionDriver|undefined,reader:XhsMcpAdapter|undefined,probeStarted=false,probeVerified=false;
    const close=async()=>{abort.abort();permit.signal.removeEventListener('abort',revoke);try{await reader?.close();}finally{try{await driver?.stop();}finally{await permit.release();}}};
    const check=async()=>{try{if(await cancelled())throw new ReadFailure('PAUSED');await this.guard(this.db,e,permit,probeStarted?checkId:undefined);if(abort.signal.aborted)throw new ReadFailure('DEVICE_UNAVAILABLE');}catch(err){abort.abort();throw err;}};
    let polling=false;const monitor=setInterval(()=>{if(!polling){polling=true;void check().catch(()=>{}).finally(()=>{polling=false;});}},100);monitor.unref();
    try{
      await check();if(await this.runtime.inspect(e.accountId,e.sessionKey,e.deviceId,this.runtime.mode()!,permit.root)!=='UNVERIFIED')throw new ReadFailure('ACCOUNT_CHANGED');
      await this.db.$transaction(async tx=>{await this.devices.lock(tx);await tx.$queryRaw`SELECT id FROM "PlatformAccount" WHERE id=${e.accountId} FOR UPDATE`;await this.guard(tx,e,permit);await tx.accountSessionReference.update({where:{accountId:e.accountId},data:{checkedRuntimeId:checkId}});await tx.auditLog.create({data:{actorId:e.actorId,entityId:taskId||e.accountId,action:'ACCOUNT_TASK_LOGIN_CHECK_STARTED',metadata:{purpose:'task-start'}}});});
      probeStarted=true;
      driver=await this.runtime.openSaved(e.accountId,e.sessionKey,AbortSignal.any([abort.signal,AbortSignal.timeout(160000)]),permit.root);
      const status=await driver.status(AbortSignal.any([abort.signal,AbortSignal.timeout(40000)]));
      if(status.loggedIn===false)throw new ReadFailure('LOGIN_EXPIRED');
      if(status.loggedIn!==true)throw new ReadFailure('MCP_PROTOCOL');
      if(!status.userId||status.userId!==e.platformUserId)throw new ReadFailure('IDENTITY_MISMATCH');
      await check();
      await this.db.$transaction(async tx=>{await this.devices.lock(tx);await tx.$queryRaw`SELECT id FROM "PlatformAccount" WHERE id=${e.accountId} FOR UPDATE`;await this.guard(tx,e,permit,checkId);await tx.accountSessionReference.update({where:{accountId:e.accountId},data:{state:'VERIFIED',verifiedAt:new Date(),checkedRuntimeId:checkId,checkingUntil:null}});await tx.auditLog.create({data:{actorId:e.actorId,entityId:taskId||e.accountId,action:'ACCOUNT_TASK_LOGIN_CHECK_RESULT',metadata:{state:'VERIFIED',purpose:'task-start'}}});});
      probeVerified=true;
      if(!driver.readTransport)throw new ReadFailure('UNSUPPORTED');
      reader=new XhsMcpAdapter(driver.readTransport(),true,e.mode,undefined,check);
      return {reader,check,commitGuard:async(tx:Prisma.TransactionClient)=>{await this.devices.lock(tx);await tx.$queryRaw`SELECT id FROM "PlatformAccount" WHERE id=${e.accountId} FOR UPDATE`;await tx.$queryRaw`SELECT id FROM "User" WHERE id=${e.actorId} FOR SHARE`;await this.guard(tx,e,permit,checkId);},close:async()=>{clearInterval(monitor);await close();}};
    }catch(error){const ended=abort.signal.aborted;clearInterval(monitor);await close();if(probeStarted&&!probeVerified)await this.db.auditLog.create({data:{actorId:e.actorId,entityId:taskId||e.accountId,action:'ACCOUNT_TASK_LOGIN_CHECK_RESULT',metadata:{state:'FAILED',reason:error instanceof ReadFailure?error.code:'CONNECTION_ERROR',purpose:'task-start'}}});if(error instanceof ReadFailure)throw error;const message=error instanceof Error?error.message:'';throw new ReadFailure(['RATE_LIMITED','RESTRICTED'].includes(message)?message as 'RATE_LIMITED'|'RESTRICTED':ended?'AUTHORIZATION_ENDED':message==='TIMEOUT'||error instanceof Error&&['TimeoutError','AbortError'].includes(error.name)?'TIMEOUT':'MCP_PROTOCOL');}
  }
  async failure(value:unknown,reason?:string,taskId?:string){
    const parsed=executionSchema.safeParse(value);if(!parsed.success||!['RATE_LIMITED','RESTRICTED','LOGIN_EXPIRED','IDENTITY_MISMATCH','TIMEOUT','MCP_PROTOCOL'].includes(reason||''))return;
    const e=parsed.data;await this.db.$transaction(async tx=>{
      await this.devices.lock(tx);await tx.$queryRaw`SELECT id FROM "PlatformAccount" WHERE id=${e.accountId} FOR UPDATE`;
      const current=await tx.platformAccount.findUnique({where:{id:e.accountId},include:{sessionReference:true}}),ref=current?.sessionReference;
      if(!current||current.version!==e.accountVersion||current.loginSessionKey!==e.sessionKey||current.loginPlatformUserId!==e.platformUserId||!ref||ref.deviceId!==e.deviceId||ref.deviceKeyId!==e.keyId||ref.sessionKey!==e.sessionKey||taskId&&ref.checkedRuntimeId!==`${e.runtimeId}:task:${taskId}`)return;
      const connection=reason==='TIMEOUT'||reason==='MCP_PROTOCOL';
      if(!connection)await tx.platformAccount.updateMany({where:{id:e.accountId,loginSessionKey:e.sessionKey},data:{status:'RESTRICTED',pauseReason:reason,version:{increment:1}}});
      await tx.accountSessionReference.updateMany({where:{accountId:e.accountId,sessionKey:e.sessionKey},data:{state:connection?'CONNECTION_ERROR':reason==='LOGIN_EXPIRED'?'EXPIRED':'NEEDS_REVIEW',checkedRuntimeId:null,checkingUntil:connection?new Date(Date.now()+30000):null}});
      await tx.auditLog.create({data:{actorId:e.actorId,entityId:e.accountId,action:'ACCOUNT_READ_STOPPED',metadata:{reason}}});
    });
  }
}
