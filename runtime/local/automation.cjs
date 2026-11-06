'use strict';
const {randomUUID}=require('node:crypto'),{LocalError,hash}=require('./database.cjs');
const {LocalContact,definition}=require('./contact.cjs'),{LocalReview}=require('./review.cjs');
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
     this.contact.frozen(ref);let selected,scope;
     // Allocate once, before any attempt: only exhausted/zero quotas may move to
     // the next explicitly authorized account. Identity/risk failures stop planning.
     for(const a of JSON.parse(rule.accounts)){
      if(!a.dailyLimit)continue;const candidate=this.contact.plan(row.id,ref.id,plan.channel,a.id).scope;
      const day=require('./send-safety.cjs').dayAt(this.store.clock()),account=this.db.prepare('SELECT daily_limit FROM accounts WHERE id=?').get(a.id),usage=this.db.prepare('SELECT occupied,daily_limit_override FROM account_days WHERE account_id=? AND day=?').get(a.id,day);
      const pending=this.db.prepare("SELECT count(*) n FROM jobs j JOIN authorizations g ON g.id=j.authorization_id WHERE j.kind='SEND' AND j.state IN('QUEUED','RUNNING') AND j.cancel_requested=0 AND g.state='ACTIVE' AND g.expires_at>? AND json_extract(j.payload,'$.accountId')=? AND NOT EXISTS(SELECT 1 FROM send_attempts s WHERE s.request_key=j.request_key)").get(this.store.clock(),a.id).n;
      if((usage?.occupied??0)+pending>=Math.min(usage?.daily_limit_override??account.daily_limit,a.dailyLimit))continue;
      selected=a;scope=candidate;break;
     }
     if(!selected)throw new LocalError('ACCOUNT_POOL_QUOTA_EXHAUSTED');
     if(this.db.prepare("SELECT 1 FROM jobs WHERE kind='SEND' AND state IN('QUEUED','RUNNING','UNKNOWN') AND json_extract(payload,'$.recipientId')=? AND (json_extract(payload,'$.channel')=? OR state='UNKNOWN')").get(scope.recipientId,plan.channel)||this.db.prepare("SELECT 1 FROM send_attempts WHERE platform='XHS' AND recipient_id=? AND (state IN('RESERVED','DISPATCHED','UNKNOWN') OR channel=? AND state='CONFIRMED')").get(scope.recipientId,plan.channel))throw new LocalError('RECIPIENT_ALREADY_PLANNED_OR_CONTACTED');
     jobId=this.contact.enqueueInTransaction(row.id,ref.id,plan.channel,selected.id);queued++;
    }catch(error){if(!(error instanceof LocalError))throw error;reason=error.code;skipped++;}
    this.db.prepare('INSERT INTO automation_decisions(run_id,review_id,rule_id,channel,job_id,state,reason,created_at) VALUES(?,?,?,?,?,?,?,?)').run(runId,row.id,ref.id,plan.channel,jobId,jobId?'QUEUED':'SKIPPED',reason,this.store.clock());
   });
  }
  return {queued,skipped};
 }
 decisions({page=1}={}){if(!Number.isInteger(page)||page<1||page>100000)throw new LocalError('INVALID_PAGE');return {items:this.db.prepare('SELECT d.*,r.name rule_name FROM automation_decisions d JOIN contact_rules r ON r.id=d.rule_id ORDER BY d.id DESC LIMIT 30 OFFSET ?').all((page-1)*30),total:this.db.prepare('SELECT count(*) n FROM automation_decisions').get().n,page};}
}
module.exports={LocalAutomation};
