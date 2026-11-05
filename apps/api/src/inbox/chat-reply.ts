import {ConflictException,Inject,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {Db} from '../common/db';
import {requireAdmin,type Actor} from '../auth/security';
import {parse} from '../common/validation';
import {contactLock} from '../auto-contact/contact-lock';
import {contactNow} from '../auto-contact/contact-settings.service';
import {quotaBucket} from '../auto-contact/contact-policy';
import {activeAcceptance} from '../auto-contact/normal-acceptance';
import {recipientRecoveryBlocked} from '../auto-contact/user-reviewed-recovery';
import {accountSystemBlock,recordedAccountBlocks} from '../accounts/account-execution-policy';
import {effectiveAccountLimit} from '../accounts/account-day-limit';
import {boundAccountNickname} from '../accounts/account-display';
import {DM_EXECUTOR,type DmExecutor} from '../direct-messages/dm-executor';
import {DM_SEND_PROTOCOL,dmDigest,parseDmExecution,type DmCommand,type DmExecution} from '../direct-messages/dm-send-protocol';
import {dmConfirmInput} from '../direct-messages/dm-send.service';
import {chatDraft,validInbound,replyAnchor,CHAT_SCOPE} from './chat-policy';
import {InboxStore} from './inbox-store';
const scopeSchema=z.object({protocol:z.literal(CHAT_SCOPE),input:chatDraft,hash:z.string(),day:z.string()}).strict();
function fail(s:string):never{throw new ConflictException(s)}
@Injectable()
export class ChatReply {
 constructor(@Inject(Db)private db:Db,@Inject(DM_EXECUTOR)private executor:DmExecutor,@Inject(InboxStore)private store:InboxStore){}
 capability(){const sendingAvailable=this.executor.available()&&this.executor.supportsReplies?.()===true;return {sendingAvailable,reason:sendingAvailable?null:'会话回复通道尚未完成部署验收；当前可查看消息'};}
 private async validate(tx:Prisma.TransactionClient,actor:Actor,input:z.infer<typeof chatDraft>,ownKey?:string){
  const user=await tx.user.findUnique({where:{id:actor.id}});if(!user?.active||user.role!=='ADMIN')fail('管理员权限已变化');
  const now=await contactNow(tx);if(await activeAcceptance(tx))fail('限定执行进行中，请稍后回复');
  const account=await tx.platformAccount.findUnique({where:{id:input.accountId},include:{sessionReference:true}});
  if(!account||account.archivedAt||account.isDemo||account.platform!=='XHS'||accountSystemBlock(account)||(await recordedAccountBlocks(tx,[account.id])).has(account.id))fail('接收账号不可发送或存在风险限制');
  const session=account.sessionReference;if(!account.loginSessionKey||!account.loginPlatformUserId||session?.state!=='VERIFIED'||session.provider!=='real'||session.sessionKey!==account.loginSessionKey)fail('接收账号登录身份未核实');
  const rows=await tx.$queryRaw<any[]>`SELECT * FROM "InboxMessage" WHERE id=${input.messageId} AND "accountId"=${input.accountId} AND "senderId"=${input.senderId}`;const message=rows[0];
  if(!message||!validInbound(message,account.loginPlatformUserId))fail('该消息缺少可靠的入站身份或消息证据，不能据此发送');
  if(await recipientRecoveryBlocked(tx,'XHS',input.senderId))fail('该用户存在保留的发送风险，不能回复');
  const identity=await tx.platformIdentity.findUnique({where:{platform_platformUserId:{platform:'XHS',platformUserId:input.senderId}},include:{lead:true}});
  if(identity?.lead?.doNotContact)fail('该用户已标记勿联系');
  if(identity&&await tx.contactAttempt.count({where:{ledger:{identityId:identity.id,mode:'REAL'},outcome:{in:['UNKNOWN','RESERVED','ATTEMPTED']},...(ownKey?{requestKey:{not:ownKey}}:{})}}))fail('该用户存在未知或执行中的发送，请先核查');
  if(await tx.autoContactJob.count({where:{platform:'XHS',mode:'REAL',recipientId:input.senderId,status:{in:['PENDING_ACTION','MANUAL_READY','QUEUED','WAITING_ACCOUNT','WAITING_QUOTA','RESERVED','ATTEMPTED']}}}))fail('该用户已有执行中的自动回复任务');
  const answered=await tx.contactAttempt.findFirst({where:{mode:'REAL',channel:'DM',historySnapshot:{path:['inboxMessageId'],equals:input.messageId},outcome:{in:['RESERVED','ATTEMPTED','UNKNOWN','CONFIRMED']},...(ownKey?{requestKey:{not:ownKey}}:{})}});if(answered)fail('这条入站消息已回复或结果待确认，请勿重复发送');
  const control=await tx.autoContactControl.findUnique({where:{platform_mode:{platform:'XHS',mode:'REAL'}}});if(control?.pauseReason||control?.activeJobId&&control.activeJobId!==ownKey)fail('平台暂停或其他发送正在执行');
  const day=quotaBucket('REAL',now),usage=await tx.accountDay.findUnique({where:{accountId_day:{accountId:account.id,day}}}),limit=effectiveAccountLimit(account.dailyLimit,usage,day),occupied=usage?.occupied??0;
  if(ownKey?occupied<1||occupied>limit:occupied>=limit)fail('账号今日额度不足；不会自动跨天发送');
  const newest=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "InboxMessage" WHERE "accountId"=${input.accountId} AND "senderId"=${input.senderId} AND channel='DM' ORDER BY "receivedAt" DESC,id DESC LIMIT 1`;if(newest[0]?.id!==input.messageId)fail('会话已有新消息，请刷新后回复');
  const anchor=replyAnchor(message),hash=dmDigest(JSON.stringify({input,anchor,day,accountVersion:account.version,sender:account.loginPlatformUserId,session:dmDigest(account.loginSessionKey)}));
  return {account,message,identity,day,now,hash,anchor,remaining:Math.max(0,limit-occupied)};
 }
 async prepare(actor:Actor,raw:unknown){requireAdmin(actor);const input=parse(chatDraft,raw);if(!this.capability().sendingAvailable)fail(this.capability().reason!);
  return this.db.$transaction(async tx=>{await contactLock(tx);const v=await this.validate(tx,actor,input),id=randomUUID(),token=randomBytes(32).toString('base64url'),expiresAt=new Date(Math.min(v.now.getTime()+180000,Date.parse(v.day.slice(-10)+'T00:00:00+08:00')+86400000));
   await tx.manualReplyRequest.create({data:{id,actorId:actor.id,accountId:v.account.id,accountVersion:v.account.version,tokenHash:dmDigest(token),scope:{protocol:CHAT_SCOPE,input,hash:v.hash,day:v.day},expiresAt}});
   return {previewId:id,token,expiresAt:expiresAt.toISOString(),accountName:boundAccountNickname(v.account),recipientName:v.message.senderName,content:input.content,remaining:v.remaining};
  });
 }
 async status(actor:Actor,id:string){requireAdmin(actor);const req=await this.db.manualReplyRequest.findUnique({where:{id}});if(!req||req.actorId!==actor.id||!scopeSchema.safeParse(req.scope).success)throw new NotFoundException();const a=await this.db.contactAttempt.findUnique({where:{requestKey:'inbox:'+id}});return {previewId:id,outcome:a&&['RESERVED','ATTEMPTED'].includes(a.outcome)&&Date.now()-a.updatedAt.getTime()>120000?'INTERRUPTED':a?.outcome??'NOT_SUBMITTED',reason:a?.resolutionNote??null,attemptId:a?.id??null};}
 async confirm(actor:Actor,raw:unknown,signal:AbortSignal=AbortSignal.timeout(90000)){
  requireAdmin(actor);const input=parse(dmConfirmInput,raw);
  const reserved=await this.db.$transaction(async tx=>{await contactLock(tx);const req=await tx.manualReplyRequest.findUnique({where:{id:input.previewId}});if(!req||req.actorId!==actor.id)throw new NotFoundException();
   if(!/^[a-f0-9]{64}$/.test(req.tokenHash)||!timingSafeEqual(Buffer.from(req.tokenHash),Buffer.from(dmDigest(input.token))))fail('回复确认凭据不匹配');
   const scope=scopeSchema.parse(req.scope),key='inbox:'+req.id;
   if(req.confirmedAt){if(req.submissionKey!==input.requestKey)fail('此回复已提交，请查看结果');const a=await tx.contactAttempt.findUnique({where:{requestKey:key}});if(!a)fail('提交记录不完整，请勿重发');return {existing:true as const,attempt:a};}
   if(req.expiresAt<=await contactNow(tx))fail('预览已过期，请重新预览');if(!this.capability().sendingAvailable)fail('会话回复通道不可用');
   const v=await this.validate(tx,actor,scope.input);if(v.hash!==scope.hash||v.day!==scope.day)fail('账号或入站证据已变化，请重新预览');
   await tx.$queryRaw`SELECT id FROM "PlatformAccount" WHERE id=${v.account.id} FOR UPDATE`;
   const identity=v.identity??await tx.platformIdentity.create({data:{platform:'XHS',platformUserId:scope.input.senderId,nickname:v.message.senderName,isDemo:false}});
   const ledger=await tx.contactLedger.upsert({where:{identityId_mode:{identityId:identity.id,mode:'REAL'}},create:{identityId:identity.id,mode:'REAL',accountId:v.account.id},update:{}});
   const attempt=await tx.contactAttempt.create({data:{id:randomUUID(),ledgerId:ledger.id,requestKey:key,kind:'INBOX_REPLY',mode:'REAL',channel:'DM',content:scope.input.content,outcome:'RESERVED',day:v.day,actorId:actor.id,accountIdSnapshot:v.account.id,historySnapshot:{platform:'XHS',accountId:v.account.id,accountLabel:v.account.label,senderNickname:boundAccountNickname(v.account),senderPlatformId:v.account.loginPlatformUserId,recipientId:scope.input.senderId,inboxMessageId:scope.input.messageId,inboundPlatformId:v.message.platformId,incoming:{body:v.message.body,senderName:v.message.senderName}}}});
   await tx.accountDay.upsert({where:{accountId_day:{accountId:v.account.id,day:v.day}},create:{accountId:v.account.id,day:v.day,occupied:1},update:{occupied:{increment:1}}});
   await tx.autoContactControl.upsert({where:{platform_mode:{platform:'XHS',mode:'REAL'}},create:{platform:'XHS',mode:'REAL',activeJobId:key,leaseUntil:new Date(v.now.getTime()+120000)},update:{activeJobId:key,leaseUntil:new Date(v.now.getTime()+120000)}});
   await tx.manualReplyRequest.update({where:{id:req.id},data:{confirmedAt:v.now,submissionKey:input.requestKey}});
   await tx.auditLog.create({data:{actorId:actor.id,entityId:key,action:'INBOX_REPLY_RESERVED',metadata:{attemptId:attempt.id,messageId:scope.input.messageId,contentHash:dmDigest(scope.input.content)}}});return {existing:false as const,attempt,v,scope,expiresAt:req.expiresAt};
  });
  if(reserved.existing)return {outcome:reserved.attempt.outcome,attemptId:reserved.attempt.id,replayed:true};
  const {attempt,v,scope}=reserved;let dispatched=false;
  const command:DmCommand={protocol:DM_SEND_PROTOCOL,attemptId:attempt.id,requestKey:attempt.requestKey,accountId:v.account.id,senderId:v.account.loginPlatformUserId!,recipientId:scope.input.senderId,content:scope.input.content,contentSha256:dmDigest(scope.input.content),replyTo:v.anchor,maxSubmissions:1,expiresAt:reserved.expiresAt.toISOString()};
  const before=()=>this.db.$transaction(async tx=>{await contactLock(tx);if(dispatched||signal.aborted||reserved.expiresAt<=await contactNow(tx))return false;const current=await tx.contactAttempt.findUnique({where:{id:attempt.id}});if(current?.outcome!=='RESERVED')return false;const checked=await this.validate(tx,actor,scope.input,attempt.requestKey);if(checked.hash!==scope.hash)return false;await tx.contactAttempt.update({where:{id:attempt.id},data:{outcome:'ATTEMPTED',attemptedAt:checked.now,version:{increment:1}}});dispatched=true;return true;});
  let r:DmExecution;try{r=parseDmExecution(await this.executor.run(actor,command,v.account.loginSessionKey!,before,signal),command)}catch{r={protocol:DM_SEND_PROTOCOL,attemptId:attempt.id,requestKey:attempt.requestKey,kind:'UNKNOWN',reason:'TRANSPORT_OUTCOME_UNKNOWN',inputs:0,submissions:dispatched?1:0,stopped:false};}
  const confirmed=dispatched&&r.kind==='CONFIRMED'&&r.stopped,notSent=r.kind==='NOT_SENT'&&r.submissions===0&&r.stopped;
  const outcome=confirmed?'CONFIRMED':notSent?'FAILED':'UNKNOWN',reason=confirmed?'平台消息回执与独立回读一致':notSent?'未提交回复，身份、会话或发送条件未通过':'发送结果未知，请勿重发';
  await this.db.$transaction(async tx=>{await contactLock(tx);const current=await tx.contactAttempt.findUniqueOrThrow({where:{id:attempt.id}});if(!['RESERVED','ATTEMPTED'].includes(current.outcome))return;
   await tx.contactAttempt.update({where:{id:attempt.id},data:{outcome,platformReceipt:confirmed?r.receipt!.messageId:null,confirmedAt:confirmed?await contactNow(tx):null,resolutionNote:reason,version:{increment:1}}});
   if(notSent)await tx.accountDay.update({where:{accountId_day:{accountId:v.account.id,day:v.day}},data:{occupied:{decrement:1}}});
   const latestControl=await tx.autoContactControl.findUnique({where:{platform_mode:{platform:'XHS',mode:'REAL'}}});
   await tx.autoContactControl.updateMany({where:{platform:'XHS',mode:'REAL',activeJobId:attempt.requestKey},data:{activeJobId:null,leaseUntil:null,...(!confirmed&&!notSent&&!latestControl?.pauseReason?{pauseReason:'DM_SUBMISSION_UNKNOWN',pausedAt:await contactNow(tx)}:{})}});
   await tx.auditLog.create({data:{actorId:actor.id,entityId:attempt.requestKey,action:'INBOX_REPLY_FINISHED',metadata:{attemptId:attempt.id,result:r as unknown as Prisma.InputJsonValue,dispatched}}});
  });this.store.changed.next();return {outcome,reason,attemptId:attempt.id,replayed:false};
 }
}
