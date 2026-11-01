import type {AutoContactOverview,AutoContactRule} from '@crm/contracts';
/** Current pool only, not a reconstructed reason for a historical job. Never grants eligibility. */
export function poolQuotaNotice(data:AutoContactOverview,rule:AutoContactRule|undefined,now=new Date()){
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 if(data.day!==day||!rule?.enabled||rule.pauseReason||rule.mode!=='REAL'||!rule.accountIds.length)return;
 const pool=rule.accountIds.map(id=>data.accounts.find(a=>a.id===id));
 if(pool.some(a=>!a||a.platform!==rule.platform||a.isDemo||a.systemBlockReason||a.loginState!=='VERIFIED'||!a.canCheck||a.unknown>0||a.sendEligibility?.state!=='UNKNOWN'))return;
 const full=pool.every(a=>{const limit=Math.min(a!.dailyLimit,rule.accountLimits.find(l=>l.id===a!.id)?.dailyLimit??0);return Number.isFinite(limit)&&limit>0&&Number.isFinite(a!.occupied)&&a!.occupied>=limit;});
 if(full)return pool.some(a=>a!.reserved>0)?'当前账号池今日额度已占满，包含预占或在途回复。':'当前账号池今日发送额度已用完。';
}
