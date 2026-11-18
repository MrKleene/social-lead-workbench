const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./flow-fixture.cjs');
const {LocalWorkflow}=require('../dist/workflow.cjs');
const {DEFAULT_FILTERS}=require('../dist/keyword-plan.cjs');
const vault={has:()=>true,protector:{available:()=>true},get:()=> 'synthetic-key-for-workflow-only',put:()=>{}};
const collectEnabled={capabilities:()=>({collect:true})};
const SEED='0123456789abcdef0123456789abcdef';
const plan={version:2,order:['合成关键词'],seed:SEED,filters:{...DEFAULT_FILTERS}};
/** 前序任务还在队列里时不允许开始新一轮采集——不排队、不覆盖。 */
test('a queued collection round blocks the next start until the queue is clear',(t)=>{
 const f=fixture(t),w=new LocalWorkflow(f.store,vault,collectEnabled);
 const first=w.previewCollection({configId:'config',accountId:'account',batchLimit:1,policyIds:[],keywordPlan:plan});
 const started=w.authorizeCollection({...first,requestKey:'queue-busy-1',consent:'bounded-platform-read-once-v1'});
 assert.equal(f.queue.busy().kind,'COLLECT');
 assert.equal(f.queue.busy().id,started.id);
 const again=w.previewCollection({configId:'config',accountId:'account',batchLimit:1,policyIds:[],keywordPlan:plan});
 assert.throws(()=>w.authorizeCollection({...again,requestKey:'queue-busy-2',consent:'bounded-platform-read-once-v1'}),/QUEUE_BUSY/);
 // 同一个 requestKey 重放仍是幂等的，不受忙碌判定影响。
 assert.equal(w.authorizeCollection({...first,requestKey:'queue-busy-1',consent:'bounded-platform-read-once-v1'}).id,started.id);
 f.store.db.prepare("UPDATE jobs SET state='SUCCEEDED' WHERE id=?").run(started.id);
 assert.equal(f.queue.busy(),null);
 assert.ok(w.authorizeCollection({...again,requestKey:'queue-busy-3',consent:'bounded-platform-read-once-v1'}).id);
});
/** 模型额度耗尽时审核任务会一直排队；这种排不动的任务不算前序任务。 */
test('queued review work that cannot run does not block a new round',(t)=>{
 const f=fixture(t);
 const scope={runId:'run-x',postId:'post-x',policyId:'policy',policyRevision:1,policyVersion:1,model:'qwen3.8-flash',modelVersion:1,priceVersion:'synthetic',requestPolicy:'whole-post-single-request-v1',inputHash:'a'.repeat(64),payloadHash:'b'.repeat(64),commentIds:['c'],segmentNo:0,attemptNo:1};
 const grant=f.queue.authorize('REVIEW',scope);
 f.queue.enqueue('REVIEW',scope,grant,'review-queued-1');
 assert.equal(f.queue.busy().kind,'REVIEW');
 f.store.db.prepare("INSERT INTO safety_state VALUES('model',1,NULL,'MODEL_RECONCILIATION_REQUIRED',0)").run();
 assert.equal(f.queue.busy(),null);
});
