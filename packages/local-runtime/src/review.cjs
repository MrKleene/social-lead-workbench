'use strict';
const {randomUUID}=require('node:crypto');
const {LocalError,canonical,hash}=require('./database.cjs');
const {LocalQueue}=require('./queue.cjs');
const {LocalCollection}=require('./collection.cjs');
const policy=require('@crm/local-runtime/policy');
const dayAt=timestamp=>new Date(timestamp+8*3600000).toISOString().slice(0,10);
class LocalReview {
  constructor(store){this.store=store;this.db=store.db;this.queue=new LocalQueue(store);this.collection=new LocalCollection(store);}
  plan(runId,postId,policyId,reviewMode){
    if(reviewMode!==undefined&&reviewMode!=='INDEPENDENT')throw new LocalError('INVALID_REVIEW_MODE');
    const independent=reviewMode==='INDEPENDENT';
    const barrier=independent?this.independentSource(runId,postId):this.collection.barrier(runId);if(!barrier.ready)throw new LocalError('COLLECTION_BARRIER_NOT_READY');
    const run=this.db.prepare('SELECT * FROM collection_runs WHERE id=?').get(runId),post=this.db.prepare("SELECT * FROM run_posts WHERE id=? AND run_id=? AND coverage='COMPLETE'").get(postId,runId);
    const selected=this.db.prepare('SELECT * FROM review_policies WHERE id=?').get(policyId),model=this.db.prepare("SELECT * FROM model_profile WHERE id='qwen'").get();
    const config=this.db.prepare('SELECT * FROM configurations WHERE id=?').get(run.config_id),frozen=JSON.parse(run.snapshot).strictStages.policies.find(p=>p.id===policyId);
    if(!post||!independent&&(!config||config.archived||config.revision!==run.revision))throw new LocalError('REVIEW_SOURCE_CHANGED');
    if(!selected?.enabled||(!independent&&(!frozen||selected.version!==frozen.version||selected.revision!==frozen.revision||selected.model_version!==frozen.modelVersion)))throw new LocalError('REVIEW_POLICY_CHANGED');
    if(!model?.authorized||model.version!==(independent?selected.model_version:frozen.modelVersion)||model.consent!=='beijing-original-comments-v2')throw new LocalError('MODEL_AUTHORIZATION_REQUIRED');
    const comments=this.collection.comments(runId,postId);
    const inputs=comments.map(c=>({id:c.id,snapshot:c.snapshot,rules:{target:selected.target}}));
    const payload={...policy.prepareOutbound(inputs,true),requestPolicy:policy.wholePostRequestPolicy};
    const estimate=policy.estimateWholePostCost(payload,model.model);
    if(!estimate.fits||!estimate.priceVersion||model.price_ack!==model.model+':'+estimate.priceVersion)throw new LocalError('MODEL_CAPACITY_OR_PRICE_ACK_REQUIRED');
    const scope={...(independent?{reviewMode,sourceEvidence:barrier.evidenceHash}:{}),runId,postId,policyId,policyRevision:selected.revision,policyVersion:selected.version,model:model.model,modelVersion:model.version,
      priceVersion:estimate.priceVersion,requestPolicy:policy.wholePostRequestPolicy,inputHash:hash(inputs),payloadHash:hash(payload),commentIds:comments.map(c=>c.id)};
    return {scope,payload,inputs,estimate,empty:inputs.length===0};
  }
  independentSource(runId,postId){
    const run=this.db.prepare('SELECT r.*,j.state job_state FROM collection_runs r JOIN jobs j ON j.id=r.job_id WHERE r.id=?').get(runId),post=this.db.prepare('SELECT * FROM run_posts WHERE id=? AND run_id=?').get(postId,runId);
    if(!run||!post||run.identity_conflict||run.reason==='LEGACY_HISTORY_READ_ONLY'||!['COMPLETE','PARTIAL'].includes(run.status)||run.job_state!=='SUCCEEDED'||post.coverage!=='COMPLETE')return {ready:false};
    const report=policy.boundedReadReportSchema.safeParse(JSON.parse(post.snapshot).boundedRead),coverage=policy.safeRunCoverage(run.coverage?JSON.parse(run.coverage):null),member=coverage?.posts.find(p=>p.postRef===post.platform_id&&p.ordinal===post.ordinal),rows=this.collection.comments(runId,postId);
    if(!report.success||report.data.state!=='COMPLETE'||!member?.complete||member.saved!==rows.length||rows.some(c=>c.source_hash!==hash(c.snapshot)||c.snapshot.coverage!=='COMPLETE'))return {ready:false};
    const total=report.data.chunkSummary||report.data.retained?.loaded;
    if(!total||(total.unique??total.uniqueKnown)!==rows.length||member.roots!==rows.filter(c=>!c.parent_id).length||member.replies!==rows.filter(c=>!!c.parent_id).length)return {ready:false};
    return {ready:true,evidenceHash:hash({runId,postId,observedAt:run.finished_at,postHash:post.content_hash,coverage:member,report:report.data,sourceHashes:rows.map(c=>c.source_hash)})};
  }
  currentScope(job){
    if(this.db.prepare("SELECT 1 FROM authorizations WHERE id=? AND issuer='AUTOMATION'").get(job.authorization_id))new(require('./automatic-review.cjs').AutomaticReview)(this.store).assertJob(job);
    const scope=JSON.parse(job.payload),plan=this.plan(scope.runId,scope.postId,scope.policyId,scope.reviewMode);
    if(hash(plan.scope)!==job.payload_hash)throw new LocalError('REVIEW_PREVIEW_CHANGED');
    return plan;
  }
  budget(){
    if(this.db.prepare("SELECT 1 FROM safety_state WHERE id='model' AND reason IS NOT NULL").get())throw new LocalError('MODEL_RECONCILIATION_REQUIRED');
    const now=this.store.clock(),model=this.db.prepare("SELECT * FROM model_profile WHERE id='qwen'").get(),day=dayAt(now),used=this.db.prepare('SELECT occupied FROM model_days WHERE day=?').get(day)?.occupied||0;
    if(!model?.authorized||(model.daily_limit!==null&&used>=model.daily_limit))throw new LocalError('MODEL_DAILY_LIMIT');
    const last=this.db.prepare("SELECT * FROM review_batches WHERE state NOT IN('CANCELLED','RESERVED') ORDER BY created_at DESC,id DESC LIMIT 1").get();
    if(last&&policy.modelCallWaitMs({status:last.state==='COMPLETED'?'COMPLETED':last.state,createdAt:new Date(last.created_at),finishedAt:last.finished_at===null?null:new Date(last.finished_at),errorCode:last.error_code},now)>0)throw new LocalError('MODEL_CALL_COOLDOWN');
    if(this.db.prepare("SELECT 1 FROM review_batches WHERE state IN('RESERVED','DISPATCHED')").get())throw new LocalError('MODEL_CALL_IN_PROGRESS');
    return {day,now};
  }
  reserve(lease){return this.store.transaction(()=>{
    const job=this.queue.current(lease);if(job.kind!=='REVIEW'||job.dispatch_started||job.cancel_requested)throw new LocalError('INVALID_REVIEW_JOB');
    const prior=this.db.prepare('SELECT * FROM review_batches WHERE job_id=?').get(job.id);if(prior){if(prior.scope_hash!==job.payload_hash)throw new LocalError('REQUEST_KEY_CONFLICT');return prior.id;}
    const grant=this.db.prepare("SELECT * FROM authorizations WHERE id=? AND purpose='REVIEW' AND state='ACTIVE' AND expires_at>?").get(job.authorization_id,this.store.clock());
    if(!grant||grant.scope_hash!==job.payload_hash)throw new LocalError('MODEL_AUTHORIZATION_REQUIRED');
    const plan=this.currentScope(job),scope=plan.scope;
    if(plan.empty)throw new LocalError('EMPTY_POST_REQUIRES_NO_MODEL_CALL');
    if(this.db.prepare("SELECT 1 FROM review_batches WHERE run_id=? AND post_id=? AND policy_id=? AND policy_revision=? AND model_version=? AND review_mode=? AND state IN('RESERVED','DISPATCHED','COMPLETED','UNKNOWN')").get(scope.runId,scope.postId,scope.policyId,scope.policyRevision,scope.modelVersion,scope.reviewMode||'FROZEN_RUN'))throw new LocalError('MODEL_BATCH_ALREADY_CLAIMED');
    const {day,now}=this.budget(),id=randomUUID();
    this.db.prepare("INSERT INTO review_batches(id,job_id,run_id,post_id,policy_id,policy_revision,policy_version,model,model_version,scope_hash,payload,inputs,state,day,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'RESERVED',?,?)")
      .run(id,job.id,scope.runId,scope.postId,scope.policyId,scope.policyRevision,scope.policyVersion,scope.model,scope.modelVersion,job.payload_hash,canonical(plan.payload),canonical(plan.inputs),day,now);
    this.db.prepare('INSERT INTO model_days VALUES(?,1) ON CONFLICT(day) DO UPDATE SET occupied=occupied+1').run(day);
    this.db.prepare('UPDATE review_batches SET review_mode=? WHERE id=?').run(scope.reviewMode||'FROZEN_RUN',id);
    this.store.audit('AUTOMATION','MODEL_CALL_RESERVED',id,{scopeHash:job.payload_hash,rows:plan.inputs.length});return id;
  });}
  dispatch(lease,batchId){return this.store.transaction(()=>{
    const job=this.queue.current(lease),batch=this.db.prepare("SELECT * FROM review_batches WHERE id=? AND job_id=? AND state='RESERVED'").get(batchId,job.id);
    const grant=this.db.prepare("SELECT * FROM authorizations WHERE id=? AND state='ACTIVE' AND expires_at>?").get(job.authorization_id,this.store.clock());
    if(job.kind!=='REVIEW'||job.dispatch_started||job.cancel_requested||!batch||!grant||grant.scope_hash!==job.payload_hash)throw new LocalError('MODEL_AUTHORIZATION_ENDED');
    const plan=this.currentScope(job),usage=this.db.prepare('SELECT occupied FROM model_days WHERE day=?').get(batch.day),profile=this.db.prepare("SELECT * FROM model_profile WHERE id='qwen'").get();
    if(dayAt(this.store.clock())!==batch.day||!usage||usage.occupied<1||(profile.daily_limit!==null&&usage.occupied>profile.daily_limit))throw new LocalError('MODEL_DAILY_LIMIT_CHANGED');
    if(this.db.prepare("SELECT 1 FROM safety_state WHERE id='model' AND reason IS NOT NULL").get())throw new LocalError('MODEL_RECONCILIATION_REQUIRED');
    this.db.prepare("UPDATE review_batches SET state='DISPATCHED' WHERE id=?").run(batchId);
    this.db.prepare('UPDATE jobs SET dispatch_started=1,updated_at=? WHERE id=?').run(this.store.clock(),job.id);
    this.db.prepare("UPDATE authorizations SET state='CONSUMED' WHERE id=?").run(grant.id);
    this.store.audit('AUTOMATION','MODEL_DISPATCH_INTENT',batchId,{scopeHash:job.payload_hash});
    return {batchId,model:batch.model,modelVersion:batch.model_version,payload:plan.payload,maxOutputTokens:plan.estimate.outputTokens,maxSubmissions:1};
  });}
  complete(lease,batchId,raw){
    const job=this.queue.current(lease),batch=this.db.prepare("SELECT * FROM review_batches WHERE id=? AND job_id=? AND state='DISPATCHED'").get(batchId,job.id);
    if(!batch)throw new LocalError('INVALID_MODEL_RESULT');
    let results;try{results=policy.validateQwenEvidence(raw,JSON.parse(batch.payload),JSON.parse(batch.inputs));}catch{return this.fail(lease,batchId,'INVALID_OUTPUT',false);}
    return this.store.transaction(()=>{
      const currentJob=this.queue.current(lease),run=this.db.prepare('SELECT * FROM collection_runs WHERE id=?').get(batch.run_id),automatic=batch.review_mode==='FROZEN_RUN'&&JSON.parse(run.read_plan).kind!=='SAVED_POST'&&!currentJob.cancel_requested;
      if(!this.db.prepare("SELECT 1 FROM review_batches WHERE id=? AND state='DISPATCHED'").get(batchId))throw new LocalError('INVALID_MODEL_RESULT');
      const inputs=new Map(JSON.parse(batch.inputs).map(x=>[x.id,x]));
      for(const r of results){const input=inputs.get(r.id);this.db.prepare('INSERT INTO review_results(id,batch_id,comment_id,source_hash,snapshot,score,context,decision,reason,evidence,automatic_contact_allowed,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(randomUUID(),batch.id,r.id,hash(input.snapshot),canonical(input.snapshot),r.score,r.context,r.decision,r.reason,canonical(r.evidence),automatic?1:0,this.store.clock());}
      this.db.prepare("UPDATE review_batches SET state='COMPLETED',finished_at=? WHERE id=? AND state='DISPATCHED'").run(this.store.clock(),batchId);
      this.db.prepare("UPDATE jobs SET state='SUCCEEDED',result=?,lease_owner=NULL,lease_until=NULL,updated_at=? WHERE id=?").run(canonical({batchId,rows:results.length}),this.store.clock(),job.id);
      this.store.audit('AUTOMATION','MODEL_BATCH_COMPLETED',batchId,{rows:results.length});return {state:'COMPLETED',rows:results.length};
    });
  }
  fail(lease,batchId,code='TRANSPORT_UNKNOWN',unknown=true){return this.store.transaction(()=>{
    const job=this.queue.current(lease),batch=this.db.prepare('SELECT * FROM review_batches WHERE id=? AND job_id=?').get(batchId,job.id);
    if(!batch||!['RESERVED','DISPATCHED'].includes(batch.state))throw new LocalError('INVALID_MODEL_RESULT');
    const state=batch.state==='RESERVED'?'CANCELLED':unknown?'UNKNOWN':'FAILED';
    this.db.prepare('UPDATE review_batches SET state=?,error_code=?,finished_at=? WHERE id=?').run(state,code,this.store.clock(),batchId);
    if(state==='CANCELLED')this.db.prepare('UPDATE model_days SET occupied=occupied-1 WHERE day=? AND occupied>0').run(batch.day);
    if(state==='UNKNOWN')this.pause(batchId);
    this.db.prepare('UPDATE jobs SET state=?,result=?,lease_owner=NULL,lease_until=NULL,updated_at=? WHERE id=?').run(state==='CANCELLED'?'FAILED':state,canonical({batchId,code}),this.store.clock(),job.id);
    this.store.audit('AUTOMATION','MODEL_BATCH_STOPPED',batchId,{state,code});return {state};
  });}
  pause(id){const event=this.store.audit('RECOVERY','MODEL_RECONCILIATION_REQUIRED',id);this.db.prepare("INSERT INTO safety_state VALUES('model',1,?,'MODEL_SUBMISSION_UNKNOWN',?) ON CONFLICT(id) DO UPDATE SET version=version+1,event_id=excluded.event_id,reason=excluded.reason,created_at=excluded.created_at").run(event,this.store.clock());}
  recover(){return this.store.transaction(()=>{
    const rows=this.db.prepare("SELECT b.* FROM review_batches b JOIN jobs j ON j.id=b.job_id WHERE b.state IN('RESERVED','DISPATCHED') AND (j.state<>'RUNNING' OR j.lease_until<=?)").all(this.store.clock());
    for(const b of rows){const unknown=b.state==='DISPATCHED';this.db.prepare('UPDATE review_batches SET state=?,error_code=?,finished_at=? WHERE id=?').run(unknown?'UNKNOWN':'CANCELLED','WORKER_INTERRUPTED',this.store.clock(),b.id);if(unknown)this.pause(b.id);else this.db.prepare('UPDATE model_days SET occupied=occupied-1 WHERE day=? AND occupied>0').run(b.day);}
    return rows.length;
  });}
  barrier(runId){
    const collected=this.collection.barrier(runId);if(!collected.ready)return collected;
    const run=this.db.prepare('SELECT * FROM collection_runs WHERE id=?').get(runId),frozen=JSON.parse(run.snapshot).strictStages.policies,posts=this.collection.posts(runId);
    if(!frozen.length)return {ready:false,reason:'本轮未启用评论匹配'};
    for(const p of frozen)for(const post of posts){
      let plan;try{plan=this.plan(runId,post.id,p.id);}catch{return {ready:false,reason:'审核配置或范围已变化'};}
      if(plan.empty)continue;
      const batch=this.db.prepare("SELECT b.* FROM review_batches b JOIN jobs j ON j.id=b.job_id WHERE b.run_id=? AND b.post_id=? AND b.policy_id=? AND b.policy_revision=? AND b.model_version=? AND b.review_mode='FROZEN_RUN' AND b.state='COMPLETED' AND j.state='SUCCEEDED' AND j.cancel_requested=0").get(runId,post.id,p.id,p.revision,p.modelVersion);
      if(!batch)return {ready:false,reason:'等待整轮全部评论审核完成'};
      const results=this.db.prepare('SELECT * FROM review_results WHERE batch_id=?').all(batch.id);
      if(results.length!==plan.inputs.length||plan.inputs.some(input=>!results.some(r=>r.comment_id===input.id&&r.source_hash===hash(input.snapshot)&&hash(JSON.parse(r.snapshot))===hash(input.snapshot))))return {ready:false,reason:'审核结果与本轮原文不一致'};
    }
    return {ready:true,reason:'整轮审核已结束'};
  }
}
module.exports={LocalReview};
