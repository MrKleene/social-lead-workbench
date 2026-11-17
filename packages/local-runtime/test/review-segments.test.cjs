const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,entry,collect,output}=require('./flow-fixture.cjs');
const {RunReview}=require('../dist/run-review.cjs'),{LocalRunner}=require('../dist/runner.cjs');
const {LocalError}=require('../dist/database.cjs');
const texts=n=>Array.from({length:n},(_,i)=>'合成评论第'+(i+1)+'条：想请教学习方法和选题指导');
function onePost(f,n=60){const run=collect(f,[entry('post-a',texts(n))]),post=f.collection.posts(run.runId)[0];return {run,post,comments:f.collection.comments(run.runId,post.id)};}
function submit(f,plan){const grant=f.queue.authorize('REVIEW',plan.scope),key=require('node:crypto').randomUUID();f.queue.enqueue('REVIEW',plan.scope,grant,key);const lease=f.queue.claim('review-test');if(!lease)throw new Error('NO_LEASE');const batchId=f.review.reserve(lease),command=f.review.dispatch(lease,batchId);return {lease,batchId,command};}
test('fifty comments per request: 60 comments split into two segments and both complete',async t=>{
 const f=fixture(t),{run,post,comments}=onePost(f,60),review=new RunReview(f.store),p=review.preview({runId:run.runId});
 assert.equal(p.requests,2);assert.equal(p.comments,60);assert.deepEqual(p.scope.batches.map(b=>b.comments),[50,10]);
 assert.deepEqual(p.scope.batches.map(b=>b.scope.commentIds), [comments.slice(0,50).map(c=>c.id),comments.slice(50).map(c=>c.id)]);
 const ids=review.authorize({...p,requestKey:'segments',consent:'review-exact-new-run-batches-v1'}).ids;assert.equal(ids.length,2);
 const runner=new LocalRunner(f.store,{REVIEW:{prepare:async()=>{},execute:async c=>output(c)}});await runner.tick();assert.equal(f.store.db.prepare('SELECT count(*) n FROM review_results').get().n,50);
 f.advance(1001);await runner.tick();assert.equal(f.store.db.prepare('SELECT count(*) n FROM review_results').get().n,60);assert.equal(f.review.barrier(run.runId).ready,true);
 assert.equal(f.store.db.prepare('SELECT count(*) n FROM review_batches WHERE state=\'COMPLETED\'').get().n,2);await runner.stop();
});
test('retryable failure opens a new attempt row and keeps the failed one',t=>{
 const f=fixture(t),{run,post,comments}=onePost(f,55),ids=comments.map(c=>c.id),plan=f.review.plan(run.runId,post.id,'policy',undefined,undefined,{segmentNo:0,commentIds:ids.slice(0,50),attemptNo:1});
 const first=submit(f,plan);assert.equal(f.store.db.prepare('SELECT attempt_no FROM review_batches WHERE id=?').get(first.batchId).attempt_no,1);f.review.fail(first.lease,first.batchId,{code:'RATE_LIMIT',httpStatus:429});
 const failed=f.store.db.prepare('SELECT * FROM review_batches WHERE id=?').get(first.batchId);assert.equal(failed.state,'FAILED');assert.equal(failed.retryable,1);assert.equal(failed.error_stage,'PROVIDER');
 const retry=f.store.db.prepare("SELECT * FROM jobs WHERE kind='REVIEW' AND state='QUEUED'").get();assert.ok(retry);assert.equal(JSON.parse(retry.payload).attemptNo,2);assert.ok(retry.available_at>f.store.clock());
 assert.equal(f.store.db.prepare('SELECT count(*) n FROM review_batches').get().n,1);
});
test('three exhausted attempts pause the post instead of skipping or marking reviewed',t=>{
 const f=fixture(t),{run,post,comments}=onePost(f,10),plan=f.review.plan(run.runId,post.id,'policy',undefined,undefined,{segmentNo:0,commentIds:comments.map(c=>c.id),attemptNo:1});
 const first=submit(f,plan);let lease=first.lease,batchId=first.batchId;
 for(let attempt=1;attempt<=3;attempt++){
  assert.equal(f.store.db.prepare('SELECT attempt_no FROM review_batches WHERE id=?').get(batchId).attempt_no,attempt);f.review.fail(lease,batchId,{code:'UPSTREAM_FAILED',httpStatus:503});
  if(attempt<3){f.advance(30001);lease=f.queue.claim('retry-'+attempt);assert.ok(lease);batchId=f.review.reserve(lease);f.review.dispatch(lease,batchId);}
 }
 assert.equal(f.store.db.prepare('SELECT count(*) n FROM review_batches').get().n,3);
 const pause=f.store.db.prepare("SELECT * FROM review_pauses WHERE kind='POST'").get();assert.ok(pause);assert.equal(pause.reason,'UPSTREAM_FAILED');
 assert.equal(f.store.db.prepare('SELECT count(*) n FROM review_results').get().n,0);
});
test('timeout after dispatch is unknown, never retried automatically, and pauses the model',t=>{
 const f=fixture(t),{run,post,comments}=onePost(f,5),plan=f.review.plan(run.runId,post.id,'policy',undefined,undefined,{segmentNo:0,commentIds:comments.map(c=>c.id),attemptNo:1}),job=submit(f,plan);
 f.review.fail(job.lease,job.batchId,{code:'TIMEOUT'});
 assert.equal(f.store.db.prepare('SELECT state FROM review_batches WHERE id=?').get(job.batchId).state,'UNKNOWN');
 assert.equal(f.store.db.prepare("SELECT count(*) n FROM jobs WHERE kind='REVIEW' AND state='QUEUED'").get().n,0);
 assert.equal(f.store.db.prepare("SELECT reason FROM safety_state WHERE id='model'").get().reason,'MODEL_SUBMISSION_UNKNOWN');
 assert.equal(f.review.barrier(run.runId).ready,false);
});
test('barrier waits for every comment of every segment before automatic contact qualifies',async t=>{
 const f=fixture(t),{run,post}=onePost(f,60),review=new RunReview(f.store),p=review.preview({runId:run.runId});
 assert.equal(f.review.barrier(run.runId).ready,false);
 review.authorize({...p,requestKey:'barrier',consent:'review-exact-new-run-batches-v1'});
 const runner=new LocalRunner(f.store,{REVIEW:{prepare:async()=>{},execute:async c=>output(c)}});await runner.tick();assert.equal(f.review.barrier(run.runId).ready,false);
 f.advance(1001);await runner.tick();assert.equal(f.review.barrier(run.runId).ready,true);
 assert.equal(f.review.commentSegments(run.runId,post.id).segments.reduce((n,s)=>n+s.comments.length,0),60);await runner.stop();
});
