'use strict';
const {randomUUID}=require('node:crypto');
const {LocalError,canonical,hash}=require('./database.cjs');
const {LocalQueue}=require('./queue.cjs');
const policy=require('./policy.cjs');
const account=(db,id,revision)=>{
  const row=db.prepare("SELECT * FROM accounts WHERE id=? AND state='VERIFIED'").get(id);
  if(!row||row.revision!==revision||!row.session_ref||!row.platform_user_id)throw new LocalError('ACCOUNT_IDENTITY_CHANGED');
  return row;
};
class LocalCollection {
  constructor(store){this.store=store;this.db=store.db;this.queue=new LocalQueue(store);}
  start(lease){return this.store.transaction(()=>{
    const job=this.queue.current(lease),scope=JSON.parse(job.payload);
    if(job.kind!=='COLLECT'||!job.dispatch_started||job.cancel_requested)throw new LocalError('COLLECTION_AUTHORIZATION_REQUIRED');
    const configuration=this.db.prepare("SELECT * FROM configurations WHERE id=? AND kind='KEYWORDS' AND archived=0").get(scope.configId);
    if(!configuration||configuration.revision!==scope.configRevision)throw new LocalError('COLLECTION_CONFIGURATION_CHANGED');
    account(this.db,scope.accountId,scope.accountRevision);
    const stages=policy.stagePlanSchema.parse(scope.strictStages),plan=scope.readPlan;
    if(new Set(stages.policies.map(p=>p.id)).size!==stages.policies.length||!plan||!['SEARCH','SAVED_POST'].includes(plan.kind)||!Number.isInteger(plan.batchLimit)||plan.batchLimit<1||plan.batchLimit>10||plan.kind==='SAVED_POST'&&(plan.batchLimit!==1||typeof plan.postId!=='string'||!plan.postId))throw new LocalError('INVALID_COLLECTION_PLAN');
    for(const frozen of stages.policies){const p=this.db.prepare('SELECT * FROM review_policies WHERE id=?').get(frozen.id);if(!p||!p.enabled||p.version!==frozen.version||p.revision!==frozen.revision||p.model_version!==frozen.modelVersion)throw new LocalError('REVIEW_POLICY_CHANGED');}
    const rules=scope.strictStages.contactRules??[];
    if(!Array.isArray(rules)||rules.length>100||new Set(rules.map(r=>r.id)).size!==rules.length)throw new LocalError('INVALID_CONTACT_RULES');
    for(const ref of rules){const r=new (require('./contact.cjs').LocalContact)(this.store).frozen(ref);if(!stages.policies.some(p=>p.id===r.policy_id&&p.revision===r.policy_revision))throw new LocalError('CONTACT_RULE_POLICY_MISSING');}
    const spec=policy.configInput.parse({name:configuration.name,platform:'XHS',mode:'XHS_MCP',keywords:JSON.parse(configuration.body).keywords,excludeWords:JSON.parse(configuration.body).excludeWords||[],batchLimit:plan.batchLimit,enabled:true});
    const existing=this.db.prepare('SELECT id,status FROM collection_runs WHERE job_id=?').get(job.id);
    if(existing){if(existing.status!=='RUNNING')throw new LocalError('COLLECTION_ALREADY_FINISHED');return existing.id;}
    this.db.prepare("INSERT INTO collection_runs(id,job_id,config_id,revision,account_id,account_revision,snapshot,read_plan,status,created_at) VALUES(?,?,?,?,?,?,?,?,'RUNNING',?)")
      .run(job.id,job.id,configuration.id,configuration.revision,scope.accountId,scope.accountRevision,canonical({...spec,strictStages:scope.strictStages}),canonical(plan),this.store.clock());
    this.store.audit('AUTOMATION','COLLECTION_STARTED',job.id,{configurationRevision:configuration.revision});return job.id;
  });}
  current(lease,runId){
    const job=this.queue.current(lease),run=this.db.prepare('SELECT * FROM collection_runs WHERE id=? AND job_id=?').get(runId,job.id);
    if(job.kind!=='COLLECT'||job.cancel_requested||!run||run.cancel_requested||run.status!=='RUNNING')throw new LocalError('COLLECTION_NOT_RUNNING');
    const config=this.db.prepare('SELECT revision,archived FROM configurations WHERE id=?').get(run.config_id);
    if(!config||config.archived||config.revision!==run.revision)throw new LocalError('COLLECTION_CONFIGURATION_CHANGED');
    account(this.db,run.account_id,run.account_revision);return run;
  }
  checkpoint(lease,runId,entries){
    if(!Array.isArray(entries)||entries.length>10)throw new LocalError('CAPTURE_BOUND');
    return this.store.transaction(()=>{
      const run=this.current(lease,runId),plan=JSON.parse(run.read_plan);let addedPosts=0,addedComments=0,conflicts=0;
      const conflict=(platformId,kind,observed)=>{this.db.prepare('INSERT INTO capture_conflicts(run_id,platform_id,kind,observed,created_at) VALUES(?,?,?,?,?)').run(runId,platformId,kind,canonical(observed),this.store.clock());this.db.prepare('UPDATE collection_runs SET identity_conflict=1 WHERE id=?').run(runId);conflicts++;};
      for(const entry of entries){
        const parsed=policy.postSchema.parse(entry.post),{sourceReference,...post}=parsed;
        // Source access references must be sealed by the adapter, never persisted as plaintext here.
        if(plan.kind==='SAVED_POST'&&plan.postId!==post.id)throw new LocalError('POST_OUTSIDE_READ_PLAN');
        if(!Array.isArray(entry.comments)||entry.comments.length>800)throw new LocalError('CAPTURE_BOUND');
        const comments=entry.comments.map(c=>policy.commentSchema.parse(c)),contentHash=hash({id:post.id,title:post.title,body:post.body||''});
        let saved=this.db.prepare('SELECT * FROM run_posts WHERE run_id=? AND platform_id=?').get(runId,post.id);
        if(saved&&saved.content_hash!==contentHash){conflict(post.id,'POST_TEXT_CHANGED',post);continue;}
        const reference=entry.sourceReferenceRef??null;if(reference!==null&&(typeof reference!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(reference)))throw new LocalError('INVALID_SOURCE_REFERENCE');
        if(!saved){
          const count=this.db.prepare('SELECT count(*) n FROM run_posts WHERE run_id=?').get(runId).n;
          if(count>=plan.batchLimit)throw new LocalError('POST_OUTSIDE_READ_PLAN');
          const id=randomUUID();this.db.prepare('INSERT INTO run_posts(id,run_id,platform_id,snapshot,content_hash,ordinal,source_reference_ref) VALUES(?,?,?,?,?,?,?)').run(id,runId,post.id,canonical(post),contentHash,count+1,reference);saved=this.db.prepare('SELECT * FROM run_posts WHERE id=?').get(id);addedPosts++;
        }else this.db.prepare('UPDATE run_posts SET snapshot=?,source_reference_ref=coalesce(?,source_reference_ref) WHERE id=?').run(canonical({...JSON.parse(saved.snapshot),...post}),reference,saved.id);
        for(const c of comments){
          const old=this.db.prepare('SELECT * FROM run_comments WHERE run_id=? AND platform_id=?').get(runId,c.id);
          if(old){if(old.post_id!==saved.id||old.user_id!==c.userId||old.body!==c.text||(old.parent_id||null)!==(c.parentId||null))conflict(c.id,'COMMENT_IDENTITY_OR_TEXT_CHANGED',c);continue;}
          const ordinal=this.db.prepare('SELECT count(*) n FROM run_comments WHERE post_id=?').get(saved.id).n+1;if(ordinal>800)throw new LocalError('CAPTURE_BOUND');
          const snapshot={...policy.semanticSnapshot(post,c,undefined,false,false),authorNickname:c.nickname,...(c.replyTarget?{replyTarget:c.replyTarget}:{}),...(c.replyTargetConflict?{replyTargetConflict:true}:{})};
          this.db.prepare('INSERT INTO run_comments(id,run_id,post_id,platform_id,user_id,parent_id,body,snapshot,source_hash,ordinal) VALUES(?,?,?,?,?,?,?,?,?,?)')
            .run(randomUUID(),runId,saved.id,c.id,c.userId,c.parentId||null,c.text,canonical(snapshot),hash(snapshot),ordinal);addedComments++;
        }
        if(entry.chunk){
          const receipt=policy.commentChunkSchema.pick({checkpoint:true,hash:true,replaying:true,remainingAnchors:true}).parse(entry.chunk),chunkComments=(entry.chunkComments??[]).map(c=>policy.commentSchema.parse(c)),prior=this.db.prepare('SELECT * FROM run_checkpoints WHERE post_id=?').get(saved.id),previous=prior?JSON.parse(prior.checkpoint):{version:1,sequence:0,marks:[]};
          if(prior?.hash===receipt.hash){
            if(hash(previous)!==hash(receipt.checkpoint)||receipt.replaying&&chunkComments.length)throw new LocalError('CHECKPOINT_REPLAY_CONFLICT');
            for(const c of chunkComments){const m=previous.marks.find(m=>m.id===c.id);if(!m||m.digest!==policy.commentDigest(post.id,c))throw new LocalError('CHECKPOINT_REPLAY_CONFLICT');}
          }else policy.validateChunk(previous,receipt,post.id,chunkComments);
          const retained=this.db.prepare('SELECT platform_id,user_id,parent_id,body FROM run_comments WHERE post_id=?').all(saved.id);
          if(receipt.checkpoint.marks.length!==retained.length||retained.some(c=>!receipt.checkpoint.marks.some(m=>m.id===c.platform_id&&m.parent===(c.parent_id||'')&&m.digest===policy.commentDigest(post.id,{id:c.platform_id,userId:c.user_id,parentId:c.parent_id||undefined,text:c.body}))))throw new LocalError('CHECKPOINT_MEMBERSHIP_MISMATCH');
          this.db.prepare('INSERT INTO run_checkpoints VALUES(?,?,?,?,?,?) ON CONFLICT(post_id) DO UPDATE SET checkpoint=excluded.checkpoint,hash=excluded.hash,remaining_anchors=excluded.remaining_anchors,sequence=excluded.sequence,updated_at=excluded.updated_at').run(saved.id,canonical(receipt.checkpoint),receipt.hash,receipt.remainingAnchors,receipt.checkpoint.sequence,this.store.clock());
        }
      }
      this.store.audit('AUTOMATION','CAPTURE_CHECKPOINT',runId,{addedPosts,addedComments,conflicts});return {addedPosts,addedComments,conflicts};
    });
  }
  finish(lease,runId,{status,reason=null,coverage}){return this.store.transaction(()=>{
    const run=this.current(lease,runId),evidence=policy.safeRunCoverage(coverage);
    if(!['COMPLETE','PARTIAL','FAILED','CANCELLED'].includes(status)||!evidence)throw new LocalError('INVALID_RUN_COVERAGE');
    const posts=this.db.prepare('SELECT * FROM run_posts WHERE run_id=? ORDER BY ordinal').all(runId);
    if(evidence.posts.length!==posts.length||new Set(evidence.posts.map(p=>p.postRef)).size!==posts.length)throw new LocalError('RUN_MEMBERSHIP_MISMATCH');
    for(const post of posts){
      const e=evidence.posts.find(p=>p.postRef===post.platform_id),rows=this.db.prepare('SELECT * FROM run_comments WHERE post_id=? ORDER BY ordinal').all(post.id),snapshot=JSON.parse(post.snapshot);
      if(!e||e.ordinal!==post.ordinal||e.saved!==rows.length||e.roots!==rows.filter(c=>!c.parent_id).length||e.replies!==rows.filter(c=>!!c.parent_id).length)throw new LocalError('RUN_MEMBERSHIP_MISMATCH');
      if(e.recovery){const saved=this.db.prepare('SELECT * FROM run_checkpoints WHERE post_id=?').get(post.id);if(!saved||e.recovery.confirmedTotal!==rows.length||e.recovery.sequence!==saved.sequence||e.recovery.remainingAnchors!==saved.remaining_anchors||e.complete&&saved.remaining_anchors!==0)throw new LocalError('CHECKPOINT_MEMBERSHIP_MISMATCH');}
      const bounded=policy.boundedReadReportSchema.safeParse(snapshot.boundedRead);
      if(e.complete&&(!bounded.success||bounded.data.state!=='COMPLETE'))throw new LocalError('COMPLETE_COVERAGE_REQUIRED');
      if(e.complete){const totals=bounded.data.chunkSummary||bounded.data.retained.loaded;if(!totals||(totals.unique??totals.uniqueKnown)!==rows.length||totals.roots!==e.roots||totals.replies!==e.replies||e.boundedRead&&hash(e.boundedRead)!==hash(bounded.data))throw new LocalError('RUN_MEMBERSHIP_MISMATCH');}
      this.db.prepare('UPDATE run_posts SET coverage=? WHERE id=?').run(e.complete?'COMPLETE':'PARTIAL',post.id);
      for(const row of rows){
        const prior=JSON.parse(row.snapshot),parent=rows.find(r=>r.platform_id===row.parent_id);
        const next={...prior,parent:parent?.body??null,coverage:e.complete?'COMPLETE':'PARTIAL'};
        this.db.prepare('UPDATE run_comments SET snapshot=?,source_hash=? WHERE id=?').run(canonical(next),hash(next),row.id);
      }
    }
    this.db.prepare('UPDATE collection_runs SET status=?,reason=?,coverage=?,finished_at=? WHERE id=?').run(run.identity_conflict?'PARTIAL':status,run.identity_conflict?'IDENTITY_CONFLICT':reason,canonical(evidence),this.store.clock(),runId);
    this.store.audit('AUTOMATION','COLLECTION_FINISHED',runId,{status:run.identity_conflict?'PARTIAL':status});
  });}
  barrier(runId){
    const run=this.db.prepare('SELECT r.*,j.state job_state FROM collection_runs r JOIN jobs j ON j.id=r.job_id WHERE r.id=?').get(runId);
    if(!run)return {ready:false,reason:'任务不存在'};
    if(run.job_state!=='SUCCEEDED')return {ready:false,reason:'采集任务尚未成功结束'};
    if(run.identity_conflict)return {ready:false,reason:'本轮身份或正文存在冲突'};
    const posts=this.db.prepare('SELECT count(*) n FROM run_posts WHERE run_id=?').get(runId).n,comments=this.db.prepare('SELECT count(*) n FROM run_comments WHERE run_id=?').get(runId).n;
    return policy.collectionBarrier({snapshot:JSON.parse(run.snapshot),cancelRequested:!!run.cancel_requested,status:run.status,finishedAt:run.finished_at,reason:run.reason,capturedPosts:posts,capturedCommentsCount:comments,metrics:{coverage:run.coverage?JSON.parse(run.coverage):null}});
  }
  cancel(runId){return this.store.transaction(()=>{const run=this.db.prepare('SELECT job_id FROM collection_runs WHERE id=?').get(runId);if(!run)throw new LocalError('RUN_NOT_FOUND');this.db.prepare('UPDATE collection_runs SET cancel_requested=1 WHERE id=?').run(runId);this.db.prepare('UPDATE jobs SET cancel_requested=1 WHERE id=?').run(run.job_id);this.store.audit('LOCAL_USER','COLLECTION_CANCEL_REQUESTED',runId);});}
  fail(lease,runId,reason='COLLECTION_INTERRUPTED'){return this.store.transaction(()=>{const job=this.queue.current(lease);if(!this.db.prepare('SELECT 1 FROM collection_runs WHERE id=? AND job_id=?').get(runId,job.id))throw new LocalError('RUN_NOT_FOUND');this.db.prepare("UPDATE collection_runs SET status='FAILED',reason=?,finished_at=? WHERE id=?").run(reason,this.store.clock(),runId);});}
  recover(){return this.store.transaction(()=>this.db.prepare("UPDATE collection_runs SET status='INTERRUPTED',reason='WORKER_INTERRUPTED',finished_at=? WHERE status='RUNNING' AND EXISTS(SELECT 1 FROM jobs j WHERE j.id=collection_runs.job_id AND j.state NOT IN('QUEUED','RUNNING'))").run(this.store.clock()).changes);}
  posts(runId){return this.db.prepare('SELECT * FROM run_posts WHERE run_id=? ORDER BY ordinal').all(runId).map(p=>({...p,snapshot:JSON.parse(p.snapshot)}));}
  comments(runId,postId){return this.db.prepare('SELECT * FROM run_comments WHERE run_id=? AND post_id=? ORDER BY ordinal').all(runId,postId).map(c=>({...c,snapshot:JSON.parse(c.snapshot)}));}
}
module.exports={LocalCollection};
