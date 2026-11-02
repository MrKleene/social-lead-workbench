import {describe,expect,it} from 'vitest';
import type {ContactAccount} from '@crm/contracts';
import {accountSendSummary,currentQuotaDay} from './account-send-summary';
const base:ContactAccount={id:'a',version:1,label:'虚构账号',platform:'XHS',dailyLimit:1,authorizedLimit:1,isDemo:false,healthy:false,occupied:1,confirmed:1,reserved:0,unknown:0,remaining:0,loginState:'VERIFIED',canCheck:true,workbenchStatus:'PAUSED',systemBlockReason:null,sendEligibility:{state:'UNKNOWN',canSend:false,checkedAt:null,stale:true,reason:'尚未检查',source:null,evidence:null}};
describe('inline account status is display only and risk-aware',()=>{
 it('quota exhaustion wins over auto-recoverable qualification and legacy pause label',()=>expect(accountSendSummary(base).label).toBe('额度已耗尽'));
 it('unknown attempts and system restrictions are never presented as only quota exhaustion',()=>{expect(accountSendSummary({...base,unknown:1}).label).toBe('发送结果未知');expect(accountSendSummary({...base,systemBlockReason:'历史回复限制，禁止回复'}).reason).toContain('禁止回复');});
 it.each(['RESTRICTED','VERIFY_REQUIRED','RATE_LIMITED','REPLY_DISABLED'] as const)('keeps real %s evidence',state=>{const result=accountSendSummary({...base,sendEligibility:{...base.sendEligibility!,state,reason:'已保存限制'}});expect(result.reason).toBe('已保存限制');expect(result.label).not.toBe('额度已耗尽');});
 it.each(['EXPIRED','MISSING','NEEDS_REVIEW','CHECKING'])('keeps login %s above quota',loginState=>expect(accountSendSummary({...base,loginState}).label).not.toBe('额度已耗尽'));
 it('distinguishes occupied quota, missing quota and stale daily records',()=>{expect(accountSendSummary({...base,confirmed:0,reserved:1}).label).toBe('额度已占满');expect(accountSendSummary({...base,authorizedLimit:0}).label).toBe('未配置发送额度');expect(accountSendSummary(base,false).label).toBe('额度记录待更新');});
 it('does not call an unchecked or simulated account ready to send',()=>{expect(accountSendSummary({...base,occupied:0,remaining:1}).label).toBe('发送前自动核验');expect(accountSendSummary({...base,canCheck:false,occupied:0,remaining:1}).label).toBe('发送资格待核查');expect(accountSendSummary({...base,isDemo:true}).reason).toBe('不向平台发送');});
 it('uses the quota timezone at the date boundary',()=>{expect(currentQuotaDay('2026-11-02','Asia/Shanghai',new Date('2026-11-01T16:00:00Z'))).toBe(true);expect(currentQuotaDay('2026-11-01','Asia/Shanghai',new Date('2026-11-01T16:00:00Z'))).toBe(false);expect(currentQuotaDay('2026-11-02','invalid')).toBe(false);});
});
