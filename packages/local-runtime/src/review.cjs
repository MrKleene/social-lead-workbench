'use strict';
const {randomUUID}=require('node:crypto');
const {LocalError,canonical,hash}=require('./database.cjs');
const {LocalQueue}=require('./queue.cjs');
const {LocalCollection}=require('./collection.cjs');
const policy=require('@crm/local-runtime/policy');
const dayAt=timestamp=>new Date(timestamp+8*3600000).toISOString().slice(0,10);
const {reviewRetryPolicy,reviewCommentPolicy,classifyReviewError}=policy;
const segmentSize=reviewRetryPolicy.chunkSize,maxCommentChars=reviewCommentPolicy.maxChars;
const commentText=c=>String(c.snapshot&&c.snapshot.comment||'').trim(),commentTooLong=text=>[...text].length>maxCommentChars;
const barrierSql='SELECT r.comment_id,r.source_hash,r.snapshot FROM review_results r JOIN review_batches b ON b.id=r.batch_id JOIN jobs j ON j.id=b.job_id '
 +"WHERE b.run_id=? AND b.post_id=? AND b.policy_id=? AND b.policy_revision=? AND b.model_version=? AND b.review_mode='FROZEN_RUN' AND b.state='COMPLETED' AND j.state='SUCCEEDED' AND j.cancel_requested=0";
class LocalReview {
  constructor(store){this.store=store;this.db=store.db;this.queue=new LocalQueue(store);this.collection=new LocalCollection(store);}
  /** 可送审评论：正文为空（只有图片/表情或被删除）或超过长度上限的评论不送审，永久留在模型请求之外。 */
  reviewableComments(runId,postId){return this.collection.comments(runId,postId).filter(c=>{const text=commentText(c);return text!==''&&!commentTooLong(text);});}
  /** 因正文超长而不送审的评论；与 reviewableComments 互斥。 */
  skippedComments(runId,postId){return this.collection.comments(runId,postId).filter(c=>{const text=commentText(c);return text!==''&&commentTooLong(text);});}
  plan(runId,postId,policyId,reviewMode,reviewedKeys,options={}){
    if(reviewMode!==undefined&&reviewMode!=='INDEPENDENT')throw new LocalError('INVALID_REVIEW_MODE');
    const independent=reviewMode==='INDEPENDENT';
    const barrier=independent?this.independentSource(runId,postId):this.collection.barrier(runId);if(!barrier.ready)throw new LocalError('COLLECTION_BARRIER_NOT_READY');
    const run=this.db.prepare('SELECT * FROM collection_runs WHERE id=?').get(runId),post=this.db.prepare("SELECT * FROM run_posts WHERE id=? AND run_id=? AND coverage='COMPLETE'").get(postId,runId);
    const selected=this.db.prepare('SELECT * FROM review_policies WHERE id=?').get(policyId),model=this.db.prepare("SELECT * FROM model_profile WHERE id='qwen'").get();
    const config=this.db.prepare('SELECT * FROM configurations WHERE id=?').get(run.config_id),frozen=JSON.parse(run.snapshot).strictStages.policies.find(p=>p.id===policyId);
    if(!post||!independent&&(!config||config.archived||config.revision!==run.revision))throw new LocalError('REVIEW_SOURCE_CHANGED');
    if(!selected?.enabled||(!independent&&(!frozen||selected.version!==frozen.version||selected.revision!==frozen.revision||selected.model_version!==frozen.modelVersion)))throw new LocalError('REVIEW_POLICY_CHANGED');
    if(!model?.authorized||model.version!==(independent?selected.model_version:frozen.modelVersion)||model.consent!=='beijing-original-comments-v2')throw new LocalError('MODEL_AUTHORIZATION_REQUIRED');
    const skip=reviewedKeys&&new Set(reviewedKeys),pinned=options.commentIds&&new Set(options.commentIds);
    const comments=this.reviewableComments(runId,postId).filter(c=>(!pinned||pinned.has(c.id))&&(!skip||!skip.has(c.platform_id+'\u0000'+c.source_hash)));
    const inputs=comments.map(c=>({id:c.id,snapshot:c.snapshot,rules:{target:selected.target}}));
    const payload={...policy.prepareOutbound(inputs,true),requestPolicy:policy.wholePostRequestPolicy};
    const estimate=policy.estimateWholePostCost(payload,model.model);
    if(!estimate.fits||!estimate.priceVersion||model.price_ack!==model.model+':'+estimate.priceVersion)throw new LocalError('MODEL_CAPACITY_OR_PRICE_ACK_REQUIRED');
    const scope={...(independent?{reviewMode,sourceEvidence:barrier.evidenceHash}:{}),runId,postId,policyId,policyRevision:selected.revision,policyVersion:selected.version,model:model.model,modelVersion:model.version,
      priceVersion:estimate.priceVersion,requestPolicy:policy.wholePostRequestPolicy,inputHash:hash(inputs),payloadHash:hash(payload),commentIds:comments.map(c=>c.id),
      segmentNo:options.segmentNo??0,attemptNo:options.attemptNo??1};
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
  /** 以原始评论顺序按固定大小切成段；段号只取决于本轮保存的评论顺序。 */
  commentSegments(runId,postId,size=segmentSize){
    const comments=this.reviewableComments(runId,postId),segments=[];
    for(let index=0;index<comments.length;index+=size)segments.push({segmentNo:Math.floor(index/size),comments:comments.slice(index,index+size)});
    return {comments,segments};
  }
  /** 跨轮已审评论（同一规则修订下），键为 platform_id + NUL + source_hash。 */
  reviewedKeys(policyId,policyRevision){
    return new Set(this.db.prepare('SELECT c.platform_id platform_id,c.source_hash source_hash FROM review_results r JOIN review_batches b ON b.id=r.batch_id JOIN run_comments c ON c.id=r.comment_id WHERE b.policy_id=? AND b.policy_revision=?').all(policyId,policyRevision).map(r=>r.platform_id+'\u0000'+r.source_hash));
  }
  /** 当前轮每段的请求状态；自动审核只推进一段，手动预览跳过在途段。 */
  segmentStates(runId,postId,policyId,policyRevision){
    const states=new Map();
    for(const row of this.db.prepare('SELECT segment_no,state,retryable,attempt_no FROM review_batches WHERE run_id=? AND post_id=? AND policy_id=? AND policy_revision=? ORDER BY segment_no,attempt_no').all(runId,postId,policyId,policyRevision)){
      const current=states.get(row.segment_no)||{};states.set(row.segment_no,{...current,batchState:row.state,retryable:row.retryable===1,maxAttempt:Math.max(current.maxAttempt||0,row.attempt_no)});
    }
    for(const row of this.db.prepare("SELECT coalesce(json_extract(payload,'$.segmentNo'),0) segment_no,coalesce(json_extract(payload,'$.attemptNo'),1) attempt_no,state FROM jobs WHERE kind='REVIEW' AND json_extract(payload,'$.runId')=? AND json_extract(payload,'$.postId')=? AND json_extract(payload,'$.policyId')=? ORDER BY created_at").all(runId,postId,policyId)){
      const current=states.get(row.segment_no)||{};states.set(row.segment_no,{...current,jobStates:[...(current.jobStates||[]),row.state],maxAttempt:Math.max(current.maxAttempt||0,row.attempt_no)});
    }
    return states;
  }
  currentScope(job){
    if(this.db.prepare("SELECT 1 FROM authorizations WHERE id=? AND issuer='AUTOMATION'").get(job.authorization_id))new(require('./automatic-review.cjs').AutomaticReview)(this.store).assertJob(job);
    const scope=JSON.parse(job.payload),plan=this.plan(scope.runId,scope.postId,scope.policyId,scope.reviewMode,undefined,{commentIds:scope.commentIds,segmentNo:scope.segmentNo,attemptNo:scope.attemptNo});
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
    // 同一段只允许一个在途/未知请求；已完成的段不再阻止后续段。
    if(this.db.prepare("SELECT 1 FROM review_batches WHERE run_id=? AND post_id=? AND policy_id=? AND policy_revision=? AND model_version=? AND segment_no=? AND review_mode=? AND state IN('RESERVED','DISPATCHED','UNKNOWN')").get(scope.runId,scope.postId,scope.policyId,scope.policyRevision,scope.modelVersion,scope.segmentNo,scope.reviewMode||'FROZEN_RUN'))throw new LocalError('MODEL_BATCH_ALREADY_CLAIMED');
    const {day,now}=this.budget(),id=randomUUID();
    this.db.prepare("INSERT INTO review_batches(id,job_id,run_id,post_id,policy_id,policy_revision,policy_version,model,model_version,scope_hash,payload,inputs,state,day,created_at,segment_no,attempt_no) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'RESERVED',?,?,?,?)")
      .run(id,job.id,scope.runId,scope.postId,scope.policyId,scope.policyRevision,scope.policyVersion,scope.model,scope.modelVersion,job.payload_hash,canonical(plan.payload),canonical(plan.inputs),day,now,scope.segmentNo,scope.attemptNo);
    this.db.prepare('INSERT INTO model_days VALUES(?,1) ON CONFLICT(day) DO UPDATE SET occupied=occupied+1').run(day);
    this.db.prepare('UPDATE review_batches SET review_mode=? WHERE id=?').run(scope.reviewMode||'FROZEN_RUN',id);
    this.store.audit('AUTOMATION','MODEL_CALL_RESERVED',id,{scopeHash:job.payload_hash,rows:plan.inputs.length,segmentNo:scope.segmentNo,attemptNo:scope.attemptNo});return id;
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
    this.store.audit('AUTOMATION','MODEL_DISPATCH_INTENT',batchId,{scopeHash:job.payload_hash,segmentNo:batch.segment_no,attemptNo:batch.attempt_no});
    return {batchId,model:batch.model,modelVersion:batch.model_version,payload:plan.payload,maxOutputTokens:plan.estimate.outputTokens,maxSubmissions:1};
  });}
  complete(lease,batchId,raw){
    const job=this.queue.current(lease),batch=this.db.prepare("SELECT * FROM review_batches WHERE id=? AND job_id=? AND state='DISPATCHED'").get(batchId,job.id);
    if(!batch)throw new LocalError('INVALID_MODEL_RESULT');
    let results;try{results=policy.validateQwenEvidence(raw,JSON.parse(batch.payload),JSON.parse(batch.inputs));}catch(error){return this.fail(lease,batchId,{code:'INVALID_OUTPUT',detail:error&&typeof error.code==='string'?error.code:null});}
    return this.store.transaction(()=>{
      const currentJob=this.queue.current(lease),run=this.db.prepare('SELECT * FROM collection_runs WHERE id=?').get(batch.run_id),automatic=batch.review_mode==='FROZEN_RUN'&&JSON.parse(run.read_plan).kind!=='SAVED_POST'&&!currentJob.cancel_requested;
      if(!this.db.prepare("SELECT 1 FROM review_batches WHERE id=? AND state='DISPATCHED'").get(batchId))throw new LocalError('INVALID_MODEL_RESULT');
      const inputs=new Map(JSON.parse(batch.inputs).map(x=>[x.id,x]));
      for(const r of results){const input=inputs.get(r.id);this.db.prepare('INSERT INTO review_results(id,batch_id,comment_id,source_hash,snapshot,score,context,decision,reason,evidence,automatic_contact_allowed,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(randomUUID(),batch.id,r.id,hash(input.snapshot),canonical(input.snapshot),r.score,r.context,r.decision,r.reason,canonical(r.evidence),automatic?1:0,this.store.clock());}
      this.db.prepare("UPDATE review_batches SET state='COMPLETED',finished_at=? WHERE id=? AND state='DISPATCHED'").run(this.store.clock(),batchId);
      this.db.prepare("UPDATE jobs SET state='SUCCEEDED',result=?,lease_owner=NULL,lease_until=NULL,updated_at=? WHERE id=?").run(canonical({batchId,rows:results.length}),this.store.clock(),job.id);
      this.store.audit('AUTOMATION','MODEL_BATCH_COMPLETED',batchId,{rows:results.length,segmentNo:batch.segment_no,attemptNo:batch.attempt_no});return {state:'COMPLETED',rows:results.length};
    });
  }
  /** 失败必须带上“是否确定没有结果”。未知结果只暂停对账，绝不自动重试。 */
  fail(lease,batchId,failure='TRANSPORT_UNKNOWN',unknown){
    // 只覆盖调用方确实知道的字段，未知字段仍用分类默认值。
    const source=typeof failure==='string'?{code:failure}:failure||{code:'TRANSPORT_UNKNOWN'},classified=classifyReviewError(source.code??'TRANSPORT_UNKNOWN',source.httpStatus??null),detail={...classified,code:source.code??classified.code,errorDetail:typeof source.detail==='string'?source.detail:null};
    for(const key of ['stage','retryable','unknown','httpStatus'])if(source[key]!==undefined)detail[key]=source[key];
    if(typeof unknown==='boolean')detail.unknown=unknown;
    return this.store.transaction(()=>{
      const job=this.queue.current(lease),batch=this.db.prepare('SELECT * FROM review_batches WHERE id=? AND job_id=?').get(batchId,job.id);
      if(!batch||!['RESERVED','DISPATCHED'].includes(batch.state))throw new LocalError('INVALID_MODEL_RESULT');
      const state=batch.state==='RESERVED'?'CANCELLED':detail.unknown?'UNKNOWN':'FAILED';
      this.db.prepare('UPDATE review_batches SET state=?,error_code=?,error_stage=?,http_status=?,retryable=?,error_detail=?,finished_at=? WHERE id=?').run(state,detail.code,detail.stage??null,detail.httpStatus??null,detail.retryable?1:0,detail.errorDetail,this.store.clock(),batchId);
      if(state==='CANCELLED')this.db.prepare('UPDATE model_days SET occupied=occupied-1 WHERE day=? AND occupied>0').run(batch.day);
      if(state==='UNKNOWN')this.pause(batchId);
      let retryId=null;
      if(state==='FAILED'&&detail.retryable&&batch.attempt_no<reviewRetryPolicy.maxAttempts&&!job.cancel_requested)retryId=this.scheduleRetry(job,batch,detail);
      else if(state==='FAILED')this.pausePost(batch,detail.code);
      this.db.prepare('UPDATE jobs SET state=?,result=?,lease_owner=NULL,lease_until=NULL,updated_at=? WHERE id=?').run(state==='CANCELLED'?'FAILED':state,canonical({batchId,code:detail.code,detail:detail.errorDetail,stage:detail.stage??null,attemptNo:batch.attempt_no,retryJobId:retryId}),this.store.clock(),job.id);
      this.store.audit('AUTOMATION','MODEL_BATCH_STOPPED',batchId,{state,code:detail.code,detail:detail.errorDetail,stage:detail.stage??null,httpStatus:detail.httpStatus??null,retryable:!!detail.retryable,attemptNo:batch.attempt_no,retryJobId:retryId});
      return {state,retryJobId:retryId};
    });
  }
  /** 可重试失败：保留旧批次，新开一次尝试；授权沿用同一签发者与父证明。 */
  scheduleRetry(job,batch,detail){
    const scope={...JSON.parse(job.payload),attemptNo:batch.attempt_no+1},grant=this.db.prepare('SELECT * FROM authorizations WHERE id=?').get(job.authorization_id);
    if(!grant)return null;
    const now=this.store.clock(),wait=detail.code==='RATE_LIMIT'?reviewRetryPolicy.rateLimitWaitMs:reviewRetryPolicy.failureWaitMs,id=randomUUID(),auth=randomUUID(),body=canonical(scope),digest=hash(scope);
    this.db.prepare("INSERT INTO authorizations(id,purpose,scope,scope_hash,state,created_at,expires_at,issuer,parent_proof) VALUES(?,'REVIEW',?,?,'ACTIVE',?,?,?,?)").run(auth,body,digest,now,now+900000,grant.issuer??'LOCAL_USER',grant.parent_proof??null);
    this.db.prepare("INSERT INTO jobs(id,request_key,kind,payload,payload_hash,authorization_id,state,available_at,created_at,updated_at) VALUES(?,?,'REVIEW',?,?,?,'QUEUED',?,?,?)").run(id,(job.request_key||'review').slice(0,80)+':retry:'+(batch.attempt_no+1),body,digest,auth,now+wait,now,now);
    if(grant.issuer==='AUTOMATION'){
      this.db.prepare('INSERT INTO automatic_review_segments(run_id,post_id,policy_id,segment_no,attempt_no,job_id,reason,created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(run_id,post_id,policy_id,segment_no,attempt_no) DO UPDATE SET job_id=excluded.job_id,reason=excluded.reason').run(batch.run_id,batch.post_id,batch.policy_id,batch.segment_no,batch.attempt_no+1,id,'RETRY',now);
      this.db.prepare('UPDATE automatic_review_tasks SET job_id=?,reason=? WHERE run_id=? AND post_id=? AND policy_id=?').run(id,'RETRY',batch.run_id,batch.post_id,batch.policy_id);
    }
    this.store.audit('AUTOMATION','MODEL_BATCH_RETRY_SCHEDULED',batch.id,{code:detail.code,nextAttempt:batch.attempt_no+1,jobId:id,waitMs:wait});return id;
  }
  pausePost(batch,reason){
    const now=this.store.clock(),id=batch.run_id+':'+batch.post_id+':'+batch.policy_id;
    this.db.prepare("INSERT INTO review_pauses(id,run_id,post_id,policy_id,kind,reason,created_at) VALUES(?,?,?,?,'POST',?,?) ON CONFLICT(id) DO UPDATE SET reason=excluded.reason,created_at=excluded.created_at").run(id,batch.run_id,batch.post_id,batch.policy_id,reason,now);
    const failed=this.db.prepare("SELECT count(*) n FROM review_batches WHERE run_id=? AND state='FAILED' AND retryable=0").get(batch.run_id).n;
    if(failed>=3)this.pauseQueue(batch.run_id,reason);
  }
  pauseQueue(runId,reason){
    const now=this.store.clock(),id='queue:'+runId;
    this.db.prepare("INSERT INTO review_pauses(id,run_id,post_id,policy_id,kind,reason,created_at) VALUES(?,?,NULL,NULL,'QUEUE',?,?) ON CONFLICT(id) DO UPDATE SET reason=excluded.reason,created_at=excluded.created_at").run(id,runId,reason,now);
    this.store.audit('RECOVERY','REVIEW_QUEUE_PAUSED',runId,{reason});
  }
  pauses(runId){return this.db.prepare('SELECT id,run_id,post_id,policy_id,kind,reason,created_at FROM review_pauses WHERE run_id=? ORDER BY created_at,id').all(runId).map(p=>({id:p.id,runId:p.run_id,postId:p.post_id,policyId:p.policy_id,kind:p.kind,reason:p.reason,createdAt:p.created_at}));}
  clearPauses(runId,postId,policyId){this.db.prepare("DELETE FROM review_pauses WHERE run_id=? AND (kind='QUEUE' OR (post_id=? AND policy_id=?))").run(runId,postId,policyId);}
  /** 卡住的模型请求：提交结果未知、又没有对账证据的批次。作废通道只列这些。 */
  unknown(){return this.db.prepare("SELECT b.id,b.run_id,b.post_id,b.created_at,b.error_code,j.id job_id FROM review_batches b LEFT JOIN jobs j ON j.id=b.job_id WHERE b.state='UNKNOWN' ORDER BY b.created_at").all().map(r=>({batchId:r.id,runId:r.run_id,postId:r.post_id,jobId:r.job_id??null,createdAt:r.created_at,errorCode:r.error_code??null}));}
  discard({batchId,consent}){
   if(consent!=='discard-unknown-model-submission-v1')throw new LocalError('MODEL_DISCARD_CONSENT_REQUIRED');
   if(typeof batchId!=='string'||!batchId||batchId.length>200)throw new LocalError('INVALID_MODEL_RESULT');
   return this.store.transaction(()=>{
    const batch=this.db.prepare("SELECT * FROM review_batches WHERE id=? AND state='UNKNOWN'").get(batchId);
    if(!batch)throw new LocalError('MODEL_BATCH_NOT_DISCARDABLE');
    this.db.prepare("UPDATE review_batches SET state='FAILED',error_code='DISCARDED_BY_USER',finished_at=? WHERE id=? AND state='UNKNOWN'").run(this.store.clock(),batchId);
    if(batch.job_id)this.db.prepare("UPDATE jobs SET state='FAILED',result=?,lease_owner=NULL,lease_until=NULL,updated_at=? WHERE id=? AND state IN('UNKNOWN','RUNNING')").run(canonical({batchId,state:'DISCARDED_BY_USER'}),this.store.clock(),batch.job_id);
    if(!this.db.prepare("SELECT 1 FROM review_batches WHERE state='UNKNOWN'").get())this.db.prepare("DELETE FROM safety_state WHERE id='model'").run();
    this.store.audit('LOCAL_USER','MODEL_UNKNOWN_DISCARDED',batchId,{runId:batch.run_id,postId:batch.post_id});
    return {discarded:true,batchId,remaining:this.unknown().length};
   });
  }
  pause(id){const event=this.store.audit('RECOVERY','MODEL_RECONCILIATION_REQUIRED',id);this.db.prepare("INSERT INTO safety_state VALUES('model',1,?,'MODEL_SUBMISSION_UNKNOWN',?) ON CONFLICT(id) DO UPDATE SET version=version+1,event_id=excluded.event_id,reason=excluded.reason,created_at=excluded.created_at").run(event,this.store.clock());}
  recover(){return this.store.transaction(()=>{
    const rows=this.db.prepare("SELECT b.* FROM review_batches b JOIN jobs j ON j.id=b.job_id WHERE b.state IN('RESERVED','DISPATCHED') AND (j.state<>'RUNNING' OR j.lease_until<=?)").all(this.store.clock());
    for(const b of rows){const unknown=b.state==='DISPATCHED';this.db.prepare('UPDATE review_batches SET state=?,error_code=?,finished_at=? WHERE id=?').run(unknown?'UNKNOWN':'CANCELLED','WORKER_INTERRUPTED',this.store.clock(),b.id);if(unknown)this.pause(b.id);else this.db.prepare('UPDATE model_days SET occupied=occupied-1 WHERE day=? AND occupied>0').run(b.day);}
    return rows.length;
  });}
  /** 完成判定按评论而不是按批次：同一规则修订下每条评论都恰好有一条原文一致的结果。 */
  barrier(runId){
    const collected=this.collection.barrier(runId);if(!collected.ready)return collected;
    const run=this.db.prepare('SELECT * FROM collection_runs WHERE id=?').get(runId),frozen=JSON.parse(run.snapshot).strictStages.policies,posts=this.collection.posts(runId).filter(post=>post.coverage==='COMPLETE');
    if(!frozen.length)return {ready:false,reason:'本轮未启用评论匹配'};
    // 完成判定按评论：整帖请求容量不是完成条件，每条可送审评论都必须恰有一条对应原文的结果。
    for(const p of frozen)for(const post of posts){
      const comments=this.reviewableComments(runId,post.id);
      if(!comments.length)continue;
      const skipped=new Set(this.skippedComments(runId,post.id).map(c=>c.id));
      const results=this.db.prepare(barrierSql).all(runId,post.id,p.id,p.revision,p.modelVersion).filter(r=>!skipped.has(r.comment_id));
      if(results.length!==comments.length)return {ready:false,reason:'等待整轮全部评论审核完成'};
      const byComment=new Map();for(const r of results){const list=byComment.get(r.comment_id)||[];list.push(r);byComment.set(r.comment_id,list);}
      for(const comment of comments){const list=byComment.get(comment.id)||[],expected=hash(comment.snapshot);if(list.length!==1||list[0].source_hash!==expected||hash(JSON.parse(list[0].snapshot))!==expected)return {ready:false,reason:'审核结果与本轮原文不一致'};}
    }
    return {ready:true,reason:'整轮审核已结束'};
  }
}
module.exports={LocalReview};
