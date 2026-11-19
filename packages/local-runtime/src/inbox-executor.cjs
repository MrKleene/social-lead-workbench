'use strict';
const {LocalError,hash}=require('./database.cjs'),{LocalQueue}=require('./queue.cjs'),{LocalInbox}=require('./inbox.cjs');
class LocalInboxExecutor{
 constructor(store,runtime,{wireFactory}={}){this.store=store;this.runtime=runtime;this.wireFactory=wireFactory;this.queue=new LocalQueue(store);this.inbox=new LocalInbox(store);}
 async prepare(scope,signal,{lease}){const job=this.queue.current(lease);if(signal.aborted||job.kind!=='INBOX'||job.dispatch_started||job.cancel_requested||hash(scope)!==job.payload_hash)throw new LocalError('INBOX_AUTHORIZATION_REQUIRED');if(!this.runtime.available('INBOX')||this.store.db.prepare("SELECT 1 FROM safety_state WHERE id='platform' AND reason IS NOT NULL").get())throw new LocalError('INBOX_RUNTIME_UNAVAILABLE');}
 /** 一次只读获取：先评论区通知，再私信会话；读完立即停止，不维持推送监听。 */
 async execute(scope,signal,{lease}){
  const receiver=this.inbox.start(lease);let session,wire,received=0,reason='SNAPSHOT_COMPLETE';
  const proof=value=>{if(!value||value.identity!=='MATCH'||value.submissions!==0)throw new LocalError('INBOX_IDENTITY_UNVERIFIED');return value;};
  const close=async()=>{await wire?.close().catch(()=>{});wire=null;if(session){const old=session;session=null;const stopped=await old.stop().catch(()=>false);if(!stopped){reason='PLATFORM_PROCESS_STOP_UNCONFIRMED';this.store.transaction(()=>{const e=this.store.audit('RECOVERY','INBOX_STOP_UNCONFIRMED',scope.accountId);this.store.db.prepare("INSERT INTO safety_state VALUES('platform',1,?,'PLATFORM_PROCESS_STOP_UNCONFIRMED',?) ON CONFLICT(id) DO UPDATE SET reason=excluded.reason,event_id=excluded.event_id,version=version+1").run(e,this.store.clock());});throw new LocalError('PLATFORM_PROCESS_STOP_UNCONFIRMED');}}};
  try{
   if(signal.aborted)throw new LocalError('INBOX_CANCELLED');
   const account=this.store.db.prepare('SELECT * FROM accounts WHERE id=?').get(scope.accountId);
   session=await this.runtime.openSaved({accountId:account.id,revision:account.revision,senderId:account.platform_user_id,sessionRef:account.session_ref,purpose:'INBOX'},signal);
   wire=this.wireFactory(session.endpoint(),account.platform_user_id,signal);await wire.connect();proof(await wire.call('inbox_start'));
   this.inbox.status(lease,receiver,{state:'SYNCING'});
   for(const channel of ['COMMENT','DM']){
    if(signal.aborted)throw new LocalError('INBOX_CANCELLED');
    const snapshot=proof(await wire.call('inbox_snapshot',channel));
    if(!Array.isArray(snapshot.items)||snapshot.items.length>500)throw new LocalError('INBOX_BOUND');
    this.inbox.current(lease,receiver);
    received+=this.inbox.ingest(lease,receiver,snapshot.items,'RECONCILIATION').added;
    this.inbox.status(lease,receiver,{state:'SYNCING',...(channel==='COMMENT'?{commentMode:'RECONCILIATION'}:{dmMode:'RECONCILIATION'})});
   }
   this.inbox.status(lease,receiver,{state:'LISTENING',commentMode:'RECONCILIATION',dmMode:'RECONCILIATION',coverage:'VISIBLE_PARTIAL',reason:'VISIBLE_HISTORY_ONLY'});
   return {received,reason};
  }catch(error){
   if(error?.code==='PLATFORM_PROCESS_STOP_UNCONFIRMED'){reason=error.code;throw error;}
   if(signal.aborted){reason='CANCELLED';return {received,reason};}
   reason='INBOX_INTERRUPTED';throw new LocalError(error?.code||reason);
  }finally{
   try{await close();}finally{this.store.transaction(()=>{this.store.db.prepare("UPDATE inbox_receivers SET state=CASE WHEN ?='PLATFORM_PROCESS_STOP_UNCONFIRMED' THEN 'FAILED' ELSE 'STOPPED' END,stop_requested=1,coverage=?,reason=?,updated_at=? WHERE account_id=? AND generation=?").run(reason,reason==='SNAPSHOT_COMPLETE'?'VISIBLE_PARTIAL':'UNCONFIRMED',reason,this.store.clock(),receiver.accountId,receiver.generation);});}
  }
 }
}
module.exports={LocalInboxExecutor};
