const test=require('node:test'),assert=require('node:assert/strict');
const {randomPlan,planSpec,DEFAULT_FILTERS}=require('../dist/keyword-plan.cjs');
const {fixture,completeReport}=require('./flow-fixture.cjs');
const {LocalWorkflow}=require('../dist/workflow.cjs');
const vault={has:()=>true,protector:{available:()=>true},get:()=> 'synthetic-key-for-workflow-only',put:()=>{}};
const collectEnabled={capabilities:()=>({collect:true})};
const SEED='0123456789abcdef0123456789abcdef';
test('a random plan shuffles every configured keyword and freezes seed and filters',()=>{
 const plan=randomPlan(['甲','乙','丙'],3,{draw:()=>0,seed:SEED});
 assert.equal(plan.version,2);
 assert.equal(plan.seed,SEED);
 assert.deepEqual([...plan.order].sort(),['丙','乙','甲']);
 assert.equal(new Set(plan.order).size,3);
 assert.deepEqual(plan.filters,DEFAULT_FILTERS);
 const other=randomPlan(['甲','乙','丙'],3,{draw:n=>n-1,seed:SEED});
 assert.deepEqual(other.order,['甲','乙','丙']);
 assert.ok(randomPlan(['甲'],5,{draw:()=>0}).order.length===1);
});
test('a supplied plan may only reorder configured keywords with a valid seed and filters',()=>{
 const keywords=['甲','乙','丙'],base={version:2,order:['乙','甲'],seed:SEED,filters:{...DEFAULT_FILTERS}};
 const plan=planSpec(base,keywords,3);
 assert.deepEqual(plan.order,['乙','甲']);
 assert.deepEqual(plan.filters,{sortBy:'最多点赞',publishTime:'一周内'});
 assert.deepEqual(planSpec({...base,order:[' 甲 ']},keywords,3).order,['甲']);
 for(const bad of [
  {...base,order:['丁']},
  {...base,order:['甲','甲']},
  {...base,order:[]},
  {...base,order:['甲','乙','丙','甲']},
  {...base,seed:'nope'},
  {...base,filters:{sortBy:'最热'}},
  {...base,filters:{publishTime:'一年内'}},
  {version:1,order:['甲'],seed:SEED,filters:{...DEFAULT_FILTERS}},
  null,
 ]) assert.throws(()=>planSpec(bad,keywords,3),/INVALID_COLLECTION_PLAN/);
});
test('a collection round freezes its plan into scope and run snapshot',t=>{
 const f=fixture(t);
 f.store.db.exec("UPDATE configurations SET body='{\"keywords\":[\"选题\",\"开题\",\"综述\",\"模型\"]}' WHERE id='config'");
 const w=new LocalWorkflow(f.store,vault,collectEnabled);
 const p=w.previewCollection({configId:'config',accountId:'account',batchLimit:3,policyIds:[]});
 assert.ok(Array.isArray(p.keywordPlan.order)&&p.keywordPlan.order.length===4);
 assert.match(p.keywordPlan.seed,/^[a-f0-9]{32}$/);
 assert.deepEqual(p.scope.readPlan.keywordPlan,p.keywordPlan);
 const again=w.previewCollection({configId:'config',accountId:'account',batchLimit:3,policyIds:[],keywordPlan:p.keywordPlan});
 assert.equal(again.previewHash,p.previewHash);
 assert.deepEqual(again.keywordPlan,p.keywordPlan);
 assert.throws(()=>w.previewCollection({configId:'config',accountId:'account',batchLimit:3,policyIds:[],keywordPlan:[{keyword:'选题',limit:2}]}),/INVALID_COLLECTION_PLAN/);
 assert.throws(()=>w.previewCollection({configId:'config',accountId:'account',batchLimit:3,policyIds:[],keywordPlan:{...p.keywordPlan,order:['不存在']}}),/INVALID_COLLECTION_PLAN/);
 w.authorizeCollection({...p,requestKey:'random-plan-round',consent:'bounded-platform-read-once-v1'});
 const lease=f.queue.claim('fixture');f.queue.beginDispatch(lease);const runId=f.collection.start(lease);
 const snapshot=JSON.parse(f.store.db.prepare('SELECT snapshot FROM collection_runs WHERE id=?').get(runId).snapshot);
 assert.deepEqual(snapshot.keywords,p.keywordPlan.order);
 assert.equal(snapshot.searchSeed,p.keywordPlan.seed);
 assert.deepEqual(snapshot.searchFilters,p.keywordPlan.filters);
 assert.equal(snapshot.batchLimit,3);
});
test('the collector searches planned keywords in order, sends filters and records usage',async()=>{
 const {collect,keywordQuota}=await import('@crm/domain/collection/collector');
 const {limits}=await import('@crm/domain/collection/contract');
 const searched=[],filters=[],posts={甲:[{id:'p1',title:'一',body:'正文'}],乙:[{id:'p2',title:'二',body:'正文'}],丙:[{id:'p3',title:'三',body:'正文'}]};
 const adapter={platform:'XHS',mode:'XHS_MCP',async search(keyword,cursor,signal,filter){searched.push(keyword);filters.push(filter);return {items:posts[keyword]??[],complete:false};},async post(p){return {...p,boundedRead:completeReport([])};},receivedComments:()=>[],canContinuePost:()=>false};
 const config={mode:'XHS_MCP',platform:'XHS',keywords:['甲','乙','丙'],searchSeed:SEED,searchFilters:{sortBy:'最多点赞',publishTime:'一周内'},batchLimit:3};
 const result=await collect(adapter,config,async()=>false,{...limits,requests:64,comments:100,runMs:30000,searchGap:{minMs:0,maxMs:0}});
 assert.deepEqual(searched,['甲','乙','丙']);
 assert.ok(filters.every(f=>f.sortBy==='最多点赞'&&f.publishTime==='一周内'));
 assert.deepEqual(result.searchPlanUsage,[{keyword:'甲',found:1},{keyword:'乙',found:1},{keyword:'丙',found:1}]);
 assert.equal(result.searchExhausted,undefined);
 assert.equal(result.searchIncomplete,true);
 assert.equal(result.status,'COMPLETE');
 assert.equal(result.reason,undefined);
 for(let ordinal=0;ordinal<5;ordinal++){
  const quota=keywordQuota(SEED,ordinal,3);
  assert.ok(quota>=1&&quota<=3&&Number.isInteger(quota));
  assert.equal(keywordQuota(SEED,ordinal,3),quota);
 }
});
test('a plan that yields fewer posts than the batch marks the round exhausted',async()=>{
 const {collect}=await import('@crm/domain/collection/collector');
 const {limits}=await import('@crm/domain/collection/contract');
 const adapter={platform:'XHS',mode:'XHS_MCP',async search(keyword){return {items:[{id:'p-'+keyword,title:keyword,body:'正文'}],complete:true};},async post(p){return {...p,boundedRead:completeReport([])};},receivedComments:()=>[],canContinuePost:()=>false};
 const result=await collect(adapter,{mode:'XHS_MCP',platform:'XHS',keywords:['甲','乙'],searchSeed:SEED,batchLimit:3},async()=>false,{...limits,requests:64,comments:100,runMs:30000,searchGap:{minMs:0,maxMs:0}});
 assert.equal(result.searchExhausted,true);
 assert.equal(result.posts.length,2);
 assert.equal(result.status,'PARTIAL');
 assert.equal(result.reason,'SEARCH_EXHAUSTED');
});