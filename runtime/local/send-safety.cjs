'use strict';
const {randomUUID}=require('node:crypto');
const {LocalError,canonical,hash}=require('./database.cjs');
const {LocalQueue}=require('./queue.cjs');
function dayAt(timestamp){const f=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'});return f.format(new Date(timestamp));}
function validateScope(s){
 if(!s||s.platform!=='XHS'||!['COMMENT','DM'].includes(s.channel)||!Number.isInteger(s.accountRevision)||s.accountRevision<1)throw new LocalError('INVALID_SEND_SCOPE');
 for(const key of ['accountId','recipientId','content'])if(typeof s[key]!=='string'||!s[key].trim()||s[key].length>(key==='content'?4000:200))throw new LocalError('INVALID_SEND_SCOPE');
 if(!s.target||typeof s.target!=='object'||Array.isArray(s.target))throw new LocalError('EXACT_TARGET_REQUIRED');
 if(Object.entries(s.target).some(([k,v])=>!['postId','commentId','parentCommentId','recipientId','inboxMessageId','receiverId'].includes(k)||typeof v!=='string'||!v||v.length>200))throw new LocalError('INVALID_TARGET_REFERENCE');
 if(s.channel==='COMMENT'&&(!s.target.postId||!s.target.commentId))throw new LocalError('EXACT_TARGET_REQUIRED');
 if(s.channel==='DM'&&s.target.recipientId!==s.recipientId)throw new LocalError('EXACT_TARGET_REQUIRED');
 if(Object.keys(s).some(k=>!['platform','channel','accountId','accountRevision','recipientId','content','target'].includes(k)))throw new LocalError('INVALID_SEND_SCOPE');
 canonical(s);
}
class SendSafety {
 constructor(store){this.store=store;this.db=store.db;this.queue=new LocalQueue(store);}
 reserve(lease){return this.store.transaction(()=>{
  const job=this.queue.current(lease),s=JSON.parse(job.payload);if(job.kind!=='SEND'||job.dispatch_started||job.cancel_requested)throw new LocalError('INVALID_SEND_JOB');validateScope(s);
  const prior=this.db.prepare('SELECT * FROM send_attempts WHERE request_key=?').get(job.request_key);if(prior){if(prior.scope_hash!==job.payload_hash)throw new LocalError('REQUEST_KEY_CONFLICT');return prior.id;}
  const now=this.store.clock(),grant=this.db.prepare("SELECT * FROM authorizations WHERE id=? AND purpose='SEND' AND state='ACTIVE' AND expires_at>?").get(job.authorization_id,now);
  if(!grant||grant.scope_hash!==hash(s))throw new LocalError('AUTHORIZATION_REQUIRED');
  this.account(s);this.notPaused();
  const blocked=this.db.prepare('SELECT blocked FROM contact_ledger WHERE platform=? AND channel=? AND recipient_id=?').get(s.platform,s.channel,s.recipientId);if(blocked?.blocked)throw new LocalError('DO_NOT_CONTACT');
  if(this.db.prepare("SELECT 1 FROM send_attempts WHERE platform=? AND recipient_id=? AND (state IN('RESERVED','DISPATCHED','UNKNOWN') OR (channel=? AND state='CONFIRMED'))").get(s.platform,s.recipientId,s.channel))throw new LocalError('ALREADY_CONTACTED_OR_UNKNOWN');
  const day=dayAt(now),usage=this.db.prepare('SELECT occupied,daily_limit_override FROM account_days WHERE account_id=? AND day=?').get(s.accountId,day),account=this.account(s);
  if((usage?.occupied||0)>=(usage?.daily_limit_override??account.daily_limit))throw new LocalError('DAILY_LIMIT');
  this.db.prepare('INSERT INTO contact_ledger(platform,channel,recipient_id) VALUES(?,?,?) ON CONFLICT DO NOTHING').run(s.platform,s.channel,s.recipientId);
  this.db.prepare('INSERT INTO account_days(account_id,day,occupied) VALUES(?,?,1) ON CONFLICT(account_id,day) DO UPDATE SET occupied=occupied+1').run(s.accountId,day);
  const id=randomUUID();this.db.prepare("INSERT INTO send_attempts(id,request_key,platform,channel,recipient_id,account_id,account_revision,authorization_id,scope_hash,content,target,quota_day,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'RESERVED',?,?)").run(id,job.request_key,s.platform,s.channel,s.recipientId,s.accountId,s.accountRevision,grant.id,hash(s),s.content,canonical(s.target),day,now,now);
  this.store.audit('AUTOMATION','SEND_RESERVED',id,{jobId:job.id,scopeHash:hash(s)});return id;
 });}
 account(s){const a=this.db.prepare("SELECT * FROM accounts WHERE id=? AND state='VERIFIED'").get(s.accountId);if(!a||a.platform!==s.platform||a.revision!==s.accountRevision||!a.session_ref||!a.platform_user_id)throw new LocalError('ACCOUNT_IDENTITY_CHANGED');return a;}
 notPaused(){if(this.db.prepare("SELECT 1 FROM safety_state WHERE id='sending' AND reason IS NOT NULL").get())throw new LocalError('SENDING_PAUSED');}
 dispatch(lease,attemptId){return this.store.transaction(()=>{
  const job=this.queue.current(lease),s=JSON.parse(job.payload),a=this.db.prepare("SELECT * FROM send_attempts WHERE id=? AND state='RESERVED'").get(attemptId);
  const grant=this.db.prepare("SELECT * FROM authorizations WHERE id=? AND state='ACTIVE' AND expires_at>?").get(job.authorization_id,this.store.clock());
  if(job.kind!=='SEND'||job.dispatch_started||job.cancel_requested||!grant||!a||a.request_key!==job.request_key||a.scope_hash!==hash(s)||grant.scope_hash!==hash(s))throw new LocalError('SEND_AUTHORIZATION_ENDED');
  this.account(s);this.notPaused();
  if(this.db.prepare('SELECT blocked FROM contact_ledger WHERE platform=? AND channel=? AND recipient_id=?').get(s.platform,s.channel,s.recipientId)?.blocked)throw new LocalError('DO_NOT_CONTACT');
  if(dayAt(this.store.clock())!==a.quota_day)throw new LocalError('QUOTA_DAY_CHANGED');
  const usage=this.db.prepare('SELECT occupied,daily_limit_override FROM account_days WHERE account_id=? AND day=?').get(a.account_id,a.quota_day);
  if(!usage||usage.occupied<1||usage.occupied>(usage.daily_limit_override??this.account(s).daily_limit))throw new LocalError('DAILY_LIMIT_CHANGED');
  this.db.prepare("UPDATE send_attempts SET state='DISPATCHED',updated_at=? WHERE id=?").run(this.store.clock(),a.id);
  this.db.prepare('UPDATE jobs SET dispatch_started=1,updated_at=? WHERE id=?').run(this.store.clock(),job.id);
  this.db.prepare("UPDATE authorizations SET state='CONSUMED' WHERE id=?").run(grant.id);
  this.store.audit('AUTOMATION','SEND_DISPATCH_INTENT',a.id,{jobId:job.id,scopeHash:a.scope_hash});
  return {attemptId:a.id,requestKey:a.request_key,scope:s};
 });}
 result(lease,attemptId,result){return this.store.transaction(()=>{
  const job=this.queue.current(lease),a=this.db.prepare('SELECT * FROM send_attempts WHERE id=?').get(attemptId);
  if(!a||a.request_key!==job.request_key||!['RESERVED','DISPATCHED'].includes(a.state))throw new LocalError('INVALID_SEND_RESULT');
  let state;
  // This method is for a verified executor only; never expose it as renderer IPC.
  if(result.kind==='CONFIRMED'&&a.state==='DISPATCHED'&&result.scopeHash===a.scope_hash&&typeof result.receipt==='string'&&result.receipt.length>0&&result.receipt.length<=500&&result.submissions===1)state='CONFIRMED';
  else if(result.kind==='NOT_SUBMITTED'&&result.submissions===0&&result.stopped===true)state='NOT_SUBMITTED';
  else state='UNKNOWN';
  const now=this.store.clock(),evidence={kind:state,submissions:result.submissions??null,stopped:result.stopped===true};
  this.db.prepare('UPDATE send_attempts SET state=?,receipt=?,evidence=?,updated_at=? WHERE id=?').run(state,state==='CONFIRMED'?result.receipt:null,canonical(evidence),now,a.id);
  if(state==='NOT_SUBMITTED')this.db.prepare('UPDATE account_days SET occupied=occupied-1 WHERE account_id=? AND day=? AND occupied>0').run(a.account_id,a.quota_day);
  if(state==='UNKNOWN')this.pause('SUBMISSION_UNKNOWN',a.id);
  this.db.prepare('UPDATE jobs SET state=?,result=?,lease_owner=NULL,lease_until=NULL,updated_at=? WHERE id=?').run(state==='CONFIRMED'?'SUCCEEDED':state==='UNKNOWN'?'UNKNOWN':'FAILED',canonical({attemptId,state}),now,job.id);
  this.store.audit('AUTOMATION','SEND_RESULT',a.id,{state});return state;
 });}
 pause(reason,attemptId){const eventId=this.store.audit('RECOVERY','SENDING_PAUSED',attemptId,{reason});this.db.prepare("INSERT INTO safety_state VALUES('sending',1,?,?,?) ON CONFLICT(id) DO UPDATE SET version=version+1,event_id=excluded.event_id,reason=excluded.reason,created_at=excluded.created_at").run(eventId,reason,this.store.clock());}
 recover(){return this.store.transaction(()=>{
  const rows=this.db.prepare("SELECT s.* FROM send_attempts s JOIN jobs j ON j.request_key=s.request_key WHERE s.state IN('RESERVED','DISPATCHED') AND (j.state<>'RUNNING' OR j.lease_until<=?)").all(this.store.clock());
  for(const a of rows){const sent=a.state==='DISPATCHED',state=sent?'UNKNOWN':'CANCELLED';this.db.prepare('UPDATE send_attempts SET state=?,updated_at=? WHERE id=?').run(state,this.store.clock(),a.id);if(sent)this.pause('SUBMISSION_UNKNOWN',a.id);else this.db.prepare('UPDATE account_days SET occupied=occupied-1 WHERE account_id=? AND day=? AND occupied>0').run(a.account_id,a.quota_day);this.store.audit('RECOVERY','SEND_INTERRUPTED',a.id,{state});}return rows.length;
 });}
}
module.exports={SendSafety,validateScope,dayAt};
