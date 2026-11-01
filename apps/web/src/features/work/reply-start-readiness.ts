import type {AutoContactRule,ContactAccount} from '@crm/contracts';
type Rule=Pick<AutoContactRule,'mode'|'accountIds'|'accountLimits'>;
const restrictions:Record<string,string>={RESTRICTED:'平台限制，禁止回复',VERIFY_REQUIRED:'需要完成平台验证',RATE_LIMITED:'平台限流，暂不可回复',REPLY_DISABLED:'平台限制回复',IDENTITY_MISMATCH:'账号身份不符',STOP_UNCONFIRMED:'上次执行停止状态未确认',SUBMISSION_UNKNOWN:'上次回复结果未知，需核查',ACCOUNT_RESTRICTED:'账号存在平台限制'};
export function replyBlockText(reason:string){return reason==='历史回复限制，禁止回复'?'历史回复受限，不可发送':restrictions[reason]||reason;}
/** canCheck is a backend capability: a bound saved session can be qualified by
 * the worker for actual authorized waiting work. It is not permission to send. */
export function replyAccountIssue(a:ContactAccount|undefined,rule:Rule):string|null{
 if(!a)return '所选发送账号已不存在，请重新选择';
 const issue=(()=>{
  if(a.systemBlockReason)return replyBlockText(a.systemBlockReason);
  if(a.workbenchStatus==='RESTRICTED')return '账号受限，需核查';
  if(rule.mode!=='SIMULATION'){
   if(a.isDemo)return '模拟账号不能用于真实回复';
   const login:Record<string,string>={EXPIRED:'登录已失效，请重新登录',MISSING:'本机会话缺失',NEEDS_REVIEW:'账号身份或会话待核查',CHECKING:'登录检查进行中，请稍后重试'};
   if(login[a.loginState||''])return login[a.loginState!];
   if(a.sendEligibility&&a.sendEligibility.state!=='UNKNOWN')return restrictions[a.sendEligibility.state]||'发送限制待核查';
  }else if(!a.isDemo||!a.healthy)return '模拟账号未就绪';
  const ruleLimit=rule.accountLimits.find(l=>l.id===a.id)?.dailyLimit;
  if(!Number.isFinite(a.dailyLimit)||a.dailyLimit<=0||!Number.isFinite(ruleLimit)||!ruleLimit||ruleLimit<=0)return '发送日额度未配置';
  if(a.occupied>=Math.min(a.dailyLimit,ruleLimit))return '今日发送额度已用完';
  if(rule.mode==='SIMULATION')return null;
  if(a.sendEligibility?.state==='UNKNOWN'&&a.canCheck===true)return null;
  if(a.healthy&&a.sendEligibility?.canSend&&!a.sendEligibility.stale)return null;
  return '发送资格无法自动核验，请检查账号';
 })();
 return issue?`「${a.label||'发送账号'}」${issue}`:null;
}
export function replyRuleAccountIssue(rule:Rule,accounts:ContactAccount[]){
 for(const id of rule.accountIds){const issue=replyAccountIssue(accounts.find(a=>a.id===id),rule);if(issue)return issue;}
 return null;
}
export function replyEnabledDescription(block:string,accounts:(ContactAccount|undefined)[]){
 if(block)return `规则已开启 · ${block}`;
 return accounts.some(a=>a?.canCheck&&(!a.healthy||!a.sendEligibility?.canSend||a.sendEligibility.stale))?'规则已开启 · 发送前自动核验':'规则已开启 · 按规则处理新匹配评论';
}
