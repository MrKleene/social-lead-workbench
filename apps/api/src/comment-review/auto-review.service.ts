import {liveReporter} from '../common/journey-live';
import {wasHistoryArchived} from '../history-archive/archive-guard';
import {coverageSkipped,bindAcceptancePost,activeAcceptance,normalAcceptanceScope,acceptanceReviewAllowed,liveAcceptance} from '../auto-contact/normal-acceptance';
import {Inject,Injectable} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {outputFailureReason,semanticBatchConsent,autoReviewInputPolicy} from '@crm/contracts';
import type {CollectionRun} from '@prisma/client';
import {Db} from '../common/db';
import type {PostRead,ReadResult} from '../collection/collector';
import {ReviewPolicyService,lockReview} from './review-policy.service';
import {ReviewEvaluationService} from './review-evaluation.service';
import {assertAutoReview} from './auto-review.guard';
import {WHOLE_POST_STALE} from '../collection/whole-post-capacity';
import {semanticHash} from '../collection/capture-archive';
@Injectable()
export class AutoReviewService {
 constructor(@Inject(Db) private db:Db,@Inject(ReviewPolicyService) private policies:ReviewPolicyService,@Inject(ReviewEvaluationService) private evaluation:ReviewEvaluationService){}
 async postFinished(run:CollectionRun,entry:PostRead){
  await this.db.$transaction(async tx=>{await lockReview(tx);
   if(await wasHistoryArchived(tx,'CollectionRun',run.id))return;
   const policies=await tx.commentReviewPolicy.findMany({where:{autoEnabled:true}});
   const posts=await tx.capturedPost.findMany({where:{configId:run.configId,lastRunId:run.id,platformPostId:entry.post.id}});
   for(const policy of policies)for(const post of posts){
    if(!await bindAcceptancePost(tx,run.id,post.id))continue;
    if(!await acceptanceReviewAllowed(tx,{id:"pending",runId:run.id,postId:post.id,policyId:policy.id,policyVersion:policy.version}))continue;
    const complete=entry.windowRead&&entry.complete&&post.coverage==='COMPLETE';
    await tx.autoReviewJob.createMany({data:[{policyId:policy.id,policyVersion:policy.version,inputPolicyVersion:autoReviewInputPolicy,runId:run.id,postId:post.id,status:complete?'PENDING':'SKIPPED',reason:complete?'等待预算与调用间隔':`覆盖未通过：${entry.stopReason||'评论范围不完整'}`}],skipDuplicates:true});
   }
  });
 }
 async finished(run:CollectionRun,result:ReadResult){
  // Record incomplete/failed captures too. Never turn task completion into coverage evidence.
  const posts=await this.db.capturedPost.findMany({where:{configId:run.configId,lastRunId:run.id}});
  for(const p of posts)await this.postFinished(run,{post:{id:p.platformPostId,title:''},comments:[],deletedIds:[],complete:false,stopReason:result.reason||'评论读取未完成'} as PostRead);
  if(['FAILED','PAUSED'].includes(result.status))await this.db.autoReviewJob.updateMany({where:{runId:run.id,status:'PENDING'},data:{status:'CANCELLED',reason:`采集未完成：${result.reason||result.status}`}});
 }
 async tick(){
  if(!await this.prepareAcceptanceBatch())return;
  // No replay after an uncertain worker exit. Unstarted jobs can resume; claimed work requires manual review.
  await this.db.autoReviewJob.updateMany({where:{status:'PROCESSING',updatedAt:{lt:new Date(Date.now()-WHOLE_POST_STALE)}},data:{status:'FAILED',reason:'执行中断，调用结果可能未知；请手动核查，不自动重试'}});
  const job=await this.db.$transaction(async tx=>{await lockReview(tx);
   const envelope=await activeAcceptance(tx),scope=envelope?normalAcceptanceScope.parse(envelope.scope):null;if(envelope&&(!liveAcceptance(envelope)||!envelope.runId||!envelope.capturedPostId))return null;
   if(envelope&&await tx.autoReviewJob.count({where:{runId:envelope.runId!,status:'PROCESSING'}}))return null;
   const pendingPosts=envelope?await tx.normalAcceptancePost.findMany({where:{acceptanceId:envelope.id,modelCallId:null}}):[];
   const next=await tx.autoReviewJob.findFirst({where:{status:'PENDING',...(scope?{policyId:scope.policyId,runId:envelope!.runId!,postId:{in:pendingPosts.map(p=>p.postId)}}:{})},orderBy:{createdAt:'asc'}});if(!next)return null;
   const model=await this.policies.models.resolve(tx);
   await tx.autoReviewJob.update({where:{id:next.id},data:{status:'PROCESSING'}});
   try{await assertAutoReview(tx,next.id,model.configurationVersion);}catch(e){await tx.autoReviewJob.update({where:{id:next.id},data:{status:'CANCELLED',reason:e instanceof Error?e.message:'自动授权已失效'}});return null;}
   const status=await this.policies.qwen.status(tx,undefined,{enabled:true,version:next.policyVersion});
   if(!model.status.authorized||model.status.state!=='READY'){await tx.autoReviewJob.update({where:{id:next.id},data:{status:'CANCELLED',reason:'模型未配置或未授权'}});return null;}
   if(!status.usage.canCall){await tx.autoReviewJob.update({where:{id:next.id},data:{status:'PENDING',reason:'等待每日预算、在途请求或 30 秒调用间隔'}});return null;}
   return next;
  });if(!job)return;
  const live=liveReporter(this.db,job.runId,'review',job.id);await live.set('PREPARING_REVIEW');
  try{
   const policy=await this.db.commentReviewPolicy.findUniqueOrThrow({where:{id:job.policyId}}),actor=await this.db.user.findUnique({where:{id:policy.autoActorId||''}});
   if(!actor||actor.role!=='ADMIN')throw Error('自动授权管理员已失效');
   const prepared=await this.policies.prepare(actor,job.policyId,{version:job.policyVersion,scope:{kind:'POSTS',postIds:[job.postId]}},true,job.runId);
   if(!prepared.count){await this.db.autoReviewJob.updateMany({where:{id:job.id,status:'PROCESSING'},data:{status:'COMPLETED',reason:'没有新的可自动送审内容；已有待处理或失败记录可手动测试'}});return;}
   const rows=await this.db.semanticReview.findMany({where:{id:{in:prepared.reviewIds}},orderBy:{id:'asc'}});
   const count=rows.length;
   const preview=await this.evaluation.preview(actor,job.policyId,rows.map(r=>r.id),false,true);
   const result=await this.evaluation.evaluate(actor,job.policyId,{requestKey:randomUUID(),previewHash:preview.hash,reviewIds:preview.reviewIds,priceVersion:preview.connection.priceVersion!,consent:semanticBatchConsent},job.id,undefined,live);
   await this.db.autoReviewJob.updateMany({where:{id:job.id,status:'PROCESSING'},data:{status:result.status==='COMPLETED'?'COMPLETED':'FAILED',processed:{increment:result.status==='COMPLETED'?count:0},reason:result.status==='COMPLETED'?'本次整帖处理完成':(outputFailureReason('errorCode' in result?result.errorCode:null)||'模型请求失败，不自动重试')+` 本批 ${count} 条未采纳，剩余评论未继续送审。`}});
  }catch{await this.db.autoReviewJob.updateMany({where:{id:job.id,status:'PROCESSING'},data:{status:'FAILED',reason:'授权、批次或输入安全检查未通过；请手动核查，不自动重试'}});}finally{await live.close();}
 }
 /** Freeze every selected post's full payload and reserve the SUM of estimates
  * before the first payable call. Preparing/previewing reads no provider key. */
 private async prepareAcceptanceBatch(){
  const a=await activeAcceptance(this.db);if(!a)return true;
  const s=normalAcceptanceScope.parse(a.scope);if(s.replyOnly)return false;if(s.maxPosts===1)return true;
  if(!liveAcceptance(a)||!a.runId)return false;
  const enabledPolicy=await this.db.commentReviewPolicy.findUnique({where:{id:s.policyId}});if(!enabledPolicy?.autoEnabled||enabledPolicy.version!==s.policyVersion)return false;
  if(a.batchPlanned)return true;
  const run=await this.db.collectionRun.findUnique({where:{id:a.runId}});if(!run||['QUEUED','RUNNING'].includes(run.status))return false;
  const bound=await this.db.normalAcceptancePost.findMany({where:{acceptanceId:a.id}}),jobs=await this.db.autoReviewJob.findMany({where:{runId:a.runId,policyId:s.policyId}});
  if(!bound.length)return false;
  try{
   if(!['COMPLETE','PARTIAL'].includes(run.status)||bound.length>s.maxPosts)throw Error('INCOMPLETE_POST');
   const actor=await this.db.user.findUniqueOrThrow({where:{id:a.actorId}}),plans:{postId:string;reviewIds:string[];estimatedMicros:number;payloadHash:string|null}[]=[];
   for(const post of bound){
    const job=jobs.find(j=>j.postId===post.postId);if(!job)throw Error('MISSING_JOB');
    if(await coverageSkipped(this.db,a,job)){plans.push({postId:post.postId,reviewIds:[],estimatedMicros:0,payloadHash:null});continue;}
    if(job.status!=='PENDING')throw Error('UNSAFE_JOB');
    const prepared=await this.policies.prepare(actor,s.policyId,{version:s.policyVersion,scope:{kind:'POSTS',postIds:[post.postId]}},true,a.runId);
    if(!prepared.count){plans.push({postId:post.postId,reviewIds:[] as string[],estimatedMicros:0,payloadHash:null});continue;}
    const preview=await this.evaluation.preview(actor,s.policyId,prepared.reviewIds,false,true),e=preview.costEstimate;
    if(!e.fits||e.priceVersion!==s.priceVersion||e.inputTokensUpper>s.maxInputTokens||e.outputTokens>s.maxOutputTokens||e.estimatedMicros===null)throw Error('POST_CAPACITY');
    plans.push({postId:post.postId,reviewIds:prepared.reviewIds,estimatedMicros:e.estimatedMicros,payloadHash:semanticHash(preview.payload)});
   }
   const estimatedMicros=plans.reduce((n,p)=>n+p.estimatedMicros,0);if(estimatedMicros>s.maxEstimatedMicros)throw Error('TOTAL_ESTIMATE');
   return await this.db.$transaction(async tx=>{await lockReview(tx);const current=await tx.normalAutomationAcceptance.findUniqueOrThrow({where:{id:a.id}});if(!liveAcceptance(current))return false;if(current.batchPlanned)return true;
    if(await tx.normalAcceptancePost.count({where:{acceptanceId:a.id,modelCallId:{not:null}}}))throw Error('CLAIM_CHANGED');
    for(const plan of plans){await tx.normalAcceptancePost.update({where:{acceptanceId_postId:{acceptanceId:a.id,postId:plan.postId}},data:plan});if(!plan.reviewIds.length)await tx.autoReviewJob.updateMany({where:{runId:a.runId!,postId:plan.postId,status:'PENDING'},data:{status:'COMPLETED',reason:'没有新的待评评论'}});}
    await tx.normalAutomationAcceptance.update({where:{id:a.id},data:{batchPlanned:true}});
    await tx.auditLog.create({data:{entityId:a.id,action:'NORMAL_ACCEPTANCE_BATCH_BUDGET_READY',metadata:{estimatedMicros,maximumEstimatedMicros:s.maxEstimatedMicros,maximumCalls:s.maxPosts,plans,billingHardCap:false}}});return true;
   });
  }catch{
   // Another worker may have committed the identical plan and started a call
   // while this reader was previewing. Its now-PROCESSING rows are not a new
   // budget failure and must not cancel that committed plan.
   return this.db.$transaction(async tx=>{await lockReview(tx);const current=await tx.normalAutomationAcceptance.findUniqueOrThrow({where:{id:a.id}});if(current.batchPlanned)return liveAcceptance(current);
    await tx.autoReviewJob.updateMany({where:{runId:a.runId!,status:'PENDING'},data:{status:'FAILED',reason:'本轮全部帖子容量、总费用估算或冻结版本未通过；未调用模型、不拆批'}});return false;
   });
  }
 }
}
