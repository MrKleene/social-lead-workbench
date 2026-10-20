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
const initialPauseReasons = ['登录已验证；真实采集与发送仍禁用','登录已验证；只读采集须逐次确认，发送禁用'];
@Injectable()
export class AccountReadService {
  constructor(@Inject(Db) private db:Db,@Inject(DeviceService) private devices:DeviceService,@Inject(LoginRuntime) private runtime:LoginRuntime){}
  private eligible(a:{platform:string;archivedAt:Date|null;loginProvider:string|null;loginPlatformUserId:string|null;status:string;pauseReason:string|null}) {
    return a.platform==='XHS'&&!a.archivedAt&&a.loginProvider===this.runtime.mode()&&!!a.loginPlatformUserId&&a.status==='PAUSED'&&initialPauseReasons.includes(a.pauseReason||'');
  }
  async readiness(actor:Actor){
    requireAdmin(actor); const mode=accountReadMode(); const state=await this.devices.status(actor);
    const rows=mode?await this.db.platformAccount.findMany({where:{archivedAt:null,platform:'XHS'},include:{sessionReference:true},orderBy:{createdAt:'asc'}}):[];
    return {enabled:!!mode,mode:mode||null,accountBound:true,reason:state.device?.online?'READY':'DEVICE_UNAVAILABLE',lastCheck:null,loginOnly:false,configurationOnly:false,coverage:'WINDOW_ONLY',automaticPolling:false,maxPosts:3,device:state.device,accounts:rows.map(a=>({id:a.id,label:a.label,platformUserId:a.loginPlatformUserId,eligible:this.eligible(a)&&a.sessionReference?.state==='VERIFIED'&&a.sessionReference.checkedRuntimeId===process.env.CRM_RUNTIME_ID,reason:a.sessionReference?.state||'LOGIN_REQUIRED'}))};
  }
  async authorize(tx:Prisma.TransactionClient,actor:Actor,mode:string,accountId?:string,consent?:string):Promise<ReadExecution>{
    requireAdmin(actor);if(!accountId||consent!==readConsent)throw new BadRequestException('请选择账号并逐次确认本机会话只读用途');
    if(mode!==accountReadMode())throw new ForbiddenException('执行模式不符');
    const a=await tx.platformAccount.findUnique({where:{id:accountId},include:{sessionReference:true}}),d=await tx.executionDevice.findFirst({where:{enabled:true}}),u=await tx.user.findUnique({where:{id:actor.id}});
    const ref=a?.sessionReference;
    if(!a||!this.eligible(a)||!u?.active||u.role!=='ADMIN'||!d||!ref||ref.state!=='VERIFIED'||ref.checkedRuntimeId!==process.env.CRM_RUNTIME_ID||ref.deviceId!==d.id||ref.deviceKeyId!==d.keyId||ref.provider!==this.runtime.mode()||ref.sessionKey!==a.loginSessionKey)throw new ForbiddenException('账号、稳定ID或批准会话未就绪；请在账号中心核验，暂停/风控账号不可采集');
    return executionSchema.parse({accountId,actorId:actor.id,deviceId:d.id,keyId:d.keyId,sessionKey:ref.sessionKey,platformUserId:a.loginPlatformUserId,accountVersion:a.version,runtimeId:process.env.CRM_RUNTIME_ID,mode,consent});
  }
  async guard(tx:Prisma.TransactionClient,e:ReadExecution,permit?:ExecutionPermit){
    if(e.runtimeId!==process.env.CRM_RUNTIME_ID||e.mode!==accountReadMode())throw new ReadFailure('AUTHORIZATION_ENDED');
    const a=await tx.platformAccount.findUnique({where:{id:e.accountId},include:{sessionReference:true}}),u=await tx.user.findUnique({where:{id:e.actorId}}),d=await tx.executionDevice.findUnique({where:{id:e.deviceId}}),ref=a?.sessionReference;
    if(!u?.active||u.role!=='ADMIN')throw new ReadFailure('AUTHORIZATION_ENDED');
    if(!d?.enabled||d.keyId!==e.keyId)throw new ReadFailure('DEVICE_UNAVAILABLE');
    if(!a||!this.eligible(a)||a.version!==e.accountVersion||a.loginPlatformUserId!==e.platformUserId||!ref||ref.sessionKey!==e.sessionKey||ref.deviceId!==e.deviceId||ref.deviceKeyId!==e.keyId||ref.state!=='VERIFIED'||ref.checkedRuntimeId!==e.runtimeId)throw new ReadFailure('ACCOUNT_CHANGED');
    if(permit)try{await this.devices.assertPermit(tx,permit);}catch{throw new ReadFailure('DEVICE_UNAVAILABLE');}
  }
  async open(value:unknown,cancelled:()=>Promise<boolean>=async()=>false){
    const e=executionSchema.parse(value);await this.guard(this.db,e);
    const actor=await this.db.user.findUniqueOrThrow({where:{id:e.actorId}});
    let permit:ExecutionPermit;try{permit=await this.devices.acquire(actor,e.accountId);}catch{throw new ReadFailure('DEVICE_UNAVAILABLE');}
    const abort=new AbortController(),revoke=()=>abort.abort();permit.signal.addEventListener('abort',revoke,{once:true});if(permit.signal.aborted)abort.abort();
    let driver:SessionDriver|undefined,reader:XhsMcpAdapter|undefined;
    const close=async()=>{abort.abort();permit.signal.removeEventListener('abort',revoke);try{await reader?.close();}finally{try{await driver?.stop();}finally{await permit.release();}}};
    const check=async()=>{try{if(await cancelled())throw new ReadFailure('PAUSED');await this.guard(this.db,e,permit);if(abort.signal.aborted)throw new ReadFailure('DEVICE_UNAVAILABLE');}catch(err){abort.abort();throw err;}};
    let polling=false;const monitor=setInterval(()=>{if(!polling){polling=true;void check().catch(()=>{}).finally(()=>{polling=false;});}},100);monitor.unref();
    try{
      await check();if(await this.runtime.inspect(e.accountId,e.sessionKey,e.deviceId,this.runtime.mode()!,permit.root)!=='UNVERIFIED')throw new ReadFailure('ACCOUNT_CHANGED');
      driver=await this.runtime.openSaved(e.accountId,e.sessionKey,AbortSignal.any([abort.signal,AbortSignal.timeout(160000)]),permit.root);
      const status=await driver.status(AbortSignal.any([abort.signal,AbortSignal.timeout(40000)]));
      if(!status.loggedIn)throw new ReadFailure('LOGIN_EXPIRED');
      if(!status.userId||status.userId!==e.platformUserId)throw new ReadFailure('IDENTITY_MISMATCH');
      await check();if(!driver.readTransport)throw new ReadFailure('UNSUPPORTED');
      reader=new XhsMcpAdapter(driver.readTransport(),true,e.mode);
      return {reader,check,commitGuard:async(tx:Prisma.TransactionClient)=>{await this.devices.lock(tx);await tx.$queryRaw`SELECT id FROM "PlatformAccount" WHERE id=${e.accountId} FOR UPDATE`;await tx.$queryRaw`SELECT id FROM "User" WHERE id=${e.actorId} FOR SHARE`;await this.guard(tx,e,permit);},close:async()=>{clearInterval(monitor);await close();}};
    }catch(error){const ended=abort.signal.aborted;clearInterval(monitor);await close();if(error instanceof ReadFailure)throw error;const message=error instanceof Error?error.message:'';throw new ReadFailure(['RATE_LIMITED','RESTRICTED'].includes(message)?message as 'RATE_LIMITED'|'RESTRICTED':ended?'AUTHORIZATION_ENDED':'MCP_PROTOCOL');}
  }
  async failure(value:unknown,reason?:string){
    const parsed=executionSchema.safeParse(value);if(!parsed.success||!['RATE_LIMITED','RESTRICTED','LOGIN_EXPIRED','IDENTITY_MISMATCH'].includes(reason||''))return;
    const e=parsed.data;await this.db.$transaction(async tx=>{
      await this.devices.lock(tx);await tx.$queryRaw`SELECT id FROM "PlatformAccount" WHERE id=${e.accountId} FOR UPDATE`;
      await tx.platformAccount.updateMany({where:{id:e.accountId,loginSessionKey:e.sessionKey},data:{status:'RESTRICTED',pauseReason:reason,version:{increment:1}}});
      await tx.accountSessionReference.updateMany({where:{accountId:e.accountId,sessionKey:e.sessionKey},data:{state:reason==='LOGIN_EXPIRED'?'EXPIRED':'NEEDS_REVIEW',checkedRuntimeId:null}});
      await tx.auditLog.create({data:{actorId:e.actorId,entityId:e.accountId,action:'ACCOUNT_READ_STOPPED',metadata:{reason}}});
    });
  }
}
