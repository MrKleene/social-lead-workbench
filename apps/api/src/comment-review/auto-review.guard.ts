import {acceptanceReviewConfigRevision,acceptanceReviewAllowed,acceptanceConflict} from '../auto-contact/normal-acceptance';
import {reviewObservations} from './review-observation';
import {ConflictException} from '@nestjs/common';
import {boundedReadReportSchema,autoReviewInputPolicy,wholePostRequestPolicy} from '@crm/contracts';
import type {ReviewDb} from './review-policy.service';
// Checked under the same global provider lock immediately before reservation AND dispatch.
export async function assertAutoReview(db:ReviewDb,jobId:string,modelVersion:number){
 const job=await db.autoReviewJob.findUnique({where:{id:jobId}});
 if(job&&!await acceptanceReviewAllowed(db,job,modelVersion))acceptanceConflict();
 if(!job||job.inputPolicyVersion!==autoReviewInputPolicy||job.status!=='PROCESSING')throw new ConflictException('自动任务已取消');
 const [policy,post,run]=await Promise.all([db.commentReviewPolicy.findUnique({where:{id:job.policyId}}),db.capturedPost.findUnique({where:{id:job.postId}}),db.collectionRun.findUnique({where:{id:job.runId},include:{config:true}})]);
 if(!policy?.autoEnabled||policy.version!==job.policyVersion||policy.autoModelVersion!==modelVersion)throw new ConflictException('自动授权或模型已变化');
 const consent=await db.auditLog.findFirst({where:{entityId:job.policyId,action:'COMMENT_REVIEW_AUTO_CONSENT',metadata:{path:['policyVersion'],equals:policy.version}},orderBy:{createdAt:'desc'}});
 if((consent?.metadata as {requestPolicy?:string}|null)?.requestPolicy!==wholePostRequestPolicy)throw new ConflictException('整帖单次调用需要重新确认自动授权');
 if(!run||run.cancelRequested||!['RUNNING','COMPLETE','PARTIAL'].includes(run.status)||!run.config.enabled||run.config.archivedAt||run.config.revision!==await acceptanceReviewConfigRevision(db,run.id,run.revision))throw new ConflictException('采集已取消、失败或配置已变化');
 if(!post||post.coverage!=='COMPLETE'||post.lastRunId!==run.id)throw new ConflictException('评论覆盖不完整');
 const snapshot=post.snapshot as {boundedRead?:unknown};
 if((run.snapshot as {mode?:string}).mode==='XHS_MCP'){
  const coverage=boundedReadReportSchema.safeParse(snapshot.boundedRead);
  if(!coverage.success||coverage.data.state!=='COMPLETE')throw new ConflictException('缺少完整覆盖证据');
  const captures=await db.capturedComment.findMany({where:{postId:post.id},select:{id:true}}),observations=await reviewObservations(db,captures.map(c=>c.id));
  if(!captures.length||captures.some(c=>observations.get(c.id)?.coverage!=='COMPLETE'))throw new ConflictException('当前覆盖证据与已保存评论未完成逐条核对');
 }
 return {job,policy};
}
