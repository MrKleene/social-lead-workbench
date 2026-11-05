import {runReviewStage} from './run-review-model';
import {describe,it,expect} from 'vitest';
import {commentReviewLabel,scoreLabel,decisionLabel} from './run-review-model';
const comment={reviews:[]} as any;
describe('per-comment review states',()=>{
 it('does not assign zero to missing or failed results',()=>{expect(scoreLabel()).toBe('—');expect(scoreLabel({state:'FAILED',score:90} as any)).toBe('—');expect(scoreLabel({state:'EVALUATED',score:0} as any)).toBe('0');expect(scoreLabel({state:'EVALUATED',score:12} as any)).toBe('12');});
 it.each(['SKIPPED','FAILED','CANCELLED','COMPLETED'])('does not invent per-comment execution from %s post status',status=>expect(commentReviewLabel(comment,[{status,reason:null,processed:0}])).toBe('尚无审核记录'));
 it('distinguishes a pending post from running and a persisted failed comment',()=>{expect(commentReviewLabel(comment,[{status:'PENDING'} as any])).toBe('等待审核');expect(commentReviewLabel(comment,[{status:'PROCESSING'} as any])).toBe('帖子审核中');expect(commentReviewLabel({reviews:[{state:'FAILED'}]} as any,[])).toBe('审核失败');});
 it('keeps unrelated and uncertain results explicit',()=>{expect(decisionLabel('NO_MATCH')).toBe('不相关');expect(decisionLabel('UNCERTAIN')).toBe('待判断');});
});

it('labels run progress from its jobs, not historical first-capture score totals',()=>{
 expect(runReviewStage({COMPLETED:1},true,true).label).toBe('匹配作业已结束');
 expect(runReviewStage({SKIPPED:1},true,true).label).toBe('存在未送审帖子');
 expect(runReviewStage({FAILED:1},true,true).notice).toContain('对应帖子');
 expect(runReviewStage({PROCESSING:1,FAILED:1},true,true).label).toBe('评论匹配中 · 已完成 0/2 批');
 expect(runReviewStage({},true,false).label).toBe('匹配未启用');
});

it('shows remaining batches without calling partial scores a completed round',()=>{expect(runReviewStage({COMPLETED:1,PROCESSING:1,PENDING:1},true,true).label).toBe('评论匹配中 · 已完成 1/3 批 · 1 批等待');expect(runReviewStage({COMPLETED:2,PENDING:1},true,true).label).toBe('等待评论匹配 · 已完成 2/3 批 · 1 批等待');});
