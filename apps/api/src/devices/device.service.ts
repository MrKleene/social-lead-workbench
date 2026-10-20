import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomBytes, randomUUID, verify } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { Db } from '../common/db';
import { Actor, requireAdmin } from '../auth/security';
import { LocalDeviceRuntime } from './device-runtime';
export type ExecutionPermit={token:string;deviceId:string;keyId:string;root:string;signal:AbortSignal;release():Promise<void>};
@Injectable()
export class DeviceService implements OnModuleInit,OnModuleDestroy {
  private heartbeatTimer?:NodeJS.Timeout;
  private ticking=false;
  private permits=new Map<string,{abort:AbortController;timer:NodeJS.Timeout}>();
  constructor(@Inject(Db)private db:Db,@Inject(LocalDeviceRuntime)private local:LocalDeviceRuntime){}
  enabled(){return this.local.enabled();}
  private requireEnabled(){if(!this.enabled()||!this.local.capability().supported)throw new ForbiddenException('当前环境未启用受支持的专用电脑适配器');}
  private async proof(device:{id:string;keyId:string;publicKey:string;provider:string}){
    try{const challenge=Buffer.concat([Buffer.from(`crm-device-v1:${device.id}:${device.keyId}:`),randomBytes(32)]);return verify(null,challenge,device.publicKey,await this.local.prove(device,challenge));}catch{return false;}
  }
  async heartbeat(){
    if(!this.enabled()||this.ticking)return;this.ticking=true;
    try{const device=await this.db.executionDevice.findFirst({where:{enabled:true}});if(!device){for(const p of this.permits.values())p.abort.abort();return;}
      const valid=await this.proof(device);
      await this.db.executionDevice.updateMany({where:{id:device.id,enabled:true,keyId:device.keyId},data:{lastSeenAt:valid?new Date():null,runtimeId:valid?process.env.CRM_RUNTIME_ID||null:null}});
      if(!valid){for(const p of this.permits.values())p.abort.abort();await this.db.accountSessionReference.updateMany({where:{deviceId:device.id},data:{state:'UNVERIFIED',checkedRuntimeId:null}});}
    }finally{this.ticking=false;}
  }
  async onModuleInit(){if(!this.enabled())return;await this.heartbeat();this.heartbeatTimer=setInterval(()=>{void this.heartbeat().catch(()=>{for(const p of this.permits.values())p.abort.abort();});},10000);this.heartbeatTimer.unref();}
  async onModuleDestroy(){clearInterval(this.heartbeatTimer);for(const p of this.permits.values()){p.abort.abort();clearTimeout(p.timer);}this.permits.clear();}
  async status(actor:Actor){requireAdmin(actor);const capability=this.local.capability();if(!this.enabled())return {enabled:false,capability,device:null,windows:'UNSUPPORTED_UNVERIFIED'};
    const device=await this.db.executionDevice.findFirst({orderBy:{approvedAt:'desc'}});
    const count=device?await this.db.accountSessionReference.count({where:{deviceId:device.id}}):0;
    const online=!!device?.enabled&&!!device.lastSeenAt&&Date.now()-device.lastSeenAt.getTime()<30000&&device.runtimeId===process.env.CRM_RUNTIME_ID;
    return {enabled:true,capability,provider:this.local.provider(),candidateId:this.local.id(),allowedBase:this.local.allowedBase(),suggestedRoot:this.local.defaultRoot(),windows:'UNSUPPORTED_UNVERIFIED',device:device?{id:device.id,name:device.name,os:device.os,enabled:device.enabled,online,credentialRoot:device.credentialRoot,keyFingerprint:this.local.fingerprint(device.publicKey),version:device.version,lastSeenAt:device.lastSeenAt,accountCount:count}:null};
  }
  async approve(actor:Actor,input:{candidateId:string;name:string;credentialRoot:string;consent:string}){
    requireAdmin(actor);this.requireEnabled();if(input.consent!=='approve-local-device-v1')throw new BadRequestException('需要明确批准执行机及本地设备密钥保存');
    if(input.candidateId!==this.local.id())throw new ForbiddenException('不能注册其他执行设备');
    try{await this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(31174029)`;
      if(await tx.executionDevice.findFirst({where:{enabled:true}}))throw new ConflictException('首版只允许一台启用的专用电脑');
      if(await tx.accountSessionReference.count({where:{deviceId:input.candidateId}}))throw new ConflictException('已有会话引用，不能静默重新绑定；需要另行确认迁移或重新登录');
      const root=await this.local.validateRoot(input.credentialRoot,true,true),identity=await this.local.createIdentity();
      if(!await this.proof(identity))throw new ConflictException('设备认证证明失败，未绑定');
      await tx.executionDevice.upsert({where:{id:identity.id},create:{...identity,name:input.name,os:this.local.capability().os,credentialRoot:root,approvedBy:actor.id,lastSeenAt:new Date(),runtimeId:process.env.CRM_RUNTIME_ID},update:{...identity,name:input.name,credentialRoot:root,approvedBy:actor.id,approvedAt:new Date(),revokedAt:null,enabled:true,lastSeenAt:new Date(),runtimeId:process.env.CRM_RUNTIME_ID,version:{increment:1}}});
      await tx.auditLog.create({data:{actorId:actor.id,entityId:identity.id,action:'DEVICE_APPROVED',metadata:{consentVersion:input.consent,keyFingerprint:this.local.fingerprint(identity.publicKey),provider:identity.provider}}});
    });}catch(e){if(e instanceof ConflictException||e instanceof ForbiddenException)throw e;throw new BadRequestException(e instanceof Error&&e.message.startsWith('目录')?e.message:'设备或目录验证失败；未配置执行设备。不会导入或搬运现有会话');}
    return this.status(actor);
  }
  async changeDirectory(actor:Actor,id:string,version:number,path:string){
    requireAdmin(actor);this.requireEnabled();
    await this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(31174029)`;
      const d=await tx.executionDevice.findUnique({where:{id}});if(!d||!d.enabled||d.id!==this.local.id())throw new ForbiddenException('执行设备不匹配或已撤销');
      if(d.version!==version)throw new ConflictException('设备设置已变化，请刷新');
      if(!await this.proof(d))throw new ConflictException('设备离线或认证失败，不执行目录任务');
      if(await tx.deviceExecutionLease.count({where:{deviceId:id,expiresAt:{gt:new Date()}}}))throw new ConflictException('执行任务进行中，不能修改目录');
      if(await tx.accountSessionReference.count({where:{deviceId:id}}))throw new ConflictException('已有会话，不能静默换目录；需要明确迁移或重新登录，本版不执行迁移');
      try{await this.local.validateRoot(d.credentialRoot,false,true);await this.local.validateRoot(path,true,true);}catch{throw new BadRequestException('目录必须安全、可写且为空；已有会话或遗留文件时需人工核查，不会迁移');}
      await tx.executionDevice.update({where:{id},data:{credentialRoot:path,version:{increment:1}}});await tx.auditLog.create({data:{actorId:actor.id,entityId:id,action:'DEVICE_DIRECTORY_CHANGED'}});
    });return this.status(actor);
  }
  async revoke(actor:Actor,id:string,version:number){
    requireAdmin(actor);this.requireEnabled();await this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(31174029)`;
      const d=await tx.executionDevice.findUnique({where:{id}});if(!d||d.id!==this.local.id())throw new ForbiddenException();if(d.version!==version)throw new ConflictException('设备已变化');
      await tx.executionDevice.update({where:{id},data:{enabled:false,lastSeenAt:null,runtimeId:null,revokedAt:new Date(),version:{increment:1}}});
      await tx.accountSessionReference.updateMany({where:{deviceId:id},data:{state:'UNVERIFIED',checkedRuntimeId:null}});
      await tx.auditLog.create({data:{actorId:actor.id,entityId:id,action:'DEVICE_REVOKED'}});
    });for(const p of this.permits.values())p.abort.abort();return this.status(actor);
  }
  async lock(tx:Prisma.TransactionClient){await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(31174029)`;}
  async assertPermit(tx:Prisma.TransactionClient,permit:ExecutionPermit){
    await tx.$queryRaw`SELECT id FROM "ExecutionDevice" WHERE id=${permit.deviceId} FOR SHARE`;
    const d=await tx.executionDevice.findUnique({where:{id:permit.deviceId}});
    if(!d?.enabled||d.keyId!==permit.keyId||permit.signal.aborted||!await tx.deviceExecutionLease.findFirst({where:{token:permit.token,expiresAt:{gt:new Date()}}}))throw new ConflictException('设备授权已撤销或任务租约失效');
  }
  async acquire(actor:Actor,accountId:string):Promise<ExecutionPermit>{
    requireAdmin(actor);this.requireEnabled();const token=randomUUID();
    // Register cancellation before awaiting DB locks so revoke cannot miss a pending dispatch.
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),300000);timer.unref();this.permits.set(token,{abort,timer});
    try{const lease=await this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(31174029)`;
      await tx.$queryRaw`SELECT id FROM "PlatformAccount" WHERE id=${accountId} FOR UPDATE`;
      const account=await tx.platformAccount.findUnique({where:{id:accountId}});if(!account||account.archivedAt)throw new ForbiddenException('账号不可执行');
      const d=await tx.executionDevice.findFirst({where:{enabled:true}});
      if(!d||d.id!==this.local.id()||d.provider!==this.local.provider()||!await this.proof(d))throw new ConflictException('专用电脑未批准、离线或认证失败，不投递任务');
      await tx.executionDevice.update({where:{id:d.id},data:{lastSeenAt:new Date(),runtimeId:process.env.CRM_RUNTIME_ID}});
      const ref=await tx.accountSessionReference.findUnique({where:{accountId}});
      if(ref&&(ref.deviceId!==d.id||ref.deviceKeyId!==d.keyId))throw new ForbiddenException('账号不属于当前可信设备；历史引用需另行确认迁移或重新登录');
      try{await this.local.validateRoot(d.credentialRoot,false);}catch{throw new ConflictException('执行机凭证目录无效，停止投递');}
      const prior=await tx.deviceExecutionLease.findUnique({where:{accountId}});if(prior&&prior.expiresAt>new Date())throw new ConflictException('同账号已有执行任务');
      await tx.deviceExecutionLease.deleteMany({where:{accountId}});
      await tx.deviceExecutionLease.create({data:{accountId,deviceId:d.id,token,expiresAt:new Date(Date.now()+300000)}});
      await tx.auditLog.create({data:{actorId:actor.id,entityId:accountId,action:'DEVICE_EXECUTION_RESERVED',metadata:{deviceId:d.id}}});return d;
    });
    if(abort.signal.aborted)throw new ConflictException('设备授权在任务准备期间已撤销');
    return {token,deviceId:lease.id,keyId:lease.keyId,root:lease.credentialRoot,signal:abort.signal,release:async()=>{clearTimeout(timer);this.permits.delete(token);await this.db.deviceExecutionLease.deleteMany({where:{token}});}};
    }catch(e){clearTimeout(timer);this.permits.delete(token);await this.db.deviceExecutionLease.deleteMany({where:{token}}).catch(()=>{});throw e;}
  }
}
