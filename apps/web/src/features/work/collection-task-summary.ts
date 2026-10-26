import {collectionOutcome} from '../collection/collection-outcome';
import {safeSearchAttempts,searchAttemptLabel,safeCollectionDiagnostic,searchFailureLabels} from '@crm/contracts';
import {reasonLabels,type Run} from '../collection/types';
import {collectionBoundarySummary} from './collection-boundary-summary';
export function savedCollectionCounts(run:Run){
 const posts=run.capturedPosts,comments=run.capturedCommentsCount;
 return [posts===undefined?'帖子数量未返回':`${posts} 篇帖子`,comments===undefined?'评论数量未返回':`${comments} 条评论/回复`].join(' · ');
}
export function collectionTaskSummary(run:Run){
 const saved=run.capturedPosts===undefined&&run.capturedCommentsCount===undefined?'保存数量尚未返回':`已保存 ${savedCollectionCounts(run)}`;
 const diagnostic=safeCollectionDiagnostic(run.metrics?.diagnostic);
 const attempts=safeSearchAttempts(run.metrics?.searchAttempts);
 const searchSummary=run.reason==='SEARCH_PARTIAL'&&attempts?.length?[...new Set(attempts.map(searchAttemptLabel))].slice(0,2).join('；'):undefined;
 const reason=searchSummary|| (diagnostic?.stage==='search'&&diagnostic.kind==='UPSTREAM_ERROR'?searchFailureLabels[diagnostic.searchReason||'UNKNOWN']:diagnostic?.kind==='SCHEMA_VALIDATION'&&diagnostic.stage==='post'&&diagnostic.field==='text'?`${diagnostic.postOrdinal?`第 ${diagnostic.postOrdinal} 篇帖子的`:''}评论文本未通过校验`:reasonLabels[run.reason||'']||'结束原因未返回');
 const range=run.readPlan?.savedPostId?'本轮仅重新读取所选帖子。':run.readPlan?`本轮计划最多 ${run.readPlan.rounds*run.readPlan.postsPerRound} 篇。`:'';
 if(run.status==='QUEUED')return '任务已排队，等待开始读取。';
 if(run.status==='RUNNING')return `正在读取。${saved}；仅显示已返回信息。`;
 if(run.status==='FAILED')return `${range}本轮中途停止，尚未完成：${reason}。${saved}。可先查看采集信息，再检查异常。`;
 if(run.status==='PARTIAL'){const outcome=collectionOutcome(run);return `${range}${outcome.label}。${saved}。${outcome.coverage}。${outcome.issue?`${outcome.issue}。`:''}${collectionBoundarySummary(run)||(!outcome.issue?`${reason}。`:'')}可查看已保存信息。`;}
 if(run.status==='PAUSED')return `${range}本轮已停止：${reason}。${saved}，可查看已保存信息。`;
 if(run.status==='COMPLETE'){const outcome=collectionOutcome(run);return outcome.warning?`${range}${outcome.label}。${saved}。${outcome.issue||'读取异常待核查'}。请查看诊断详情。`:`${range}本轮批次完成，${saved}。不代表全部评论均已读取，可查看采集信息。`;}
 return `任务状态待确认。${saved}，请刷新状态。`;
}

/** Short primary message; full reasons remain in task details. */
export function collectionTaskHeadline(run:Run){
 if(['QUEUED','RUNNING','FAILED','PAUSED'].includes(run.status))return collectionTaskSummary(run);
 const outcome=collectionOutcome(run);
 return `${outcome.label}。已保存 ${savedCollectionCounts(run)}。${outcome.coverage}。${outcome.warning?`${outcome.issue||'请查看停止原因'}；可在采集详情核查后手动重试。`:''}`;
}
