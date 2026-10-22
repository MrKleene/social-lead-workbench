import {describe,it,expect} from 'vitest';
import type {Run} from '@/features/collection/types';
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
