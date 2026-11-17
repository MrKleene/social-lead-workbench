'use strict';
const {randomUUID}=require('node:crypto');
const {LocalError,hash}=require('./database.cjs');
const {LocalQueue}=require('./queue.cjs');
const {LocalCollection}=require('./collection.cjs');
const policy=require('@crm/local-runtime/policy');
const {collect,runCoverage,XhsMcpAdapter,readWindow,postTimeBudget,longReadPacing,roundTimeBudget}=require('@crm/local-runtime/collection-provider');
// Session runtime is a reviewed, packaged native resource owner. It is never a
// URL, process path, Cookie or transport object supplied by a renderer.
class LocalCollectionExecutor {
 constructor(store,vault,runtime,{adapterFactory=(wire,guard)=>new XhsMcpAdapter(wire,true,'XHS_MCP',readWindow,guard)}={}){this.store=store;this.vault=vault;this.runtime=runtime;this.adapterFactory=adapterFactory;this.collection=new LocalCollection(store);this.queue=new LocalQueue(store);}
 async prepare(scope,signal,{lease}){
  const job=this.queue.current(lease);if(signal.aborted||job.kind!=='COLLECT'||job.dispatch_started||job.cancel_requested||hash(scope)!==job.payload_hash)throw new LocalError('COLLECTION_AUTHORIZATION_REQUIRED');
  if(this.store.db.prepare("SELECT 1 FROM safety_state WHERE id='platform' AND reason IS NOT NULL").get())throw new LocalError('PLATFORM_PROCESS_RECONCILIATION_REQUIRED');
  if(!this.runtime.available('COLLECT'))throw new LocalError('PLATFORM_COMPONENT_UNAVAILABLE');
  const a=this.store.db.prepare("SELECT * FROM accounts WHERE id=? AND revision=? AND state='VERIFIED'").get(scope.accountId,scope.accountRevision);
  if(!a?.session_ref||!this.vault.has('PLATFORM_SESSION',a.session_ref))throw new LocalError('PLATFORM_SESSION_UNAVAILABLE');
 }
 async execute(scope,signal,{lease}){
  const runId=this.collection.start(lease),references=new Map();let session,adapter;
  const guard=async()=>{if(signal.aborted)throw new LocalError('COLLECTION_CANCELLED');this.collection.current(lease,runId);};
  try{
   const account=this.store.db.prepare('SELECT * FROM accounts WHERE id=?').get(scope.accountId);
   session=await this.runtime.openSaved({accountId:account.id,revision:account.revision,senderId:account.platform_user_id,sessionRef:account.session_ref,purpose:'COLLECT'},signal);
   const status=await session.status(signal);if(!status.loggedIn||status.userId!==account.platform_user_id)throw new LocalError('ACCOUNT_IDENTITY_CHANGED');
   await guard();adapter=this.adapterFactory(session.readTransport(),guard);
   const run=this.store.db.prepare('SELECT snapshot FROM collection_runs WHERE id=?').get(runId),{strictStages,...config}=JSON.parse(run.snapshot);
   let selected,restored=[];
   if(scope.readPlan.kind==='SAVED_POST'){
    const post=this.store.db.prepare('SELECT * FROM run_posts WHERE id=? AND platform_id=?').get(scope.readPlan.savedPostId,scope.readPlan.postId);if(!post||scope.readPlan.sourceHash!==post.content_hash||!this.store.db.prepare('SELECT 1 FROM run_posts WHERE platform_id=? AND source_reference_ref=?').get(post.platform_id,scope.readPlan.referenceRef))throw new LocalError('SAVED_POST_REFERENCE_UNAVAILABLE');
    const sourceReference=JSON.parse(this.vault.get('POST_REFERENCE',scope.readPlan.referenceRef));if(sourceReference.postId!==post.platform_id)throw new LocalError('SAVED_POST_REFERENCE_UNAVAILABLE');
    selected={...JSON.parse(post.snapshot),sourceReference};
    if(scope.readPlan.resume){if(!adapter.restoreCheckpoint)throw new LocalError('CHECKPOINT_ADAPTER_UNAVAILABLE');const recovery=new (require('./history-recovery.cjs').HistoryRecovery)(this.store).seed(lease,runId,scope.readPlan.resume);restored=recovery.comments;adapter.restoreCheckpoint(selected,recovery.checkpoint);}
   }
   const save=async result=>{
    await guard();const entries=result.posts.map(entry=>{
     if(scope.readPlan.resume){if(!entry.chunk)throw new LocalError('CHECKPOINT_PROTOCOL_REQUIRED');const current=new Set(entry.comments.map(c=>c.id));entry.comments=[...restored.filter(c=>!current.has(c.id)),...entry.comments];}
     const ref=entry.post.sourceReference;let id;
     if(ref){const old=references.get(entry.post.id);if(old?.digest===hash(ref))id=old.id;else{id=randomUUID();this.vault.put('POST_REFERENCE',id,JSON.stringify(ref));references.set(entry.post.id,{id,digest:hash(ref)});}}
     return {...entry,sourceReferenceRef:id??null};
    });this.collection.checkpoint(lease,runId,entries);
   };
   // The round ceiling follows the per-post budgets; the hard cap is the last backstop
   // for a pathological batch of huge posts. The queue stays strictly serial, so this
   // is the only time bound a round can rely on.
   const batch=Number.isFinite(config.batchLimit)&&config.batchLimit>0?config.batchLimit:1;
   const runMs=Math.min(roundTimeBudget.hardMaxMs,postTimeBudget.maxMs*batch+roundTimeBudget.overheadMs);
   const result=await collect(adapter,config,async()=>{try{await guard();return false;}catch{return true;}},{requests:10240,pagesPerStream:4,comments:policy.commentCollectionLimits.commentsPerPost*config.batchLimit-restored.length,callMs:40000,runMs,postBudget:postTimeBudget,pacing:longReadPacing},save,selected);
   if(result.discarded||result.status==='FAILED'||result.status==='PAUSED'){
    // collect 已经把真实失败原因和阶段诊断算出来了，不能在这里丢掉换成笼统码。
    const failure=new LocalError('COLLECTION_INCOMPLETE');
    failure.reason=result.reason??null;failure.diagnostic=result.diagnostic??null;
    failure.progress={posts:result.posts.length,requests:result.requests,status:result.status};
    throw failure;
   }
   await save(result);const coverage=runCoverage(result);if(!coverage)throw new LocalError('COLLECTION_COVERAGE_UNAVAILABLE');
   this.collection.finish(lease,runId,{status:result.status,reason:result.reason??null,coverage});return {runId,status:result.status,posts:result.posts.length,requests:result.requests};
  }catch(error){
   // run.reason 直接写真实失败码（界面「查看原因」显示的就是它）；诊断写审计，便于事后定位到阶段与字段。
   const code=typeof error?.code==='string'?error.code:(error?.name||'UNKNOWN');
   const detail={code,...(error?.reason?{reason:error.reason}:{}),...(error?.diagnostic?{diagnostic:error.diagnostic}:{}),...(error?.progress?error.progress:{})};
   try{this.store.audit('AUTOMATION','COLLECTION_FAILED',runId,detail);}catch{}
   const reason=error?.code==='ACCOUNT_IDENTITY_CHANGED'?'ACCOUNT_IDENTITY_CHANGED':error?.code==='COLLECTION_INCOMPLETE'&&error?.reason?error.reason:'COLLECTION_INTERRUPTED';
   try{this.collection.fail(lease,runId,reason);}catch{}throw new LocalError('COLLECTION_INTERRUPTED');}
  finally{await adapter?.close().catch(()=>{});if(session&&!await Promise.resolve().then(()=>session.stop()).catch(()=>false)){
   this.store.transaction(()=>{const event=this.store.audit('RECOVERY','PLATFORM_PROCESS_STOP_UNCONFIRMED',runId);this.store.db.prepare("INSERT INTO safety_state VALUES('platform',1,?,'PLATFORM_PROCESS_STOP_UNCONFIRMED',?) ON CONFLICT(id) DO UPDATE SET version=version+1,event_id=excluded.event_id,reason=excluded.reason,created_at=excluded.created_at").run(event,this.store.clock());});
   try{this.collection.fail(lease,runId,'PLATFORM_PROCESS_STOP_UNCONFIRMED');}catch{}
   throw new LocalError('PLATFORM_PROCESS_STOP_UNCONFIRMED');
  }}
 }
}
module.exports={LocalCollectionExecutor};
