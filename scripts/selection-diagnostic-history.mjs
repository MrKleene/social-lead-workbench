// Read-only use of the existing immutable recovery proof. attemptedAt records
// dispatch start and is not evidence of a platform submission.
export async function verifySelectionHistory(tx,scope,actorId,verifyChain){
 const fail=()=>{throw Error('TARGET_HISTORY_BLOCKED')};
 const ledger=await tx.contactLedger.findFirst({where:{mode:'REAL',identity:{platform:'XHS',platformUserId:scope.recipientId}},include:{attempts:true}});
 if(!ledger)return {predecessorCount:0};
 const attempts=ledger.attempts;
 if(ledger.accountId!==scope.accountId||!attempts.length||attempts.length>16||attempts.some(a=>a.outcome!=='FAILED'||a.mode!=='REAL'||a.channel!=='COMMENT'||a.confirmedAt||a.platformReceipt))fail();
 const referenced=new Set(attempts.map(a=>a.historySnapshot?.previousNotAttemptedId).filter(Boolean));
 const heads=attempts.filter(a=>!referenced.has(a.id));if(heads.length!==1)fail();
 const head=heads[0];
 const starts=await tx.auditLog.findMany({where:{entityId:head.requestKey,action:'SINGLE_REPLY_TEST_AUTHORIZED_RESERVED'}});
 const prior=starts[0]?.metadata?.scope;
 if(starts.length!==1||!prior||prior.purpose!=='CAPTURE_EXACT_COMMENT_RECEIPT_ONCE'||['accountId','senderId','postId','recipientId','reviewId','reviewVersion'].some(k=>prior[k]!==scope[k])||prior.commentId!==scope.targetCommentId)fail();
 // This object is used only by a verifier, never sent to a sender or persisted
 // as a send authorization. Every prior record remains immutable.
 const proof=await verifyChain(tx,actorId,{...prior,approvalId:scope.approvalId,expiresAt:scope.expiresAt,previousNotAttemptedId:head.id,recoveryWorkflowId:prior.recoveryWorkflowId??prior.approvalId},attempts);
 for(const attempt of attempts){
  const events=await tx.auditLog.findMany({where:{entityId:attempt.requestKey,action:'SINGLE_REPLY_EXECUTION_STAGE'}});
  const stops=events.map(e=>e.metadata).filter(e=>e?.stage==='TRANSPORT_STOP');
  if(stops.length!==1||stops[0].journal?.state!=='AVAILABLE'||!Array.isArray(stops[0].journal.records)||stops[0].journal.records.some(r=>['INPUT_INTENT','INPUT_FINISHED','BEFORE_SUBMIT','ATTEMPTED','AFTER_SUBMIT','SUBMIT_FINISHED','RECEIPT_CAPTURE'].includes(r.stage)))fail();
 }
 return proof;
}
