import {ConflictException} from '@nestjs/common';
import {boundedReadReportSchema,semanticInputPolicy} from '@crm/contracts';
import type {ReviewDb} from './review-policy.service';
// Checked under the same global provider lock immediately before reservation AND dispatch.
export async function assertAutoReview(db:ReviewDb,jobId:string,modelVersion:number){
 const job=await db.autoReviewJob.findUnique({where:{id:jobId}});
 if(!job||job.inputPolicyVersion!==semanticInputPolicy||job.status!=='PROCESSING')throw new ConflictException('自动任务已取消');
 const [policy,post,run]=await Promise.all([db.commentReviewPolicy.findUnique({where:{id:job.policyId}}),db.capturedPost.findUnique({where:{id:job.postId}}),db.collectionRun.findUnique({where:{id:job.runId},include:{config:true}})]);
 if(!policy?.autoEnabled||policy.version!==job.policyVersion||policy.autoModelVersion!==modelVersion)throw new ConflictException('自动授权或模型已变化');
 if(!run||run.cancelRequested||!['RUNNING','COMPLETE','PARTIAL'].includes(run.status)||!run.config.enabled||run.config.archivedAt||run.config.revision!==run.revision)throw new ConflictException('采集已取消、失败或配置已变化');
 if(!post||post.coverage!=='COMPLETE'||post.lastRunId!==run.id)throw new ConflictException('评论覆盖不完整');
 const snapshot=post.snapshot as {boundedRead?:unknown};
 if((run.snapshot as {mode?:string}).mode==='XHS_MCP'){
  const coverage=boundedReadReportSchema.safeParse(snapshot.boundedRead);
  if(!coverage.success||coverage.data.state!=='COMPLETE')throw new ConflictException('缺少完整覆盖证据');
 }
 return {job,policy};
}
