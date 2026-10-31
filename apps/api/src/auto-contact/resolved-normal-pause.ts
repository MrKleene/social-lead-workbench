import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Db} from '../common/db';
import {requireAdmin,type Actor} from '../auth/security';
import {accountSystemBlock} from '../accounts/account-execution-policy';
import {contactLock} from './contact-lock';
import {accountSendObservation} from './send-observation';
import {capturedReadbackSchema,capturedReceipt} from './captured-reply-reconciliation';
const inputSchema=z.object({jobId:z.string().min(1),expectedControlXmin:z.string().regex(/^\d+$/),expectedPausedAt:z.string().datetime(),reconciliationAuditId:z.string().min(1)}).strict();
/** Explicit operator recovery only; no HTTP route, scheduler or send capability.
 * This does NOT infer historical pause provenance. The operator must approve the
 * exact reviewed control row version. Any subsequent rewrite fails closed.
 * Only the latch is cleared; every rule, attempt, quota and recipient lock stays. */
export async function resolveReviewedNormalPause(db:Db,actor:Actor,input:unknown){
 requireAdmin(actor);const p=inputSchema.parse(input);return db.$transaction(async tx=>{
  await contactLock(tx);
  const versions=await tx.$queryRaw<{xmin:string}[]>`SELECT xmin::text AS xmin FROM "AutoContactControl" WHERE platform='XHS' AND mode='REAL' FOR UPDATE`;
  const c=await tx.autoContactControl.findUnique({where:{platform_mode:{platform:'XHS',mode:'REAL'}}});
  if(versions.length!==1||versions[0].xmin!==p.expectedControlXmin||c?.pauseReason!=='SUBMISSION_UNKNOWN'||c.pausedAt?.toISOString()!==p.expectedPausedAt||c.activeJobId||c.leaseUntil)throw Error('REVIEWED_PAUSE_CHANGED');
  const user=await tx.user.findUnique({where:{id:actor.id}}),j=await tx.autoContactJob.findUnique({where:{id:p.jobId}});
  const a=j?.attemptId?await tx.contactAttempt.findUnique({where:{id:j.attemptId}}):null;
  const account=a?.accountIdSnapshot?await tx.platformAccount.findUnique({where:{id:a.accountIdSnapshot}}):null;
  if(!user?.active||user.role!=='ADMIN'||!j||j.mode!=='REAL'||j.platform!=='XHS'||j.channel!=='COMMENT'||j.status!=='CONFIRMED'||j.leaseUntil||!a||a.outcome!=='CONFIRMED'||a.mode!=='REAL'||a.requestKey!==`auto-contact:${j.id}`||a.actorId!==actor.id||!a.confirmedAt||!a.platformReceipt||!account||account.id!==j.accountId||account.isDemo||accountSystemBlock(account))throw Error('PAUSE_NOT_PROVEN_RESOLVED');
  if(await tx.autoContactRule.count({where:{enabled:true}})||await tx.deviceExecutionLease.count()||await tx.autoContactJob.count({where:{status:{in:['QUEUED','WAITING_ACCOUNT','WAITING_QUOTA','RESERVED','ATTEMPTED']}}})||await tx.contactAttempt.count({where:{mode:'REAL',OR:[{outcome:{in:['RESERVED','ATTEMPTED']}},{outcome:'UNKNOWN',accountIdSnapshot:account.id},{outcome:'UNKNOWN',createdAt:{gte:c.pausedAt}}]}}))throw Error('PAUSE_NOT_PROVEN_RESOLVED');
  const observation=await accountSendObservation(tx,account.id,new Date());if(observation.state!=='UNKNOWN'||observation.evidenceInvalid)throw Error('PAUSE_NOT_PROVEN_RESOLVED');
  const audit=await tx.auditLog.findUnique({where:{id:p.reconciliationAuditId}}),m=audit?.metadata as any,proof=capturedReadbackSchema.safeParse(m?.proof);
  if(audit?.action!=='NORMAL_REPLY_CAPTURE_RECONCILED'||audit.actorId!==actor.id||audit.entityId!==a.requestKey||m?.from!=='UNKNOWN'||m?.to!=='CONFIRMED'||!proof.success)throw Error('READBACK_PROOF_MISSING');
  const q=proof.data;
  if(q.attemptId!==a.id||q.accountId!==account.id||q.senderId!==account.loginPlatformUserId||q.replyId!==a.platformReceipt||q.postId!==j.postId||q.commentId!==j.commentId||q.recipientId!==j.recipientId||j.content!==a.content||q.contentSha256!==createHash('sha256').update(a.content).digest('hex'))throw Error('READBACK_PROOF_MISMATCH');
  const events=await tx.auditLog.findMany({where:{actorId:actor.id,entityId:a.requestKey,action:'AUTO_CONTACT_EXECUTION_STAGE'},orderBy:{createdAt:'asc'}}),receipt=capturedReceipt(events.map(e=>e.metadata));
  if(!receipt||receipt.replyId!==a.platformReceipt||Math.abs(Date.parse(receipt.closedAt)-c.pausedAt.getTime())>30000||a.confirmedAt<c.pausedAt||m.receipt?.responseSha256!==receipt.responseSha256)throw Error('PAUSE_NOT_PROVEN_RESOLVED');
  const quota=await tx.accountDay.findUnique({where:{accountId_day:{accountId:account.id,day:a.day}}});if(!quota||quota.occupied<1)throw Error('QUOTA_RESERVATION_MISSING');
  await tx.auditLog.create({data:{actorId:actor.id,entityId:a.requestKey,action:'REVIEWED_NORMAL_REPLY_PAUSE_RESOLVED',metadata:{jobId:j.id,attemptId:a.id,replyId:a.platformReceipt,accountId:account.id,previousPauseReason:c.pauseReason,previousPausedAt:p.expectedPausedAt,reviewedControlXmin:p.expectedControlXmin,reconciliationAuditId:audit.id,automaticContactEnabled:false,quotaRetained:true,recipientLockRetained:true,origin:'EXPLICIT_OPERATOR_REVIEW'}}});
  await tx.autoContactControl.update({where:{platform_mode:{platform:'XHS',mode:'REAL'}},data:{pauseReason:null,pausedAt:null}});
  return {resolved:true,attemptId:a.id,replyId:a.platformReceipt};
 });
}
