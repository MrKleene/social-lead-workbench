import {jobMatchesPlan,attemptBlocksChannel} from './channel-plan';
import {wasHistoryArchived} from '../history-archive/archive-guard';
import {recipientRecoveryBlocked} from './user-reviewed-recovery';
import {historyDisplay} from '../common/db';
import {effectiveAccountLimit} from '../accounts/account-day-limit';
import {randomBytes,randomUUID,createHash,timingSafeEqual} from 'node:crypto';
import {Inject,Injectable,ConflictException,NotFoundException} from '@nestjs/common';
import {z} from 'zod';
import {Prisma} from '@prisma/client';
import {captureDisplay,previewReply,type CaptureDisplay} from '@crm/contracts';
import {Db} from '../common/db';
import {requireAdmin,type Actor} from '../auth/security';
import {parse} from '../common/validation';
import {activeAcceptance} from './normal-acceptance';
import {contactLock} from './contact-lock';
import {contactNow} from './contact-settings.service';
import {accountModeBlocked} from '../accounts/account-execution-policy';
import {channelSendObservation} from './channel-send-observation';
import {contactTarget,eligible,eligibilityHash,quotaBucket} from './contact-policy';
import {postAvailability,postSendBlock} from '../collection/post-availability';
import {manualReplyScope} from './manual-reply-authority';
import {CONTACT_SENDER,type ContactSender} from './contact-sender';
const key=z.string().min(1).max(200);
export const pendingPreviewInput=z.object({accountId:key,template:z.object({id:key,version:z.number().int().nonnegative()}).strict().optional(),jobs:z.array(z.object({id:key,version:z.string().datetime()}).strict()).min(1).max(1).refine(x=>new Set(x.map(j=>j.id)).size===x.length)}).strict();
export const pendingConfirmInput=z.object({previewId:z.string().uuid(),token:z.string().min(32).max(200),requestKey:z.string().uuid()}).strict();
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
function fail(s:string):never{throw new ConflictException(s);}
@Injectable()
export class PendingRepliesService {
 constructor(@Inject(Db) private db:Db,@Inject(CONTACT_SENDER) private sender:ContactSender){}
 async list(actor:Actor,offset=0,runId?:string){requireAdmin(actor);const where={mode:this.sender.mode,status:{in:['PENDING_ACTION','FAILED','UNKNOWN','BLOCKED_POST']},...(runId?{review:{runId}}:{})};const [items,total]=await Promise.all([historyDisplay(this.db).autoContactJob.findMany({where,orderBy:[{createdAt:'asc'},{id:'asc'}],skip:offset,take:20,include:{review:{select:{runId:true,snapshot:true,score:true}}}}),historyDisplay(this.db).autoContactJob.count({where})]);return {total,items:items.map(j=>{const frozen=j.sourceSnapshot as {post?:{title?:string};comment?:{comment?:string}}|null,s=j.review.snapshot as CaptureDisplay & {comment?:string;title?:string};return {id:j.id,status:j.status,selectable:j.status==='PENDING_ACTION'&&!j.attemptId,version:j.updatedAt.toISOString(),runId:j.review.runId,platform:j.platform,channel:j.channel,postTitle:frozen?.post?.title||s.title||'',comment:frozen?.comment?.comment||s.comment||'',...captureDisplay((frozen?.comment||s) as CaptureDisplay),score:(j.evidence as {score?:number})?.score??j.review.score,content:j.content,reason:j.reason,createdAt:j.createdAt.toISOString()};})};}
 async options(actor:Actor,id:string){
  requireAdmin(actor);
  return this.db.$transaction(async tx=>{
   const j=await tx.autoContactJob.findFirst({where:{id,mode:this.sender.mode},include:{rule:true}});
   if(!j||await wasHistoryArchived(tx,'AutoContactJob',id))throw new NotFoundException('未找到待处理回复');
   const now=await contactNow(tx),day=quotaBucket(this.sender.mode,now);
   const accounts=await tx.platformAccount.findMany({where:{id:{in:j.rule.accountIds},platform:j.platform,archivedAt:null},orderBy:{id:'asc'}});
   const options=[];
   for(const a of accounts){
    const usage=await tx.accountDay.findUnique({where:{accountId_day:{accountId:a.id,day}}});
    const limit=Math.min(effectiveAccountLimit(a.dailyLimit,usage,day),(j.rule.accountLimits as {id:string;dailyLimit:number}[]).find(v=>v.id===a.id)?.dailyLimit??0);
    let reason:string|null=null;
    try{await this.validate(tx,actor,a.id,[{id:j.id,version:j.updatedAt.toISOString()}],now);}catch(e){if(!(e instanceof ConflictException))throw e;reason=e.message;}
    options.push({id:a.id,label:a.loginNickname||a.label,limit,occupied:usage?.occupied??0,remaining:Math.max(0,limit-(usage?.occupied??0)),available:!reason,reason});
   }
   const templates=await tx.replyTemplate.findMany({where:{channel:j.channel},orderBy:[{name:'asc'},{id:'asc'}],select:{id:true,name:true,version:true,body:true,channel:true}});
   return {jobId:j.id,version:j.updatedAt.toISOString(),status:j.status,reason:j.reason,channel:j.channel,accounts:options,templates};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
 }
 async result(actor:Actor,id:string){
  requireAdmin(actor);const j=await historyDisplay(this.db).autoContactJob.findFirst({where:{id,mode:this.sender.mode},select:{id:true,status:true,reason:true,channel:true,accountId:true,updatedAt:true}});
  if(!j)throw new NotFoundException('未找到回复任务');return j;
 }
 private async validate(tx:Prisma.TransactionClient,actor:Actor,accountId:string,jobs:{id:string;version:string}[],now:Date){
  if(await activeAcceptance(tx))fail('限定执行正在生效，不能额外提交待处理回复');
  const currentActor=await tx.user.findUnique({where:{id:actor.id},select:{active:true,role:true}});if(!currentActor?.active||currentActor.role!=='ADMIN')fail('管理员权限已变化');
  const account=await tx.platformAccount.findUnique({where:{id:accountId},include:{sessionReference:true}});
  if(!account||account.archivedAt||accountModeBlocked(account,this.sender.mode))fail('所选账号不可发送');
  if(this.sender.mode==='REAL'){
   const ref=account.sessionReference;
   if(account.isDemo||!account.loginSessionKey||ref?.sessionKey!==account.loginSessionKey||!['VERIFIED','UNVERIFIED','CONNECTION_ERROR'].includes(ref?.state||''))fail('账号登录、身份或平台限制需处理');
  }else if(!account.isDemo||account.loginSessionKey)fail('账号模式不符');
  const control=await tx.autoContactControl.findUnique({where:{platform_mode:{platform:account.platform,mode:this.sender.mode}}});if(control?.pauseReason)fail('发送已因风险暂停，请先核查');if(control?.activeJobId)fail('当前有回复正在执行，请稍后预览');
  const rows=await tx.autoContactJob.findMany({where:{id:{in:jobs.map(j=>j.id)},mode:this.sender.mode},include:{rule:true,review:{include:{capture:{include:{post:true,config:{select:{platform:true}}}}}}}});
  if(rows.length!==jobs.length)fail('待处理任务不存在或已变化');const day=quotaBucket(this.sender.mode,now),usage=await tx.accountDay.findUnique({where:{accountId_day:{accountId,day}}});let cap=effectiveAccountLimit(account.dailyLimit,usage,day);const targets=new Set<string>();
  for(const j of rows){
   if(j.status!=='PENDING_ACTION'||j.attemptId||j.updatedAt.toISOString()!==jobs.find(x=>x.id===j.id)!.version)fail('任务状态已变化，请重新选择');
   if(j.platform!==account.platform||!this.sender.capability(j.platform,j.channel)||!j.rule.accountIds.includes(accountId))fail('所选账号不在此任务当前授权账号池中');
   if(this.sender.mode==='REAL'){const o=await channelSendObservation(tx,account.id,now,j.channel);if(o.state!=='UNKNOWN'||o.evidenceInvalid)fail('账号存在限制，不能发送');}
   const r=j.review,rule=j.rule,policy=await tx.commentReviewPolicy.findUnique({where:{id:rule.policyId}}),model=await tx.modelSettings.findFirst({select:{model:true}});
   if(rule.mode!==this.sender.mode||rule.platform!==j.platform||!jobMatchesPlan(rule,j,true)||policy?.revision!==rule.policyRevision||model?.model!==rule.model||r.policyId!==rule.policyId||r.policyRevision!==rule.policyRevision||r.selectedModel!==rule.model||!eligible(r,rule.threshold)||eligibilityHash(r)!==j.eligibilityHash||r.isDemo!==(this.sender.mode==='SIMULATION')||r.capture?.config.platform!==j.platform)fail('评分、来源、模型或规则已变化，不能沿用旧任务');
   const target=contactTarget(r,r.capture,r.capture?.post??null);if(!target||target.recipientId!==j.recipientId||target.postId!==j.postId||target.commentId!==j.commentId)fail('原评论关联已变化');
   if(await recipientRecoveryBlocked(tx,j.platform,j.recipientId))fail('该用户已隔离，禁止再次联系');
   const block=postSendBlock(await postAvailability(tx,j.platform,j.postId),now,r.updatedAt,j.availabilityVersion);if(block)fail(block);
   const identity=await tx.platformIdentity.findUnique({where:{platform_platformUserId:{platform:j.platform,platformUserId:j.recipientId}},include:{lead:true}});
   if(identity?.lead&&(identity.lead.doNotContact||(!identity.lead.isDemo&&(identity.lead.contactedAt||['CONTACTED','INTERESTED'].includes(identity.lead.contactStage)))))fail('收件人已联系或标记勿联系');
   const ledger=identity?await tx.contactLedger.findUnique({where:{identityId_mode:{identityId:identity.id,mode:this.sender.mode}},include:{attempts:true}}):null;
   if(ledger?.attempts.some(a=>attemptBlocksChannel(a,j.channel)))fail('此渠道已有发送尝试或存在未知结果，不能重复或换号补发');
   if(targets.has(j.recipientId))fail('所选任务包含重复收件人');targets.add(j.recipientId);
   cap=Math.min(cap,(rule.accountLimits as {id:string;dailyLimit:number}[]).find(a=>a.id===accountId)?.dailyLimit??0);
  }
  if(cap-(usage?.occupied??0)<rows.length)fail('所选账号今日剩余额度不足，请减少所选项或稍后处理');
  return {account,rows,day};
 }
 private async templateContent(tx:Prisma.TransactionClient,j:{channel:string;platform:string;review:{snapshot:Prisma.JsonValue}},selection:{id:string;version:number}){
  await tx.$queryRaw`SELECT id FROM "ReplyTemplate" WHERE id=${selection.id} FOR SHARE`;
  const t=await tx.replyTemplate.findUnique({where:{id:selection.id}});
  if(!t||t.version!==selection.version||t.channel!==j.channel)fail('模板已变化或渠道不匹配，请重新选择');
  const snapshot=j.review.snapshot as CaptureDisplay & {title?:string};const display=captureDisplay(snapshot);
  const rendered=previewReply(t.body,{昵称:display.authorNickname||undefined,帖子标题:snapshot.title,平台:j.platform==='XHS'?'小红书':'抖音'});
  if(rendered.missing.length||rendered.unknown.length)fail('模板有缺失或未知字段，请换用完整模板');
  if(!rendered.text.trim()||rendered.text.length>1000)fail('发送内容需为1–1000字');
  return {content:rendered.text,template:{id:t.id,version:t.version,bodyHash:digest(t.body),name:t.name}};
 }
 async preview(actor:Actor,raw:unknown){requireAdmin(actor);const input=parse(pendingPreviewInput,raw),token=randomBytes(32).toString('base64url');return this.db.$transaction(async tx=>{await contactLock(tx);const now=await contactNow(tx),v=await this.validate(tx,actor,input.accountId,input.jobs,now),id=randomUUID();const chosen=input.template?await this.templateContent(tx,v.rows[0],input.template):null;const scope=manualReplyScope.parse({day:v.day,jobs:v.rows.map(j=>({... (chosen?{template:chosen.template}:{}),channel:j.channel,id:j.id,version:j.updatedAt.toISOString(),ruleId:j.ruleId,ruleVersion:j.rule.version,reviewHash:j.eligibilityHash,originalContent:j.content,content:chosen?.content??j.content,recipientId:j.recipientId,postId:j.postId,commentId:j.commentId,availabilityVersion:j.availabilityVersion}))});const expiresAt=new Date(Math.min(now.getTime()+300000,Date.parse(v.day.slice(-10)+'T00:00:00+08:00')+86400000));await tx.manualReplyRequest.create({data:{id,actorId:actor.id,accountId:v.account.id,accountVersion:v.account.version,tokenHash:digest(token),scope,expiresAt}});return {previewId:id,token,expiresAt:expiresAt.toISOString(),accountLabel:v.account.loginNickname||v.account.label,items:v.rows.map(j=>({id:j.id,channel:j.channel,templateName:chosen?.template.name??null,content:chosen?.content??j.content,comment:(j.review.snapshot as {comment?:string}).comment||'',postTitle:(j.review.snapshot as {title?:string}).title||''})),notice:'仅发送所选任务；执行前核验账号与渠道。额度或条件变化时退回待处理，不跨天续发。'};});}
 async confirm(actor:Actor,raw:unknown){requireAdmin(actor);const input=parse(pendingConfirmInput,raw);return this.db.$transaction(async tx=>{await contactLock(tx);const r=await tx.manualReplyRequest.findUnique({where:{id:input.previewId}});if(!r||r.actorId!==actor.id)throw new NotFoundException();const actual=Buffer.from(digest(input.token));if(!timingSafeEqual(Buffer.from(r.tokenHash),actual))fail('预览凭据不匹配');
   if(r.confirmedAt){if(r.submissionKey!==input.requestKey)fail('此预览已确认，请查看处理结果');return {accepted:true,previewId:r.id,replayed:true};}
   const now=await contactNow(tx),scope=manualReplyScope.parse(r.scope);if(r.expiresAt<=now||scope.day!==quotaBucket(this.sender.mode,now))fail('预览已过期，请重新预览');
   const v=await this.validate(tx,actor,r.accountId,scope.jobs,now);if(v.account.version!==r.accountVersion||v.rows.some(j=>scope.jobs.find(x=>x.id===j.id)?.ruleVersion!==j.rule.version))fail('账号或规则版本已变化，请重新预览');
   for(const j of v.rows){const frozen=scope.jobs.find(x=>x.id===j.id)!;if(frozen.template){const chosen=await this.templateContent(tx,j,frozen.template);if(chosen.template.bodyHash!==frozen.template.bodyHash||chosen.content!==frozen.content)fail('模板或来源已变化，请重新预览');}}
   if(await tx.manualReplyRequest.findUnique({where:{submissionKey:input.requestKey}}))fail('此请求标识已被使用');
   for(const j of v.rows){const n=await tx.autoContactJob.updateMany({where:{id:j.id,status:'PENDING_ACTION',attemptId:null,updatedAt:j.updatedAt},data:{content:scope.jobs.find(x=>x.id===j.id)!.content,status:'MANUAL_READY',manualRequestId:r.id,reason:'已确认本次发送，等待执行前核验'}});if(n.count!==1)fail('任务状态已变化');}
   await tx.manualReplyRequest.update({where:{id:r.id},data:{confirmedAt:now,submissionKey:input.requestKey}});await tx.auditLog.create({data:{actorId:actor.id,entityId:r.id,action:'PENDING_REPLIES_CONFIRMED',metadata:{accountId:r.accountId,jobIds:v.rows.map(j=>j.id),templates:scope.jobs.map(j=>({jobId:j.id,channel:j.channel,templateId:j.template?.id??null,templateVersion:j.template?.version??null})),expiresAt:r.expiresAt.toISOString()}}});return {accepted:true,previewId:r.id,replayed:false};
 });}
}
