import {describe,it,expect} from 'vitest';
import type {Config,Run} from '@/features/collection/types';
import type {ArchivedPost} from '@/features/collection/archive-data';
import {progressMessages,mergeProgress,runFinished} from './collection-progress';
const run:Run={id:'fictional-run',status:'RUNNING',scenario:'BASELINE',reason:null,requests:0,observed:0,matched:0,added:0,notices:0,createdAt:'2026-10-22T00:00:00Z',finishedAt:null};
const post:ArchivedPost={id:'fictional-post',platformPostId:'post',runId:run.id,lastRunId:run.id,lastSeenAt:run.createdAt,snapshot:{title:'虚构原文标题'},coverage:'PARTIAL',stopReason:'MCP_WINDOW_ONLY'};
describe('observed collection progress',()=>{
 it('does not invent counts or earlier stages',()=>{const rows=progressMessages(run,[]);expect(rows).toHaveLength(1);expect(rows[0].title).toBe('读取中');expect(rows[0].detail).toContain('等待');});
 it('repeated polling is referentially stable with no duplicate events',()=>{const rows=progressMessages(run,[post]);expect(mergeProgress(rows,progressMessages(run,[post]))).toBe(rows);});
 it('updates counts in place rather than appending',()=>{const first=progressMessages({...run,capturedPosts:1,capturedCommentsCount:2},[]);const rows=mergeProgress(first,progressMessages({...run,capturedPosts:1,capturedCommentsCount:5},[]));expect(rows).toHaveLength(first.length);expect(rows[0].title).toContain('5 条');});
 it('only reports posts associated with this task and preserves partial coverage',()=>{const rows=progressMessages(run,[post,{...post,id:'other',runId:'other',lastRunId:'other'}]);expect(rows.filter(r=>r.kind==='post')).toHaveLength(1);expect(rows[0].detail).toBe('部分覆盖');});
 it.each(['PARTIAL','FAILED','PAUSED','UNKNOWN'])('keeps %s visible as a warning, not complete',status=>{const rows=progressMessages({...run,status,reason:'TIMEOUT'},[]);expect(rows[0].warning).toBe(true);expect(rows[0].title).not.toBe('批次完成');expect(rows[0].detail).toContain('超时');});
 it('completed means a finite batch, never all comments',()=>{expect(progressMessages({...run,status:'COMPLETE'},[])[0].detail).toContain('不代表全部评论');expect(runFinished({...run,status:'COMPLETE'})).toBe(true);expect(runFinished(run)).toBe(false);});
 it('different tasks have different event identities',()=>expect(progressMessages({...run,id:'second'},[])[0].id).not.toBe(progressMessages(run,[])[0].id));
});

// Terminal records are never adopted implicitly as the current task.
import {collectionTaskSession} from './collection-task-session';
const config=(runs:Run[],activeRunId:string|null=null)=>({id:'config',runs,activeRunId} as Config);
describe('current collection versus history',()=>{
 it.each(['FAILED','COMPLETE','PARTIAL','PAUSED'])('opens idle with old %s and retains history',status=>{
  const old={...run,status};const view=collectionTaskSession(config([old]),[old]);
  expect(view.run).toBeUndefined();expect(view.currentId).toBe('');expect(view.runs).toEqual([old]);expect(view.pending).toBe(false);
 });
 it.each(['QUEUED','RUNNING'])('recovers server %s without a local id',status=>{
  const live={...run,status};expect(collectionTaskSession(config([live])).run).toEqual(live);
 });
 it('keeps explicitly started terminal feedback for this visit',()=>{
  const done={...run,status:'FAILED'};expect(collectionTaskSession(config([done]),[],run.id).currentRun).toEqual(done);
 });
 it('selects historical tasks explicitly without replacing current identity',()=>{
  const old={...run,id:'old',status:'FAILED'};const view=collectionTaskSession(config([run],run.id),[old],run.id,old.id);
  expect(view.history).toBe(true);expect(view.run).toEqual(old);expect(view.currentRun).toEqual(run);
 });
 it('current list state wins over stale detail',()=>{
  const done={...run,status:'COMPLETE'};expect(collectionTaskSession(config([done]),[run],run.id).run?.status).toBe('COMPLETE');
 });
 it('does not attach a different configuration or missing task',()=>{
  const view=collectionTaskSession(config([]),[],run.id);expect(view.run).toBeUndefined();expect(view.pending).toBe(true);
 });
 it('blocks unresolved active pointer instead of substituting old failure',()=>{
  const old={...run,status:'FAILED'};const view=collectionTaskSession(config([old],'new'),[old]);expect(view.pending).toBe(true);expect(view.run).toBeUndefined();
 });
 it('blocks terminal detail while server still declares task active',()=>{
  expect(collectionTaskSession(config([{...run,status:'FAILED'}],run.id)).pending).toBe(true);
 });
});

import {collectionTaskSummary,savedCollectionCounts} from './collection-task-summary';
describe('truthful task prose',()=>{
 it('unknown saved counts are not zero or legacy matches',()=>{expect(savedCollectionCounts({...run,observed:900})).toBe('帖子数量未返回 · 评论数量未返回');});
 it('reports stored counts even when matching metrics were discarded',()=>{const text=collectionTaskSummary({...run,status:'FAILED',reason:'INVALID_DATA',capturedPosts:1,capturedCommentsCount:19,metrics:{discarded:true,diagnostic:{version:1,kind:'SCHEMA_VALIDATION',stage:'post',field:'text',postOrdinal:2}} as Run['metrics']});expect(text).toContain('第 2 篇帖子的评论文本');expect(text).toContain('已保存 1 篇帖子 · 19 条评论/回复');expect(text).toContain('尚未完成');expect(text).not.toContain('空文本');});
 it('zero is explicit and does not fabricate saved results',()=>expect(collectionTaskSummary({...run,status:'FAILED',capturedPosts:0,capturedCommentsCount:0})).toContain('0 篇帖子 · 0 条评论/回复'));
 it('partial remains partial and complete remains finite',()=>{expect(collectionTaskSummary({...run,status:'PARTIAL'})).toContain('仅覆盖部分范围');expect(collectionTaskSummary({...run,status:'COMPLETE'})).toContain('不代表全部评论');});
 it('uses only this task plan and counters',()=>{const text=collectionTaskSummary({...run,status:'COMPLETE',readPlan:{rounds:1,postsPerRound:3,commentPages:1},capturedPosts:2,capturedCommentsCount:8});expect(text).toContain('最多 3 篇');expect(text).toContain('2 篇帖子 · 8 条');});
 it.each(['QUEUED','RUNNING','PAUSED','OTHER'])('keeps %s distinct from completed',status=>expect(collectionTaskSummary({...run,status})).not.toContain('批次完成'));
});
