'use strict';
const {randomUUID}=require('node:crypto'),{LocalError,hash}=require('./database.cjs');
const {LocalContact,definition}=require('./contact.cjs'),{LocalReview}=require('./review.cjs');
const {dayAt}=require('./send-safety.cjs');
/** 额度不足的跳过原因。只有它（或任务夭折）的条目会留在「待处理回复」里等人处理。 */
const QUOTA_EXHAUSTED='ACCOUNT_POOL_QUOTA_EXHAUSTED';
const DEAD_JOB="j.state IN('CANCELLED','FAILED','INTERRUPTED')";
const UNRESOLVED=`d.resolved_at IS NULL AND ((d.state='SKIPPED' AND d.reason='${QUOTA_EXHAUSTED}') OR ${DEAD_JOB})`;
class LocalAutomation{
 constructor(store,{enabled=()=>false}={}){this.store=store;this.db=store.db;this.contact=new LocalContact(store);this.enabled=enabled;}
 list(){return this.db.prepare('SELECT * FROM contact_rules ORDER BY name,id').all().map(r=>({...definition(r),name:r.name,enabled:!!r.enabled}));}
 save({id=randomUUID(),name,input}){return this.contact.save(id,name,{...input,platform:'XHS'});}
 preview({id,version}){const r=this.db.prepare('SELECT * FROM contact_rules WHERE id=?').get(id);if(!r||r.version!==version)throw new LocalError('CONTACT_RULE_CHANGED');return {...definition(r),name:r.name,previewHash:hash(definition(r))};}
 authorize({id,version,previewHash,consent}){if(!this.enabled())throw new LocalError('SEND_EXECUTOR_UNAVAILABLE');if(consent!=='automatic-contact-frozen-run-v1'||this.preview({id,version}).previewHash!==previewHash)throw new LocalError('AUTOMATION_CONSENT_REQUIRED');return this.contact.authorize(id,version);}
 revoke({id}){return this.store.transaction(()=>{this.contact.revokeInTransaction(id);const rows=this.db.prepare("SELECT id,authorization_id FROM jobs WHERE kind='SEND' AND state IN('QUEUED','RUNNING') AND json_extract(payload,'$.basis.ruleId')=?").all(id);for(const row of rows){this.db.prepare("UPDATE jobs SET cancel_requested=1,state=CASE WHEN state='QUEUED' THEN 'CANCELLED' ELSE state END WHERE id=?").run(row.id);this.db.prepare("UPDATE authorizations SET state='REVOKED' WHERE id=? AND state='ACTIVE'").run(row.authorization_id);}return {disabled:true,cancelled:rows.length};});}
 frozen(ruleIds,policies){
  if(!Array.isArray(ruleIds)||ruleIds.length>100||new Set(ruleIds).size!==ruleIds.length)throw new LocalError('INVALID_AUTOMATION_SELECTION');
  return ruleIds.map(id=>{const r=this.db.prepare('SELECT * FROM contact_rules WHERE id=?').get(id);if(!r?.enabled||!policies.some(p=>p.id===r.policy_id&&p.revision===r.policy_revision))throw new LocalError('AUTOMATION_POLICY_NOT_SELECTED');const ref={id:r.id,version:r.version,hash:r.authorization_hash};this.contact.frozen(ref);return ref;});
 }
 /**
  * 从账号池里挑第一个还放得下的账号：按顺序跳过量额为 0 或已用满的账号。
  * 身份、授权、风控类失败照旧向上抛——绝不静默换号重试。
  */
 allocate(ref,rule,reviewId,channel){
  for(const a of JSON.parse(rule.accounts)){
   if(!a.dailyLimit)continue;const candidate=this.contact.plan(reviewId,ref.id,channel,a.id).scope;
   const day=dayAt(this.store.clock()),account=this.db.prepare('SELECT daily_limit FROM accounts WHERE id=?').get(a.id),usage=this.db.prepare('SELECT occupied,daily_limit_override FROM account_days WHERE account_id=? AND day=?').get(a.id,day);
   const pending=this.db.prepare("SELECT count(*) n FROM jobs j JOIN authorizations g ON g.id=j.authorization_id WHERE j.kind='SEND' AND j.state IN('QUEUED','RUNNING') AND j.cancel_requested=0 AND g.state='ACTIVE' AND g.expires_at>? AND json_extract(j.payload,'$.accountId')=? AND NOT EXISTS(SELECT 1 FROM send_attempts s WHERE s.request_key=j.request_key)").get(this.store.clock(),a.id).n;
   if((usage?.occupied??0)+pending>=Math.min(usage?.daily_limit_override??account.daily_limit,a.dailyLimit))continue;
   return {account:a,scope:candidate};
  }
  throw new LocalError(QUOTA_EXHAUSTED);
 }
 afterReview(runId){
  if(!this.enabled()||!new LocalReview(this.store).barrier(runId).ready)return {waiting:true};
  const run=this.db.prepare('SELECT snapshot FROM collection_runs WHERE id=?').get(runId),refs=JSON.parse(run.snapshot).strictStages.contactRules||[];let queued=0,skipped=0;
  for(const ref of refs){const rule=this.db.prepare('SELECT * FROM contact_rules WHERE id=?').get(ref.id);if(!rule)continue;
   const rows=this.db.prepare('SELECT r.id FROM review_results r JOIN review_batches b ON b.id=r.batch_id WHERE b.run_id=? AND b.policy_id=? ORDER BY r.created_at,r.id').all(runId,rule.policy_id);
   for(const row of rows)for(const plan of JSON.parse(rule.plans))this.store.transaction(()=>{
    if(this.db.prepare('SELECT 1 FROM automation_decisions WHERE run_id=? AND review_id=? AND rule_id=? AND channel=?').get(runId,row.id,ref.id,plan.channel))return;
    let jobId=null,reason='RULE_JOB_CREATED';
    try{
     if(this.db.prepare("SELECT 1 FROM safety_state WHERE id IN('sending','platform') AND reason IS NOT NULL").get())throw new LocalError('SENDING_PAUSED');
     this.contact.frozen(ref);
     // Allocate once, before any attempt: only exhausted/zero quotas may move to
     // the next explicitly authorized account. Identity/risk failures stop planning.
     const {account:selected,scope}=this.allocate(ref,rule,row.id,plan.channel);
     if(this.db.prepare("SELECT 1 FROM jobs WHERE kind='SEND' AND state IN('QUEUED','RUNNING','UNKNOWN') AND json_extract(payload,'$.recipientId')=? AND (json_extract(payload,'$.channel')=? OR state='UNKNOWN')").get(scope.recipientId,plan.channel)||this.db.prepare("SELECT 1 FROM send_attempts WHERE platform='XHS' AND recipient_id=? AND (state IN('RESERVED','DISPATCHED','UNKNOWN') OR channel=? AND state='CONFIRMED')").get(scope.recipientId,plan.channel))throw new LocalError('RECIPIENT_ALREADY_PLANNED_OR_CONTACTED');
     jobId=this.contact.enqueueInTransaction(row.id,ref.id,plan.channel,selected.id);queued++;
    }catch(error){if(!(error instanceof LocalError))throw error;reason=error.code;skipped++;}
    this.db.prepare('INSERT INTO automation_decisions(run_id,review_id,rule_id,channel,job_id,state,reason,created_at) VALUES(?,?,?,?,?,?,?,?)').run(runId,row.id,ref.id,plan.channel,jobId,jobId?'QUEUED':'SKIPPED',reason,this.store.clock());
   });
  }
  return {queued,skipped};
 }
 decisions({page=1}={}){if(!Number.isInteger(page)||page<1||page>100000)throw new LocalError('INVALID_PAGE');return {items:this.db.prepare('SELECT d.*,r.name rule_name FROM automation_decisions d JOIN contact_rules r ON r.id=d.rule_id ORDER BY d.id DESC LIMIT 30 OFFSET ?').all((page-1)*30),total:this.db.prepare('SELECT count(*) n FROM automation_decisions').get().n,page};}
 /**
  * 「待处理回复」：额度不足没发出去的，以及任务在发出前就夭折（取消/失败/中断）的。
  * 只读聚合，不带任何发送权限；处理动作另走 retry / dismiss。
  * 规则已被关闭（revoke）的不列：关掉自动回复就等于这批不发了。
  */
 pending({page=1}={}){
  if(!Number.isInteger(page)||page<1||page>100000)throw new LocalError('INVALID_PAGE');
  const from=`FROM automation_decisions d LEFT JOIN jobs j ON j.id=d.job_id JOIN review_results v ON v.id=d.review_id JOIN run_comments c ON c.id=v.comment_id JOIN run_posts p ON p.id=c.post_id JOIN contact_rules r ON r.id=d.rule_id WHERE ${UNRESOLVED} AND r.enabled=1`;
  const items=this.db.prepare(`SELECT d.id,d.run_id,d.review_id,d.rule_id,d.channel,d.reason,d.created_at,j.state job_state,r.name rule_name,r.plans,r.accounts,json_extract(p.snapshot,'$.title') post_title,c.body comment_body,c.user_id recipient_id ${from} ORDER BY d.id DESC LIMIT 30 OFFSET ?`).all((page-1)*30)
   .map(row=>({id:row.id,runId:row.run_id,reviewId:row.review_id,ruleId:row.rule_id,channel:row.channel,reason:row.reason,ruleName:row.rule_name,jobState:row.job_state??null,postTitle:row.post_title??'',comment:row.comment_body,recipientId:row.recipient_id,content:(JSON.parse(row.plans).find(p=>p.channel===row.channel)||{}).content??'',createdAt:row.created_at,pool:JSON.parse(row.accounts).map(a=>a.id)}));
  return {items:items.map(({pool,...item})=>item),total:this.db.prepare(`SELECT count(*) n ${from}`).get().n,page,remaining:this.remaining([...new Set(items.flatMap(item=>item.pool))])};
 }
 /** 今日还能发多少条：给定账号池（缺省为全部在用账号）的剩余额度合计，供界面判断「现在能不能重排」。 */
 remaining(ids=[]){
  const day=dayAt(this.store.clock()),filter=ids.length?`AND a.id IN (${ids.map(()=>'?').join(',')})`:'';
  return this.db.prepare(`SELECT a.daily_limit,COALESCE(d.occupied,0) occupied,d.daily_limit_override FROM accounts a LEFT JOIN account_days d ON d.account_id=a.id AND d.day=? WHERE a.state<>'ARCHIVED' ${filter}`).all(day,...ids).reduce((n,r)=>n+Math.max(0,Math.min(r.daily_limit_override??r.daily_limit,r.daily_limit)-r.occupied),0);
 }
 /** 把一条待处理回复重新排进队列：重新按当前账号池分配账号并签发新的单次授权。 */
 retry({id}){
  if(!this.enabled())throw new LocalError('SEND_EXECUTOR_UNAVAILABLE');
  if(!Number.isInteger(id)||id<1)throw new LocalError('PENDING_CONTACT_CHANGED');
  return this.store.transaction(()=>{
   const d=this.db.prepare(`SELECT d.*,j.state job_state FROM automation_decisions d LEFT JOIN jobs j ON j.id=d.job_id WHERE d.id=? AND ${UNRESOLVED}`).get(id);
   if(!d)throw new LocalError('PENDING_CONTACT_CHANGED');
   if(this.db.prepare("SELECT 1 FROM safety_state WHERE id IN('sending','platform') AND reason IS NOT NULL").get())throw new LocalError('SENDING_PAUSED');
   const rule=this.db.prepare('SELECT * FROM contact_rules WHERE id=?').get(d.rule_id);
   if(!rule?.enabled)throw new LocalError('CONTACT_RULE_AUTHORIZATION_CHANGED');
   const ref={id:rule.id,version:rule.version,hash:rule.authorization_hash};this.contact.frozen(ref);
   const {account,scope}=this.allocate(ref,rule,d.review_id,d.channel);
   if(this.db.prepare("SELECT 1 FROM jobs WHERE kind='SEND' AND state IN('QUEUED','RUNNING','UNKNOWN') AND json_extract(payload,'$.recipientId')=? AND (json_extract(payload,'$.channel')=? OR state='UNKNOWN')").get(scope.recipientId,d.channel)||this.db.prepare("SELECT 1 FROM send_attempts WHERE platform='XHS' AND recipient_id=? AND (state IN('RESERVED','DISPATCHED','UNKNOWN') OR channel=? AND state='CONFIRMED')").get(scope.recipientId,d.channel))throw new LocalError('RECIPIENT_ALREADY_PLANNED_OR_CONTACTED');
   // 同一对象只排一次；每次重排用新代次，避免旧 key 直接返回已作废的 job。
   const base=this.contact.autoKey({runId:d.run_id,reviewId:d.review_id,ruleId:ref.id,ruleVersion:scope.basis.ruleVersion,channel:d.channel});
   const generation=this.db.prepare('SELECT count(*) n FROM jobs WHERE request_key LIKE ?').get(base+'%').n;
   const jobId=this.contact.enqueueInTransaction(d.review_id,ref.id,d.channel,account.id,base+':r'+generation);
   this.db.prepare("UPDATE automation_decisions SET job_id=?,state='QUEUED',reason='RULE_JOB_CREATED',resolved_at=? WHERE id=?").run(jobId,this.store.clock(),id);
   this.store.audit('LOCAL_USER','PENDING_CONTACT_REQUEUED',String(id),{jobId,ruleId:ref.id,accountId:account.id,generation});
   return {queued:true,jobId};
  });
 }
 /** 用户明确不发了。保留记录与原因，只标记已处理。 */
 dismiss({id}){
  if(!Number.isInteger(id)||id<1)throw new LocalError('PENDING_CONTACT_CHANGED');
  return this.store.transaction(()=>{
   const n=this.db.prepare("UPDATE automation_decisions SET resolved_at=? WHERE id=? AND resolved_at IS NULL").run(this.store.clock(),id).changes;
   if(n!==1)throw new LocalError('PENDING_CONTACT_CHANGED');
   this.store.audit('LOCAL_USER','PENDING_CONTACT_DISMISSED',String(id));
   return {dismissed:true};
  });
 }
}
module.exports={LocalAutomation};
