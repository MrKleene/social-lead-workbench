'use strict';
const {LocalError}=require('./database.cjs'),{dayAt}=require('./send-safety.cjs'),{reviewCommentPolicy}=require('@crm/local-runtime/policy');
function page(value=1){if(!Number.isInteger(value)||value<1||value>100000)throw new LocalError('INVALID_PAGE');return value;}
function filterText(values){if(values.some(x=>typeof x!=='string'||x.length>200))throw new LocalError('INVALID_REPORT_FILTER');}
function range(from='',to=''){
 const time=(v,end)=>{if(!v)return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(v))throw new LocalError('INVALID_DATE_RANGE');const n=Date.parse(v+'T00:00:00+08:00');if(!Number.isFinite(n)||new Date(n+28800000).toISOString().slice(0,10)!==v)throw new LocalError('INVALID_DATE_RANGE');return n+(end?86400000:0);};
 const a=time(from,false),b=time(to,true);if(a!==null&&b!==null&&a>=b)throw new LocalError('INVALID_DATE_RANGE');return [a,b];
}
/**
 * 账号为什么不能发：把内部原因码归成三档，界面只讲「原因 + 下一步」。
 * PLATFORM = 平台限制（只能等或换号）；LOCAL = 我们这边的问题（可以自己解决）；
 * UNKNOWN = 判断不了（没见过明确提示，需要人看一次证据）。
 */
const VERDICT={
 ACCOUNT_HAS_RETAINED_RESTRICTION:['PLATFORM','RECHECK_ACCOUNT'],
 ACCOUNT_RESTRICTED_TODAY:['PLATFORM','WAIT_NEXT_DAY'],
 UNKNOWN_SEND_REQUIRES_EVIDENCE:['UNKNOWN','DISCARD_UNKNOWN_SEND'],
 ACCOUNT_REQUIRES_LOGIN:['LOCAL','RELOGIN'],
 ACCOUNT_IDENTITY_UNVERIFIED:['LOCAL','RELOGIN'],
 COMMENT_CAPABILITY_REQUIRED:['LOCAL','RECHECK_ACCOUNT'],
 ACCOUNT_HAS_ACTIVE_TASKS:['LOCAL','WAIT_TASK'],
 DAILY_QUOTA_EXHAUSTED:['LOCAL','WAIT_NEXT_DAY'],
 SENDING_PAUSED:['LOCAL','CLEAR_PAUSE'],
 TARGET_PREFLIGHT_REQUIRED:['LOCAL','SEND_ONE'],
};
const ORDER=['PLATFORM','LOCAL','UNKNOWN'];
function verdictOf(reasons){for(const level of ORDER){const reason=reasons.find(r=>VERDICT[r]?.[0]===level);if(reason)return {level,reason,nextStep:VERDICT[reason][1]};}return null;}
class LocalReporting{
 constructor(store){this.store=store;this.db=store.db;}
 account({accountId}){
  filterText([accountId]);const a=this.db.prepare("SELECT * FROM accounts WHERE id=? AND state<>'ARCHIVED'").get(accountId);if(!a)throw new LocalError('ACCOUNT_NOT_FOUND');
  const day=dayAt(this.store.clock()),usage=this.db.prepare('SELECT occupied,daily_limit_override FROM account_days WHERE account_id=? AND day=?').get(a.id,day),occupied=usage?.occupied??0,limit=usage?.daily_limit_override??a.daily_limit;
  const holds=this.db.prepare('SELECT channel,reason,created_at,detail FROM account_holds WHERE account_id=?').all(a.id).map(h=>({...h,detail:h.detail?JSON.parse(h.detail):null})),pauses=this.db.prepare('SELECT id,reason FROM safety_state WHERE reason IS NOT NULL').all(),busy=this.db.prepare("SELECT id,kind,state FROM jobs WHERE state IN('QUEUED','RUNNING') AND json_extract(payload,'$.accountId')=? ORDER BY created_at LIMIT 30").all(a.id);
  const base=[];if(a.state!=='VERIFIED'||!a.session_ref)base.push('ACCOUNT_REQUIRES_LOGIN');if(!/^[a-f0-9]{24}$/.test(a.platform_user_id??''))base.push('ACCOUNT_IDENTITY_UNVERIFIED');if(busy.length)base.push('ACCOUNT_HAS_ACTIVE_TASKS');
  const channels=['COMMENT','DM'].map(channel=>{const reasons=[...base];if(require('./account-safety.cjs').historicalSendHold(a.platform_user_id)||holds.some(h=>!h.channel||h.channel===channel)||a.state==='RESTRICTED')reasons.push('ACCOUNT_HAS_RETAINED_RESTRICTION');if(occupied>=limit)reasons.push('DAILY_QUOTA_EXHAUSTED');if(pauses.some(p=>['sending','platform'].includes(p.id)))reasons.push('SENDING_PAUSED');const unknown=this.db.prepare("SELECT count(*) n FROM send_attempts WHERE account_id=? AND channel=? AND state='UNKNOWN'").get(a.id,channel).n;if(unknown)reasons.push('UNKNOWN_SEND_REQUIRES_EVIDENCE');return {channel,reasons,unknown,targetPreflightRequired:channel==='COMMENT',verdict:verdictOf(reasons)};});
  const restrictedToday=require('./account-safety.cjs').restricted(this.store,a.id),pool=require('./account-safety.cjs').restrictedToday(this.store);
  return {accountId:a.id,day,occupied,limit,remaining:Math.max(0,limit-occupied),checkedAt:this.store.clock(),localOnly:true,platformSessionVerified:false,channels,holds,activeJobs:busy,restrictedToday,poolRestrictedToday:pool.length,poolStopped:pool.length>=2};
 }
 model({page:current=1,state='',runId='',from='',to=''}={}){
  page(current);filterText([runId]);if(!['','RESERVED','DISPATCHED','COMPLETED','FAILED','UNKNOWN','CANCELLED'].includes(state))throw new LocalError('INVALID_REPORT_FILTER');const [start,end]=range(from,to);
  const where="(?='' OR b.state=?) AND (?='' OR b.run_id=?) AND (? IS NULL OR b.created_at>=?) AND (? IS NULL OR b.created_at<?)",args=[state,state,runId,runId,start,start,end,end],source='FROM review_batches b JOIN review_policies p ON p.id=b.policy_id';
  const items=this.db.prepare(`SELECT b.id,b.run_id,b.post_id,b.state,b.model,b.day,b.created_at,b.finished_at,b.error_code,p.name policy_name,json_array_length(b.inputs) comments,(SELECT count(*) FROM model_submissions s WHERE s.batch_id=b.id) submitted FROM review_batches b JOIN review_policies p ON p.id=b.policy_id WHERE ${where} ORDER BY b.created_at DESC,b.id LIMIT 30 OFFSET ?`).all(...args,(current-1)*30);
  const summary=this.db.prepare(`SELECT b.state,count(*) count,sum(json_array_length(b.inputs)) comments ${source} WHERE ${where} GROUP BY b.state`).all(...args),day=dayAt(this.store.clock());
  return {items,total:this.db.prepare(`SELECT count(*) n ${source} WHERE ${where}`).get(...args).n,page:current,summary,day,occupied:this.db.prepare('SELECT occupied FROM model_days WHERE day=?').get(day)?.occupied??0,dailyLimit:this.db.prepare("SELECT daily_limit FROM model_profile WHERE id='qwen'").get()?.daily_limit??null,queued:this.db.prepare("SELECT count(*) n FROM jobs WHERE kind='REVIEW' AND state='QUEUED'").get().n,pauses:this.db.prepare("SELECT reason FROM safety_state WHERE id='model' AND reason IS NOT NULL").all(),costAvailable:false};
 }
 runs({page:current=1,query='',state='',configId='',accountId='',from='',to=''}={}){
  page(current);filterText([query,configId,accountId]);if(!['','RUNNING','COMPLETE','PARTIAL','FAILED','CANCELLED','INTERRUPTED'].includes(state))throw new LocalError('INVALID_REPORT_FILTER');const [start,end]=range(from,to);
  const source='FROM collection_runs r JOIN configurations c ON c.id=r.config_id',where="(?='' OR r.status=?) AND (?='' OR r.config_id=?) AND (?='' OR r.account_id=?) AND (?='' OR instr(c.name,?)>0 OR EXISTS(SELECT 1 FROM run_posts p WHERE p.run_id=r.id AND instr(coalesce(json_extract(p.snapshot,'$.title'),''),?)>0)) AND (? IS NULL OR r.created_at>=?) AND (? IS NULL OR r.created_at<?)",args=[state,state,configId,configId,accountId,accountId,query,query,query,start,start,end,end];
  return {items:this.db.prepare(`SELECT r.id,r.status,r.reason,r.created_at,r.finished_at,c.name,(SELECT count(*) FROM run_posts p WHERE p.run_id=r.id) posts,(SELECT count(*) FROM run_comments m WHERE m.run_id=r.id) comments ${source} WHERE ${where} ORDER BY r.created_at DESC,r.id LIMIT 30 OFFSET ?`).all(...args,(current-1)*30),total:this.db.prepare(`SELECT count(*) n ${source} WHERE ${where}`).get(...args).n,page:current};
 }
 unreviewed({page:current=1,runId='',policyId='',query='',state=''}={}){
  page(current);filterText([runId,policyId,query]);if(!['','FAILED','UNKNOWN','PROCESSING','UNANALYSED'].includes(state))throw new LocalError('INVALID_REPORT_FILTER');
  const source=`FROM run_comments c JOIN run_posts p ON p.id=c.post_id LEFT JOIN review_batches b ON b.id=(SELECT x.id FROM review_batches x WHERE x.post_id=c.post_id AND (?='' OR x.policy_id=?) ORDER BY x.created_at DESC,x.rowid DESC LIMIT 1)`,where="NOT EXISTS(SELECT 1 FROM review_results r JOIN review_batches rb ON rb.id=r.batch_id WHERE r.comment_id=c.id AND (?='' OR rb.policy_id=?)) AND (?='' OR c.run_id=?) AND length(trim(c.body))<="+reviewCommentPolicy.maxChars+" AND (?='' OR instr(c.body,?)>0) AND (?='' OR ?='FAILED' AND b.state IN('FAILED','CANCELLED') OR ?='UNKNOWN' AND b.state='UNKNOWN' OR ?='PROCESSING' AND b.state IN('RESERVED','DISPATCHED') OR ?='UNANALYSED' AND b.id IS NULL)",args=[policyId,policyId,policyId,policyId,runId,runId,query,query,state,state,state,state,state];
  return {items:this.db.prepare(`SELECT c.id,c.run_id,c.post_id,c.body,p.coverage,json_extract(p.snapshot,'$.title') post_title,b.state batch_state,b.error_code ${source} WHERE ${where} ORDER BY c.rowid DESC LIMIT 30 OFFSET ?`).all(...args,(current-1)*30),total:this.db.prepare(`SELECT count(*) n ${source} WHERE ${where}`).get(...args).n,page:current};
 }

 automation({page:current=1,state='',channel='',ruleId='',runId=''}={}){
  page(current);filterText([ruleId,runId]);if(!['','QUEUED','SKIPPED'].includes(state)||!['','DM','COMMENT'].includes(channel))throw new LocalError('INVALID_REPORT_FILTER');
  const source='FROM automation_decisions d JOIN contact_rules r ON r.id=d.rule_id LEFT JOIN jobs j ON j.id=d.job_id',where="(?='' OR d.state=?) AND (?='' OR d.channel=?) AND (?='' OR d.rule_id=?) AND (?='' OR d.run_id=?)",args=[state,state,channel,channel,ruleId,ruleId,runId,runId];
  return {items:this.db.prepare(`SELECT d.id,d.run_id,d.rule_id,d.channel,d.state,d.reason,d.created_at,r.name rule_name,j.state job_state ${source} WHERE ${where} ORDER BY d.id DESC LIMIT 30 OFFSET ?`).all(...args,(current-1)*30),total:this.db.prepare(`SELECT count(*) n ${source} WHERE ${where}`).get(...args).n,page:current,summary:this.db.prepare(`SELECT d.state,d.reason,count(*) count ${source} WHERE ${where} GROUP BY d.state,d.reason ORDER BY count DESC,d.reason`).all(...args)};
 }
}
module.exports={LocalReporting,range};
