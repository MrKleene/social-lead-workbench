import {safeRunCoverage} from '@crm/contracts';
import {z} from 'zod';
// Pure projection of packages/domain/src/collection/stage-barrier.ts; no database adapter.
export const stagePlanSchema=z.object({version:z.literal(1),policies:z.array(z.object({id:z.string(),version:z.number().int(),revision:z.number().int(),modelVersion:z.number().int().nullable()})).max(100)});
export function collectionBarrier(run:{snapshot:unknown;cancelRequested:boolean;status:string;finishedAt:unknown;reason:string|null;capturedPosts:number;capturedCommentsCount:number;metrics:unknown}){
 const blocked=(reason:string)=>({ready:false,reason});
 if(!stagePlanSchema.safeParse((run.snapshot as {strictStages?:unknown})?.strictStages).success)return blocked('旧任务缺少整轮阶段凭据，不自动继续');
 if(run.cancelRequested||['PAUSED','CANCELLED','FAILED'].includes(run.status))return blocked('本轮采集已暂停、取消或失败');
 if(['RUNNING','QUEUED'].includes(run.status)||!run.finishedAt)return blocked('等待整轮采集结束');
 const snapshot=run.snapshot as {mode?:string;batchLimit?:number},coverage=safeRunCoverage((run.metrics as {coverage?:unknown}|null)?.coverage);
 const boundedComplete=run.status==='PARTIAL'&&run.reason==='SEARCH_PARTIAL'&&Number.isInteger(snapshot.batchLimit)&&run.capturedPosts===snapshot.batchLimit;
 if(run.status!=='COMPLETE'&&!boundedComplete)return blocked('本轮采集不完整，尚未进入审核');
 if(snapshot.mode!=='MOCK'){
  if(!coverage||coverage.posts.length!==run.capturedPosts||coverage.posts.some(p=>!p.postRef||!p.complete||p.recovery?.remainingAnchors)||new Set(coverage.posts.map(p=>p.postRef)).size!==run.capturedPosts)return blocked('本轮帖子覆盖证据不完整');
  if(coverage.posts.reduce((n,p)=>n+p.saved,0)!==run.capturedCommentsCount)return blocked('本轮评论范围不一致');
 }
 return {ready:true,reason:'整轮采集已结束'};
}
