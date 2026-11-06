'use strict';
const {randomUUID}=require('node:crypto');
const {LocalQueue}=require('./queue.cjs');
const {SendSafety}=require('./send-safety.cjs');
const {LocalReview}=require('./review.cjs');
const {LocalCollection}=require('./collection.cjs');
// Executors are explicitly injected. Opening the desktop never registers a
// platform adapter or grants permission to resume historical external actions.
class LocalRunner {
 constructor(store,executors={}){this.store=store;this.queue=new LocalQueue(store);this.sends=new SendSafety(store);this.reviews=new LocalReview(store);this.collection=new LocalCollection(store);this.executors=executors;this.owner=randomUUID();this.pending=null;this.stopping=false;}
 tick(){if(this.pending||this.stopping)return this.pending??Promise.resolve(false);this.pending=this.runOne().finally(()=>{this.pending=null;});return this.pending;}
 recoverStartup(){
  // The application holds its exclusive instance lock. Never resume a previous
  // desktop session's pending external actions merely because the app opened.
  this.store.transaction(()=>{this.store.db.exec("UPDATE evidence_checks SET state='INTERRUPTED' WHERE state='RUNNING'; UPDATE authorizations SET state='REVOKED' WHERE state='ACTIVE'; UPDATE jobs SET state='INTERRUPTED',cancel_requested=1 WHERE state='QUEUED'; UPDATE jobs SET lease_until=0 WHERE state='RUNNING'; DELETE FROM account_leases WHERE owner LIKE 'login:%'");this.store.audit('RECOVERY','DESKTOP_SESSION_RECOVERED','installation');});
  this.queue.recover();this.sends.recover();this.reviews.recover();this.collection.recover();
 }
 async runOne(){
  this.queue.recover();this.sends.recover();this.reviews.recover();this.collection.recover();const lease=this.queue.claim(this.owner);if(!lease)return false;
  const executor=this.executors[lease.kind];if(!executor){this.queue.finish(lease,'FAILED',{code:'EXECUTOR_UNAVAILABLE'});return false;}
  const abort=new AbortController();this.abort=abort;let dispatched=false,attemptId,batchId,commentCommand;
  const heartbeat=setInterval(()=>{try{this.queue.heartbeat(lease);if(lease.kind==='INBOX'&&this.store.db.prepare("SELECT 1 FROM jobs WHERE kind='SEND' AND state='QUEUED' AND cancel_requested=0 AND available_at<=?").get(this.store.clock()))abort.abort('INBOX_YIELD_FOR_SEND');}catch{abort.abort();}},5000);heartbeat.unref();
  try{
   // prepare validates local authority and may inspect the exact comment target read-only.
   // It must never submit a message or invoke a paid model.
   await executor.prepare(lease.payload,abort.signal,{lease});if(abort.signal.aborted||this.stopping)throw Error('STOPPED');
   let command=lease.payload;
   if(lease.kind==='SEND'){
    const reference=lease.payload.channel==='COMMENT'?await executor.commentReference?.(lease.payload,abort.signal):null;
    if(lease.payload.channel==='COMMENT'&&!reference)throw Error('COMMENT_REFERENCE_UNAVAILABLE');
    attemptId=this.sends.reserve(lease);command=this.sends.dispatch(lease,attemptId);
    // Set this immediately after the durable dispatch intent, including command validation failures.
    dispatched=true;
    command=lease.payload.channel==='DM'?this.sends.commandForDm(attemptId):(commentCommand=this.sends.commandForComment(attemptId,reference));
   }else if(lease.kind==='REVIEW'){batchId=this.reviews.reserve(lease);command=this.reviews.dispatch(lease,batchId);}else this.queue.beginDispatch(lease);
   dispatched=true;const result=await executor.execute(command,abort.signal,{lease});
   if(lease.kind==='SEND'){if(lease.payload.channel==='DM')this.sends.resultDm(lease,attemptId,result);else this.sends.resultComment(lease,attemptId,commentCommand,result);}else if(lease.kind==='REVIEW'){this.reviews.complete(lease,batchId,result);try{new (require('./automation.cjs').LocalAutomation)(this.store,{enabled:()=>!!this.executors.SEND}).afterReview(lease.payload.runId);}catch{this.store.transaction(()=>this.store.audit('RECOVERY','AUTOMATION_COORDINATION_INTERRUPTED',lease.payload.runId));}}else if(lease.kind==='INBOX'&&result?.reason==='YIELDED_FOR_SEND'&&!this.stopping&&!this.queue.current(lease).cancel_requested)this.queue.yieldInbox(lease);else this.queue.finish(lease,abort.signal.aborted||this.queue.current(lease).cancel_requested?'CANCELLED':'SUCCEEDED',result);
  }catch{
   try{if(attemptId)this.sends.result(lease,attemptId,dispatched?{kind:'UNKNOWN'}:{kind:'NOT_SUBMITTED',submissions:0,stopped:true});else if(batchId)this.reviews.fail(lease,batchId);else this.queue.finish(lease,dispatched&&['SEND','REVIEW'].includes(lease.kind)?'UNKNOWN':!['SEND','REVIEW'].includes(lease.kind)&&(abort.signal.aborted||this.queue.current(lease).cancel_requested)?'CANCELLED':'FAILED',{code:'EXECUTION_INTERRUPTED'});}catch{/* Expired leases are handled by recovery; never overwrite a newer owner. */}
  }finally{clearInterval(heartbeat);this.abort=null;await executor.close?.();}
  return true;
 }
 async stop(){this.stopping=true;this.abort?.abort();await this.pending;}
}
module.exports={LocalRunner};
