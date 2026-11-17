const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,entry,completeReport,collect}=require('./flow-fixture.cjs');
const {LocalCollectionExecutor}=require('../dist/collection-executor.cjs');
const {LocalRunner}=require('../dist/runner.cjs');
const SEED='0123456789abcdef0123456789abcdef';
function runtime({identity='a'.repeat(24)}={}){return {available:()=>true,openSaved:async()=>({status:async()=>({loggedIn:true,userId:identity}),readTransport:()=>({}),stop:async()=>true})};}
function queued(f,batchLimit){const scope={configId:'config',configRevision:1,accountId:'account',accountRevision:1,readPlan:{kind:'SEARCH',batchLimit},strictStages:{version:1,policies:[{id:'policy',revision:1,version:1,modelVersion:1}]}};const a=f.queue.authorize('COLLECT',scope);return f.queue.enqueue('COLLECT',scope,a,'history-dedupe-test');}
function searchAdapter(items){const read=[];const byId=new Map(items.map(e=>[e.post.id,e]));return {read,adapter:{platform:'XHS',mode:'XHS_MCP',prepare:async()=>{},search:async()=>({items:items.map(e=>e.post),complete:false}),post:async post=>{read.push(post.id);return post;},receivedComments:post=>byId.get(post.id)?.comments??[],canContinuePost:()=>false,close:async()=>{}}};}
test('search candidates already captured completely are skipped before any read',async()=>{
 const {collect:run}=await import('@crm/domain/collection/collector');
 const {limits}=await import('@crm/domain/collection/contract');
 const old={id:'old-post',title:'旧笔记',body:'正文'},fresh={id:'fresh-post',title:'新笔记',body:'正文'};
 const read=[];
 const adapter={platform:'XHS',mode:'XHS_MCP',async search(){return {items:[old,fresh],complete:false};},async post(post){read.push(post.id);return {...post,boundedRead:completeReport([])};},receivedComments:()=>[],canContinuePost:()=>false};
 const config={mode:'XHS_MCP',platform:'XHS',keywords:['合成'],searchSeed:SEED,batchLimit:2};
 const result=await run(adapter,config,async()=>false,{...limits,requests:64,comments:100,runMs:30000,searchGap:{minMs:0,maxMs:0},completedPostIds:new Set(['old-post'])});
 assert.deepEqual(read,['fresh-post'],'history-complete note must not be opened');
 assert.deepEqual(result.posts.map(p=>p.post.id),['fresh-post']);
 assert.equal(result.searchExhausted,true);
 assert.equal(result.status,'PARTIAL');
 assert.equal(result.reason,'SEARCH_EXHAUSTED','a skipped note leaves the batch short and the round reports 结果不足');
});
test('notes whose earlier round was partial stay eligible for a fresh read',async()=>{
 const {collect:run}=await import('@crm/domain/collection/collector');
 const {limits}=await import('@crm/domain/collection/contract');
 const old={id:'old-post',title:'旧笔记',body:'正文'},read=[];
 const adapter={platform:'XHS',mode:'XHS_MCP',async search(){return {items:[old],complete:false};},async post(post){read.push(post.id);return {...post,boundedRead:completeReport([])};},receivedComments:()=>[],canContinuePost:()=>false};
 const result=await run(adapter,{mode:'XHS_MCP',platform:'XHS',keywords:['合成'],searchSeed:SEED,batchLimit:1},async()=>false,{...limits,requests:64,comments:100,runMs:30000,searchGap:{minMs:0,maxMs:0},completedPostIds:new Set()});
 assert.deepEqual(read,['old-post']);
 assert.equal(result.posts.length,1);
});
test('a search round skips an earlier complete capture and stores only the fresh note',async t=>{
 const f=fixture(t),oldEntry=entry('old-post',[]),freshEntry=entry('fresh-post',[]);
 const old=collect(f,[oldEntry]);
 const {read,adapter}=searchAdapter([oldEntry,freshEntry]);
 queued(f,1);
 const runner=new LocalRunner(f.store,{COLLECT:new LocalCollectionExecutor(f.store,{has:()=>true},runtime(),{adapterFactory:()=>adapter})});
 await runner.tick();await runner.stop();
 const next=f.store.db.prepare('SELECT id,status FROM collection_runs WHERE id<>?').get(old.runId);
 assert.equal(next.status,'COMPLETE');
 assert.deepEqual(read,['fresh-post']);
 assert.deepEqual(f.store.db.prepare('SELECT platform_id FROM run_posts WHERE run_id=?').all(next.id).map(row=>row.platform_id),['fresh-post']);
});
test('a partial historical capture is re-read in the next search round',async t=>{
 const f=fixture(t),oldEntry=entry('old-post',[]),old=collect(f,[oldEntry]);
 f.store.db.exec("UPDATE run_posts SET coverage='PARTIAL'");
 const {read,adapter}=searchAdapter([oldEntry]);
 queued(f,1);
 const runner=new LocalRunner(f.store,{COLLECT:new LocalCollectionExecutor(f.store,{has:()=>true},runtime(),{adapterFactory:()=>adapter})});
 await runner.tick();await runner.stop();
 const next=f.store.db.prepare('SELECT id,status FROM collection_runs WHERE id<>?').get(old.runId);
 assert.equal(next.status,'COMPLETE');
 assert.deepEqual(read,['old-post']);
 assert.equal(f.store.db.prepare('SELECT count(*) n FROM run_posts WHERE run_id=?').get(next.id).n,1);
});
