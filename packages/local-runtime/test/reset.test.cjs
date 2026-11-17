const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,collect,evaluate}=require('./flow-fixture.cjs');
const {LocalReset}=require('../dist/reset.cjs');
const count=(store,table)=>store.db.prepare('SELECT count(*) n FROM '+table).get().n;
function seeded(t){const f=fixture(t),run=collect(f);evaluate(f,run.runId,f.collection.posts(run.runId)[0].id);return {...f,runId:run.runId};}
const EMPTIED=['run_posts','run_comments','review_batches','review_results','model_submissions','run_checkpoints','automatic_review_tasks','automation_decisions','capture_conflicts','collection_runs'];

test('deleting the whole collection history empties every derived table and keeps configuration',t=>{
 const f=seeded(t);for(const table of ['run_posts','run_comments','review_results'])assert.ok(count(f.store,table)>=1,table);
 const result=new LocalReset(f.store).delete({categories:['runs','posts','comments','reviews']});
 assert.equal(result.deleted,true);for(const table of EMPTIED)assert.equal(count(f.store,table),0,table);
 assert.equal(result.counts.run_posts,1);assert.equal(result.counts.collection_runs,1);assert.ok(result.counts.review_results>=1);
 assert.equal(count(f.store,'configurations'),1);assert.equal(count(f.store,'review_policies'),1);assert.equal(count(f.store,'accounts'),1);assert.equal(count(f.store,'model_profile'),1);
 assert.equal(f.store.db.prepare("SELECT count(*) n FROM audit_events WHERE action='TEST_DATA_DELETED'").get().n,1);
});

test('a parent selection deletes its dependent children',t=>{
 const f=seeded(t);new LocalReset(f.store).delete({categories:['runs']});
 for(const table of EMPTIED)assert.equal(count(f.store,table),0,table);
});

test('deleting comments alone keeps collected posts and runs but drops their review history',t=>{
 const f=seeded(t);new LocalReset(f.store).delete({categories:['comments']});
 assert.equal(count(f.store,'run_comments'),0);assert.equal(count(f.store,'review_results'),0);assert.equal(count(f.store,'review_batches'),0);
 assert.equal(count(f.store,'run_posts'),1);assert.equal(count(f.store,'collection_runs'),1);
});

test('reset refuses an empty, duplicated or unknown selection',t=>{
 const f=fixture(t),reset=new LocalReset(f.store);
 for(const categories of [[],['runs','runs'],['posts','unknown'],'runs',null])assert.throws(()=>reset.delete({categories}),/INVALID_RESET_SELECTION/);
 assert.throws(()=>reset.delete(undefined),/INVALID_RESET_SELECTION/);
});

test('reset refuses while collection or review work is queued',t=>{
 const f=fixture(t),scope={configId:'config',configRevision:1,accountId:'account',accountRevision:1,readPlan:{kind:'SEARCH',batchLimit:1},strictStages:{version:1,policies:[],contactRules:[]}},grant=f.queue.authorize('COLLECT',scope);
 f.queue.enqueue('COLLECT',scope,grant,'queued-collection');
 assert.throws(()=>new LocalReset(f.store).delete({categories:['runs']}),/RESET_REQUIRES_IDLE/);
 assert.equal(count(f.store,'jobs'),1);
});

test('reset keeps the one-time grant of a queued send and drops unused collection grants',t=>{
 const f=fixture(t),collectGrant=f.queue.authorize('COLLECT',{n:1}),sendScope={platform:'XHS',channel:'DM',accountId:'account',accountRevision:1,recipientId:'recipient',content:'synthetic text',target:{recipientId:'recipient'}},sendGrant=f.queue.authorize('SEND',sendScope);
 f.queue.enqueue('SEND',sendScope,sendGrant,'queued-send');
 new LocalReset(f.store).delete({categories:['reviews']});
 const grants=f.store.db.prepare('SELECT id,purpose FROM authorizations').all();
 assert.equal(grants.length,1);assert.equal(grants[0].purpose,'SEND');assert.notEqual(grants[0].id,collectGrant);
});
