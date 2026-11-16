const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {fixture}=require('./flow-fixture.cjs');
const {canonical}=require('../dist/database.cjs');
const policy=require('../dist/policy.cjs');

test('canonical 跳过值为 undefined 的键',()=>{
 assert.equal(canonical({b:1,a:undefined}),'{"b":1}');
 assert.equal(canonical({a:undefined}),'{}');
 assert.equal(canonical({a:undefined,b:{c:undefined,d:'x'}}),'{"b":{"d":"x"}}');
 // 顶层 undefined 仍非法：它不是「字段缺失」，而是调用方给错了值。
 assert.throws(()=>canonical(undefined),/INVALID_JSON/);
});

/** 适配器读不到可选字段时的真实形状：键存在、值为 undefined。 */
function adapterPost(){
 return {id:'post-a',title:'合成学习讨论',body:'正文',coverUrl:undefined,boundedRead:undefined,boundedReadWindows:undefined,
  coverageDiagnostic:undefined,sourceReference:undefined,authorNickname:undefined,authorAvatarUrl:undefined,
  publishedAt:undefined,imageDiagnostics:undefined};
}

test('policy 抛出的 ReadFailure 能被 domain 的判定认出（跨 bundle）',()=>{
 const {isReadFailure}=require('@crm/domain/collection/contract');
 const previous={version:1,sequence:1,marks:[{id:'c1',parent:'',digest:'0'.repeat(64)}]};
 const next={version:1,sequence:1,marks:[...previous.marks,{id:'c2',parent:'',digest:'1'.repeat(64)}]};
 let error;
 try{policy.validateChunk(previous,{checkpoint:next,hash:policy.checkpointHash(next),replaying:false,remainingAnchors:0},'p',[]);}catch(e){error=e;}
 assert.ok(error,'应当抛出');
 assert.equal(isReadFailure(error),true);
 assert.equal(error.code,'INVALID_DATA');
});

test('采集写入不再因可选字段为空而整笔回滚',t=>{
 const f=fixture(t);
 const parsed=policy.postSchema.parse(adapterPost());
 // 前提：校验器会保留空的可选键，这正是写库时被 canonical 拒绝的形状。
 assert.ok(Object.keys(parsed).some(k=>parsed[k]===undefined),'校验器应保留 undefined 键');
 const scope={configId:'config',configRevision:1,accountId:'account',accountRevision:1,readPlan:{kind:'SEARCH',batchLimit:1},
  strictStages:{version:1,policies:[{id:'policy',revision:1,version:1,modelVersion:1}],contactRules:[]}};
 const grant=f.queue.authorize('COLLECT',scope);
 f.queue.enqueue('COLLECT',scope,grant,randomUUID());
 const lease=f.queue.claim('fixture');f.queue.beginDispatch(lease);
 const runId=f.collection.start(lease);
 assert.deepEqual(f.collection.checkpoint(lease,runId,[{post:parsed,comments:[]}]),{addedPosts:1,addedComments:0,conflicts:0});
 assert.equal(f.store.db.prepare('SELECT count(*) n FROM run_posts WHERE run_id=?').get(runId).n,1);
});
