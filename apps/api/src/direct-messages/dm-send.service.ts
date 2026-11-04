import {recipientRecoveryBlocked} from '../auto-contact/user-reviewed-recovery';
import {isReviewArchiveBlocked} from '../history-archive/archive-guard';
import {boundAccountNickname} from '../accounts/account-display';
import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {ConflictException,Inject,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {z} from 'zod';
import {previewReply,captureDisplay} from '@crm/contracts';
import {Db} from '../common/db';
import {parse} from '../common/validation';
import {requireAdmin,type Actor} from '../auth/security';
import {accountSystemBlock,recordedAccountBlocks} from '../accounts/account-execution-policy';
import {effectiveAccountLimit} from '../accounts/account-day-limit';
import {contactLock} from '../auto-contact/contact-lock';
import {contactNow} from '../auto-contact/contact-settings.service';
import {contactTarget,eligible,eligibilityHash,quotaBucket} from '../auto-contact/contact-policy';
import {activeAcceptance} from '../auto-contact/normal-acceptance';
import {semanticHash} from '../collection/capture-archive';
import {dmPreviewInput} from './dm-preparation';
import {DM_EXECUTOR,type DmExecutor} from './dm-executor';
import {DM_SEND_PROTOCOL,dmDigest,type DmCommand,type DmExecution,parseDmExecution,validDmMessageId} from './dm-send-protocol';
import {resolveConfirmedDmPause} from './resolved-dm-pause';
const scopeSchema=z.object({protocol:z.literal('manual-dm-v1'),input:dmPreviewInput,hash:z.string(),day:z.string(),content:z.string(),recipientId:z.string()}).strict();
export const dmConfirmInput=z.object({previewId:z.string().uuid(),token:z.string().min(32).max(200),requestKey:z.string().uuid()}).strict();
function fail(s:string):never{throw new ConflictException(s)}
@Injectable()
export class DmSendService {
 constructor(@Inject(Db) private db:Db,@Inject(DM_EXECUTOR) private executor:DmExecutor){}
 private async validate(tx:Prisma.TransactionClient,actor:Actor,input:z.infer<typeof dmPreviewInput>,ownKey?:string){
  const now=await contactNow(tx);if(await activeAcceptance(tx))fail('限定执行正在进行，暂不能提交私信');
  if(await isReviewArchiveBlocked(tx,input.reviewId))throw new ConflictException('该历史审核已归档，不能沿用旧记录发送');
  const [user,account,review,template]=await Promise.all([tx.user.findUnique({where:{id:actor.id}}),tx.platformAccount.findUnique({where:{id:input.accountId},include:{sessionReference:true}}),tx.semanticReview.findUnique({where:{id:input.reviewId},include:{capture:{include:{post:true,config:{select:{platform:true}}}}}}),tx.replyTemplate.findUnique({where:{id:input.templateId}})]);
  if(!user?.active||user.role!=='ADMIN')fail('管理员权限已变化');
  if(!account||account.archivedAt||account.isDemo||account.platform!=='XHS'||account.version!==input.accountVersion||accountSystemBlock(account)||(await recordedAccountBlocks(tx,[account.id])).has(account.id))fail('账号状态或限制已变化');
  const session=account.sessionReference;
  if(!account.loginSessionKey||!account.loginPlatformUserId||session?.sessionKey!==account.loginSessionKey||session.provider!=='real'||session.state!=='VERIFIED')fail('账号登录身份未核实');
  if(!review||review.isDemo||review.platform!=='XHS'||review.version!==input.reviewVersion||review.capture?.config.platform!=='XHS'||!eligible(review,95))fail('评论评分或资格已变化');
  const target=contactTarget(review,review.capture,review.capture?.post??null);if(!target||target.recipientId===account.loginPlatformUserId||await recipientRecoveryBlocked(tx,'XHS',target.recipientId))fail('收件人或原评论关联无效');
  if(!template||template.channel!=='DM'||template.version!==input.templateVersion)fail('私信模板已变化');
  const snapshot=review.snapshot as Record<string,unknown>,display=captureDisplay(snapshot);
  const rendered=previewReply(template.body,{昵称:display.authorNickname||undefined,帖子标题:typeof snapshot.title==='string'?snapshot.title:undefined,平台:'小红书'});
  if(rendered.missing.length||rendered.unknown.length||!rendered.text||rendered.text.trim()!==rendered.text||rendered.text.length>1000||/[\r\n\0]/.test(rendered.text))fail('模板字段不完整或内容不适合单条私信');
  const identity=await tx.platformIdentity.findUnique({where:{platform_platformUserId:{platform:'XHS',platformUserId:target.recipientId}},include:{lead:true}});
  if(identity?.lead&&(identity.lead.doNotContact||identity.lead.contactedAt||['CONTACTED','INTERESTED'].includes(identity.lead.contactStage)))fail('该用户已联系或标记勿联系');
  if(identity&&await tx.contactAttempt.count({where:{ledger:{identityId:identity.id,mode:'REAL'},outcome:{not:'CANCELLED'},...(ownKey?{requestKey:{not:ownKey}}:{})}}))fail('该用户已有发送尝试，不可重复或跨渠道补发');
  if(await tx.autoContactJob.count({where:{platform:'XHS',mode:'REAL',recipientId:target.recipientId,status:{in:['PENDING_ACTION','MANUAL_READY','QUEUED','WAITING_ACCOUNT','WAITING_QUOTA','RESERVED','ATTEMPTED','UNKNOWN','CONFIRMED']}}}))fail('该用户已属于其他联系任务');
  const control=await tx.autoContactControl.findUnique({where:{platform_mode:{platform:'XHS',mode:'REAL'}}});
  if(control?.pauseReason||(control?.activeJobId&&control.activeJobId!==ownKey))fail('发送暂停或有任务执行中');
  const day=quotaBucket('REAL',now),usage=await tx.accountDay.findUnique({where:{accountId_day:{accountId:account.id,day}}}),limit=effectiveAccountLimit(account.dailyLimit,usage,day),occupied=usage?.occupied??0;
  if(ownKey?occupied>limit||occupied<1:occupied>=limit)fail('账号今日额度已用尽，请稍后手动处理');
  const hash=semanticHash({input,review:eligibilityHash(review),recipient:target,session:semanticHash(account.loginSessionKey),content:rendered.text,day});
  return {now,account,review,template,target,identity,day,hash,content:rendered.text,remaining:Math.max(0,limit-occupied),display};
 }
 async prepare(actor:Actor,raw:unknown){
  requireAdmin(actor);const input=parse(dmPreviewInput,raw);if(!this.executor.available())fail('私信通道尚未通过当前环境核验');
  return this.db.$transaction(async tx=>{await contactLock(tx);const v=await this.validate(tx,actor,input),id=randomUUID(),token=randomBytes(32).toString('base64url'),expiresAt=new Date(Math.min(v.now.getTime()+180000,Date.parse(v.day.slice(-10)+'T00:00:00+08:00')+86400000));
   const scope=scopeSchema.parse({protocol:'manual-dm-v1',input,hash:v.hash,day:v.day,content:v.content,recipientId:v.target.recipientId});
   await tx.manualReplyRequest.create({data:{id,actorId:actor.id,accountId:v.account.id,accountVersion:v.account.version,tokenHash:dmDigest(token),scope,expiresAt}});
   return {previewId:id,token,expiresAt:expiresAt.toISOString(),accountLabel:v.account.loginNickname||v.account.label,recipientNickname:v.display.authorNickname,recipientId:v.target.recipientId,content:v.content,remaining:v.remaining,channel:'DM' as const};
  });
 }
 async status(actor:Actor,id:string){
  requireAdmin(actor);const req=await this.db.manualReplyRequest.findUnique({where:{id}});if(!req||req.actorId!==actor.id||!scopeSchema.safeParse(req.scope).success)throw new NotFoundException();
  const attempt=await this.db.contactAttempt.findUnique({where:{requestKey:'dm:'+req.id}});
  return {previewId:id,outcome:attempt?.outcome??'NOT_SUBMITTED',attemptId:attempt?.id??null,reason:attempt?.resolutionNote??null,confirmedAt:attempt?.confirmedAt?.toISOString()??null};
 }
 async verifyAttempt(actor:Actor,attemptId:string){
  requireAdmin(actor);const a=await this.db.contactAttempt.findUnique({where:{id:attemptId}});
  if(!a||a.mode!=='REAL'||a.channel!=='DM'||a.jobId||!a.requestKey.startsWith('dm:'))throw new NotFoundException();
  return this.verify(actor,a.requestKey.slice(3));
 }
 async verify(actor:Actor,id:string,signal:AbortSignal=AbortSignal.timeout(100000)){
  requireAdmin(actor);const user=await this.db.user.findUnique({where:{id:actor.id}});if(!user?.active||user.role!=='ADMIN')fail('管理员权限已变化');const req=await this.db.manualReplyRequest.findUnique({where:{id}});if(!req||req.actorId!==actor.id)throw new NotFoundException();const scope=scopeSchema.parse(req.scope);
  const attempt=await this.db.contactAttempt.findUnique({where:{requestKey:'dm:'+req.id},include:{ledger:{include:{identity:true}}}});
  if(!attempt||attempt.channel!=='DM'||attempt.mode!=='REAL')throw new NotFoundException();if(attempt.outcome==='CONFIRMED'){const pauseRecovery=await this.db.$transaction(async tx=>{await contactLock(tx);return resolveConfirmedDmPause(tx,actor,attempt.id)});return {...await this.status(actor,id),pauseRecovery};}if(attempt.outcome!=='UNKNOWN')fail('当前记录不需要核查');
  const account=await this.db.platformAccount.findUnique({where:{id:req.accountId},include:{sessionReference:true}}),snap=attempt.historySnapshot as {senderPlatformId?:string};
  if(!account||account.archivedAt||!account.loginSessionKey||account.loginPlatformUserId!==snap?.senderPlatformId||account.sessionReference?.state!=='VERIFIED'||account.sessionReference.sessionKey!==account.loginSessionKey||attempt.ledger.identity.platformUserId!==scope.recipientId||attempt.content!==scope.content||!this.executor.verify)fail('原发送账号或记录无法核对');
  const c:DmCommand={protocol:DM_SEND_PROTOCOL,attemptId:attempt.id,requestKey:attempt.requestKey,accountId:account.id,senderId:account.loginPlatformUserId!,recipientId:scope.recipientId,content:scope.content,contentSha256:dmDigest(scope.content),maxSubmissions:1,expiresAt:new Date(Date.now()+180000).toISOString()};
  let proof:Awaited<ReturnType<NonNullable<DmExecutor['verify']>>>;try{proof=await this.executor.verify(actor,c,account.loginSessionKey,signal)}catch{fail('暂未取得可靠回执，保留未知状态，请勿重发')}
  const obs=proof!.observations;if(proof!.stopped!==true||obs.length!==2||obs[0].inspectionId===obs[1].inspectionId||obs[0].messageId!==obs[1].messageId||obs.some(o=>!validDmMessageId(o.messageId,c.senderId,c.recipientId)||o.senderId!==c.senderId||o.recipientId!==c.recipientId||o.contentSha256!==c.contentSha256||!Number.isFinite(Date.parse(o.observedAt))||Date.parse(o.observedAt)<Date.now()-180000||Date.parse(o.observedAt)>Date.now()+5000))fail('回执不一致，保留未知状态');
  await this.db.$transaction(async tx=>{await contactLock(tx);const changed=await tx.contactAttempt.updateMany({where:{id:attempt.id,outcome:'UNKNOWN',version:attempt.version},data:{outcome:'CONFIRMED',platformReceipt:obs[0].messageId,confirmedAt:await contactNow(tx),resolutionNote:'私信已发送，两次独立会话回读一致',version:{increment:1}}});if(changed.count!==1)fail('记录已变化，请刷新结果');
   await tx.auditLog.create({data:{actorId:actor.id,entityId:attempt.requestKey,action:'DM_UNKNOWN_READBACK_CONFIRMED',metadata:{attemptId:attempt.id,previousOutcome:'UNKNOWN',proof:proof! as unknown as Prisma.InputJsonValue}}});
   await resolveConfirmedDmPause(tx,actor,attempt.id);
  });return this.status(actor,id);
 }
 async confirm(actor:Actor,raw:unknown,signal:AbortSignal=AbortSignal.timeout(90000)){
  requireAdmin(actor);const input=parse(dmConfirmInput,raw);
  const reserved=await this.db.$transaction(async tx=>{
   await contactLock(tx);const req=await tx.manualReplyRequest.findUnique({where:{id:input.previewId}});if(!req||req.actorId!==actor.id)throw new NotFoundException();
   if(!/^[a-f0-9]{64}$/.test(req.tokenHash)||!timingSafeEqual(Buffer.from(req.tokenHash),Buffer.from(dmDigest(input.token))))fail('预览凭据不匹配');
   const scope=scopeSchema.parse(req.scope),key='dm:'+req.id;
   if(req.confirmedAt){if(req.submissionKey!==input.requestKey)fail('此预览已确认，请查看发送结果');const attempt=await tx.contactAttempt.findUnique({where:{requestKey:key}});if(!attempt)fail('确认记录不完整，请勿重试发送');return {existing:true as const,attempt};}
   if(req.expiresAt<=await contactNow(tx))fail('预览已过期，请重新预览');
   if(!this.executor.available())fail('私信发送通道不可用');const v=await this.validate(tx,actor,scope.input);if(v.hash!==scope.hash||v.day!==scope.day||v.content!==scope.content||v.target.recipientId!==scope.recipientId)fail('账号、评论或模板已变化，请重新预览');
   await tx.$queryRaw`SELECT id FROM "PlatformAccount" WHERE id=${v.account.id} FOR UPDATE`;
   const identity=v.identity??await tx.platformIdentity.create({data:{platform:'XHS',platformUserId:v.target.recipientId,nickname:v.display.authorNickname||'',isDemo:false}});
   const ledger=await tx.contactLedger.upsert({where:{identityId_mode:{identityId:identity.id,mode:'REAL'}},create:{identityId:identity.id,mode:'REAL',accountId:v.account.id},update:{accountId:v.account.id}});
   const attempt=await tx.contactAttempt.create({data:{id:randomUUID(),ledgerId:ledger.id,requestKey:key,kind:'FIRST',mode:'REAL',channel:'DM',content:v.content,outcome:'RESERVED',day:v.day,actorId:actor.id,accountIdSnapshot:v.account.id,historySnapshot:{platform:'XHS',...v.target,reviewId:v.review.id,runId:v.review.runId,accountId:v.account.id,accountLabel:v.account.label,senderNickname:boundAccountNickname(v.account),senderPlatformId:v.account.loginPlatformUserId,source:{comment:v.review.snapshot,post:{title:(v.review.snapshot as {title?:string}).title??''}}} as Prisma.InputJsonValue}});
   await tx.accountDay.upsert({where:{accountId_day:{accountId:v.account.id,day:v.day}},create:{accountId:v.account.id,day:v.day,occupied:1},update:{occupied:{increment:1}}});
   await tx.autoContactControl.upsert({where:{platform_mode:{platform:'XHS',mode:'REAL'}},create:{platform:'XHS',mode:'REAL',activeJobId:key,leaseUntil:new Date(v.now.getTime()+120000)},update:{activeJobId:key,leaseUntil:new Date(v.now.getTime()+120000)}});
   await tx.manualReplyRequest.update({where:{id:req.id},data:{confirmedAt:v.now,submissionKey:input.requestKey}});
   await tx.auditLog.create({data:{actorId:actor.id,entityId:key,action:'DM_EXPLICIT_CONFIRMED_RESERVED',metadata:{attemptId:attempt.id,previewId:req.id,scopeHash:v.hash,recipientId:v.target.recipientId,contentHash:dmDigest(v.content)}}});
   return {existing:false as const,attempt,v,scope,expiresAt:req.expiresAt};
  });
  if(reserved.existing)return {attemptId:reserved.attempt.id,outcome:reserved.attempt.outcome,replayed:true};
  const {attempt,v,scope}=reserved;let dispatched=false;
  const c:DmCommand={protocol:DM_SEND_PROTOCOL,attemptId:attempt.id,requestKey:attempt.requestKey,accountId:v.account.id,senderId:v.account.loginPlatformUserId!,recipientId:v.target.recipientId,content:v.content,contentSha256:dmDigest(v.content),maxSubmissions:1,expiresAt:reserved.expiresAt.toISOString()};
  const beforeDispatch=()=>this.db.$transaction(async tx=>{await contactLock(tx);if(dispatched||signal.aborted||reserved.expiresAt<=await contactNow(tx))return false;const current=await tx.contactAttempt.findUnique({where:{id:attempt.id}});if(current?.outcome!=='RESERVED')return false;const checked=await this.validate(tx,actor,scope.input,attempt.requestKey);if(checked.hash!==scope.hash)return false;await tx.contactAttempt.update({where:{id:attempt.id},data:{outcome:'ATTEMPTED',attemptedAt:checked.now,version:{increment:1}}});await tx.auditLog.create({data:{actorId:actor.id,entityId:attempt.requestKey,action:'DM_DISPATCHED_ONCE',metadata:{attemptId:attempt.id}}});dispatched=true;return true;});
  let r:DmExecution;
  try{r=parseDmExecution(await this.executor.run(actor,c,v.account.loginSessionKey!,beforeDispatch,signal),c)}catch{r={protocol:DM_SEND_PROTOCOL,attemptId:attempt.id,requestKey:attempt.requestKey,kind:'UNKNOWN',reason:'EXECUTOR_OUTCOME_UNKNOWN',inputs:0,submissions:dispatched?1:0,stopped:false}}
  const reason=({EXISTING_DRAFT:'会话中已有草稿，未覆盖',EXISTING_OUTGOING_CONTACT:'会话已有外发消息，未再次联系',CONVERSATION_UNSAFE:'会话身份或平台发送条件未通过',CONVERSATION_UNVERIFIED:'收件人会话未核实',RECEIPT_UNVERIFIED:'未取得可靠消息回执',READBACK_UNVERIFIED:'新页面回读未确认',PLATFORM_SEND_FAILED:'平台显示发送失败',TRANSPORT_OUTCOME_UNKNOWN:'发送连接中断，结果未知',STOP_UNCONFIRMED:'执行进程停止状态未确认',RUNTIME_UNAVAILABLE:'私信运行环境不可用',PRE_DISPATCH_STOPPED:'提交前检查未通过',DRAFT_CHANGED:'发送内容或输入焦点已变化'} as Record<string,string>)[r.reason]??'私信执行状态需核查';
  const confirmed=dispatched&&r.kind==='CONFIRMED'&&r.stopped,notSent=r.kind==='NOT_SENT'&&r.submissions===0&&r.stopped;
  await this.db.$transaction(async tx=>{await contactLock(tx);const current=await tx.contactAttempt.findUniqueOrThrow({where:{id:attempt.id}});if(!['RESERVED','ATTEMPTED'].includes(current.outcome))return;
   await tx.contactAttempt.update({where:{id:attempt.id},data:{outcome:confirmed?'CONFIRMED':notSent?'FAILED':'UNKNOWN',platformReceipt:confirmed?r.receipt!.messageId:null,confirmedAt:confirmed?await contactNow(tx):null,resolutionNote:confirmed?'私信已发送，消息 ID 与新页面回读一致':notSent?'未提交私信：'+reason:'发送结果未知，禁止重发：'+reason,version:{increment:1}}});
   if(notSent)await tx.accountDay.update({where:{accountId_day:{accountId:v.account.id,day:v.day}},data:{occupied:{decrement:1}}});
   await tx.autoContactControl.updateMany({where:{platform:'XHS',mode:'REAL',activeJobId:attempt.requestKey},data:{activeJobId:null,leaseUntil:null,...(!notSent&&!confirmed?{pauseReason:'DM_SUBMISSION_UNKNOWN',pausedAt:await contactNow(tx)}:{})}});
   await tx.auditLog.create({data:{actorId:actor.id,entityId:attempt.requestKey,action:'DM_EXECUTION_FINISHED',metadata:{attemptId:attempt.id,result:r as unknown as Prisma.InputJsonValue,dispatched}}});
  });
  return {attemptId:attempt.id,outcome:confirmed?'CONFIRMED':notSent?'FAILED':'UNKNOWN',reason:confirmed?null:reason,replayed:false};
 }
}
