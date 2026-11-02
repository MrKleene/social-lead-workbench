import type {ContactAccount} from '@crm/contracts';

const restrictions:Record<string,string>={RESTRICTED:'账号受限',VERIFY_REQUIRED:'需要平台验证',RATE_LIMITED:'平台频率限制',REPLY_DISABLED:'评论权限受限'};
const loginIssues:Record<string,string>={EXPIRED:'登录已失效',MISSING:'登录会话缺失',NEEDS_REVIEW:'身份或会话待核查',CHECKING:'正在检查登录'};
/** Display only. Never grants send eligibility or changes quota reservations. */
export function accountSendSummary(a:ContactAccount,currentQuota=true){
 if(a.isDemo)return {label:'模拟账号',reason:'不向平台发送',tone:'neutral'};
 if(a.unknown>0)return {label:'发送结果未知',reason:'保留额度与去重锁，核查前勿重发',tone:'warning'};
 if(a.systemBlockReason)return {label:'发送受限',reason:a.systemBlockReason,tone:'warning'};
 if(a.workbenchStatus==='RESTRICTED')return {label:'账号受限',reason:a.sendEligibility?.reason||'需要核查账号限制',tone:'warning'};
 if(loginIssues[a.loginState||''])return {label:loginIssues[a.loginState!],reason:'',tone:'warning'};
 const e=a.sendEligibility;
 if(e&&e.state!=='UNKNOWN')return {label:restrictions[e.state]||'发送限制待核查',reason:e.reason,tone:'warning'};
 if(!Number.isFinite(a.authorizedLimit)||a.authorizedLimit<=0)return {label:'未配置发送额度',reason:'',tone:'neutral'};
 if(!currentQuota)return {label:'额度记录待更新',reason:'当前展示上次读取的额度',tone:'neutral'};
 if(a.remaining===0&&a.occupied>=a.authorizedLimit)return {label:a.reserved>0?'额度已占满':'额度已耗尽',reason:a.reserved>0?'包含预占或在途回复':'',tone:'neutral'};
 if(a.healthy&&e?.canSend&&!e.stale)return {label:'发送检查已通过',reason:'执行时仍核验登录与额度',tone:'success'};
 if(a.canCheck)return {label:'发送前自动核验',reason:'',tone:'neutral'};
 return {label:'发送资格待核查',reason:e?.reason||'尚无有效发送检查记录',tone:'warning'};
}
export function currentQuotaDay(day:string,timezone:string,now=new Date()){
 try{return day===new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}catch{return false;}
}
