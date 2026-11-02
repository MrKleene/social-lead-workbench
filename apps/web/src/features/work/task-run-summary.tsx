import {collectionOutcome} from '../collection/collection-outcome';
import {useRunPostSnapshot} from './use-run-post-feed';
import {taskFeedTotals} from './task-feed-totals';
import {safeRunCoverage,observedReadCounts} from '@crm/contracts';
import {readingTime} from '@/features/collection/display-metadata';
import {safeCollectionDiagnostic,searchFailureLabels,postFailureLabels} from '@crm/contracts';
import {type Run} from '@/features/collection/types';
/** Values belong to this task. Missing or uncommitted statistics stay unknown. */
export function TaskRunSummary({run,configId}:{run?:Run;configId:string}){
 const totals=taskFeedTotals(useRunPostSnapshot(configId,run?.id),configId,run);
 const coverage=safeRunCoverage(run?.metrics?.coverage),metrics=run?.metrics;
 const recovered=coverage?.posts.some(p=>observedReadCounts(p).recovered);
 const roots=recovered?coverage!.posts.reduce((n,p)=>n+observedReadCounts(p).roots,0):metrics?.version===1?metrics.rootComments:coverage?coverage.posts.reduce((n,p)=>n+p.roots,0):undefined;
 const replies=recovered?coverage!.posts.reduce((n,p)=>n+observedReadCounts(p).replies,0):metrics?.version===1?metrics.replies:coverage?coverage.posts.reduce((n,p)=>n+p.replies,0):undefined;
 if(!run)return null;
 const outcome=collectionOutcome(run),diagnostic=safeCollectionDiagnostic(metrics?.diagnostic);
 const diagnosticReason=diagnostic?.searchReason?searchFailureLabels[diagnostic.searchReason]:diagnostic?.postReason?postFailureLabels[diagnostic.postReason]:diagnostic?.kind==='SCHEMA_VALIDATION'?'返回内容未通过校验':diagnostic?'读取异常':undefined;
 return <div className="collection-result-facts" aria-label="本轮采集结果">
  <dl className="collection-result-counts"><div><dt>帖子</dt><dd>{run.capturedPosts??'待确认'} 篇</dd></div><div><dt>评论 / 回复</dt><dd>{totals?totals.newCount+totals.reusedCount:run.capturedCommentsCount??'待确认'} 条</dd></div><div><dt>任务状态</dt><dd>{outcome.label}</dd></div><div><dt>读取状态</dt><dd>{outcome.coverage}</dd></div></dl>
  <dl className="collection-result-meta"><div><dt>主评论 / 回复</dt><dd>{roots??'待确认'} / {replies??'待确认'}</dd></div><div><dt>新存 / 复用原文</dt><dd>{totals?.newCount??'待确认'} / {totals?.reusedCount??'待确认'}</dd></div>{run.readPlan&&<div><dt>采集范围</dt><dd>{run.readPlan.savedPostId?'指定帖子':`最多 ${run.readPlan.rounds*run.readPlan.postsPerRound} 篇`}</dd></div>}<div><dt>开始时间（北京）</dt><dd><time dateTime={run.createdAt}>{readingTime(run.createdAt)}</time></dd></div>{run.finishedAt&&<div><dt>结束时间（北京）</dt><dd><time dateTime={run.finishedAt}>{readingTime(run.finishedAt)}</time></dd></div>}</dl>
  {diagnosticReason&&<p className="collection-result-warning" role="status">{diagnostic?.postOrdinal?`第 ${diagnostic.postOrdinal} 篇：`:''}{diagnosticReason}</p>}
 </div>;
}
