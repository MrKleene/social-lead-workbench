'use strict';
const {LocalError,hash}=require('./database.cjs');
const {LocalQueue}=require('./queue.cjs');
const {LocalReview}=require('./review.cjs');
const policy=require('./policy.cjs');
class LocalWorkflow {
 constructor(store,vault,{capabilities=()=>({review:false,collect:false,inbox:false,send:false})}={}){this.store=store;this.db=store.db;this.vault=vault;this.capabilities=capabilities;this.queue=new LocalQueue(store);}
 overview(){const model=this.db.prepare("SELECT * FROM model_profile WHERE id='qwen'").get();return {capabilities:this.capabilities(),model:model??null,choices:policy.qwenModelChoices(model?.model),policies:this.db.prepare('SELECT * FROM review_policies p WHERE NOT EXISTS(SELECT 1 FROM configurations c WHERE c.id=p.id AND c.archived=1) ORDER BY name,id').all(),modelPaused:!!this.db.prepare("SELECT 1 FROM safety_state WHERE id='model' AND reason IS NOT NULL").get()};}
 saveModel({version,model,dailyLimit,priceAck,consent}){return this.store.transaction(()=>{
  const old=this.db.prepare("SELECT * FROM model_profile WHERE id='qwen'").get(),spec=policy.qwenModel(model);
  if(!Number.isInteger(version)||version!==(old?.version??0))throw new LocalError('MODEL_CONFIGURATION_CHANGED');
  if(!spec||!Number.isInteger(dailyLimit)||dailyLimit<1||dailyLimit>100||priceAck!==spec.priceAck||consent!=='beijing-original-comments-v2')throw new LocalError('MODEL_CONSENT_REQUIRED');
  if(!this.vault?.has('MODEL_KEY','qwen')||!this.vault.protector.available())throw new LocalError('MODEL_KEY_UNAVAILABLE');
  this.db.prepare("INSERT INTO model_profile VALUES('qwen',?,?,1,?,?,?) ON CONFLICT(id) DO UPDATE SET model=excluded.model,version=excluded.version,authorized=1,daily_limit=excluded.daily_limit,price_ack=excluded.price_ack,consent=excluded.consent").run(model,version+1,dailyLimit,priceAck,consent);
  this.db.exec('UPDATE review_policies SET enabled=0,version=version+1; UPDATE contact_rules SET enabled=0,version=version+1,authorization_hash=NULL');
  this.store.audit('LOCAL_USER','MODEL_CONFIGURATION_AUTHORIZED','qwen',{model,version:version+1,dailyLimit,priceAck,consent});return {version:version+1};
 });}
 setPolicy({id,version,enabled,consent,modelVersion}){return this.store.transaction(()=>{
  const p=this.db.prepare('SELECT * FROM review_policies WHERE id=?').get(id),m=this.db.prepare("SELECT * FROM model_profile WHERE id='qwen'").get();
  if(!p||this.db.prepare('SELECT 1 FROM configurations WHERE id=? AND archived=1').get(id)||p.version!==version||typeof enabled!=='boolean')throw new LocalError('REVIEW_POLICY_CHANGED');
  if(enabled&&(!m?.authorized||m.version!==modelVersion||consent!==policy.reviewUseConsent))throw new LocalError('MODEL_CONSENT_REQUIRED');
  this.db.prepare('UPDATE review_policies SET enabled=?,model_version=?,version=version+1 WHERE id=?').run(enabled?1:0,enabled?m.version:null,id);
  this.db.prepare('UPDATE contact_rules SET enabled=0,version=version+1,authorization_hash=NULL WHERE policy_id=?').run(id);
  this.store.audit('LOCAL_USER','REVIEW_POLICY_AUTHORIZATION',id,{enabled,modelVersion:enabled?m.version:null});return {updated:true};
 });}
 previewReview({runId,postId,policyId}){
  const plan=new LocalReview(this.store).plan(runId,postId,policyId);
  return {scope:plan.scope,previewHash:hash(plan.scope),comments:plan.inputs.length,estimatedMicros:plan.estimate.estimatedMicros,billingHardCap:false,empty:plan.empty};
 }
 authorizeReview({scope,previewHash,consent,requestKey}){
  if(!this.capabilities().review)throw new LocalError('MODEL_EXECUTOR_UNAVAILABLE');
  if(consent!==policy.reviewUseConsent||typeof requestKey!=='string'||!/^[-a-zA-Z0-9_:]{1,100}$/.test(requestKey))throw new LocalError('MODEL_CONSENT_REQUIRED');
  if(!scope||hash(scope)!==previewHash)throw new LocalError('REVIEW_PREVIEW_CHANGED');
  const prior=this.db.prepare('SELECT id,payload_hash FROM jobs WHERE request_key=?').get(requestKey);if(prior){if(prior.payload_hash!==previewHash)throw new LocalError('REQUEST_KEY_CONFLICT');return {id:prior.id};}
  const plan=new LocalReview(this.store).plan(scope?.runId,scope?.postId,scope?.policyId);if(plan.empty||hash(plan.scope)!==previewHash||hash(scope)!==previewHash)throw new LocalError('REVIEW_PREVIEW_CHANGED');
  new LocalReview(this.store).budget();const grant=this.queue.authorize('REVIEW',plan.scope);return {id:this.queue.enqueue('REVIEW',plan.scope,grant,requestKey)};
 }
 postReviewOptions({runId}){const run=this.db.prepare('SELECT snapshot FROM collection_runs WHERE id=?').get(runId);if(!run)throw new LocalError('RUN_NOT_FOUND');return {posts:this.db.prepare('SELECT id,platform_id,json_extract(snapshot,\'$.title\') title FROM run_posts WHERE run_id=? ORDER BY ordinal').all(runId),policies:JSON.parse(run.snapshot).strictStages.policies.map(p=>({id:p.id,name:this.db.prepare('SELECT name FROM review_policies WHERE id=?').get(p.id)?.name??'历史匹配目标'}))};}
 cancelJob({id}){return this.store.transaction(()=>{const row=this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id);if(!row)throw new LocalError('JOB_NOT_FOUND');this.db.prepare("UPDATE jobs SET cancel_requested=1,state=CASE WHEN state='QUEUED' THEN 'CANCELLED' ELSE state END,updated_at=? WHERE id=? AND state IN('QUEUED','RUNNING')").run(this.store.clock(),id);this.db.prepare("UPDATE authorizations SET state='REVOKED' WHERE id=? AND state='ACTIVE'").run(row.authorization_id);this.store.audit('LOCAL_USER','JOB_CANCEL_REQUESTED',id);return {requested:true};});}
}
module.exports={LocalWorkflow};
