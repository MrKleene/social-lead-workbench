import {accountSystemBlock} from '../accounts/account-execution-policy';
import type {Db} from '../common/db';
import {requireAdmin,type Actor} from '../auth/security';
import {contactLock} from './contact-lock';
import {accountSendObservation} from './send-observation';
/** Only a one-shot operator may close a pause already resolved by exact readback.
 * PostgreSQL row provenance ties the pause to the SAME transaction as its finish
 * audit. A rewritten/competing pause, even with identical text, never qualifies.
 * No rule is enabled and no attempt, quota or recipient lock is changed. */
export async function resolveConfirmedCapturePause(db:Db,actor:Actor,accountId:string){
 requireAdmin(actor);return db.$transaction(async tx=>{
  await contactLock(tx);
  const control=await tx.autoContactControl.findUnique({where:{platform_mode:{platform:'XHS',mode:'REAL'}}});
  if(!control?.pauseReason)return {resolved:false,reason:'NO_PAUSE'};
  const user=await tx.user.findUnique({where:{id:actor.id}}),account=await tx.platformAccount.findUnique({where:{id:accountId}});
  if(!user?.active||user.role!=='ADMIN'||!account||accountSystemBlock(account)||account.isDemo||control.pauseReason!=='SUBMISSION_UNKNOWN'||!control.pausedAt||control.activeJobId||control.leaseUntil)throw Error('PAUSE_NOT_PROVEN_RESOLVED');
  if(await tx.autoContactRule.count({where:{enabled:true}})||await tx.deviceExecutionLease.count()||await tx.autoContactJob.count({where:{status:{in:['RESERVED','ATTEMPTED']}}})||await tx.contactAttempt.count({where:{mode:'REAL',accountIdSnapshot:accountId,outcome:{in:['UNKNOWN','RESERVED','ATTEMPTED']}}}))throw Error('PAUSE_NOT_PROVEN_RESOLVED');
  const observation=await accountSendObservation(tx,accountId,new Date());if(observation.state!=='UNKNOWN'||observation.evidenceInvalid)throw Error('PAUSE_NOT_PROVEN_RESOLVED');
  const origins=await tx.$queryRaw<{id:string;entityId:string}[]>`SELECT a.id,a."entityId" FROM "AuditLog" a JOIN "AutoContactControl" c ON a.xmin=c.xmin WHERE c.platform='XHS' AND c.mode='REAL' AND a.action='SINGLE_REPLY_TEST_FINISHED' AND a."actorId"=${actor.id}`;
  if(origins.length!==1)throw Error('PAUSE_ORIGIN_UNPROVEN');
  const end=await tx.auditLog.findUniqueOrThrow({where:{id:origins[0].id}}),m=end.metadata as Record<string,unknown>;
  const a=await tx.contactAttempt.findUnique({where:{requestKey:end.entityId}}),proofs=await tx.auditLog.findMany({where:{entityId:end.entityId,actorId:actor.id,action:'SINGLE_REPLY_CAPTURE_RECONCILED'}});
  const proof=proofs[0]?.metadata as Record<string,any>|undefined;
  if(Math.abs(control.pausedAt.getTime()-end.createdAt.getTime())>30000||m.pause!=='SUBMISSION_UNKNOWN'||m.result!=='UNKNOWN'||m.stopped!==true||!a||m.attemptId!==a.id||a.accountIdSnapshot!==accountId||a.actorId!==actor.id||a.outcome!=='CONFIRMED'||!a.platformReceipt||!a.confirmedAt||proofs.length!==1||proof?.from!=='UNKNOWN'||proof?.to!=='CONFIRMED'||proof?.proof?.attemptId!==a.id||proof?.proof?.replyId!==a.platformReceipt||proof?.proof?.senderId!==account.loginPlatformUserId||proof?.receipt?.replyId!==a.platformReceipt)throw Error('PAUSE_NOT_PROVEN_RESOLVED');
  await tx.auditLog.create({data:{actorId:actor.id,entityId:a.requestKey,action:'CONFIRMED_CAPTURE_PAUSE_RESOLVED',metadata:{attemptId:a.id,accountId,previousPausedAt:control.pausedAt.toISOString(),originAuditId:end.id,reconciliationAuditId:proofs[0].id,automaticContactEnabled:false,quotaRetained:true,recipientLockRetained:true}}});
  await tx.autoContactControl.update({where:{platform_mode:{platform:'XHS',mode:'REAL'}},data:{pauseReason:null,pausedAt:null}});
  return {resolved:true,attemptId:a.id,replyId:a.platformReceipt};
 });
}
