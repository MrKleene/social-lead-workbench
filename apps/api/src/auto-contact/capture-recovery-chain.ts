import type {ContactAttempt} from '@prisma/client';
import type {ContactDb} from './contact-settings.service';
import type {SingleReplyScope} from './single-reply-scope';
import {semanticHash} from '../collection/capture-archive';
import {provenCaptureNonSubmission} from './capture-recovery';

/** Explicit new authorization only. Walk every immutable predecessor, never merely
 * the latest failed row. No disconnected, forked, unknown or partially logged
 * attempt can disappear from the recipient lock. Caller holds contactLock. */
export async function verifyCaptureRecoveryChain(tx:ContactDb,actorId:string,s:Extract<SingleReplyScope,{purpose:'CAPTURE_EXACT_COMMENT_RECEIPT_ONCE'}>,attempts:ContactAttempt[]){
 const fail=(code='CAPTURE_RECOVERY_CHAIN_UNPROVEN'):never=>{throw Error(code);};
 if(!s.previousNotAttemptedId||!s.recoveryWorkflowId||attempts.length===0||attempts.length>16)fail();
 const byId=new Map(attempts.map(a=>[a.id,a]));
 if(byId.size!==attempts.length)fail();
 const seen=new Set<string>();let id:string|undefined=s.previousNotAttemptedId,root:ContactAttempt|undefined;
 const approvals=new Set<string>([s.approvalId]);
 while(id){
  const old=byId.get(id);if(!old||seen.has(id))fail();seen.add(id);
  if(old!.outcome!=='FAILED'||old!.mode!=='REAL'||old!.channel!=='COMMENT'||old!.confirmedAt||old!.platformReceipt||old!.accountIdSnapshot!==s.accountId||old!.actorId!==actorId||old!.content!==s.content)fail('PREVIOUS_SUBMISSION_NOT_PROVEN_ABSENT');
  const events=await tx.auditLog.findMany({where:{entityId:old!.requestKey,action:{in:['SINGLE_REPLY_TEST_AUTHORIZED_RESERVED','SINGLE_REPLY_TEST_FINISHED','SINGLE_REPLY_EXECUTION_STAGE']}},orderBy:[{createdAt:'asc'},{id:'asc'}]});
  if(events.some(e=>e.actorId!==actorId))fail();
  const starts=events.filter(e=>e.action==='SINGLE_REPLY_TEST_AUTHORIZED_RESERVED'),ends=events.filter(e=>e.action==='SINGLE_REPLY_TEST_FINISHED');
  const start=starts[0]?.metadata as Record<string,any>|undefined,end=ends[0]?.metadata as Record<string,any>|undefined;
  const prior=start?.scope as Record<string,any>|undefined;
  if(starts.length!==1||ends.length!==1||!prior||!['accountId','senderId','postId','commentId','recipientId','comment','content','purpose','protocol','scopeVersion','receiptCapture'].every(k=>prior[k]===s[k as keyof SingleReplyScope])||prior.maximumSubmissions!==1||prior.retryCount!==0||typeof prior.approvalId!=='string'||approvals.has(prior.approvalId)||old!.requestKey!=='single-reply:'+prior.approvalId||start?.attemptId!==old!.id||end?.attemptId!==old!.id||start?.scopeHash!==semanticHash(prior)||end?.scopeHash!==start?.scopeHash||end?.result!=='NOT_ATTEMPTED'||end?.submission!=='NOT_ATTEMPTED'||end?.stopped!==true||end?.pause!==null)fail('PREVIOUS_SUBMISSION_NOT_PROVEN_ABSENT');
  approvals.add(prior!.approvalId);
  if(!provenCaptureNonSubmission(events.filter(e=>e.action==='SINGLE_REPLY_EXECUTION_STAGE').map(e=>e.metadata)))fail('CAPTURE_RECOVERY_JOURNAL_UNPROVEN');
  const previous=prior!.previousNotAttemptedId;
  const history=old!.historySnapshot as Record<string,unknown>|null;
  if((history?.previousNotAttemptedId??null)!==(previous??null))fail();
  if(previous){
   if(typeof previous!=='string'||prior!.recoveryWorkflowId!==s.recoveryWorkflowId)fail('CAPTURE_RECOVERY_SCOPE_MISMATCH');
   id=previous;
  }else{
   if(prior!.approvalId!==s.recoveryWorkflowId||prior!.recoveryWorkflowId)fail('CAPTURE_RECOVERY_SCOPE_MISMATCH');
   root=old;id=undefined;
  }
 }
 if(!root||seen.size!==attempts.length)fail('RECIPIENT_ALREADY_RESERVED_OR_CONTACTED');
 const workflow=await tx.auditLog.findMany({where:{entityId:s.recoveryWorkflowId,action:{in:['BOUNDED_WORKFLOW_AUTHORIZED','BOUNDED_WORKFLOW_FINISHED']}}});
 const authorized=workflow.filter(e=>e.action==='BOUNDED_WORKFLOW_AUTHORIZED'),finished=workflow.filter(e=>e.action==='BOUNDED_WORKFLOW_FINISHED'),done=finished[0]?.metadata as Record<string,unknown>|undefined;
 if(workflow.some(e=>e.actorId!==actorId)||authorized.length!==1||finished.length!==1||done?.attemptId!==root!.id||done?.kind!=='FAILED'||done?.submission!=='NOT_ATTEMPTED'||done?.stopped!==true)fail('CAPTURE_RECOVERY_WORKFLOW_UNPROVEN');
 const authorization=authorized[0].metadata as Record<string,any>,scope=authorization.scope;
 if(!scope||authorization.scopeHash!==semanticHash(scope)||scope.workflowId!==s.recoveryWorkflowId||scope.accountId!==s.accountId||scope.senderId!==s.senderId||scope.content!==s.content||scope.maximumSubmissions!==1||scope.retryCount!==0)fail('CAPTURE_RECOVERY_WORKFLOW_UNPROVEN');
 return {rootAttemptId:root!.id,predecessorCount:seen.size};
}
