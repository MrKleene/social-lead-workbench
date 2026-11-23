'use strict';
const {createHash}=require('node:crypto');
const {LocalError,hash}=require('./database.cjs'),{LocalQueue}=require('./queue.cjs'),{SendSafety,validateScope}=require('./send-safety.cjs');
const {assertSendAccount,retainAccountRisk}=require('./account-safety.cjs');
const digest=s=>createHash('sha256').update(s).digest('hex');
const preflightCode=result=>({
 PREFLIGHT_REFERENCE_UNVERIFIED:'COMMENT_REFERENCE_UNVERIFIED',
 PREFLIGHT_NAVIGATION_UNVERIFIED:'COMMENT_PAGE_UNAVAILABLE',
 STATE_POST_MISSING:'COMMENT_POST_UNAVAILABLE',
 STATE_POST_MISMATCH:'COMMENT_POST_UNAVAILABLE',
 STATE_COMMENTS_MISSING:'COMMENT_TREE_UNAVAILABLE',
 STATE_INVALID:'COMMENT_TREE_UNAVAILABLE',
 STATE_UNAVAILABLE:'COMMENT_TREE_UNAVAILABLE',
 EXACT_TARGET_MISSING_OR_AMBIGUOUS:'COMMENT_TARGET_NOT_FOUND',
 DOM_LOCATOR_UNVERIFIED:'COMMENT_TARGET_NOT_VISIBLE',
 TARGET_MISMATCH:'COMMENT_TARGET_MISMATCH',
 DEPTH_LIMIT:'COMMENT_TREE_TOO_LARGE',
 ROW_LIMIT:'COMMENT_TREE_TOO_LARGE',
}[result?.result?.diagnostic?.code]??'COMMENT_PREFLIGHT_FAILED');
const unavailableCode=reason=>({
 INVALID_TARGET:'COMMENT_PREFLIGHT_INVALID',
 DISABLED:'COMMENT_PREFLIGHT_DISABLED',
 PROTOCOL_UNAVAILABLE:'COMMENT_PREFLIGHT_UNAVAILABLE',
 STOP_UNCONFIRMED:'PLATFORM_PROCESS_STOP_UNCONFIRMED',
}[reason]??'COMMENT_PREFLIGHT_FAILED');
class LocalSendExecutor{
 constructor(store,vault,runtime,wire){this.store=store;this.vault=vault;this.runtime=runtime;this.wire=wire;this.queue=new LocalQueue(store);this.safety=new SendSafety(store);this.reference=null;}
 async prepare(scope,signal,{lease}){
  const job=this.queue.current(lease);validateScope(scope);this.reference=null;
  if(signal.aborted||job.kind!=='SEND'||job.dispatch_started||job.cancel_requested||hash(scope)!==job.payload_hash)throw new LocalError('SEND_AUTHORIZATION_REQUIRED');
  this.safety.notPaused();if(this.store.db.prepare("SELECT 1 FROM safety_state WHERE id='platform' AND reason IS NOT NULL").get())throw new LocalError('PLATFORM_PROCESS_RECONCILIATION_REQUIRED');
  const a=this.store.db.prepare("SELECT * FROM accounts WHERE id=? AND revision=? AND state='VERIFIED'").get(scope.accountId,scope.accountRevision);
  if(!a?.session_ref||!this.vault.has('PLATFORM_SESSION',a.session_ref)||!this.runtime.available(scope.channel))throw new LocalError('SEND_ACCOUNT_UNAVAILABLE');
  if(!this.runtime.available(scope.channel==='DM'?'DMVERIFY':'VERIFY'))throw new LocalError('SEND_CONFIRMATION_UNAVAILABLE');
  if(scope.channel==='COMMENT'){
   const row=this.store.db.prepare('SELECT source_reference_ref FROM run_posts WHERE platform_id=? AND source_reference_ref IS NOT NULL ORDER BY rowid DESC LIMIT 1').get(scope.target.postId);
   if(!row)throw new LocalError('COMMENT_REFERENCE_UNAVAILABLE');this.reference=JSON.parse(this.vault.get('POST_REFERENCE',row.source_reference_ref));
   const comment=this.store.db.prepare('SELECT parent_id FROM run_comments WHERE platform_id=? ORDER BY rowid DESC LIMIT 1').get(scope.target.commentId);
   if(comment?.parent_id)throw new LocalError('COMMENT_NESTED_REPLY_UNSUPPORTED');
   const target={protocol:'workbench.xhs.exact-preflight.v2',accountId:a.id,senderId:a.platform_user_id,postId:scope.target.postId,targetCommentId:scope.target.commentId,recipientId:scope.recipientId,postReference:this.reference};
   const session=await this.runtime.openSaved({accountId:a.id,senderId:a.platform_user_id,sessionRef:a.session_ref,purpose:'PREFLIGHT'},signal);let result;
   try{result=await this.wire.inspectComment(session,target,signal);}finally{if(!await session.stop())throw new LocalError('PLATFORM_PROCESS_STOP_UNCONFIRMED');}
   if(result?.kind==='READ_ONLY_RESULT'&&result.result.kind==='RISK'){const reason={RATE_LIMITED:'RATE_LIMITED',VERIFICATION:'VERIFY_REQUIRED',BANNED:'RESTRICTED',PLATFORM_REFUSED:'PLATFORM_REFUSED'}[result.result.diagnostic.code];if(reason)retainAccountRisk(this.store,a.id,'COMMENT',reason,{code:result.result.diagnostic.code});}
   if(result?.kind!=='READ_ONLY_RESULT'){const code=unavailableCode(result?.reason);this.store.audit('AUTOMATION','SEND_PREFLIGHT_REJECTED',scope.basis?.queueId??scope.target.commentId,{code,reason:result?.reason??null});throw new LocalError(code);}
   if(result.result.kind!=='MATCHED_READ_ONLY'){const code=preflightCode(result);this.store.audit('AUTOMATION','SEND_PREFLIGHT_REJECTED',scope.basis?.queueId??scope.target.commentId,{code,preflightCode:result.result.diagnostic?.code??null});throw new LocalError(code);}
   this.queue.current(lease);if(signal.aborted)throw new LocalError('SEND_CANCELLED');
   this.store.transaction(()=>{const current=this.store.db.prepare('SELECT * FROM accounts WHERE id=?').get(a.id);if(current.revision!==a.revision||current.session_ref!==a.session_ref)throw new LocalError('ACCOUNT_IDENTITY_CHANGED');const now=this.store.clock();this.store.db.prepare("INSERT INTO account_capabilities(account_id,channel,account_revision,sender_id,session_hash,driver_hash,evidence_hash,verified_at,expires_at) VALUES(?,'COMMENT',?,?,?,?,?,?,?) ON CONFLICT(account_id,channel) DO UPDATE SET account_revision=excluded.account_revision,sender_id=excluded.sender_id,session_hash=excluded.session_hash,verified_at=excluded.verified_at,expires_at=excluded.expires_at,driver_hash=excluded.driver_hash,evidence_hash=excluded.evidence_hash").run(a.id,a.revision,a.platform_user_id,digest(a.session_ref),session.binaryHash,hash(result.result),now,now+300000);});
  }
  assertSendAccount(this.store,a.id,a.revision,scope.channel);
 }
 commentReference(){return this.reference;}
 async execute(command,signal,{lease}){
  const scope=JSON.parse(this.queue.current(lease).payload),a=assertSendAccount(this.store,scope.accountId,scope.accountRevision,scope.channel),combined=AbortSignal.any([signal,AbortSignal.timeout(70000)]);
  let session,journal,raw,called=false;
  try{
   session=await this.runtime.openSaved({accountId:a.id,senderId:a.platform_user_id,sessionRef:a.session_ref,purpose:scope.channel},combined);
   session.retainJournal(command.attemptId,value=>{journal=value;this.store.transaction(()=>this.store.audit('AUTOMATION','SEND_PROCESS_JOURNAL',command.attemptId,{journal:value}));});
   const before=async()=>{const job=this.queue.current(lease);if(called||combined.aborted||job.cancel_requested)return false;this.safety.account(scope);this.safety.notPaused();this.safety.scopeLimit(scope,this.store.db.prepare('SELECT * FROM authorizations WHERE id=?').get(job.authorization_id));if(scope.intent==='INBOX_REPLY')require('./inbox.cjs').assertReplyScope(this.store,scope,job.request_key);called=true;this.store.transaction(()=>this.store.audit('AUTOMATION','SEND_RPC_INTENT',command.attemptId,{scopeHash:hash(scope)}));return true;};
   raw=await (scope.channel==='DM'?this.wire.submitDm:this.wire.submitComment)(session,command,combined,before);
  }catch(error){if(['RATE_LIMITED','PLATFORM_REFUSED'].includes(error?.code))retainAccountRisk(this.store,a.id,scope.channel,error.code,{attemptId:command.attemptId,code:error.code});throw error;}finally{if(session&&!await session.stop())throw new LocalError('PLATFORM_PROCESS_STOP_UNCONFIRMED');}
  if(!called||journal?.state!=='AVAILABLE')throw new LocalError('SEND_JOURNAL_UNAVAILABLE');return raw;
 }
}
module.exports={LocalSendExecutor};
