import type {AutoContactOverview,AutoContactRule,ReviewOverview} from '@crm/contracts';
import {replyRuleAccountIssue,replyBlockText} from './reply-start-readiness';
export type AutomationTab='collect'|'review'|'contact';
export type SetupIssue={tab:AutomationTab;message:string};
/** Validate the saved channel plan, not the historical COMMENT-only default.
 * Missing per-channel capabilities only retain old COMMENT compatibility. */
export function replyRuleChannelIssue(rule:AutoContactRule,contact:AutoContactOverview):string|null {
 const channels=rule.channels??[rule.channel];
 if(!channels.length||!channels.includes(rule.channel)||new Set(channels).size!==channels.length)return '请检查已选择的发送渠道。';
 if(!contact.capability.available)return '发送服务未就绪，请检查自动回复设置。';
 for(const channel of channels){
  const capability=contact.capabilities?.find(c=>c.platform===rule.platform&&c.channel===channel);
  const ready=contact.capabilities?capability?.available&&capability.supported:channel==='COMMENT';
  if(!ready)return `${channel==='DM'?'私信':'评论回复'}渠道未就绪，请检查自动回复设置。`;
 }
 const plans=rule.channelPlans?.length?rule.channelPlans:[{channel:rule.channel,content:rule.content}];
 if(plans.length!==channels.length||channels.some(channel=>plans.filter(p=>p.channel===channel&&p.content.trim()).length!==1))return '请分别选择已开启渠道的回复模板。';
 return null;
}
/** Only switched-on stages are prerequisites for a new collection. No mutation or authorization. */
export function automationIssue(review?:ReviewOverview,contact?:AutoContactOverview):SetupIssue|null {
 if(!review)return {tab:'review',message:'无法读取评论匹配设置，请重新读取后开始。'};
 if(!contact)return {tab:'contact',message:'无法读取自动回复设置，请重新读取后开始。'};
 const policies=review.policies.filter(p=>p.autoEnabled);
 if(policies.some(p=>p.target.trim().length<10))return {tab:'review',message:'已开启自动匹配，但审核需求未配置完整。'};
 if(policies.length&&review.connection.state!=='READY')return {tab:'review',message:'自动匹配已开启，但全局模型尚未就绪。请检查模型配置或关闭自动匹配。'};
 for(const rule of contact.rules.filter(r=>r.enabled)){
  if(!rule.content.trim()||!rule.accountIds.length)return {tab:'contact',message:'自动回复已开启，但回复内容或发送账号未配置。'};
  if(rule.pauseReason)return {tab:'contact',message:`自动回复已暂停：${replyBlockText(rule.pauseReason)}。请核查后再继续。`};
  const channelIssue=replyRuleChannelIssue(rule,contact);if(channelIssue)return {tab:'contact',message:channelIssue};
  const policy=review.policies.find(p=>p.id===rule.policyId);
  if(!policy?.autoEnabled||policy.revision!==rule.policyRevision)return {tab:'review',message:'自动回复依赖当前版本的自动匹配，请检查匹配开关与目标版本，或关闭发送。'};
  const accountIssue=replyRuleAccountIssue(rule,contact.accounts);
  if(accountIssue)return {tab:'contact',message:accountIssue+'。请检查账号或调整自动回复设置。'};
 }
 return null;
}
