import {createHash} from 'node:crypto';
import type {Db} from '../common/db';
import {requireAdmin,type Actor} from '../auth/security';
import {contactLock,contactNow} from './contact-settings.service';
import {capturedReadbackSchema,capturedReceipt} from './captured-reply-reconciliation';
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
/** Internal, readback-only reconciliation of an existing normal send. No sender,
 * queue or capability toggle. Original UNKNOWN events, quota and pause remain. */
export class NormalReplyReconciliation {
 constructor(private db:Db){}
 async confirm(actor:Actor,input:unknown){
  requireAdmin(actor);const p=capturedReadbackSchema.parse(input);
  return this.db.$transaction(async tx=>{
   await contactLock(tx);const now=await contactNow(tx),user=await tx.user.findUnique({where:{id:actor.id}});
   const a=await tx.contactAttempt.findUnique({where:{id:p.attemptId},include:{ledger:{include:{identity:true}}}});
   const j=a?await tx.autoContactJob.findFirst({where:{attemptId:a.id}}):null;
   if(!user?.active||user.role!=='ADMIN'||!a||!j||a.actorId!==actor.id||a.mode!=='REAL'||j.mode!=='REAL'||a.channel!=='COMMENT'||j.channel!=='COMMENT'||a.requestKey!==`auto-contact:${j.id}`||a.accountIdSnapshot!==p.accountId||j.accountId!==p.accountId||a.ledger.accountId!==p.accountId||a.ledger.identity.platformUserId!==p.recipientId||j.recipientId!==p.recipientId||j.postId!==p.postId||j.commentId!==p.commentId||a.content!==j.content||sha(j.content)!==p.contentSha256)throw Error('RECONCILIATION_SCOPE_MISMATCH');
   const events=await tx.auditLog.findMany({where:{entityId:a.requestKey,actorId:actor.id,action:'AUTO_CONTACT_EXECUTION_STAGE'},orderBy:{createdAt:'asc'}}),receipt=capturedReceipt(events.map(e=>e.metadata));
   if(!receipt||receipt.replyId!==p.replyId||[p.postId,p.commentId,p.senderId,p.recipientId].includes(p.replyId))throw Error('RECEIPT_NOT_PROVEN');
   const prior=await tx.auditLog.findFirst({where:{entityId:a.requestKey,action:'NORMAL_REPLY_CAPTURE_RECONCILED'}});
   if(a.outcome==='CONFIRMED'&&j.status==='CONFIRMED'&&a.platformReceipt===p.replyId&&prior)return {outcome:'CONFIRMED' as const,reused:true,attemptId:a.id,replyId:p.replyId};
   if(a.outcome!=='UNKNOWN'||j.status!=='UNKNOWN'||a.platformReceipt||a.confirmedAt||prior||j.leaseUntil)throw Error('ATTEMPT_NOT_RECONCILABLE');
   const observed=Date.parse(p.observedAt);if(observed<Date.parse(receipt.closedAt)||observed>now.getTime()+5000||now.getTime()-observed>900000)throw Error('READBACK_EXPIRED');
   const checks=await tx.auditLog.findMany({where:{entityId:p.readbackRequestId,actorId:actor.id,action:'ACCOUNT_TASK_LOGIN_CHECK_RESULT'}});
   if(checks.length!==1||(checks[0].metadata as any)?.state!=='VERIFIED'||checks[0].createdAt.getTime()<Date.parse(receipt.closedAt)||checks[0].createdAt.getTime()>observed)throw Error('READBACK_IDENTITY_UNPROVEN');
   const observations=await tx.auditLog.findMany({where:{entityId:a.requestKey,actorId:actor.id,action:'NORMAL_REPLY_READBACK_DIAGNOSIS_OBSERVED'}}),matching=observations.filter(e=>(e.metadata as any)?.requestId===p.readbackRequestId);
   const m=matching[0]?.metadata as any,reply=m?.matches?.[0],target=m?.target?.[0],original=(j.sourceSnapshot as any)?.comment?.comment;
   if(matching.length!==1||m.attemptId!==a.id||m.postId!==p.postId||m.replyId!==p.replyId||m.observedAt!==p.observedAt||m.submissions!==0||m.replyIdCount!==1||m.targetCount!==1||m.matches?.length!==1||m.target?.length!==1||reply.id!==p.replyId||reply.userId!==p.senderId||reply.text!==j.content||reply.parentId!==p.commentId||reply.replyTarget?.commentId!==p.commentId||reply.replyTarget?.userId!==p.recipientId||target.id!==p.commentId||target.userId!==p.recipientId||typeof original!=='string'||target.text!==original)throw Error('READBACK_TUPLE_NOT_PROVEN');
   if(await tx.deviceExecutionLease.count({where:{accountId:p.accountId}}))throw Error('READBACK_NOT_CLOSED');
   const account=await tx.platformAccount.findUnique({where:{id:p.accountId}});if(account?.loginPlatformUserId!==p.senderId)throw Error('ACCOUNT_CHANGED');
   if(await tx.capturedComment.findFirst({where:{platformCommentId:p.replyId,createdAt:{lt:a.attemptedAt??a.createdAt}}}))throw Error('REPLY_ID_PREEXISTED');
   const usage=await tx.accountDay.findUnique({where:{accountId_day:{accountId:p.accountId,day:a.day}}});if(!usage||usage.occupied<1)throw Error('QUOTA_RESERVATION_MISSING');
   await tx.auditLog.create({data:{actorId:actor.id,entityId:a.requestKey,action:'NORMAL_REPLY_CAPTURE_RECONCILED',metadata:{from:'UNKNOWN',to:'CONFIRMED',proof:p,receipt,quotaRetained:true,recipientLockRetained:true,automaticContactEnabled:false}}});
   await tx.contactAttempt.update({where:{id:a.id},data:{outcome:'CONFIRMED',platformReceipt:p.replyId,confirmedAt:now,resolutionNote:'平台回执与独立只读回查的回复ID、账号、帖子、父评论、收件人与正文一致；保留原额度和去重锁',version:{increment:1}}});
   await tx.autoContactJob.update({where:{id:j.id},data:{status:'CONFIRMED',reason:null}});
   return {outcome:'CONFIRMED' as const,reused:false,attemptId:a.id,replyId:p.replyId};
  });
 }
}
