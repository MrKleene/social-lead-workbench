import {configInput} from '../collection/contract';
import {semanticHash} from '../collection/capture-archive';
import {ConflictException,Inject,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {Db} from '../common/db';
import {parse} from '../common/validation';
import {requireAdmin,type Actor} from '../auth/security';
import {lockSinglePost,assertNoSinglePost} from '../collection/single-post-lock';
import {lockReview} from '../comment-review/review-policy.service';
import {contactLock} from './contact-lock';
import {ruleHash,eligible,eligibilityHash,contactTarget} from './contact-policy';
import {savedReadTarget} from '../collection/saved-post-read';
import {qwenModel} from '../../../../runtime/qwen-models.cjs';
import {activeAcceptance,normalAcceptanceInput,normalAcceptanceScope,replyExceptionInput,acceptanceConflict,coverageSkipped,blockingAcceptanceJobs,acceptanceDmTemplate} from './normal-acceptance';
/** Administrative finite envelope around normal endpoints and workers, never a sender. */
@Injectable()
export class NormalAcceptanceService {
 constructor(@Inject(Db) private db:Db){}
 async status(actor:Actor){requireAdmin(actor);return this.db.normalAutomationAcceptance.findMany({orderBy:{createdAt:'desc'},take:20});}
 async arm(actor:Actor,raw:unknown){
  requireAdmin(actor);const input=parse(normalAcceptanceInput,raw);
  return this.db.$transaction(async tx=>{
   // Same order as collection -> provider -> contact. No outbound IO under these locks.
   await lockSinglePost(tx);await assertNoSinglePost(tx);await lockReview(tx);await contactLock(tx);
   if(await activeAcceptance(tx)||await tx.normalAutomationAcceptance.findUnique({where:{id:input.id}}))throw new ConflictException('已有验收或授权标识已使用，不能重置次数');
   const [config,rule,model,user]=await Promise.all([tx.collectionConfig.findUnique({where:{id:input.configId}}),tx.autoContactRule.findUnique({where:{id:input.ruleId}}),tx.modelSettings.findFirst(),tx.user.findUnique({where:{id:actor.id}})]);
   if(!config||!rule||!model||!user?.active||user.role!=='ADMIN')acceptanceConflict();
   const policy=await tx.commentReviewPolicy.findUnique({where:{id:rule.policyId}}),catalog=qwenModel(model.model);
   const expiry=Date.parse(input.expiresAt)-Date.now();
   if(input.maxPosts>config.batchLimit||input.selection==='SAVED_POST'&&input.maxPosts!==1)acceptanceConflict();
   if(expiry<=0||expiry>1800000||config.archivedAt||!config.enabled||config.legacyMatchingEnabled||config.revision!==input.configRevision||rule.version!==input.ruleVersion||rule.enabled||rule.platform!=='XHS'||rule.channel!==input.channel||rule.channels.length!==1||rule.channels[0]!==input.channel||rule.accountIds.length!==1||!rule.content.trim()||policy?.version!==input.policyVersion||policy.autoEnabled||policy.revision!==rule.policyRevision||model.version!==input.modelVersion||model.model!==rule.model||catalog?.priceVersion!==input.priceVersion||model.priceVersion!==input.priceVersion)acceptanceConflict();
   const dmTemplate=input.channel==='DM'?await acceptanceDmTemplate(tx,rule):undefined;
   if(input.channel==='DM'&&!dmTemplate)acceptanceConflict();
   if((rule.mode==='REAL'&&(config.mode!=='XHS_MCP'||!input.readAccountId))||(rule.mode==='SIMULATION'&&(config.mode!=='MOCK'||input.readAccountId)))acceptanceConflict();
   if(input.selection==='CONFIG_SEARCH'?(!!input.savedPostId||!!input.targets||rule.threshold!==100):(!input.savedPostId||!input.targets))acceptanceConflict();
   const target=input.savedPostId?await savedReadTarget(tx,config.id,input.savedPostId,config.mode as 'MOCK'|'XHS_MCP'):null;
   if(rule.mode==='REAL'&&target&&(!/^[a-f0-9]{24}$/.test(target.id)||input.targets!.some(t=>!(/^[a-f0-9]{24}$/.test(t.commentId)&&/^[a-f0-9]{24}$/.test(t.recipientId)))))acceptanceConflict();
   if(await tx.collectionRun.count({where:{status:{in:['QUEUED','RUNNING']}}})||await tx.collectionRun.findUnique({where:{requestKey:input.requestKey}})||await tx.autoContactRule.count({where:{enabled:true}})||await tx.commentReviewPolicy.count({where:{autoEnabled:true}})||await tx.autoContactJob.count({where:{status:{in:['RESERVED','ATTEMPTED']}}})||await tx.autoReviewJob.count({where:{status:'PROCESSING'}})||await tx.semanticModelCall.count({where:{status:'RESERVED'}})||await tx.deviceExecutionLease.count())throw new ConflictException('请先核查并结束其他活动任务、规则和租约；未自动取消或重放旧任务');
   const {consent,...bound}=input;
   const scope=normalAcceptanceScope.parse({...bound,...(dmTemplate?{dmTemplate}:{}),ruleVersion:rule.version+1,policyVersion:policy.version+1,platformPostId:target?.id,replyAccountId:rule.accountIds[0],ruleHash:ruleHash({...rule,version:rule.version+1}),policyId:policy.id,policyRevision:policy.revision,model:model.model,mode:rule.mode});
   const row=await tx.normalAutomationAcceptance.create({data:{id:input.id,actorId:actor.id,scope:scope as Prisma.InputJsonValue}});
   await tx.auditLog.create({data:{actorId:actor.id,entityId:row.id,action:'NORMAL_ACCEPTANCE_ARMED',metadata:{consent,scope:scope as Prisma.InputJsonValue,maximumModelCalls:input.maxPosts,maximumSubmissions:1,billingHardCap:false}}});return row;
  });
 }
 /** Explicit administrator continuation of a preflight-only failure. Never renew
  * a deadline, collect again, clear a claim, or replay an external request. */
 async resumeUnspent(actor:Actor,id:string,expiresAt:string){
  requireAdmin(actor);return this.db.$transaction(async tx=>{await lockSinglePost(tx);await assertNoSinglePost(tx);await lockReview(tx);await contactLock(tx);
   const a=await tx.normalAutomationAcceptance.findUniqueOrThrow({where:{id}}),s=normalAcceptanceScope.parse(a.scope),deadline=Date.parse(expiresAt);
   if(a.state!=='CLOSED'||a.actorId!==actor.id||!a.runId||s.maxPosts<2||!Number.isFinite(deadline)||deadline<=Date.now()||deadline>Date.parse(s.expiresAt)||a.modelCallId||a.sendJobId||a.modelClaimedAt||a.sendClaimedAt||a.reviewIds.length||a.batchPlanned||await activeAcceptance(tx))acceptanceConflict();
   const [rule,policy,model,run,posts,jobs]=await Promise.all([tx.autoContactRule.findUniqueOrThrow({where:{id:s.ruleId}}),tx.commentReviewPolicy.findUniqueOrThrow({where:{id:s.policyId}}),tx.modelSettings.findFirstOrThrow(),tx.collectionRun.findUniqueOrThrow({where:{id:a.runId}}),tx.normalAcceptancePost.findMany({where:{acceptanceId:id}}),tx.autoReviewJob.findMany({where:{runId:a.runId}})]);
   if(rule.enabled||policy.autoEnabled||ruleHash({...rule,version:s.ruleVersion})!==s.ruleHash||policy.revision!==s.policyRevision||model.version!==s.modelVersion||model.model!==s.model||model.priceVersion!==s.priceVersion||run.status!=='PARTIAL'||!posts.length||posts.length>s.maxPosts||posts.some(p=>p.modelCallId||p.reviewIds.length||p.estimatedMicros!==null||p.payloadHash!==null)||jobs.length!==posts.length)acceptanceConflict();
   if(await tx.collectionRun.count({where:{status:{in:['QUEUED','RUNNING']}}})||await tx.autoReviewJob.count({where:{status:{in:['PENDING','PROCESSING']}}})||await tx.manualReviewJob.count({where:{status:{in:['PENDING','PROCESSING']}}})||await tx.semanticModelCall.count({where:{OR:[{status:'RESERVED'},{createdAt:{gte:a.createdAt}}]}})||await tx.autoContactJob.count({where:{status:{in:['QUEUED','WAITING_ACCOUNT','WAITING_QUOTA','RESERVED','ATTEMPTED']}}})||await tx.deviceExecutionLease.count()||await tx.autoContactRule.count({where:{enabled:true}})||await tx.commentReviewPolicy.count({where:{autoEnabled:true}}))acceptanceConflict();
   const config=await tx.collectionConfig.findUniqueOrThrow({where:{id:s.configId}}),user=await tx.user.findUnique({where:{id:actor.id}});
   const currentSnapshot=configInput.parse({name:config.name,platform:config.platform,mode:config.mode,legacyMatchingEnabled:config.legacyMatchingEnabled,...(config.legacyMatchingEnabled?{semanticRules:config.semanticRules,commentRules:config.commentRules}:{}),keywords:config.keywords,excludeWords:config.excludeWords,batchLimit:config.batchLimit,enabled:config.enabled});
   if(!user?.active||user.role!=='ADMIN'||config.archivedAt||!config.enabled||semanticHash({...currentSnapshot,batchLimit:1})!==semanticHash({...configInput.parse(run.snapshot),batchLimit:1}))acceptanceConflict();
   const eligible:string[]=[];let excluded=0;
   for(const job of jobs){
    if(job.policyId!==s.policyId||!posts.some(p=>p.postId===job.postId))acceptanceConflict();
    if(await coverageSkipped(tx,a,job)){excluded++;continue;}
    const post=await tx.capturedPost.findUniqueOrThrow({where:{id:job.postId}});
    if(post.lastRunId!==a.runId||post.coverage!=='COMPLETE'||job.status!=='FAILED'||job.processed!==0||job.reason!=='本轮全部帖子容量、总费用估算或冻结版本未通过；未调用模型、不拆批')acceptanceConflict();
    eligible.push(job.id);
   }
   if(!eligible.length||!excluded)acceptanceConflict();
   const scope=normalAcceptanceScope.parse({...s,expiresAt,reviewConfigRevision:config.revision,ruleVersion:rule.version+1,policyVersion:policy.version+1,ruleHash:ruleHash({...rule,version:rule.version+1})});
   await tx.autoReviewJob.updateMany({where:{id:{in:eligible}},data:{status:'PENDING',policyVersion:scope.policyVersion,reason:'仅续接未调用的完整帖子；覆盖未确认帖子保留跳过'}});
   await tx.auditLog.create({data:{actorId:actor.id,entityId:id,action:'NORMAL_ACCEPTANCE_RESUMED_UNSPENT',metadata:{runId:a.runId,priorExpiresAt:s.expiresAt,expiresAt,eligibleJobs:eligible,excluded,claimsReset:false}}});
   return tx.normalAutomationAcceptance.update({where:{id},data:{state:'ACTIVE',scope:scope as Prisma.InputJsonValue}});
  });
 }
 /** New explicit one-recipient consent over an existing completed evaluation.
  * The original model claims, run, close audit and global 100 rule stay intact. */
 async armReplyException(actor:Actor,id:string,raw:unknown){
  requireAdmin(actor);const input=parse(replyExceptionInput,raw);
  return this.db.$transaction(async tx=>{await lockSinglePost(tx);await assertNoSinglePost(tx);await lockReview(tx);await contactLock(tx);
   const a=await tx.normalAutomationAcceptance.findUniqueOrThrow({where:{id}}),s=normalAcceptanceScope.parse(a.scope),expiry=Date.parse(input.expiresAt)-Date.now();
   if(a.state!=='CLOSED'||a.actorId!==actor.id||!a.runId||!a.modelCallId||a.sendJobId||a.sendClaimedAt||s.replyOnly||s.selection!=='CONFIG_SEARCH'||expiry<=0||expiry>1800000||!a.reviewIds.includes(input.reviewId)||await activeAcceptance(tx)||await tx.auditLog.count({where:{entityId:id,action:'NORMAL_ACCEPTANCE_REPLY_EXCEPTION_ARMED'}}))acceptanceConflict();
   const [rule,policy,model,user,review]=await Promise.all([tx.autoContactRule.findUniqueOrThrow({where:{id:s.ruleId}}),tx.commentReviewPolicy.findUniqueOrThrow({where:{id:s.policyId}}),tx.modelSettings.findFirstOrThrow(),tx.user.findUnique({where:{id:actor.id}}),tx.semanticReview.findUniqueOrThrow({where:{id:input.reviewId},include:{capture:{include:{post:true}}}})]);
   if(!user?.active||user.role!=='ADMIN'||rule.enabled||rule.threshold!==100||ruleHash({...rule,version:s.ruleVersion})!==s.ruleHash||policy.autoEnabled||policy.revision!==s.policyRevision||model.version!==s.modelVersion||model.model!==s.model||review.score!==95||!eligible(review,95)||review.policyId!==s.policyId||review.policyRevision!==s.policyRevision||review.selectedModel!==s.model||review.capture?.postId!==input.postId||review.capture.lastRunId!==a.runId||review.capture.post.coverage!=='COMPLETE')acceptanceConflict();
   const target=contactTarget(review,review.capture,review.capture.post),claim=await tx.normalAcceptancePost.findUnique({where:{acceptanceId_postId:{acceptanceId:id,postId:input.postId}}});
   if(!target||!claim?.modelCallId||!claim.reviewIds.includes(review.id)||(await tx.semanticModelCall.findUnique({where:{id:claim.modelCallId}}))?.status!=='COMPLETED'||await blockingAcceptanceJobs(tx,a,['PENDING','PROCESSING','FAILED','CANCELLED','SKIPPED']))acceptanceConflict();
   const identity=await tx.platformIdentity.findUnique({where:{platform_platformUserId:{platform:rule.platform,platformUserId:target.recipientId}},include:{lead:true,contactLedger:{include:{attempts:true}}}});
   if(identity?.lead&&(identity.lead.doNotContact||identity.lead.contactedAt||['CONTACTED','INTERESTED'].includes(identity.lead.contactStage))||identity?.contactLedger.some(l=>l.attempts.some(t=>t.outcome!=='CANCELLED'))||await tx.autoContactJob.count({where:{recipientId:target.recipientId,mode:rule.mode,status:{not:'CANCELLED'}}}))acceptanceConflict();
   if(await tx.collectionRun.count({where:{status:{in:['QUEUED','RUNNING']}}})||await tx.autoReviewJob.count({where:{status:{in:['PENDING','PROCESSING']}}})||await tx.manualReviewJob.count({where:{status:{in:['PENDING','PROCESSING']}}})||await tx.semanticModelCall.count({where:{status:'RESERVED'}})||await tx.autoContactJob.count({where:{status:{in:['QUEUED','WAITING_ACCOUNT','WAITING_QUOTA','RESERVED','ATTEMPTED']}}})||await tx.deviceExecutionLease.count()||await tx.autoContactRule.count({where:{enabled:true}})||await tx.commentReviewPolicy.count({where:{autoEnabled:true}}))acceptanceConflict();
   const replyOnly={reviewId:review.id,postId:input.postId,platformPostId:target.postId,commentId:target.commentId,recipientId:target.recipientId,score:95 as const,reviewHash:eligibilityHash(review),sourceHash:semanticHash({capture:review.capture.snapshot,post:review.capture.post.snapshot})};
   const scope=normalAcceptanceScope.parse({...s,replyOnly,expiresAt:input.expiresAt,ruleVersion:rule.version+1,ruleHash:ruleHash({...rule,version:rule.version+1})});
   await tx.auditLog.create({data:{actorId:actor.id,entityId:id,action:'NORMAL_ACCEPTANCE_REPLY_EXCEPTION_ARMED',metadata:{consent:input.consent,priorScope:a.scope,scope:scope as Prisma.InputJsonValue,additionalModelCalls:0,additionalCollections:0,maximumSubmissions:1,claimsReset:false}}});
   return tx.normalAutomationAcceptance.update({where:{id},data:{state:'ACTIVE',scope:scope as Prisma.InputJsonValue}});
  });
 }
 async close(actor:Actor,id:string){
  requireAdmin(actor);return this.db.$transaction(async tx=>{await lockReview(tx);await contactLock(tx);
   const row=await tx.normalAutomationAcceptance.findUnique({where:{id}});if(!row)throw new NotFoundException();if(row.state==='CLOSED')return row;
   const s=normalAcceptanceScope.parse(row.scope);
   await tx.autoContactRule.updateMany({where:{id:s.ruleId},data:{enabled:false}});
   await tx.commentReviewPolicy.updateMany({where:{id:s.policyId},data:{autoEnabled:false}});
   if(row.runId){await tx.collectionRun.updateMany({where:{id:row.runId,status:{in:['QUEUED','RUNNING']}},data:{cancelRequested:true}});await tx.autoReviewJob.updateMany({where:{runId:row.runId,status:'PENDING'},data:{status:'CANCELLED',reason:'限定验收已结束'}});}
   await tx.auditLog.create({data:{actorId:actor.id,action:'NORMAL_ACCEPTANCE_CLOSED',entityId:id,metadata:{consumedModel:!!row.modelCallId,consumedSend:!!row.sendJobId}}});
   return tx.normalAutomationAcceptance.update({where:{id},data:{state:'CLOSED',closedAt:new Date()}});
  });
 }
}
