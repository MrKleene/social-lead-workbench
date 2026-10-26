import {collectionOutcome,readingInterruption} from '../collection/collection-outcome';
import type {Run} from '../collection/types';
import {reasonLabels} from '../collection/types';
import type {ArchivedPost} from '../collection/archive-data';
import {coverageLabel} from '../collection/archive-labels';
export type ProgressMessage={id:string;kind:'status'|'count'|'post';title:string;detail?:string;warning:boolean};
export const runFinished=(run:Run)=>!['QUEUED','RUNNING'].includes(run.status);
/** Only facts returned by the local API; no inferred intermediate steps. */
export function progressMessages(run:Run,posts:ArchivedPost[]):ProgressMessage[]{
 const messages:ProgressMessage[]=[];
 const metrics=run.metrics?.version===1&&!run.metrics.discarded?run.metrics:null;
 if(run.capturedPosts!==undefined) messages.push({id:`${run.id}:count`,kind:'count',title:`已保存 ${run.capturedPosts} 篇帖子 · ${run.capturedCommentsCount??'数量未知'} 条评论/回复`,detail:metrics?`已提交统计：${metrics.rootComments} 条一级评论 · ${metrics.replies} 条回复`:undefined,warning:false});
 else if(metrics) messages.push({id:`${run.id}:count`,kind:'count',title:`已读取 ${metrics.postsRead} 篇帖子 · ${metrics.rootComments} 条一级评论 · ${metrics.replies} 条回复`,warning:false});
 else if(run.observed>0) messages.push({id:`${run.id}:count`,kind:'count',title:`已返回 ${run.observed} 条评论/回复`,detail:'帖子数量尚未返回',warning:false});
 for(const p of posts.filter(p=>p.lastRunId===run.id||p.runId===run.id)) messages.push({id:`${run.id}:post:${p.id}`,kind:'post',title:p.snapshot.title||'已归档帖子（标题缺失）',detail:coverageLabel(p.coverage),warning:readingInterruption(p.stopReason)});
 messages.push({id:`${run.id}:status`,kind:'status',title:collectionOutcome(run).label,detail:run.reason?(reasonLabels[run.reason]||run.reason):run.status==='RUNNING'?'等待新的已返回信息':run.status==='QUEUED'?'任务已排队':run.status==='COMPLETE'?'本轮有限批次结束；不代表全部评论已读取':'停止原因未返回，请查看详情',warning:collectionOutcome(run).warning});
 return messages;
}
/** Stable event keys replace updates; repeated polling never appends a duplicate. */
export function mergeProgress(previous:ProgressMessage[],next:ProgressMessage[]):ProgressMessage[]{
 const rows=new Map(previous.map(m=>[m.id,m]));
 next.forEach(m=>rows.set(m.id,m));
 const merged=[...rows.values()].sort((a,b)=>Number(a.kind==='status')-Number(b.kind==='status'));
 return JSON.stringify(merged)===JSON.stringify(previous)?previous:merged;
}
