'use strict';
const {LocalError}=require('./database.cjs');
const {parsePostReference,singlePostSummary,postSchema,commentSchema}=require('./policy.cjs');
const {XhsMcpAdapter,readWindow}=require('./collection-provider.cjs');
class PostDiagnostic{
 constructor(store,vault,runtime,{adapterFactory=(wire,guard)=>new XhsMcpAdapter(wire,true,'XHS_MCP',readWindow,guard)}={}){this.store=store;this.db=store.db;this.vault=vault;this.runtime=runtime;this.adapterFactory=adapterFactory;this.current=null;}
 cancel(){this.current?.abort.abort();return {requested:true};}
 async check(input){
  const {accountId,url,requestKey,mode='INITIAL_WINDOW',consent}=input??{},ref=parsePostReference(url);
  if(!ref||typeof accountId!=='string'||!['INITIAL_WINDOW','BOUNDED_REPLIES'].includes(mode)||typeof requestKey!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(requestKey)||consent!==(mode==='BOUNDED_REPLIES'?'single-post-bounded-read-v1':'single-post-read-v1'))throw new LocalError('INVALID_POST_DIAGNOSTIC');
  if(!this.runtime?.available('COLLECT'))throw new LocalError('PLATFORM_COMPONENT_UNAVAILABLE');
  const a=this.db.prepare("SELECT * FROM accounts WHERE id=? AND state='VERIFIED'").get(accountId);
  if(!a?.session_ref||!this.vault.has('PLATFORM_SESSION',a.session_ref))throw new LocalError('PLATFORM_SESSION_UNAVAILABLE');
  const guard=async()=>{if(signal.aborted)throw new LocalError('DIAGNOSTIC_CANCELLED');if(this.db.prepare("SELECT 1 FROM safety_state WHERE id='platform' AND reason IS NOT NULL").get())throw new LocalError('PLATFORM_PROCESS_RECONCILIATION_REQUIRED');if(!this.db.prepare("SELECT 1 FROM accounts WHERE id=? AND revision=? AND state='VERIFIED' AND session_ref=? AND platform_user_id=?").get(accountId,a.revision,a.session_ref,a.platform_user_id))throw new LocalError('ACCOUNT_IDENTITY_CHANGED');};
  const abort=new AbortController(),signal=AbortSignal.any([abort.signal,AbortSignal.timeout(45000)]);await guard();
  this.store.transaction(()=>{if(this.store.active()||this.current)throw new LocalError('DIAGNOSTIC_REQUIRES_IDLE');if(this.db.prepare('SELECT 1 FROM post_diagnostics WHERE request_key=?').get(requestKey))throw new LocalError('DIAGNOSTIC_ALREADY_SUBMITTED');this.db.prepare("INSERT INTO post_diagnostics VALUES(?,?,?,'RUNNING',?,NULL)").run(requestKey,accountId,mode,this.store.clock());this.store.audit('LOCAL_USER','POST_DIAGNOSTIC_AUTHORIZED',requestKey,{mode});});this.current={abort};
  let session,adapter,stopped=true,result={status:'FAILED',reason:'CHECK_FAILED'};
  try{
   session=await this.runtime.openSaved({accountId,revision:a.revision,senderId:a.platform_user_id,sessionRef:a.session_ref,purpose:'COLLECT'},signal);stopped=false;
   const status=await session.status(signal);if(!status.loggedIn||status.userId!==a.platform_user_id)throw new LocalError('ACCOUNT_IDENTITY_CHANGED');await guard();
   adapter=this.adapterFactory(session.readTransport(),guard);const post=await adapter.postReference(ref,signal,mode);await guard();
   result=singlePostSummary(postSchema.parse(post),adapter.receivedComments(post).map(c=>commentSchema.parse(c)),mode);
   if(result.boundedRead?.reason==='PLATFORM_LIMIT')require('./account-safety.cjs').retainAccountRisk(this.store,accountId,null,'RESTRICTED',{kind:'POST_DIAGNOSTIC_PLATFORM_LIMIT'});
  }catch(error){
   // Raw exceptions may include the supplied access token. Only fixed enum codes
   // cross IPC or enter audit storage; no URL/content/session is persisted.
   const allowed=['ACCOUNT_IDENTITY_CHANGED','DIAGNOSTIC_CANCELLED','RESTRICTED','VERIFY_REQUIRED','RATE_LIMITED','NOT_LOGGED_IN','INVALID_DATA','TIMEOUT'];const reason=allowed.includes(error?.code)?error.code:'CHECK_FAILED';result={status:'FAILED',reason};
   if(['RESTRICTED','VERIFY_REQUIRED','RATE_LIMITED'].includes(reason))require('./account-safety.cjs').retainAccountRisk(this.store,accountId,null,reason,{kind:'POST_DIAGNOSTIC_FAILURE',reason});
  }finally{
   await adapter?.close().catch(()=>{});if(session)stopped=await Promise.resolve().then(()=>session.stop()).catch(()=>false);
   if(!stopped){result={status:'FAILED',reason:'PLATFORM_PROCESS_STOP_UNCONFIRMED'};this.store.transaction(()=>{const id=this.store.audit('RECOVERY','POST_DIAGNOSTIC_STOP_UNCONFIRMED',requestKey);this.db.prepare("INSERT INTO safety_state VALUES('platform',1,?,'PLATFORM_PROCESS_STOP_UNCONFIRMED',?) ON CONFLICT(id) DO UPDATE SET version=version+1,event_id=excluded.event_id,reason=excluded.reason").run(id,this.store.clock());});}
   this.store.transaction(()=>{this.db.prepare('UPDATE post_diagnostics SET state=?,finished_at=? WHERE request_key=?').run(result.status==='CHECKED'?'COMPLETED':'FAILED',this.store.clock(),requestKey);this.store.audit('AUTOMATION','POST_DIAGNOSTIC_FINISHED',requestKey,{mode,status:result.status,...(result.reason?{reason:result.reason}:{})});});this.current=null;
  }
  return result;
 }
}
module.exports={PostDiagnostic};
