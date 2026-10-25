// SYNTHETIC I/O only; launched solely by the disposable real DB/Redis acceptance.
require('reflect-metadata');
const assert=require('node:assert/strict');
assert.equal(process.env.CRM_DISPOSABLE_QUEUE_TEST,'1');
assert.match(process.env.COLLECTION_QUEUE_NAME||'',/^crm-queue-acceptance-[a-f0-9]+$/);
assert.equal(new URL(process.env.DATABASE_URL).pathname,'/crm_test');
const {Db}=require('../../apps/api/dist/common/db');
const {CollectionService}=require('../../apps/api/dist/collection/service');
const {CollectionQueue}=require('../../apps/api/dist/collection/queue');
const {createCollectionWorker,closeCollectionWorker}=require('../../apps/api/dist/collection/worker-runtime');
const {XhsMcpAdapter}=require('../../apps/api/dist/collection/adapters/xhs-mcp');
const {ReadFailure}=require('../../apps/api/dist/collection/contract');
const {commentDigest,checkpointHash}=require('../../apps/api/dist/collection/comment-checkpoint');
const db=new Db(),producer=new CollectionQueue();
const exact=value=>({state:'EXACT',value});
function sample(n,more){return {status:'OK',ready:{document:'complete',container:true},total:exact(125),hasMore:exact(more),cursor:more?'NONEMPTY':'EMPTY',list:'EXACT',loaded:{roots:n,replies:0,uniqueKnown:n,duplicateIds:0,missingIds:0,invalidNodes:0},groups:Array.from({length:n},(_,i)=>({ordinal:i+1,parent:null,depth:0,declared:exact(0),loaded:exact(0)})),findings:[]};}
const envelope=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
// No platform client, credential runtime, network URL, or production test bypass.
const accountIO={failure:async()=>{},open:async(execution)=>{
 assert.equal(execution.accountId,'isolated-account');assert.equal(execution.deviceId,'isolated-device');
 let cp={version:1,sequence:0,marks:[]},reads=0;
 const transport={supportsBoundedComments:()=>true,supportsCommentChunks:()=>true,call:async(name,args,signal)=>{
  if(name==='check_login_status')return {content:[{type:'text',text:'✅ 已登录\n'}]};
  if(name==='search_feeds')return envelope({feeds:[{id:'synthetic-post',xsecToken:'SYNTHETIC_ONLY'}]});
  assert.equal(name,'get_feed_detail');
  if(args.read_chunks.mode==='FINISH')return envelope({feed_id:'synthetic-post',data:{chunkAck:true}});
  if(args.read_chunks.mode==='START'){cp=args.read_chunks.checkpoint||cp;process.send({kind:'RESTORED',marks:cp.marks.length});}
  else assert.equal(args.read_chunks.ack,checkpointHash(cp));
  reads++;
  if(process.env.SYNTHETIC_BLOCK_AFTER_FIRST==='1'&&reads===2){
   // This request carries the ACK: production execute() already committed chunk 1.
   process.send({kind:'AFTER_COMMIT',marks:cp.marks.length});
   await new Promise((resolve,reject)=>{const abort=()=>reject(new ReadFailure('PAUSED'));if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});});
  }
  const start=cp.marks.length,rows=Array.from({length:Math.min(40,125-start)},(_,i)=>({id:'r'+(start+i),userId:'synthetic-user',nickname:'合成',text:'合成'+(start+i),hasReplies:false}));
  cp={version:1,sequence:cp.sequence+(rows.length?1:0),marks:[...cp.marks,...rows.map(c=>({id:c.id,parent:'',digest:commentDigest('synthetic-post',c)}))]};
  const n=cp.marks.length,more=n<125,observation=sample(n,more);
  return envelope({feed_id:'synthetic-post',data:{note:{noteId:'synthetic-post',title:'离线分块测试'},comments:{list:[]},boundedRead:{version:1,window:reads,state:'PARTIAL',reason:more?'ROOT_PAGE_BUDGET':'BUTTON_NOT_FOUND',rootStop:more?'ROOT_PAGE_BUDGET':'ROOT_END',replyStop:'BUTTON_NOT_FOUND',rootActions:1,replyActions:0,actions:{replyClicks:0,rootScrolls:1,addedRoots:rows.length,addedReplies:0},excludedRoots:0,elapsedMs:10,initial:sample(start,true),final:observation,retained:observation},chunk:{version:1,checkpoint:cp,hash:checkpointHash(cp),replaying:false,remainingAnchors:0,rows:rows.map(c=>({parent:'',comment:{id:c.id,content:c.text,userInfo:{userId:c.userId,nickname:c.nickname},subComments:[]}})),canContinue:more,token:reads.toString(16).padStart(64,'0')}}});
 }};
 return {reader:new XhsMcpAdapter(transport,true,'XHS_MCP',{version:1,root_pages:3,reply_clicks:12,max_roots:40,max_comments:100,max_replies_per_root:30,timeout_ms:15000}),check:async()=>{},commitGuard:async()=>{},close:async()=>{}};
}};
const service=new CollectionService(db,producer,accountIO);
const worker=createCollectionWorker(id=>service.execute(id));
worker.on('error',()=>process.send?.({kind:'ERROR'}));
const close=closeCollectionWorker(worker,async()=>{await producer.onModuleDestroy();await db.$disconnect();});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{await close();process.exit(0);});
worker.waitUntilReady().then(()=>process.send({kind:'READY'}));
