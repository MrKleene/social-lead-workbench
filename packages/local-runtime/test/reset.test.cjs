const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {fixture,collect,evaluate}=require('./flow-fixture.cjs');
const {LocalReset}=require('../dist/reset.cjs');
const {CredentialStore}=require('../dist/credentials.cjs');
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

test('reset refuses a queued send, then keeps its one-time grant and drops unused collection grants',t=>{
 const f=fixture(t),collectGrant=f.queue.authorize('COLLECT',{n:1}),sendScope={platform:'XHS',channel:'DM',accountId:'account',accountRevision:1,recipientId:'recipient',content:'synthetic text',target:{recipientId:'recipient'}},sendGrant=f.queue.authorize('SEND',sendScope);
 f.queue.enqueue('SEND',sendScope,sendGrant,'queued-send');
 assert.throws(()=>new LocalReset(f.store).delete({categories:['reviews']}),/RESET_REQUIRES_IDLE/);
 assert.equal(count(f.store,'jobs'),1);
 f.store.db.prepare("UPDATE jobs SET state='SUCCEEDED' WHERE request_key='queued-send'").run();
 new LocalReset(f.store).delete({categories:['reviews']});
 const grants=f.store.db.prepare('SELECT id,purpose FROM authorizations').all();
 assert.equal(grants.length,1);assert.equal(grants[0].purpose,'SEND');assert.notEqual(grants[0].id,collectGrant);
});test('restoring the initial state empties every business table and keeps install identity and the chosen model',t=>{
 const f=seeded(t);for(const table of ['accounts','configurations','collection_runs','run_posts','run_comments','review_results','jobs','audit_events'])assert.ok(count(f.store,table)>=1,table);
 const purged=[];const vault={purge(kinds){purged.push(kinds);return 5;}};
 const result=new LocalReset(f.store).restoreInitialState({vault});
 assert.equal(result.restored,true);assert.equal(result.secrets,5);
 const keep=new Set(['schema_migrations','installation','model_profile']);
 const tables=f.store.db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row=>row.name);
 // audit_events 只保留这一条「已恢复」，否则现场无法解释这台机器被重置过。
 for(const table of tables.filter(name=>!keep.has(name)&&name!=='audit_events'))assert.equal(count(f.store,table),0,table);
 assert.ok(count(f.store,'schema_migrations')>=1);assert.equal(count(f.store,'installation'),1);
 const model=f.store.db.prepare("SELECT * FROM model_profile WHERE id='qwen'").get();
 assert.equal(model.model,'qwen3.8-flash');assert.equal(model.authorized,0);assert.equal(model.daily_limit,null);assert.equal(model.price_ack,'');assert.equal(model.consent,'');
 assert.equal(f.store.db.prepare("SELECT count(*) n FROM audit_events WHERE action='INITIAL_STATE_RESTORED'").get().n,1);
 assert.deepEqual(purged,[['MODEL_KEY','PLATFORM_SESSION','POST_REFERENCE']]);
});

test('service restore rewrites the ten built-in configurations',t=>{
 const {LocalService}=require('../dist/service.cjs');
 const f=seeded(t);new LocalService(f.store,{}).restoreInitialState();
 assert.equal(count(f.store,'configurations'),10);
 assert.equal(f.store.db.prepare('SELECT count(*) n FROM configurations WHERE builtin=1').get().n,10);
 assert.equal(count(f.store,'collection_runs'),0);
});

test('restoring refuses while work is queued and leaves data untouched',t=>{
 const f=fixture(t),scope={configId:'config',configRevision:1,accountId:'account',accountRevision:1,readPlan:{kind:'SEARCH',batchLimit:1},strictStages:{version:1,policies:[],contactRules:[]}},grant=f.queue.authorize('COLLECT',scope);
 f.queue.enqueue('COLLECT',scope,grant,'queued-restore');
 assert.throws(()=>new LocalReset(f.store).restoreInitialState(),/RESTORE_REQUIRES_IDLE/);
 assert.equal(count(f.store,'configurations'),1);assert.equal(count(f.store,'jobs'),1);
});test('credential purge removes only sealed entries of the listed kinds',t=>{
 const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'local-cred-purge-')));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const vault=new CredentialStore(dir,{available:()=>true});
 fs.writeFileSync(vault.file('MODEL_KEY','qwen'),'sealed',{mode:0o600});
 fs.writeFileSync(vault.file('PLATFORM_SESSION','session'),'sealed',{mode:0o600});
 fs.writeFileSync(vault.file('POST_REFERENCE','post'),'sealed',{mode:0o600});
 fs.writeFileSync(path.join(dir,'notes.txt'),'keep',{mode:0o600});
 assert.equal(vault.purge(['MODEL_KEY','PLATFORM_SESSION']),2);
 assert.equal(vault.has('MODEL_KEY','qwen'),false);assert.equal(vault.has('PLATFORM_SESSION','session'),false);
 assert.equal(vault.has('POST_REFERENCE','post'),true);assert.equal(fs.readFileSync(path.join(dir,'notes.txt'),'utf8'),'keep');
 assert.throws(()=>vault.purge(['NOT_A_KIND']),/INVALID_CREDENTIAL_REFERENCE/);
});
