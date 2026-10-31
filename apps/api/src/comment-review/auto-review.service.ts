import {bindAcceptancePost,activeAcceptance,normalAcceptanceScope,acceptanceReviewAllowed,liveAcceptance} from '../auto-contact/normal-acceptance';
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
@Injectable()
export class AutoReviewService {
 constructor(@Inject(Db) private db:Db,@Inject(ReviewPolicyService) private policies:ReviewPolicyService,@Inject(ReviewEvaluationService) private evaluation:ReviewEvaluationService){}
 async postFinished(run:CollectionRun,entry:PostRead){
  await this.db.$transaction(async tx=>{await lockReview(tx);
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
  // No replay after an uncertain worker exit. Unstarted jobs can resume; claimed work requires manual review.
  await this.db.autoReviewJob.updateMany({where:{status:'PROCESSING',updatedAt:{lt:new Date(Date.now()-WHOLE_POST_STALE)}},data:{status:'FAILED',reason:'执行中断，调用结果可能未知；请手动核查，不自动重试'}});
  const job=await this.db.$transaction(async tx=>{await lockReview(tx);
   const envelope=await activeAcceptance(tx),scope=envelope?normalAcceptanceScope.parse(envelope.scope):null;if(envelope&&(!liveAcceptance(envelope)||envelope.modelCallId||!envelope.runId||!envelope.capturedPostId))return null;
   const next=await tx.autoReviewJob.findFirst({where:{status:'PENDING',...(scope?{policyId:scope.policyId,runId:envelope!.runId!,postId:envelope!.capturedPostId!}:{})},orderBy:{createdAt:'asc'}});if(!next)return null;
   const model=await this.policies.models.resolve(tx);
   await tx.autoReviewJob.update({where:{id:next.id},data:{status:'PROCESSING'}});
   try{await assertAutoReview(tx,next.id,model.configurationVersion);}catch(e){await tx.autoReviewJob.update({where:{id:next.id},data:{status:'CANCELLED',reason:e instanceof Error?e.message:'自动授权已失效'}});return null;}
   const status=await this.policies.qwen.status(tx,undefined,{enabled:true,version:next.policyVersion});
   if(!model.status.authorized||model.status.state!=='READY'){await tx.autoReviewJob.update({where:{id:next.id},data:{status:'CANCELLED',reason:'模型未配置或未授权'}});return null;}
   if(!status.usage.canCall){await tx.autoReviewJob.update({where:{id:next.id},data:{status:'PENDING',reason:'等待每日预算、在途请求或 30 秒调用间隔'}});return null;}
   return next;
  });if(!job)return;
  try{
   const policy=await this.db.commentReviewPolicy.findUniqueOrThrow({where:{id:job.policyId}}),actor=await this.db.user.findUnique({where:{id:policy.autoActorId||''}});
   if(!actor||actor.role!=='ADMIN')throw Error('自动授权管理员已失效');
   const prepared=await this.policies.prepare(actor,job.policyId,{version:job.policyVersion,scope:{kind:'POSTS',postIds:[job.postId]}},true);
   if(!prepared.count){await this.db.autoReviewJob.updateMany({where:{id:job.id,status:'PROCESSING'},data:{status:'COMPLETED',reason:'没有新的可自动送审内容；已有待处理或失败记录可手动测试'}});return;}
   const rows=await this.db.semanticReview.findMany({where:{id:{in:prepared.reviewIds}},orderBy:{id:'asc'}});
   const count=rows.length;
   const preview=await this.evaluation.preview(actor,job.policyId,rows.map(r=>r.id),false,true);
   const result=await this.evaluation.evaluate(actor,job.policyId,{requestKey:randomUUID(),previewHash:preview.hash,reviewIds:preview.reviewIds,priceVersion:preview.connection.priceVersion!,consent:semanticBatchConsent},job.id);
   await this.db.autoReviewJob.updateMany({where:{id:job.id,status:'PROCESSING'},data:{status:result.status==='COMPLETED'?'COMPLETED':'FAILED',processed:{increment:result.status==='COMPLETED'?count:0},reason:result.status==='COMPLETED'?'本次整帖处理完成':(outputFailureReason('errorCode' in result?result.errorCode:null)||'模型请求失败，不自动重试')+` 本批 ${count} 条未采纳，剩余评论未继续送审。`}});
  }catch{await this.db.autoReviewJob.updateMany({where:{id:job.id,status:'PROCESSING'},data:{status:'FAILED',reason:'授权、批次或输入安全检查未通过；请手动核查，不自动重试'}});}
 }
}
