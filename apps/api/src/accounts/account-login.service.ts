import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AccountLogin } from '@prisma/client';
import { Db } from '../common/db';
import { Actor, requireAdmin } from '../auth/security';
import { DeviceService, ExecutionPermit } from '../devices/device.service';
import { LoginRuntime, SessionDriver } from './login-runtime';
const active=['STARTING','WAITING'];
type Job={permit?:ExecutionPermit;abort:AbortController;driver?:SessionDriver;image?:string;busy:boolean;heartbeat:number;deadline:number;nextCheck:number;timer?:NodeJS.Timeout};
@Injectable()
export class AccountLoginService implements OnModuleDestroy, OnModuleInit {
  private runtimeId=randomUUID(); private savedChecks=new Map<string,AbortController>(); private jobs=new Map<string,Job>();
  constructor(@Inject(Db)private db:Db,@Inject(LoginRuntime)private runtime:LoginRuntime,@Optional() @Inject(DeviceService)private devices?:DeviceService){}
  async capabilities(actor:Actor){requireAdmin(actor);const device=this.devices?.enabled()?await this.devices.status(actor):null;return {device:device?.device||null,deviceRequired:!!device,enabled:!!this.runtime.mode()&&(this.runtime.mode()==='offline'||!!device)&&(!device||!!device.device?.online),mode:this.runtime.mode()||'disabled',storageRoot:device?device.device?.credentialRoot||device.suggestedRoot:this.runtime.storage(),persistent:this.runtime.persistent(),deviceId:this.runtime.persistent()?this.runtime.deviceId():null,send:false,collection:process.env.CRM_ACCOUNT_READ_ENABLED==='1',consentVersion:'local-session-v1'};}
  private async account(actor:Actor,id:string,allowArchived=false){requireAdmin(actor);const a=await this.db.platformAccount.findUnique({where:{id}});if(!a||(!allowArchived&&a.archivedAt))throw new NotFoundException();if(a.platform!=='XHS')throw new BadRequestException('仅支持小红书登录');return a;}
  private dto(row:AccountLogin){const job=this.jobs.get(row.id);return {id:row.id,requestKey:row.requestKey,state:row.state,mode:row.mode,expiresAt:row.expiresAt.toISOString(),reason:row.reason,nextCheckAt:job?new Date(job.nextCheck).toISOString():null,...(row.state==='WAITING'&&job?.image?{image:job.image}:{})};}
  private async audit(actorId:string,id:string,state:string){await this.db.auditLog.create({data:{actorId,entityId:id,action:'ACCOUNT_LOGIN_'+state}});}
  async start(actor:Actor,accountId:string,requestKey:string,consent:string){
    await this.account(actor,accountId);if(this.runtime.mode()==='real'&&!this.devices?.enabled())throw new ForbiddenException('真实扫码需使用持久工作台并批准专用电脑');if(!this.runtime.mode())throw new ForbiddenException('登录入口未启用');if(consent!=='local-session-v1')throw new BadRequestException('需明确确认本地保存会话用途');
    const row=await this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(204772641)`;
      await tx.$queryRaw`SELECT id FROM "PlatformAccount" WHERE id=${accountId} FOR UPDATE`;
      const a=await tx.platformAccount.findUniqueOrThrow({where:{id:accountId}});if(a.archivedAt)throw new ConflictException('账号已归档');
      const old=await tx.accountLogin.findUnique({where:{requestKey}});if(old){if(old.accountId!==accountId||old.actorId!==actor.id)throw new ConflictException('请求键冲突');return {...old,reused:true};}
      if(a.loginSessionKey)throw new ConflictException('账号已绑定；请创建独立账号');
      await tx.accountLogin.updateMany({where:{accountId,state:{in:active},expiresAt:{lt:new Date()}},data:{state:'EXPIRED',reason:'QR_EXPIRED'}});
      if(await tx.accountLogin.findFirst({where:{accountId,state:{in:active}}}))throw new ConflictException('该账号已有登录尝试，请先取消或等待过期');
      if(await tx.accountLogin.count({where:{state:{in:active}}})>=3)throw new ConflictException('最多同时进行三个登录尝试');
      const created=await tx.accountLogin.create({data:{accountId,actorId:actor.id,requestKey,mode:this.runtime.mode()!,runtimeId:this.runtimeId,expiresAt:new Date(Date.now()+45000)}});
      await tx.auditLog.create({data:{actorId:actor.id,entityId:created.id,action:'ACCOUNT_LOGIN_CONSENT',metadata:{accountId,consentVersion:consent,mode:created.mode}}});return {...created,reused:false};
    });
    if(row.reused)return this.dto(row);
    const job:Job={abort:new AbortController(),busy:true,heartbeat:Date.now(),deadline:Date.now()+45000,nextCheck:0};this.jobs.set(row.id,job);
    job.timer=setInterval(()=>{const expired=Date.now()>=job.deadline,disconnected=Date.now()-job.heartbeat>60000;if(expired||disconnected)void this.finish(row.id,expired?'EXPIRED':'CANCELLED',expired?'QR_EXPIRED':'PAGE_DISCONNECTED').catch(()=>{});},1000);job.timer.unref();
    try{
      const fresh=await this.db.accountLogin.findUniqueOrThrow({where:{id:row.id}});
      if(fresh.state!=='STARTING'){await this.finish(row.id,'CANCELLED','USER_CANCELLED');return this.dto(fresh);}
      if(this.devices?.enabled()){
        job.permit=await this.devices.acquire(actor,accountId);
        if(job.permit.signal.aborted){job.abort.abort();throw Error('CANCELLED');}
        job.permit.signal.addEventListener('abort',()=>{void this.finish(row.id,'CANCELLED','DEVICE_AUTHORIZATION_ENDED').catch(()=>{});},{once:true});
      }
      job.driver=await this.runtime.open(accountId,row.id,job.abort.signal,false,job.permit?.root);
      const qr=await job.driver.qr(job.abort.signal);
      if(job.abort.signal.aborted)return this.dto(await this.db.accountLogin.findUniqueOrThrow({where:{id:row.id}}));
      job.image=qr.image;job.heartbeat=Date.now();job.deadline=Date.now()+Math.min(qr.seconds,240)*1000;
      await this.db.accountLogin.updateMany({where:{id:row.id,state:'STARTING'},data:{state:'WAITING',expiresAt:new Date(job.deadline)}});
    }catch(e){await this.finish(row.id,job.permit?.signal.aborted?'CANCELLED':'FAILED',job.permit?.signal.aborted?'DEVICE_AUTHORIZATION_ENDED':this.devices?.enabled()&&!job.permit?'DEVICE_UNAVAILABLE':this.reason(e));}finally{job.busy=false;}
    return this.dto(await this.db.accountLogin.findUniqueOrThrow({where:{id:row.id}}));
  }
  private reason(e:unknown){const m=e instanceof Error?e.message:'';return ['QR_FORMAT_UNSUPPORTED','INVALID_EXPIRY','UNEXPECTED_EXISTING_LOGIN','RATE_LIMITED','RESTRICTED','BINARY_REVIEW_REQUIRED','UNSAFE_SESSION_DIRECTORY'].includes(m)?m:'LOGIN_UNAVAILABLE';}
  private async owned(actor:Actor,accountId:string,requestKey:string){await this.account(actor,accountId);const row=await this.db.accountLogin.findUnique({where:{requestKey}});if(!row||row.accountId!==accountId)throw new NotFoundException();return row;}
  async state(actor:Actor,accountId:string,requestKey:string){const row=await this.owned(actor,accountId,requestKey);if(active.includes(row.state)&&row.runtimeId!==this.runtimeId)return this.dto(await this.finish(row.id,'CANCELLED','RUNTIME_RESTARTED'));return this.dto(row);}
  async cancel(actor:Actor,accountId:string,requestKey:string){
    await this.account(actor,accountId,true);
    // Cancellation may arrive before the original start request. Persist a tombstone
    // under the same account lock so a delayed start cannot resurrect consent.
    const row=await this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "PlatformAccount" WHERE id=${accountId} FOR UPDATE`;
      const old=await tx.accountLogin.findUnique({where:{requestKey}});
      if(old){if(old.accountId!==accountId)throw new NotFoundException();return old;}
      return tx.accountLogin.create({data:{accountId,actorId:actor.id,requestKey,runtimeId:this.runtimeId,mode:this.runtime.mode()||'disabled',state:'CANCELLED',reason:'USER_CANCELLED',expiresAt:new Date()}});
    });
    return this.dto(await this.finish(row.id,'CANCELLED','USER_CANCELLED'));
  }
  private async expire(id:string){const row=await this.db.accountLogin.findUnique({where:{id}}),job=this.jobs.get(id);if(!row)return;if(!active.includes(row.state)){if(job)await this.finish(id,row.state,row.reason||'STOPPED');return;}const a=await this.db.platformAccount.findUnique({where:{id:row.accountId}});if(!a||a.archivedAt){await this.finish(id,'CANCELLED','ACCOUNT_ARCHIVED');return;}if(row.expiresAt.getTime()<=Date.now())await this.finish(id,'EXPIRED','QR_EXPIRED');else if(job&&Date.now()-job.heartbeat>60000)await this.finish(id,'CANCELLED','PAGE_DISCONNECTED');}
  private async finish(id:string,state:string,reason:string){
    const job=this.jobs.get(id);if(job){job.image=undefined;job.abort.abort();clearInterval(job.timer);await job.driver?.stop();this.jobs.delete(id);await job.permit?.release();}
    return this.db.$transaction(async tx=>{
      const initial=await tx.accountLogin.findUniqueOrThrow({where:{id}});
      await tx.$queryRaw`SELECT id FROM "PlatformAccount" WHERE id=${initial.accountId} FOR UPDATE`;
      const changed=await tx.accountLogin.updateMany({where:{id,state:{in:active}},data:{state,reason}});
      if(changed.count)await tx.auditLog.create({data:{actorId:initial.actorId,entityId:id,action:'ACCOUNT_LOGIN_'+state}});
      return tx.accountLogin.findUniqueOrThrow({where:{id}});
    });
  }
  async check(actor:Actor,accountId:string,requestKey:string){
    let row=await this.owned(actor,accountId,requestKey);await this.expire(row.id);row=await this.db.accountLogin.findUniqueOrThrow({where:{id:row.id}});
    const job=this.jobs.get(row.id);if(!active.includes(row.state))return this.dto(row);if(!job)return this.dto(await this.finish(row.id,'CANCELLED','RUNTIME_RESTARTED'));
    job.heartbeat=Date.now();if(job.busy||Date.now()<job.nextCheck||!job.driver)return this.dto(row);job.busy=true;job.nextCheck=Date.now()+10000;
    try{
      const status=await job.driver.status(job.abort.signal);if(job.abort.signal.aborted)return this.dto(await this.db.accountLogin.findUniqueOrThrow({where:{id:row.id}}));
      if(status.loggedIn&&!status.userId)return this.dto(await this.finish(row.id,'NEEDS_REVIEW','STABLE_ID_MISSING'));
      if(status.loggedIn){
        await this.db.$transaction(async tx=>{
          if(job.permit)await this.devices!.lock(tx);
          await tx.$queryRaw`SELECT id FROM "PlatformAccount" WHERE id=${accountId} FOR UPDATE`;
          const fresh=await tx.accountLogin.findUniqueOrThrow({where:{id:row.id}});const a=await tx.platformAccount.findUniqueOrThrow({where:{id:accountId}});
          if(fresh.state!=='WAITING'||job.abort.signal.aborted||fresh.expiresAt.getTime()<=Date.now()||a.archivedAt)throw Error('CANCELLED');
          if(job.permit)await this.devices!.assertPermit(tx,job.permit);
          if(await tx.platformAccount.findFirst({where:{platform:'XHS',loginProvider:row.mode,loginPlatformUserId:status.userId}}))throw new ConflictException('账号已绑定');
          await tx.platformAccount.update({where:{id:accountId},data:{loginSessionKey:row.id,loginProvider:row.mode,loginPlatformUserId:status.userId,loginNickname:status.nickname||null,loginVerifiedAt:new Date(),isDemo:row.mode==='offline',status:'PAUSED',pauseReason:'登录已验证；只读采集须逐次确认，发送禁用',version:{increment:1}}});
          if(this.runtime.persistent())await tx.accountSessionReference.create({data:{accountId,deviceId:this.runtime.deviceId(),sessionKey:row.id,deviceKeyId:job.permit?.keyId||null,provider:row.mode,state:'VERIFIED',checkedRuntimeId:this.runtime.runtimeId,verifiedAt:new Date()}});
          await tx.accountLogin.update({where:{id:row.id},data:{state:'VERIFIED',reason:null}});
          await tx.auditLog.create({data:{actorId:actor.id,entityId:row.id,action:'ACCOUNT_LOGIN_VERIFIED',metadata:{accountId,mode:row.mode}}});
        });
        await this.finish(row.id,'VERIFIED','VERIFIED');
      }
    }catch(e){await this.finish(row.id,job.permit?.signal.aborted?'CANCELLED':'FAILED',job.permit?.signal.aborted?'DEVICE_AUTHORIZATION_ENDED':e instanceof ConflictException?'ACCOUNT_ALREADY_BOUND':this.reason(e));}finally{job.busy=false;}
    return this.dto(await this.db.accountLogin.findUniqueOrThrow({where:{id:row.id}}));
  }
  async simulate(actor:Actor,accountId:string,requestKey:string,scenario:string){if(this.runtime.mode()!=='offline')throw new ForbiddenException();const row=await this.owned(actor,accountId,requestKey),job=this.jobs.get(row.id);if(!job)throw new ConflictException();if(scenario==='EXPIRED')await this.db.accountLogin.update({where:{id:row.id},data:{expiresAt:new Date(0)}});else await job.driver?.simulate?.(scenario);job.nextCheck=0;return this.check(actor,accountId,requestKey);}
  async onModuleInit(){
    if(!this.runtime.persistent())return;
    // No platform calls. Only opaque references and local ownership/exists checks.
    const refs=await this.db.accountSessionReference.findMany();
    const device=this.devices?.enabled()?await this.db.executionDevice.findFirst({where:{enabled:true}}):null;
    for(const ref of refs){const inspected=this.devices?.enabled()&&(!device||ref.deviceKeyId!==device.keyId||ref.deviceId!==device.id)?(device&&ref.deviceId!==device.id?'DEVICE_MISMATCH':'NEEDS_REVIEW'):await this.runtime.inspect(ref.accountId,ref.sessionKey,ref.deviceId,ref.provider,device?.credentialRoot);await this.db.accountSessionReference.update({where:{accountId:ref.accountId},data:{state:inspected==='UNVERIFIED'&&ref.state==='EXPIRED'?'EXPIRED':inspected,checkedRuntimeId:null,checkingUntil:null}});}
    const interrupted=await this.db.accountLogin.findMany({where:{state:{in:active}}});
    for(const row of interrupted)await this.finish(row.id,'CANCELLED','RUNTIME_RESTARTED');
  }
  async verifySaved(actor:Actor,accountId:string,consent:string){
    const account=await this.account(actor,accountId);
    if(this.runtime.mode()==='real'&&!this.devices?.enabled())throw new ForbiddenException('真实会话核验需已批准的专用电脑');
    if(!this.runtime.persistent()||!this.runtime.mode())throw new ForbiddenException('仅持久工作台支持已保存会话核验');
    if(consent!=='read-local-session-v1')throw new BadRequestException('需明确确认使用本机已保存会话核验');
    const permit=this.devices?.enabled()?await this.devices.acquire(actor,accountId):undefined;
    try{
      const ref=await this.db.$transaction(async tx=>{
        await tx.$queryRaw`SELECT id FROM "PlatformAccount" WHERE id=${accountId} FOR UPDATE`;
        const a=await tx.platformAccount.findUniqueOrThrow({where:{id:accountId}});if(a.archivedAt)throw new ConflictException('账号已归档');
        const r=await tx.accountSessionReference.findUnique({where:{accountId}});if(!r)throw new ConflictException('没有可信设备引用；不会扫描或导入遗留会话');
        if(r.checkingUntil&&r.checkingUntil>new Date())throw new ConflictException('核验正在进行或短暂退避中');
        await tx.accountSessionReference.update({where:{accountId},data:{state:'UNVERIFIED',checkedRuntimeId:null,checkingUntil:new Date(Date.now()+60000)}});
        await tx.auditLog.create({data:{actorId:actor.id,entityId:accountId,action:'SAVED_SESSION_CHECK_CONSENT',metadata:{deviceId:this.runtime.deviceId(),consentVersion:consent,provider:r.provider}}});return r;
      });
      let state='UNVERIFIED',driver:SessionDriver|undefined;
      const abort=new AbortController();this.savedChecks.set(accountId,abort);const timer=setTimeout(()=>abort.abort(),45000);
      const revoked=()=>abort.abort();permit?.signal.addEventListener('abort',revoked,{once:true});if(permit?.signal.aborted)abort.abort();
      try{
        state=await this.runtime.inspect(accountId,ref.sessionKey,ref.deviceId,ref.provider,permit?.root);
        if(state==='UNVERIFIED'&&!abort.signal.aborted){
          driver=await this.runtime.openSaved(accountId,ref.sessionKey,abort.signal,permit?.root);const status=await driver.status(abort.signal);
          state=!status.loggedIn?'EXPIRED':status.userId&&status.userId===account.loginPlatformUserId?'VERIFIED':'NEEDS_REVIEW';
        }
        if(abort.signal.aborted)state='UNVERIFIED';
      }catch{state='NEEDS_REVIEW';}finally{clearTimeout(timer);abort.abort();await driver?.stop();this.savedChecks.delete(accountId);permit?.signal.removeEventListener('abort',revoked);}
      return await this.db.$transaction(async tx=>{
        if(permit)await this.devices!.lock(tx);
        await tx.$queryRaw`SELECT id FROM "PlatformAccount" WHERE id=${accountId} FOR UPDATE`;
        const a=await tx.platformAccount.findUniqueOrThrow({where:{id:accountId}});if(a.archivedAt)state='UNVERIFIED';
        if(permit)try{await this.devices!.assertPermit(tx,permit);}catch{state='UNVERIFIED';}
        const result=await tx.accountSessionReference.update({where:{accountId},data:{state,checkedRuntimeId:state==='VERIFIED'?this.runtime.runtimeId:null,...(state==='VERIFIED'?{verifiedAt:new Date()}:{}),checkingUntil:new Date(Date.now()+10000)}});
        await tx.auditLog.create({data:{actorId:actor.id,entityId:accountId,action:'SAVED_SESSION_CHECK_RESULT',metadata:{state,provider:ref.provider}}});return {state:result.state,provider:result.provider,verifiedAt:result.verifiedAt};
      });
    }finally{await permit?.release();}
  }
  async onModuleDestroy(){for(const abort of this.savedChecks.values())abort.abort();await Promise.all([...this.jobs.keys()].map(id=>this.finish(id,'CANCELLED','WORKBENCH_STOPPED').catch(()=>{})));}
}
