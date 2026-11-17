'use strict';
const {randomUUID}=require('node:crypto');
const {LocalError,hash,canonical}=require('./database.cjs'),{LocalReview}=require('./review.cjs'),{reviewRetryPolicy}=require('@crm/local-runtime/policy');
const inFlight=new Set(['QUEUED','RUNNING','UNKNOWN']);
class RunReview{
 constructor(store){this.store=store;this.db=store.db;this.review=new LocalReview(store);}
 /** 只把尚无结果、也不在途的段切成请求；失败段在人工重试时作为新尝试重新进入。 */
 preview({runId}){
 const run=this.db.prepare('SELECT snapshot FROM collection_runs WHERE id=?').get(runId);if(!run)throw new LocalError('RUN_NOT_FOUND');const frozen=JSON.parse(run.snapshot).strictStages,batches=[];let skipped=0;
 for(const post of this.db.prepare('SELECT id FROM run_posts WHERE run_id=? ORDER BY ordinal').all(runId))for(const p of frozen.policies){
  const reviewed=this.review.reviewedKeys(p.id,p.revision),states=this.review.segmentStates(runId,post.id,p.id,p.revision),{segments}=this.review.commentSegments(runId,post.id);
  for(const segment of segments){
   const state=states.get(segment.segmentNo)||{},running=state.batchState&&['RESERVED','DISPATCHED','UNKNOWN'].includes(state.batchState)||(state.jobStates||[]).some(s=>inFlight.has(s))||state.batchState==='COMPLETED';
   if(running){skipped++;continue;}
   // 已审评论在同一规则修订下不再计费；重试段沿用新尝试号，历史失败批次保留。
   const plan=this.review.plan(runId,post.id,p.id,undefined,reviewed,{segmentNo:segment.segmentNo,commentIds:segment.comments.map(c=>c.id),attemptNo:(state.maxAttempt||0)+1});
   if(plan.empty){skipped++;continue;}batches.push({scope:plan.scope,comments:plan.inputs.length,estimatedMicros:plan.estimate.estimatedMicros});
  }
 }
 if(batches.length>100)throw new LocalError('RUN_REVIEW_BATCH_LIMIT');const scope={runId,batches,automaticRules:(frozen.contactRules||[]).length};if(Buffer.byteLength(canonical(scope))>60000)throw new LocalError('RUN_REVIEW_BATCH_LIMIT');return {scope,previewHash:hash(scope),requests:batches.length,comments:batches.reduce((n,b)=>n+b.comments,0),estimatedMicros:batches.some(b=>b.estimatedMicros===null)?null:batches.reduce((n,b)=>n+b.estimatedMicros,0),skipped,pauses:this.review.pauses(runId),minutes:15};
 }
 authorize({scope,previewHash,requestKey,consent}){return this.store.transaction(()=>{
 if(consent!=='review-exact-new-run-batches-v1'||!scope||hash(scope)!==previewHash||typeof requestKey!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(requestKey))throw new LocalError('MODEL_CONSENT_REQUIRED');
 const prior=this.db.prepare("SELECT details FROM audit_events WHERE action='RUN_REVIEW_AUTHORIZED' AND entity_id=? ORDER BY id LIMIT 1").get(requestKey);if(prior){const p=JSON.parse(prior.details);if(p.previewHash!==previewHash)throw new LocalError('REQUEST_KEY_CONFLICT');return {ids:p.ids};}
 const plan=this.preview({runId:scope.runId});if(plan.previewHash!==previewHash||!plan.requests)throw new LocalError('REVIEW_PREVIEW_CHANGED');this.review.budget();
 const model=this.db.prepare("SELECT daily_limit FROM model_profile WHERE id='qwen'").get(),day=require('./send-safety.cjs').dayAt(this.store.clock()),used=this.db.prepare('SELECT occupied FROM model_days WHERE day=?').get(day)?.occupied??0,pending=this.db.prepare("SELECT count(*) n FROM jobs j JOIN authorizations a ON a.id=j.authorization_id WHERE j.kind='REVIEW' AND j.state='QUEUED' AND a.state='ACTIVE' AND a.expires_at>?").get(this.store.clock()).n;
 if(model.daily_limit!==null&&used+pending+plan.requests>model.daily_limit)throw new LocalError('MODEL_DAILY_LIMIT');
 const ids=plan.scope.batches.map((b,i)=>{const grant=randomUUID(),id=randomUUID(),now=this.store.clock(),body=canonical(b.scope),digest=hash(b.scope);this.db.prepare("INSERT INTO authorizations(id,purpose,scope,scope_hash,state,created_at,expires_at) VALUES(?,'REVIEW',?,?,'ACTIVE',?,?)").run(grant,body,digest,now,now+900000);this.db.prepare("INSERT INTO jobs(id,request_key,kind,payload,payload_hash,authorization_id,state,available_at,created_at,updated_at) VALUES(?,?,'REVIEW',?,?,?,'QUEUED',?,?,?)").run(id,'run-review:'+hash({requestKey,i}),body,digest,grant,now,now,now);this.store.audit('LOCAL_USER','MODEL_BATCH_AUTHORIZED_IN_RUN',id,{scopeHash:digest,requestKey});return id;});
 // 人工重试即恢复：清除该帖与整轮的审核暂停，后续失败再重新累计。
 for(const b of plan.scope.batches)this.review.clearPauses(b.scope.runId,b.scope.postId,b.scope.policyId);
 this.store.audit('LOCAL_USER','RUN_REVIEW_AUTHORIZED',requestKey,{previewHash,ids});return {ids};
 });}
}
module.exports={RunReview};
