import {collectionOutcome} from '../collection/collection-outcome';
import {useRunPostSnapshot} from './use-run-post-feed';
import {taskFeedTotals} from './task-feed-totals';
import {safeRunCoverage,observedReadCounts} from '@crm/contracts';
import {Clock3,FileText,MessageSquare} from 'lucide-react';
import {type Run} from '@/features/collection/types';
/** Values belong to this task. Missing or uncommitted statistics stay unknown. */
export function TaskRunSummary({run,configId}:{run?:Run;configId:string}){
 const totals=taskFeedTotals(useRunPostSnapshot(configId,run?.id),configId,run);
 const coverage=safeRunCoverage(run?.metrics?.coverage),metrics=run?.metrics;
 const recovered=coverage?.posts.some(p=>observedReadCounts(p).recovered);
 const roots=recovered?coverage!.posts.reduce((n,p)=>n+observedReadCounts(p).roots,0):metrics?.version===1?metrics.rootComments:coverage?coverage.posts.reduce((n,p)=>n+p.roots,0):undefined;
 const replies=recovered?coverage!.posts.reduce((n,p)=>n+observedReadCounts(p).replies,0):metrics?.version===1?metrics.replies:coverage?coverage.posts.reduce((n,p)=>n+p.replies,0):undefined;
 return <aside className="mist-task-summary mist-panel" aria-label="本轮记录"><h2>本轮记录</h2><p className="mist-summary-status" data-state={run?collectionOutcome(run).warning?'WARNING':'NORMAL':undefined}>{run?collectionOutcome(run).label:'尚未开始'}</p><div className="mist-summary-count"><FileText size={19}/><span>已保存帖子</span><strong>{run?.capturedPosts??'—'}<small>篇</small></strong></div><div className="mist-summary-count"><MessageSquare size={19}/><span>本次确认评论与回复</span><strong>{totals?totals.newCount+totals.reusedCount:run?.capturedCommentsCount??'—'}<small>条</small></strong></div><dl><dt>评论覆盖</dt><dd>{run?collectionOutcome(run).coverage:'等待读取'}</dd><dt>已读取主评论</dt><dd>{roots??'—'}</dd><dt>已读取回复</dt><dd>{replies??'—'}</dd><dt>本次新存原文</dt><dd>{totals?.newCount??'—'}</dd><dt>本次复用原文</dt><dd>{totals?.reusedCount??'—'}</dd><dt>本轮范围</dt><dd>{run?.readPlan?run.readPlan.savedPostId?'指定帖子':`最多 ${run.readPlan.rounds*run.readPlan.postsPerRound} 篇`:run?'范围未返回':'等待开始'}</dd></dl>{run&&<div className="mist-summary-time"><Clock3 size={14}/><span>开始于 {new Date(run.createdAt).toLocaleTimeString()}{run.finishedAt&&<small>结束于 {new Date(run.finishedAt).toLocaleTimeString()}</small>}</span></div>}<small className="mist-summary-note">新存与复用按评论原文版本计数。仅统计本轮已返回信息，不等于平台总数。</small></aside>;
}
