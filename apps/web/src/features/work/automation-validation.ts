import type {AutoContactOverview,ReviewOverview} from '@crm/contracts';
export type AutomationTab='collect'|'review'|'contact';
export type SetupIssue={tab:AutomationTab;message:string};
/** Only switched-on stages are prerequisites for a new collection. No mutation or authorization. */
export function automationIssue(review?:ReviewOverview,contact?:AutoContactOverview):SetupIssue|null {
 if(!review)return {tab:'review',message:'无法读取评论匹配设置，请重新读取后开始。'};
 if(!contact)return {tab:'contact',message:'无法读取自动回复设置，请重新读取后开始。'};
 const policies=review.policies.filter(p=>p.autoEnabled);
 if(policies.some(p=>p.target.trim().length<10))return {tab:'review',message:'已开启自动匹配，但审核需求未配置完整。'};
 if(policies.length&&review.connection.state!=='READY')return {tab:'review',message:'自动匹配已开启，但全局模型尚未就绪。请检查模型配置或关闭自动匹配。'};
 for(const rule of contact.rules.filter(r=>r.enabled)){
  if(!rule.content.trim()||!rule.accountIds.length)return {tab:'contact',message:'自动回复已开启，但回复内容或发送账号未配置。'};
  if(rule.channel!=='COMMENT'||!contact.capability.available||rule.pauseReason)return {tab:'contact',message:'发送能力未就绪或规则已暂停，请检查自动回复设置。'};
  const policy=review.policies.find(p=>p.id===rule.policyId);
  if(!policy?.autoEnabled||policy.revision!==rule.policyRevision)return {tab:'review',message:'自动回复依赖当前版本的自动匹配，请检查匹配开关与目标版本，或关闭发送。'};
  if(rule.accountIds.some(id=>{const a=contact.accounts.find(a=>a.id===id);return !a?.healthy||a.workbenchStatus==='PAUSED'||!rule.accountLimits.find(l=>l.id===id)?.dailyLimit||(rule.mode==='SIMULATION'?!a.isDemo:a.isDemo||!a.sendEligibility?.canSend||a.sendEligibility.stale);}))return {tab:'contact',message:'已选发送账号的状态、发送资格或日额度未就绪。请检查账号，或关闭发送后仅采集。'};
 }
 return null;
}
