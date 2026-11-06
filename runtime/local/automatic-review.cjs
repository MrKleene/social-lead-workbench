'use strict';
const {randomUUID}=require('node:crypto');
const {LocalError,canonical,hash}=require('./database.cjs');
const {LocalReview}=require('./review.cjs');
const policy=require('./policy.cjs');
const consent='comment-review-continuous-single-post-v3';
class AutomaticReview{
 constructor(store){this.store=store;this.db=store.db;this.review=new LocalReview(store);}
 authority(id){
  const a=this.db.prepare('SELECT * FROM automatic_review_authorizations WHERE policy_id=? AND enabled=1').get(id),p=this.db.prepare('SELECT * FROM review_policies WHERE id=? AND enabled=1').get(id),m=this.db.prepare("SELECT * FROM model_profile WHERE id='qwen' AND authorized=1").get();
  if(!a||!p||!m||a.policy_version!==p.version||a.model_version!==m.version||p.model_version!==m.version||a.price_ack!==m.price_ack||a.consent!==consent||a.request_policy!==policy.wholePostRequestPolicy||this.db.prepare('SELECT 1 FROM configurations WHERE id=? AND archived=1').get(id))throw new LocalError('AUTOMATIC_REVIEW_AUTHORIZATION_CHANGED');
  const spec=policy.qwenModel(m.model);if(!spec||spec.priceAck!==a.price_ack)throw new LocalError('MODEL_CAPACITY_OR_PRICE_ACK_REQUIRED');
  return {policyId:id,policyVersion:p.version,modelVersion:m.version,priceAck:a.price_ack,consent,requestPolicy:a.request_policy,authorizedAt:a.authorized_at};
 }
 enabled(){return this.db.prepare('SELECT policy_id FROM automatic_review_authorizations WHERE enabled=1 ORDER BY policy_id').all().flatMap(a=>{try{return [this.authority(a.policy_id)];}catch{return [];}});}
 set({id,version,enabled,consent:ack,modelVersion,priceAck}){return this.store.transaction(()=>{
  const p=this.db.prepare('SELECT * FROM review_policies WHERE id=?').get(id),m=this.db.prepare("SELECT * FROM model_profile WHERE id='qwen'").get();
  if(!p||p.version!==version||typeof enabled!=='boolean'||this.db.prepare('SELECT 1 FROM configurations WHERE id=? AND archived=1').get(id))throw new LocalError('REVIEW_POLICY_CHANGED');
  if(enabled&&(!p.enabled||!m?.authorized||p.model_version!==m.version||modelVersion!==m.version||ack!==consent||priceAck!==m.price_ack||policy.qwenModel(m.model)?.priceAck!==priceAck))throw new LocalError('MODEL_CONSENT_REQUIRED');
  this.db.prepare('UPDATE review_policies SET version=version+1 WHERE id=?').run(id);
  if(enabled)this.db.prepare('INSERT INTO automatic_review_authorizations VALUES(?,?,?,?,?,?,1,?) ON CONFLICT(policy_id) DO UPDATE SET policy_version=excluded.policy_version,model_version=excluded.model_version,price_ack=excluded.price_ack,consent=excluded.consent,request_policy=excluded.request_policy,enabled=1,authorized_at=excluded.authorized_at').run(id,version+1,m.version,m.price_ack,consent,policy.wholePostRequestPolicy,this.store.clock());
  else this.db.prepare('UPDATE automatic_review_authorizations SET enabled=0 WHERE policy_id=?').run(id);
  // Stop old frozen work immediately, including dispatch already in flight. Its result
  // is retained, but cannot qualify a contact or be replayed under a new consent.
  this.db.prepare("UPDATE jobs SET cancel_requested=1,state=CASE WHEN state='QUEUED' THEN 'CANCELLED' ELSE state END WHERE id IN(SELECT job_id FROM automatic_review_tasks WHERE policy_id=?) AND state IN('QUEUED','RUNNING')").run(id);
  this.db.prepare("UPDATE authorizations SET state='REVOKED' WHERE state='ACTIVE' AND id IN(SELECT authorization_id FROM jobs WHERE id IN(SELECT job_id FROM automatic_review_tasks WHERE policy_id=?))").run(id);
  this.store.audit('LOCAL_USER','AUTOMATIC_REVIEW_CONSENT',id,{enabled,policyVersion:version+1,modelVersion:enabled?m.version:null,requestPolicy:policy.wholePostRequestPolicy});return {updated:true};
 });}
 assertJob(job){
  const task=this.db.prepare('SELECT * FROM automatic_review_tasks WHERE job_id=?').get(job.id),grant=this.db.prepare('SELECT * FROM authorizations WHERE id=?').get(job.authorization_id);
  if(!task||job.kind!=='REVIEW'||job.cancel_requested||!grant||grant.issuer!=='AUTOMATION'||grant.purpose!=='REVIEW')throw new LocalError('AUTOMATIC_REVIEW_AUTHORIZATION_CHANGED');
  const run=this.db.prepare('SELECT * FROM collection_runs WHERE id=?').get(task.run_id),frozen=JSON.parse(run.snapshot).strictStages.automaticReview?.find(p=>p.policyId===task.policy_id),authority=this.authority(task.policy_id);
  if(JSON.parse(run.read_plan).kind!=='SEARCH'||!frozen||hash(frozen)!==hash(authority)||grant.parent_proof!==canonical({kind:'AUTOMATIC_REVIEW',runId:task.run_id,postId:task.post_id,authority}))throw new LocalError('AUTOMATIC_REVIEW_AUTHORIZATION_CHANGED');
  const plan=this.review.plan(task.run_id,task.post_id,task.policy_id);
  if(hash(plan.scope)!==job.payload_hash||grant.scope_hash!==job.payload_hash||hash(JSON.parse(job.payload))!==job.payload_hash)throw new LocalError('REVIEW_PREVIEW_CHANGED');
  return plan;
 }
 reconcile(){
  // Durable standing consent is usable only for the exact policies frozen when a
  // new search began. Old/imported runs and saved-post rereads acquire no authority.
  for(const run of this.db.prepare("SELECT r.* FROM collection_runs r JOIN jobs j ON j.id=r.job_id WHERE j.state='SUCCEEDED' AND json_extract(r.read_plan,'$.kind')='SEARCH' AND json_array_length(r.snapshot,'$.strictStages.automaticReview')>0 ORDER BY r.created_at").all()){
   if(!this.review.collection.barrier(run.id).ready)continue;
   for(const frozen of JSON.parse(run.snapshot).strictStages.automaticReview){
    try{if(hash(frozen)!==hash(this.authority(frozen.policyId)))continue;}catch{continue;}
    for(const post of this.review.collection.posts(run.id)){
     if(this.db.prepare('SELECT 1 FROM automatic_review_tasks WHERE run_id=? AND post_id=? AND policy_id=?').get(run.id,post.id,frozen.policyId))continue;
     this.store.transaction(()=>{
      let plan,reason='QUEUED';try{plan=this.review.plan(run.id,post.id,frozen.policyId);}catch(error){reason=error instanceof LocalError?error.code:'INVALID_REVIEW_SOURCE';}
      // Any prior job/batch is an explicit decision, including cancellation/failure.
      // The coordinator must never reinterpret it as permission to retry.
      if(this.db.prepare("SELECT 1 FROM jobs WHERE kind='REVIEW' AND json_extract(payload,'$.runId')=? AND json_extract(payload,'$.postId')=? AND json_extract(payload,'$.policyId')=?").get(run.id,post.id,frozen.policyId)||this.db.prepare('SELECT 1 FROM review_batches WHERE run_id=? AND post_id=? AND policy_id=?').get(run.id,post.id,frozen.policyId))reason='EXISTING_REVIEW';
      if(plan?.empty)reason='EMPTY_POST';
      let id=null;const now=this.store.clock();
      if(reason==='QUEUED'){
       id=randomUUID();const grant=randomUUID(),body=canonical(plan.scope),digest=hash(plan.scope),parent=canonical({kind:'AUTOMATIC_REVIEW',runId:run.id,postId:post.id,authority:frozen});
       this.db.prepare("INSERT INTO authorizations(id,purpose,scope,scope_hash,state,created_at,expires_at,issuer,parent_proof) VALUES(?,'REVIEW',?,?,'ACTIVE',?,?,'AUTOMATION',?)").run(grant,body,digest,now,now+900000,parent);
       this.db.prepare("INSERT INTO jobs(id,request_key,kind,payload,payload_hash,authorization_id,state,available_at,created_at,updated_at) VALUES(?,?,'REVIEW',?,?,?,'QUEUED',?,?,?)").run(id,'auto-review:'+hash({runId:run.id,postId:post.id,policyId:frozen.policyId}),body,digest,grant,now,now,now);
      }
      this.db.prepare('INSERT INTO automatic_review_tasks VALUES(?,?,?,?,?,?)').run(run.id,post.id,frozen.policyId,id,reason,now);this.store.audit('AUTOMATION','AUTOMATIC_REVIEW_PLANNED',run.id,{postId:post.id,policyId:frozen.policyId,jobId:id,reason});
     });
    }
   }
  }
  this.renewPending();
 }
 renewPending(){return this.store.transaction(()=>{
  for(const j of this.db.prepare("SELECT j.* FROM jobs j JOIN automatic_review_tasks t ON t.job_id=j.id WHERE j.state='QUEUED'").all()){
   try{const grant=this.db.prepare('SELECT state FROM authorizations WHERE id=?').get(j.authorization_id);if(j.dispatch_started||grant?.state!=='ACTIVE')throw new LocalError('AUTOMATIC_REVIEW_AUTHORIZATION_CHANGED');this.assertJob(j);this.db.prepare('UPDATE authorizations SET expires_at=? WHERE id=?').run(this.store.clock()+900000,j.authorization_id);}
   catch{this.db.prepare("UPDATE jobs SET state='CANCELLED',cancel_requested=1,updated_at=? WHERE id=?").run(this.store.clock(),j.id);this.db.prepare("UPDATE authorizations SET state='REVOKED' WHERE id=? AND state='ACTIVE'").run(j.authorization_id);}
  }
 });}
}
module.exports={AutomaticReview};
