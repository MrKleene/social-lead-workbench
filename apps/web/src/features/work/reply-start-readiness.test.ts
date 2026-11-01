import {describe,it,expect} from 'vitest';
import type {AutoContactRule,ContactAccount,AutoContactOverview,ReviewOverview} from '@crm/contracts';
import {replyAccountIssue,replyRuleAccountIssue,replyEnabledDescription} from './reply-start-readiness';
import {automationIssue} from './automation-validation';
const account:ContactAccount={id:'fictional',label:'虚构账号',version:1,platform:'XHS',dailyLimit:3,authorizedLimit:3,isDemo:false,healthy:false,occupied:0,confirmed:0,reserved:0,unknown:0,remaining:3,workbenchStatus:'PAUSED',systemBlockReason:null,loginState:'VERIFIED',canCheck:true,sendEligibility:{state:'UNKNOWN',canSend:false,stale:true,checkedAt:null,source:null,reason:'',evidence:null}};
const rule={id:'rule',enabled:true,mode:'REAL',platform:'XHS',channel:'COMMENT',content:'虚构正文',accountIds:[account.id],accountLimits:[{id:account.id,dailyLimit:3}],policyId:'policy',policyRevision:2} as AutoContactRule;
const review={policies:[{id:'policy',revision:2,target:'此处是虚构的完整审核目标',autoEnabled:true}],connection:{state:'READY'}} as ReviewOverview;
const contact={rules:[rule],accounts:[account],capability:{available:true}} as AutoContactOverview;
describe('reply prerequisites match backend automatic qualification',()=>{
 it.each(['VERIFIED','UNVERIFIED','CONNECTION_ERROR'])('allows %s only with server qualification capability and no known risk',loginState=>{
  const a={...account,loginState};expect(replyAccountIssue(a,rule)).toBeNull();expect(automationIssue(review,{...contact,accounts:[a]})).toBeNull();expect(a.sendEligibility?.canSend).toBe(false);
 });
 it('accepts fresh ready evidence without needing a new qualification',()=>expect(replyAccountIssue({...account,healthy:true,canCheck:false,sendEligibility:{...account.sendEligibility!,canSend:true,stale:false}},rule)).toBeNull());
 it('does not assume absent qualification support can recover stale evidence',()=>expect(replyAccountIssue({...account,canCheck:false},rule)).toContain('无法自动核验'));
 it.each([
  [{systemBlockReason:'历史回复限制，禁止回复'},'历史回复受限'],
  [{systemBlockReason:'身份风险待复核'},'身份风险待复核'],
  [{workbenchStatus:'RESTRICTED'},'账号受限'],
  [{loginState:'EXPIRED'},'登录已失效'],
  [{loginState:'MISSING'},'本机会话缺失'],
  [{loginState:'NEEDS_REVIEW'},'身份或会话待核查'],
  [{loginState:'CHECKING'},'登录检查进行中'],
  [{dailyLimit:0},'日额度未配置'],
  [{occupied:3},'额度已用完'],
  [{isDemo:true},'模拟账号不能用于真实回复']
 ] as const)('preserves hard stop %j despite canCheck=true',(patch,message)=>expect(replyAccountIssue({...account,...patch},rule)).toContain(message));
 it.each(['RESTRICTED','VERIFY_REQUIRED','RATE_LIMITED','REPLY_DISABLED'] as const)('never treats expired %s evidence as recoverable',state=>expect(replyAccountIssue({...account,sendEligibility:{...account.sendEligibility!,state}},rule)).not.toBeNull());
 it('reports missing accounts and per-rule quota without silently changing pool',()=>{
  expect(replyRuleAccountIssue(rule,[])).toContain('已不存在');
  expect(replyAccountIssue(account,{...rule,accountLimits:[]})).toContain('日额度未配置');
  expect(replyAccountIssue({...account,occupied:1},{...rule,accountLimits:[{id:account.id,dailyLimit:1}]})).toContain('额度已用完');
 });
 it('retains global unknown-send pause and does not shut off an enabled rule',()=>{
  const paused={...rule,pauseReason:'SUBMISSION_UNKNOWN'};expect(automationIssue(review,{...contact,rules:[paused]})?.message).toContain('上次回复结果未知');expect(paused.enabled).toBe(true);
 });
 it('keeps disabled downstream stages out of collection prerequisites',()=>expect(automationIssue(review,{...contact,rules:[{...rule,enabled:false}],accounts:[]})).toBeNull());
 it('does not claim running merely because the rule is enabled',()=>{
  expect(replyEnabledDescription('',[account])).toBe('规则已开启 · 发送前自动核验');
  expect(replyEnabledDescription('登录已失效',[account])).toBe('规则已开启 · 登录已失效');
  expect(replyEnabledDescription('',[{...account,healthy:true,sendEligibility:{...account.sendEligibility!,canSend:true,stale:false}}])).toBe('规则已开启 · 按规则处理新匹配评论');
 });
});
