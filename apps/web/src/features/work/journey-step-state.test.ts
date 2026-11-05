import {it,expect} from 'vitest';
import {journeyStepState} from './journey-step-state';
import type {Run} from '@/features/collection/types';
const run={id:'run',status:'COMPLETE',capturedCommentsCount:22,capturedPosts:3} as Run;
const base={run,summary:{reviewJobs:{COMPLETED:3},reviews:{EVALUATED:22},contacts:{CONFIRMED:2},matches:2},reviewEnabled:true,sendEnabled:true};
it('only green complete for finished stages, keeps view selection separate',()=>{
 const p=journeyStepState(base);expect(p.steps.map(x=>x.state)).toEqual(['complete','complete','complete']);expect(p.caption).toBe('本轮已完成');expect(p.current).toBeNull();
});
it('actual unknown screenshot stays unknown despite confirmed siblings and disabled rule',()=>{
 const p=journeyStepState({...base,sendEnabled:false,pauseReason:'SUBMISSION_UNKNOWN',summary:{...base.summary,contacts:{UNKNOWN:1,CANCELLED:1}}});
 expect(p.steps.map(x=>x.state)).toEqual(['complete','complete','unknown']);expect(p.caption).toContain('勿重发');expect(p.current).toBe('contact');
});
it.each(['FAILED','CANCELLED','PENDING_ACTION','WAITING_QUOTA','WAITING_ACCOUNT','FUTURE_STATUS','SIMULATED_SUCCESS'])('never gives green success for %s',status=>{
 expect(journeyStepState({...base,summary:{...base.summary,contacts:{[status]:1}}}).steps[2].state).not.toBe('complete');
});
it('shows actual active stages and following step without starting anything',()=>{
 expect(journeyStepState({...base,run:{...run,status:'RUNNING'},summary:{reviews:{},reviewJobs:{},contacts:{},matches:0}}).steps[0].state).toBe('running');
 const pending=journeyStepState({...base,summary:{...base.summary,reviewJobs:{PROCESSING:1},contacts:{}}});expect(pending.current).toBe('review');expect(pending.caption).toContain('评论匹配中');
 const next=journeyStepState({...base,summary:{...base.summary,contacts:{}}});expect(next.steps[2].state).toBe('next');expect(next.caption).toContain('下一步');
});
it('distinguishes loading, read error, no matches and not enabled',()=>{
 expect(journeyStepState({...base,summary:undefined}).steps[1].state).toBe('loading');
 expect(journeyStepState({...base,error:true}).steps[1].state).toBe('unavailable');
 expect(journeyStepState({...base,summary:{...base.summary,matches:0,contacts:{}}}).steps[2]).toMatchObject({state:'skipped',status:'无匹配对象'});
 expect(journeyStepState({...base,summary:{...base.summary,contacts:{}},sendEnabled:false}).steps[2].status).toBe('自动回复未启用');
});
it('historical results do not become disabled or paused by current settings',()=>{
 expect(journeyStepState({...base,history:true,sendEnabled:false,reviewEnabled:false,pauseReason:'SUBMISSION_UNKNOWN'}).caption).toBe('本轮已完成');
});
it('incomplete review rows without a completed batch do not claim full matching success',()=>{
 expect(journeyStepState({...base,summary:{...base.summary,reviewJobs:{},reviews:{EVALUATED:1}}}).steps[1].state).toBe('unknown');
});
it('no run is idle and a cancelled collection never completes',()=>{
 expect(journeyStepState({...base,run:undefined}).caption).toBe('尚未开始');
 expect(journeyStepState({...base,run:{...run,status:'CANCELLED'}}).steps[0]).toMatchObject({state:'paused',status:'已取消'});
});

it('one completed post cannot imply all three posts completed',()=>{expect(journeyStepState({...base,summary:{...base.summary,reviewJobs:{COMPLETED:1},reviews:{EVALUATED:1}}}).steps[1].state).toBe('unknown');});
it('live substep is precise while stale cache, unknown and network error cannot spin as sending',()=>{
 const now=Date.now(),live={observedAt:new Date(now).toISOString(),recent:[],current:[{stage:'contact' as const,phase:'CONFIRMING',label:'正在确认发送结果',at:new Date(now).toISOString(),state:'running' as const,concurrent:1}]};
 const input={...base,now,summary:{...base.summary,contacts:{ATTEMPTED:1},live}};
 expect(journeyStepState(input).steps[2]).toMatchObject({state:'running',status:'正在确认发送结果'});
 expect(journeyStepState({...input,now:now+16000}).steps[2].state).toBe('unavailable');
 expect(journeyStepState({...input,error:true}).steps[2].state).toBe('unavailable');
 expect(journeyStepState({...input,summary:{...input.summary,contacts:{UNKNOWN:1}}}).steps[2].state).toBe('unknown');
 expect(journeyStepState({...base,summary:{...base.summary,contacts:{RESERVED:1}}}).steps[2]).toMatchObject({state:'queued',status:'已分配账号 · 等待执行'});
});
it('offline collection does not keep a cached running spinner',()=>{expect(journeyStepState({...base,error:true,run:{...run,status:'RUNNING'}}).steps[0].state).toBe('unavailable');});
it('initial run request shows loading rather than pretending no task exists',()=>{const p=journeyStepState({...base,run:undefined,loading:true});expect(p.caption).toBe('正在读取任务');expect(p.steps.every(s=>s.state==='loading')).toBe(true);expect(journeyStepState({...base,run:undefined,loading:true,error:true}).caption).toBe('进度读取失败');});

it('stream disconnection stops active spinner but never erases UNKNOWN or completion',()=>{const live={observedAt:new Date().toISOString(),recent:[],current:[{stage:'contact' as const,phase:'SUBMITTING',label:'正在提交发送',at:new Date().toISOString(),state:'running' as const,concurrent:1}]};expect(journeyStepState({...base,disconnected:true,summary:{...base.summary,contacts:{ATTEMPTED:1},live}}).steps[2]).toMatchObject({state:'unavailable',status:'连接中断，正在重连'});expect(journeyStepState({...base,disconnected:true,summary:{...base.summary,contacts:{UNKNOWN:1},live}}).steps[2].state).toBe('unknown');expect(journeyStepState({...base,disconnected:true}).steps[2].state).toBe('complete');expect(journeyStepState({...base,run:undefined,loading:true,disconnected:true}).caption).toBe('连接中断，正在重连');});

it('offline refresh failure cannot erase an already observed UNKNOWN warning',()=>{expect(journeyStepState({...base,error:true,disconnected:true,summary:{...base.summary,contacts:{UNKNOWN:1}}}).steps[2].state).toBe('unknown');});

it('reread ends after matching without a send-next step, but retains real historical UNKNOWN',()=>{
 const reread={...base,run:{...run,readPlan:{rounds:1,postsPerRound:1,commentPages:1,savedPostId:'synthetic'}},pauseReason:'SUBMISSION_UNKNOWN'};
 expect(journeyStepState({...reread,summary:{...base.summary,contacts:{}}}).steps[2]).toMatchObject({state:'skipped',status:'本次不自动回复或私信'});
 expect(journeyStepState({...reread,summary:{...base.summary,contacts:{UNKNOWN:1}}}).steps[2].state).toBe('unknown');
});

it('whole-run phase gates keep collection current and reject stale downstream live labels',()=>{
 const s={reviewJobs:{PENDING:3},reviews:{},contacts:{},matches:0,stages:{collection:{ready:false,reason:'等待整轮采集结束'},review:{ready:false,reason:'等待整轮采集结束'}},live:{observedAt:new Date().toISOString(),recent:[],current:[{stage:'review' as const,phase:'MODEL',label:'评论匹配中',at:new Date().toISOString(),state:'running' as const,concurrent:1}]}};
 const p=journeyStepState({...base,run:{...run,status:'RUNNING'},summary:s});expect(p.current).toBe('collect');expect(p.steps[1]).toMatchObject({state:'queued',status:'等待整轮采集结束 · 已完成 0/3 批 · 3 批等待'});
 const matching=journeyStepState({...base,summary:{...s,live:undefined,reviewJobs:{PROCESSING:1},stages:{collection:{ready:true,reason:'整轮采集已结束'},review:{ready:false,reason:'等待整轮评论审核结束'}}}});expect(matching.current).toBe('review');expect(matching.steps[2].status).toBe('等待整轮评论审核结束');
});
it('phase failure never claims completion or suppresses historical UNKNOWN and reread scope',()=>{
 const stages={collection:{ready:false,reason:'本轮采集不完整'},review:{ready:false,reason:'本轮采集不完整'}};
 const s={...base.summary,contacts:{},reviewJobs:{},reviews:{},stages};
 expect(journeyStepState({...base,run:{...run,status:'FAILED'},summary:s}).steps[2].state).toBe('paused');
 expect(journeyStepState({...base,summary:{...s,contacts:{UNKNOWN:1}}}).steps[2].state).toBe('unknown');
 expect(journeyStepState({...base,run:{...run,readPlan:{rounds:1,postsPerRound:1,commentPages:1,savedPostId:'saved'}},summary:s}).steps[2].state).toBe('skipped');
});
