import {describe,it,expect} from 'vitest';
import type {AutoContactOverview,AutoContactRule,ContactAccount} from '@crm/contracts';
import {poolQuotaNotice} from './pool-quota-notice';
const now=new Date('2026-11-01T19:00:00Z');
const a={id:'fictional',platform:'XHS',isDemo:false,systemBlockReason:null,loginState:'VERIFIED',canCheck:true,unknown:0,reserved:0,occupied:1,dailyLimit:1,sendEligibility:{state:'UNKNOWN',canSend:false,stale:true}} as ContactAccount;
const r={enabled:true,mode:'REAL',platform:'XHS',pauseReason:null,accountIds:['fictional'],accountLimits:[{id:'fictional',dailyLimit:10}]} as AutoContactRule;
const d={day:'2026-11-02',accounts:[a]} as AutoContactOverview;
describe('current pool quota display without changing job state',()=>{
 it('shows actual account cap even when rule cap is higher and qualification is stale',()=>expect(poolQuotaNotice(d,r,now)).toBe('当前账号池今日发送额度已用完。'));
 it('distinguishes pending reservations from completed sends',()=>expect(poolQuotaNotice({...d,accounts:[{...a,reserved:1}]},r,now)).toContain('预占或在途'));
 it.each([{unknown:1},{systemBlockReason:'限制'},{loginState:'EXPIRED'},{canCheck:false},{sendEligibility:{state:'RESTRICTED'}}])('does not mask account risks %j',patch=>expect(poolQuotaNotice({...d,accounts:[{...a,...patch} as ContactAccount]},r,now)).toBeUndefined());
 it('does not infer exhaustion from incomplete, outdated or another pool',()=>{expect(poolQuotaNotice({...d,accounts:[]},r,now)).toBeUndefined();expect(poolQuotaNotice({...d,day:'2026-11-01'},r,now)).toBeUndefined();expect(poolQuotaNotice(d,{...r,accountIds:['other']},now)).toBeUndefined();expect(poolQuotaNotice(d,{...r,pauseReason:'UNKNOWN'},now)).toBeUndefined();});
 it('does not call an available second account exhausted',()=>expect(poolQuotaNotice({...d,accounts:[a,{...a,id:'second',occupied:0}]},{...r,accountIds:['fictional','second'],accountLimits:[...r.accountLimits,{id:'second',dailyLimit:1}]},now)).toBeUndefined());
 it('does not turn disabled or zero-limit configuration into automatic waiting',()=>{expect(poolQuotaNotice(d,{...r,enabled:false},now)).toBeUndefined();expect(poolQuotaNotice(d,{...r,accountLimits:[{id:'fictional',dailyLimit:0}]},now)).toBeUndefined();});
});
