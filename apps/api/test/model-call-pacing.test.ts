import 'reflect-metadata';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {modelCallWaitMs} from '../src/collection/model-call-pacing';
import {QwenMatchingService} from '../src/collection/qwen-matching.service';
const now=Date.parse('2026-11-05T05:30:00Z');
const call=(status='COMPLETED',age=2000,errorCode:string|null=null)=>({status,createdAt:new Date(now-age),finishedAt:new Date(now-100),errorCode});
afterEach(()=>vi.useRealTimers());
describe('durable serial model admission',()=>{
 it('normal ten-second calls need no idle cooldown',()=>{expect(modelCallWaitMs(null,now)).toBe(0);expect(modelCallWaitMs(call('COMPLETED',10000),now)).toBe(0)});
 it('fast calls keep one-second start spacing',()=>{expect(modelCallWaitMs(call('COMPLETED',100),now)).toBe(900);expect(modelCallWaitMs(call('COMPLETED',1000),now)).toBe(0)});
 it('429 waits one minute from failure',()=>{expect(modelCallWaitMs(call('FAILED',120000,'RATE_LIMIT'),now)).toBe(59900);expect(modelCallWaitMs({...call('FAILED',120000,'RATE_LIMIT'),finishedAt:new Date(now-60000)},now)).toBe(0)});
 it.each(['TIMEOUT','AUTH_FAILED','INVALID_RESPONSE','UPSTREAM_FAILED'])('%s retains backoff',code=>expect(modelCallWaitMs(call('FAILED',60000,code),now)).toBe(29900));
 it('legacy, stale and future dates stay conservative',()=>{expect(modelCallWaitMs({...call('FAILED',1000),finishedAt:null},now)).toBe(29000);expect(modelCallWaitMs(call('STALE'),now)).toBe(29900);expect(modelCallWaitMs(call('COMPLETED',-2000),now)).toBe(3000)});
 it.each([{active:1,limit:null,requests:0,enabled:true,state:'READY'}, {active:0,limit:1,requests:1,enabled:true,state:'READY'}, {active:0,limit:null,requests:0,enabled:false,state:'READY'}, {active:0,limit:null,requests:0,enabled:true,state:'UNAUTHORIZED'}])('never overrides existing gate %j',async c=>{
  vi.useFakeTimers();vi.setSystemTime(now);
  const db:any={semanticModelCall:{aggregate:async()=>({_count:{_all:c.requests},_sum:{}}),findFirst:async()=>call(),count:vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(c.active)}};
  const q=new QwenMatchingService(db,{settings:()=>({status:{model:'qwen3.8-flash',state:c.state,dailyLimit:c.limit} as any}),transport:vi.fn()});
  expect((await q.status(db,undefined,{enabled:c.enabled,version:1})).usage.canCall).toBe(false);
 });
 it('success history is eligible without 30 seconds; status has no side effect',async()=>{
  vi.useFakeTimers();vi.setSystemTime(now);const db:any={semanticModelCall:{aggregate:async()=>({_count:{_all:3},_sum:{}}),findFirst:async()=>call(),count:async()=>0}};
  const transport=vi.fn(),q=new QwenMatchingService(db,{settings:()=>({status:{model:'qwen3.8-flash',state:'READY',dailyLimit:10} as any}),transport});
  expect((await q.status(db,undefined,{enabled:true,version:1})).usage.canCall).toBe(true);expect(transport).not.toHaveBeenCalled();
 });
});
