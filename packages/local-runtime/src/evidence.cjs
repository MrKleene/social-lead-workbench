'use strict';
const {randomUUID,createHash}=require('node:crypto'),{LocalError,hash,canonical}=require('./database.cjs'),{validDmMessageId}=require('@crm/local-runtime/policy');
const digest=s=>createHash('sha256').update(s).digest('hex'),pid=s=>typeof s==='string'&&/^[a-f0-9]{24}$/.test(s);
class LocalEvidence{
 constructor(store,vault,runtime,wire){this.store=store;this.db=store.db;this.vault=vault;this.runtime=runtime;this.wire=wire;this.current=null;}
 list(){return {attempts:this.db.prepare("SELECT s.id,s.channel,s.content,s.recipient_id,s.account_id,s.updated_at,a.name account_name FROM send_attempts s JOIN accounts a ON a.id=s.account_id WHERE s.state='UNKNOWN' ORDER BY s.updated_at DESC LIMIT 100").all(),checks:this.db.prepare('SELECT id,attempt_id,state,started_at,finished_at,details FROM evidence_checks ORDER BY started_at DESC LIMIT 30').all().map(r=>({...r,details:JSON.parse(r.details)}))};}
 scope({attemptId,replyId}){
  const a=this.db.prepare("SELECT * FROM send_attempts WHERE id=? AND state='UNKNOWN'").get(attemptId);if(!a)throw new LocalError('UNKNOWN_ATTEMPT_REQUIRED');
  const account=this.db.prepare("SELECT * FROM accounts WHERE id=? AND state IN('VERIFIED','RESTRICTED')").get(a.account_id);if(!account?.session_ref||!pid(account.platform_user_id)||account.platform_user_id!==a.sender_id||!pid(a.recipient_id))throw new LocalError('EVIDENCE_ACCOUNT_LOGIN_REQUIRED');
  if(this.db.prepare("SELECT 1 FROM safety_state WHERE id='platform' AND reason IS NOT NULL").get())throw new LocalError('PLATFORM_PROCESS_RECONCILIATION_REQUIRED');
  const target=JSON.parse(a.target);let ref;
  if(a.channel==='COMMENT'){
   if(!pid(replyId)||[target.postId,target.commentId,a.sender_id,a.recipient_id].includes(replyId))throw new LocalError('CANDIDATE_REPLY_ID_REQUIRED');
   ref=this.db.prepare('SELECT source_reference_ref FROM run_posts WHERE platform_id=? AND source_reference_ref IS NOT NULL ORDER BY rowid DESC LIMIT 1').get(target.postId)?.source_reference_ref;
   if(!ref||!this.vault.has('POST_REFERENCE',ref))throw new LocalError('COMMENT_REFERENCE_UNAVAILABLE');
  }else if(a.channel!=='DM'||replyId!==undefined&&replyId!=='')throw new LocalError('INVALID_EVIDENCE_CHANNEL');
  return {attemptId:a.id,channel:a.channel,accountId:account.id,accountRevision:account.revision,senderId:a.sender_id,recipientId:a.recipient_id,contentHash:digest(a.content),target,attemptUpdatedAt:a.updated_at,attemptScopeHash:a.scope_hash,sessionHash:digest(account.session_ref),...(ref?{referenceRef:ref,replyId}:{})};
 }
 preview(input){const scope=this.scope(input),a=this.db.prepare('SELECT content FROM send_attempts WHERE id=?').get(scope.attemptId);return {scope,previewHash:hash(scope),content:a.content,accountName:this.db.prepare('SELECT name FROM accounts WHERE id=?').get(scope.accountId).name,mayMarkRead:scope.channel==='DM',available:!!this.runtime?.available(scope.channel==='DM'?'DMVERIFY':'VERIFY')};}
 cancel(){this.current?.abort.abort();return {requested:true};}
 async verify({scope,previewHash,consent}){
  if(consent!=='inspect-unknown-twice-no-send-v1'||!scope||hash(scope)!==previewHash||hash(this.scope({attemptId:scope.attemptId,replyId:scope.replyId}))!==previewHash)throw new LocalError('EVIDENCE_PREVIEW_CHANGED');
  if(!this.runtime?.available(scope.channel==='DM'?'DMVERIFY':'VERIFY')||!this.wire)throw new LocalError('EVIDENCE_EXECUTOR_UNAVAILABLE');
  const id=randomUUID(),started=this.store.clock(),abort=new AbortController(),signal=AbortSignal.any([abort.signal,AbortSignal.timeout(100000)]);this.store.transaction(()=>{if(this.current||this.store.active())throw new LocalError('EVIDENCE_REQUIRES_IDLE');this.db.prepare("INSERT INTO evidence_checks(id,attempt_id,scope_hash,state,started_at) VALUES(?,?,?,'RUNNING',?)").run(id,scope.attemptId,previewHash,started);this.store.audit('LOCAL_USER','UNKNOWN_READBACK_AUTHORIZED',scope.attemptId,{checkId:id,scopeHash:previewHash});});this.current={id,abort};const observations=[];let stopped=true;
  const unchanged=()=>{if(signal.aborted||hash(this.scope({attemptId:scope.attemptId,replyId:scope.replyId}))!==previewHash)throw new LocalError('EVIDENCE_AUTHORITY_CHANGED');};
  try{
   for(let i=0;i<2;i++){
    unchanged();const account=this.db.prepare('SELECT * FROM accounts WHERE id=?').get(scope.accountId),session=await this.runtime.openSaved({accountId:account.id,revision:account.revision,senderId:scope.senderId,sessionRef:account.session_ref,purpose:scope.channel==='DM'?'DMVERIFY':'VERIFY'},signal);stopped=false;
    try{
     const base={accountId:scope.accountId,senderId:scope.senderId,recipientId:scope.recipientId,contentSha256:scope.contentHash};let observed;
     if(scope.channel==='DM')observed=await this.wire.inspectDm(session,base,signal);
     else{const ref=JSON.parse(this.vault.get('POST_REFERENCE',scope.referenceRef));if(ref.postId!==scope.target.postId)throw new LocalError('COMMENT_REFERENCE_UNAVAILABLE');observed=await this.wire.inspectComment(session,{...base,protocol:'workbench.xhs.exact-reply-verify.v1',postId:scope.target.postId,targetCommentId:scope.target.commentId,replyId:scope.replyId,postReference:ref},signal);}
     observations.push(observed);
    }finally{stopped=await session.stop().catch(()=>false);if(!stopped)throw new LocalError('PLATFORM_PROCESS_STOP_UNCONFIRMED');}
   }
   unchanged();if(observations.length!==2||observations[0].inspectionId===observations[1].inspectionId||observations[0].messageId!==observations[1].messageId)throw new LocalError('EVIDENCE_NOT_EXACT');
   for(const o of observations){const observed=Date.parse(o.observedAt);if(typeof o.inspectionId!=='string'||!o.inspectionId||o.senderId!==scope.senderId||o.recipientId!==scope.recipientId||o.contentSha256!==scope.contentHash||!Number.isFinite(observed)||observed<started-5000||observed>this.store.clock()+5000||(scope.channel==='DM'?!validDmMessageId(o.messageId,scope.senderId,scope.recipientId):o.messageId!==scope.replyId||o.postId!==scope.target.postId||o.parentCommentId!==scope.target.commentId))throw new LocalError('EVIDENCE_NOT_EXACT');}
   return this.store.transaction(()=>{unchanged();const evidence={kind:'CONFIRMED',proof:'TWO_INDEPENDENT_STOPPED_READBACKS',checkId:id,observations,stopped:true},now=this.store.clock();const changed=this.db.prepare("UPDATE send_attempts SET state='CONFIRMED',receipt=?,evidence=?,updated_at=? WHERE id=? AND state='UNKNOWN' AND updated_at=?").run(observations[0].messageId,canonical(evidence),now,scope.attemptId,scope.attemptUpdatedAt);if(changed.changes!==1)throw new LocalError('EVIDENCE_PREVIEW_CHANGED');this.db.prepare("UPDATE jobs SET state='SUCCEEDED',result=?,updated_at=? WHERE request_key=(SELECT request_key FROM send_attempts WHERE id=?) AND state='UNKNOWN'").run(canonical({attemptId:scope.attemptId,state:'CONFIRMED',readback:true}),now,scope.attemptId);this.db.prepare("UPDATE send_queue SET state='SENT',reason=NULL,updated_at=?,settled_at=? WHERE state='UNKNOWN' AND job_id=(SELECT id FROM jobs WHERE request_key=(SELECT request_key FROM send_attempts WHERE id=?))").run(now,now,scope.attemptId);this.db.prepare("UPDATE evidence_checks SET state='CONFIRMED',details=?,finished_at=? WHERE id=? AND state='RUNNING'").run(canonical(evidence),now,id);this.store.audit('RECOVERY','UNKNOWN_READBACK_CONFIRMED',scope.attemptId,{checkId:id,scopeHash:previewHash});return {id,state:'CONFIRMED'};});
  }catch(error){this.store.transaction(()=>{const reason=error instanceof LocalError?error.code:'EVIDENCE_UNVERIFIED';this.db.prepare("UPDATE evidence_checks SET state='UNVERIFIED',details=?,finished_at=? WHERE id=? AND state='RUNNING'").run(canonical({reason,stopped}),this.store.clock(),id);if(!stopped){const e=this.store.audit('RECOVERY','READBACK_STOP_UNCONFIRMED',scope.attemptId);this.db.prepare("INSERT INTO safety_state VALUES('platform',1,?,'PLATFORM_PROCESS_STOP_UNCONFIRMED',?) ON CONFLICT(id) DO UPDATE SET reason=excluded.reason,event_id=excluded.event_id,version=version+1").run(e,this.store.clock());}});return {id,state:'UNVERIFIED'};
  }finally{if(this.current?.id===id)this.current=null;}
 }
}
module.exports={LocalEvidence};
