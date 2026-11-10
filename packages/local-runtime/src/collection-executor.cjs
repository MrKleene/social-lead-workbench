'use strict';
const {randomUUID}=require('node:crypto');
const {LocalError,hash}=require('./database.cjs');
const {LocalQueue}=require('./queue.cjs');
const {LocalCollection}=require('./collection.cjs');
const {collect,runCoverage,XhsMcpAdapter,readWindow}=require('@crm/local-runtime/collection-provider');
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
   const result=await collect(adapter,config,async()=>{try{await guard();return false;}catch{return true;}},{requests:32,pagesPerStream:4,comments:800-restored.length,callMs:40000,runMs:180000},save,selected);
   if(result.discarded||result.status==='FAILED'||result.status==='PAUSED')throw new LocalError('COLLECTION_INCOMPLETE');
   await save(result);const coverage=runCoverage(result);if(!coverage)throw new LocalError('COLLECTION_COVERAGE_UNAVAILABLE');
   this.collection.finish(lease,runId,{status:result.status,reason:result.reason??null,coverage});return {runId,status:result.status,posts:result.posts.length,requests:result.requests};
  }catch(error){try{this.collection.fail(lease,runId,error?.code==='ACCOUNT_IDENTITY_CHANGED'?'ACCOUNT_IDENTITY_CHANGED':'COLLECTION_INTERRUPTED');}catch{}throw new LocalError('COLLECTION_INTERRUPTED');}
  finally{await adapter?.close().catch(()=>{});if(session&&!await Promise.resolve().then(()=>session.stop()).catch(()=>false)){
   this.store.transaction(()=>{const event=this.store.audit('RECOVERY','PLATFORM_PROCESS_STOP_UNCONFIRMED',runId);this.store.db.prepare("INSERT INTO safety_state VALUES('platform',1,?,'PLATFORM_PROCESS_STOP_UNCONFIRMED',?) ON CONFLICT(id) DO UPDATE SET version=version+1,event_id=excluded.event_id,reason=excluded.reason,created_at=excluded.created_at").run(event,this.store.clock());});
   try{this.collection.fail(lease,runId,'PLATFORM_PROCESS_STOP_UNCONFIRMED');}catch{}
   throw new LocalError('PLATFORM_PROCESS_STOP_UNCONFIRMED');
  }}
 }
}
module.exports={LocalCollectionExecutor};
