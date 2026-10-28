import {createHash,randomUUID} from 'node:crypto';
import type {Db} from '../common/db';
import {requireAdmin,type Actor} from '../auth/security';
import {AccountReadService,readConsent,type ReadExecution} from '../collection/account-read.service';
import {savedPostReference} from '../collection/post-reference';
import {singleReplyScopeSchema,type SingleReplyScope} from './single-reply-scope';
import {semanticHash} from '../collection/capture-archive';
import {CapturedReplyReconciliation,capturedReceipt,type CapturedReadback} from './captured-reply-reconciliation';
import {contactLock} from './contact-lock';
import type {Comment} from '../collection/contract';
export function exactReadback(rows:Pick<Comment,'id'|'userId'|'text'|'parentId'|'replyTarget'>[],scope:SingleReplyScope,replyId:string){
 const targets=rows.filter(r=>r.id===scope.commentId&&r.userId===scope.recipientId&&r.text===scope.comment);
 const ids=rows.filter(r=>r.id===replyId);
 return targets.length===1&&ids.length===1&&ids[0].userId===scope.senderId&&ids[0].text===scope.content&&ids[0].parentId===scope.commentId&&ids[0].replyTarget?.commentId===scope.commentId&&ids[0].replyTarget?.userId===scope.recipientId;
}
/** One independent bounded read automatically follows a captured submission.
 * No sender, search, archive writes, retry or guessed response ID. The existing
 * owned reader restricts tools and enforces account identity throughout. */
export class BoundedCaptureReadback {
 constructor(private db:Db,private reads:AccountReadService){}
 async run(actor:Actor,attemptId:string,signal:AbortSignal){
  requireAdmin(actor);const requestId=randomUUID();
  const authorized=await this.db.$transaction(async tx=>{
   await contactLock(tx);const a=await tx.contactAttempt.findUnique({where:{id:attemptId}});
   if(!a||a.outcome!=='UNKNOWN'||a.actorId!==actor.id)throw Error('READBACK_ATTEMPT_NOT_UNKNOWN');
   const auth=await tx.auditLog.findMany({where:{entityId:a.requestKey,action:'SINGLE_REPLY_TEST_AUTHORIZED_RESERVED'}}),m=auth[0]?.metadata as Record<string,unknown>|undefined;
   const scope=singleReplyScopeSchema.parse(m?.scope);
   if(auth.length!==1||m?.attemptId!==attemptId||m.scopeHash!==semanticHash(scope)||scope.purpose!=='CAPTURE_EXACT_COMMENT_RECEIPT_ONCE'||a.accountIdSnapshot!==scope.accountId||a.content!==scope.content)throw Error('READBACK_SCOPE_CHANGED');
   const events=await tx.auditLog.findMany({where:{entityId:a.requestKey,action:'SINGLE_REPLY_EXECUTION_STAGE'},orderBy:{createdAt:'asc'}}),receipt=capturedReceipt(events.map(e=>e.metadata));
   if(!receipt)return null;
   if(await tx.auditLog.count({where:{entityId:a.requestKey,action:'BOUNDED_CAPTURE_READBACK_STARTED'}}))throw Error('READBACK_ALREADY_CONSUMED');
   const review=await tx.semanticReview.findUnique({where:{id:scope.reviewId},include:{capture:{include:{post:true}}}}),reference=savedPostReference((review?.capture?.post.snapshot as Record<string,unknown>)?.sourceReference,scope.postId);
   if(!reference||review?.version!==scope.reviewVersion||review.capture?.platformCommentId!==scope.commentId)throw Error('READBACK_REFERENCE_CHANGED');
   const execution=await this.reads.authorize(tx,actor,'XHS_MCP',scope.accountId,readConsent);
   await tx.auditLog.create({data:{actorId:actor.id,entityId:a.requestKey,action:'BOUNDED_CAPTURE_READBACK_STARTED',metadata:{attemptId,requestId,replyId:receipt.replyId,maximumWindows:1,maximumComments:100,maximumReplyClicks:12,submissions:0}}});
   return {scope,receipt,reference,execution,key:a.requestKey};
  });
  if(!authorized)return {kind:'UNKNOWN' as const,reason:'RECEIPT_MAPPING_NOT_PROVEN',attemptId};
  const {scope,receipt,reference,execution,key}=authorized;
  let owned:Awaited<ReturnType<AccountReadService['open']>>|undefined,proof:CapturedReadback|undefined,stopped=false,reason='READBACK_NO_EXACT_MATCH';
  try{
   owned=await this.reads.open(execution,async()=>signal.aborted,requestId);await owned.check();
   const post=await owned.reader.postReference(reference,AbortSignal.any([signal,AbortSignal.timeout(45000)]),'BOUNDED_REPLIES');await owned.check();
   const rows=owned.reader.receivedComments(post),matched=post.id===scope.postId&&exactReadback(rows,scope,receipt.replyId);
   const verification=await this.db.auditLog.findFirstOrThrow({where:{entityId:requestId,actorId:actor.id,action:'ACCOUNT_TASK_LOGIN_CHECK_RESULT'}}),observedAt=new Date(Math.max(Date.now(),verification.createdAt.getTime())).toISOString();
   await this.db.auditLog.create({data:{actorId:actor.id,entityId:key,action:'BOUNDED_CAPTURE_READBACK_OBSERVED',metadata:{attemptId,requestId,postId:post.id,replyId:receipt.replyId,matched,receivedCount:rows.length,observedAt,submissions:0}}});
   if(owned.reader.chunkReceipt(post)){owned.reader.confirmCheckpoint(post);await owned.reader.finishChunks(post,AbortSignal.any([signal,AbortSignal.timeout(10000)]));}
   if(matched)proof={source:'OWNED_MCP_BOUNDED_READBACK',attemptId,readbackRequestId:requestId,accountId:scope.accountId,senderId:scope.senderId,postId:scope.postId,commentId:scope.commentId,recipientId:scope.recipientId,replyId:receipt.replyId,contentSha256:createHash('sha256').update(scope.content).digest('hex'),observedAt,identityVerified:true,stopped:true,matches:1};
  }catch(error){reason=typeof (error as any)?.code==='string'&&/^[A-Z_]+$/.test((error as any).code)?(error as any).code:'READBACK_FAILED';await this.reads.failure(execution,reason,requestId);}
  finally{try{await owned?.close();stopped=true;}catch{reason='READBACK_CLOSE_UNCONFIRMED';}await this.db.auditLog.create({data:{actorId:actor.id,entityId:key,action:'BOUNDED_CAPTURE_READBACK_FINISHED',metadata:{attemptId,requestId,stopped,matched:!!proof,reason:proof&&stopped?null:reason,submissions:0}}});}
  if(!proof||!stopped||signal.aborted)return {kind:'UNKNOWN' as const,reason:signal.aborted?'READBACK_CANCELLED':reason,attemptId,stopped};
  const confirmed=await new CapturedReplyReconciliation(this.db).confirm(actor,proof);return {kind:'CONFIRMED' as const,...confirmed,proof,stopped};
 }
}
