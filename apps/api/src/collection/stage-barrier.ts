import {z} from 'zod';
import {safeRunCoverage} from '@crm/contracts';
import type {CollectionRun} from '@prisma/client';
import type {ReviewDb} from '../comment-review/review-policy.service';
import {autoReviewScope} from '../comment-review/auto-review-scope';
import {wasHistoryArchived} from '../history-archive/archive-guard';
import {semanticHash} from './capture-archive';
export const stagePlanSchema=z.object({version:z.literal(1),policies:z.array(z.object({id:z.string(),version:z.number().int(),revision:z.number().int(),modelVersion:z.number().int().nullable()})).max(100)});
export const stagePlan=(run:{snapshot:unknown})=>stagePlanSchema.safeParse((run.snapshot as {strictStages?:unknown})?.strictStages);
export type StageBarrier={ready:boolean;reason:string};
const blocked=(reason:string):StageBarrier=>({ready:false,reason});
/** A bounded search need not exhaust the platform; it MUST finish every requested
 * post with complete evidence. Any other PARTIAL result is not a stage barrier. */
export function collectionBarrier(run:CollectionRun):StageBarrier {
 if(!stagePlan(run).success)return blocked('旧任务缺少整轮阶段凭据，不自动继续');
 if(run.cancelRequested||['PAUSED','CANCELLED','FAILED'].includes(run.status))return blocked('本轮采集已暂停、取消或失败');
 if(['RUNNING','QUEUED'].includes(run.status)||!run.finishedAt)return blocked('等待整轮采集结束');
 const snapshot=run.snapshot as {mode?:string;batchLimit?:number};
 const coverage=safeRunCoverage((run.metrics as {coverage?:unknown}|null)?.coverage);
 const boundedComplete=run.status==='PARTIAL'&&run.reason==='SEARCH_PARTIAL'&&Number.isInteger(snapshot.batchLimit)&&run.capturedPosts===snapshot.batchLimit;
 if(run.status!=='COMPLETE'&&!boundedComplete)return blocked('本轮采集不完整，尚未进入审核');
 if(snapshot.mode!=='MOCK'){
  if(!coverage||coverage.posts.length!==run.capturedPosts||coverage.posts.some(p=>!p.postRef||!p.complete||p.recovery?.remainingAnchors)||new Set(coverage.posts.map(p=>p.postRef)).size!==run.capturedPosts)return blocked('本轮帖子覆盖证据不完整');
  if(coverage.posts.reduce((n,p)=>n+p.saved,0)!==run.capturedCommentsCount)return blocked('本轮评论范围不一致');
 }
 return {ready:true,reason:'整轮采集已结束'};
}
/** Always re-derived from durable rows. No in-memory "finished" latch. */
export async function reviewBarrier(db:ReviewDb,runId:string):Promise<StageBarrier>{
 const run=await db.collectionRun.findUnique({where:{id:runId}});
 if(!run||await wasHistoryArchived(db,'CollectionRun',runId))return blocked('任务不存在或已归档');
 const collected=collectionBarrier(run);if(!collected.ready)return collected;
 const plan=stagePlan(run);if(!plan.success||!plan.data.policies.length)return blocked('本轮未启用评论匹配');
 const posts=await db.capturedPost.findMany({where:{configId:run.configId,lastRunId:run.id}});
 if(posts.length!==run.capturedPosts)return blocked('本轮帖子范围已变化');
 const jobs=await db.autoReviewJob.findMany({where:{runId}});
 if(jobs.length!==posts.length*plan.data.policies.length)return blocked('等待本轮全部审核任务就绪');
 const model=await db.modelSettings.findFirst({select:{model:true}});
 for(const p of plan.data.policies){
  const policy=await db.commentReviewPolicy.findUnique({where:{id:p.id}});
  if(!policy?.autoEnabled||policy.version!==p.version||policy.revision!==p.revision||policy.autoModelVersion!==p.modelVersion)return blocked('本轮审核配置已变化');
  for(const post of posts){
   const job=jobs.find(j=>j.postId===post.id&&j.policyId===p.id&&j.policyVersion===p.version);
   if(!job||['PENDING','PROCESSING'].includes(job.status))return blocked('等待整轮评论审核结束');
   if(job.status!=='COMPLETED')return blocked('本轮审核存在未完成项，不自动回复');
   let members;try{members=await autoReviewScope(db,post.id,runId);}catch{return blocked('本轮评论成员证据不完整');}
   if(!members.length)continue;
   const reviews=await db.semanticReview.findMany({where:{policyId:p.id,policyRevision:p.revision,sourceContentHash:{in:members.map(c=>c.contentHash)}}});
   // Reused scores are valid only for the exact same captured content/model;
   // an empty job is never proof that failed or missing scores completed.
   if(members.some(c=>!reviews.some(r=>r.sourceContentHash===c.contentHash&&r.selectedModel===model?.model&&r.state==='EVALUATED'&&semanticHash(r.snapshot)===semanticHash(c.snapshot))))return blocked('仍有评论未完成审核，不自动回复');
  }
 }
 return {ready:true,reason:'整轮审核已结束'};
}
export async function automaticReplyBarrier(db:ReviewDb,reviewId:string,cache?:Map<string,StageBarrier>):Promise<StageBarrier>{
 const row=await db.semanticReview.findUnique({where:{id:reviewId},include:{capture:{select:{lastRunId:true}}}});
 if(!row?.capture||!row.automaticContactAllowed)return blocked('该审核不允许自动回复');
 const run=await db.collectionRun.findUnique({where:{id:row.capture.lastRunId}});
 if(!run||(run.readPlan as {savedPostId?:string}|null)?.savedPostId)return blocked('单帖重读不自动回复或私信');
 const cached=cache?.get(run.id);if(cached)return cached;
 const result=await reviewBarrier(db,run.id);cache?.set(run.id,result);return result;
}
