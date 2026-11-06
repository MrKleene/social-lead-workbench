'use strict';
const {randomUUID}=require('node:crypto');
const {LocalQueue}=require('./queue.cjs');
const {SendSafety}=require('./send-safety.cjs');
// Executors are explicitly injected. Opening the desktop never registers a
// platform adapter or grants permission to resume historical external actions.
class LocalRunner {
 constructor(store,executors={}){this.store=store;this.queue=new LocalQueue(store);this.sends=new SendSafety(store);this.executors=executors;this.owner=randomUUID();this.pending=null;this.stopping=false;}
 tick(){if(this.pending||this.stopping)return this.pending??Promise.resolve(false);this.pending=this.runOne().finally(()=>{this.pending=null;});return this.pending;}
 async runOne(){
  this.queue.recover();this.sends.recover();const lease=this.queue.claim(this.owner);if(!lease)return false;
  const executor=this.executors[lease.kind];if(!executor){this.queue.finish(lease,'FAILED',{code:'EXECUTOR_UNAVAILABLE'});return false;}
  const abort=new AbortController();this.abort=abort;let dispatched=false,attemptId;
  const heartbeat=setInterval(()=>{try{this.queue.heartbeat(lease);}catch{abort.abort();}},5000);heartbeat.unref();
  try{
   // prepare is read-only locally. It must not submit a platform/model request.
   await executor.prepare(lease.payload,abort.signal);if(abort.signal.aborted||this.stopping)throw Error('STOPPED');
   let command=lease.payload;
   if(lease.kind==='SEND'){attemptId=this.sends.reserve(lease);command=this.sends.dispatch(lease,attemptId);}else this.queue.beginDispatch(lease);
   dispatched=true;const result=await executor.execute(command,abort.signal);
   if(lease.kind==='SEND')this.sends.result(lease,attemptId,result);else this.queue.finish(lease,'SUCCEEDED',result);
  }catch{
   try{if(attemptId)this.sends.result(lease,attemptId,dispatched?{kind:'UNKNOWN'}:{kind:'NOT_SUBMITTED',submissions:0,stopped:true});else this.queue.finish(lease,dispatched&&['SEND','REVIEW'].includes(lease.kind)?'UNKNOWN':'FAILED',{code:'EXECUTION_INTERRUPTED'});}catch{/* Expired leases are handled by recovery; never overwrite a newer owner. */}
  }finally{clearInterval(heartbeat);this.abort=null;await executor.close?.();}
  return true;
 }
 async stop(){this.stopping=true;this.abort?.abort();await this.pending;}
}
module.exports={LocalRunner};
