import {z} from 'zod';
import type {Prisma} from '@prisma/client';
import type {Db} from '../common/db';
import {requireAdmin,type Actor} from '../auth/security';
import {accountSystemBlock} from '../accounts/account-execution-policy';
import {contactLock} from './contact-lock';
import {accountSendObservation} from './send-observation';
import {executionEventSchema} from './reply-stage-journal';
const recoveryAction='USER_REVIEWED_DELETED_SEND_RECOVERY';
/** A recipient quarantine, not a reconstructed send or a claim that sending failed. */
export async function recipientRecoveryBlocked(tx:Prisma.TransactionClient,platform:string,recipientId:string){
 return !!await tx.auditLog.findFirst({where:{action:recoveryAction,AND:[{metadata:{path:['platform'],equals:platform}},{metadata:{path:['recipientId'],equals:recipientId}}]},select:{id:true}});
}
const inputSchema=z.object({accountId:z.string().min(1),recipientId:z.string().min(1),jobId:z.string().min(1),attemptId:z.string().min(1),deletionAuditId:z.string().min(1),stopAuditId:z.string().min(1),expectedControlXmin:z.string().regex(/^\d+$/),expectedPausedAt:z.string().datetime(),acknowledgeUnresolvedOutcome:z.literal(true)}).strict();
/** Explicit reviewed operator action, never a timer/HTTP enable side effect.
 * Only deleted UNKNOWN history with a stopped, warning-free original process and
 * fresh bound account observation is eligible. Platform risk pauses never qualify.
 * Does not enable a rule, send, restore history, refund quota or change outcomes. */
export async function recoverUserReviewedDeletedSend(db:Db,actor:Actor,raw:unknown){
 requireAdmin(actor);const p=inputSchema.parse(raw);
 return db.$transaction(async tx=>{
  await contactLock(tx);
  const [v]=await tx.$queryRaw<{xmin:string}[]>`SELECT xmin::text AS xmin FROM "AutoContactControl" WHERE platform='XHS' AND mode='REAL' FOR UPDATE`;
  const c=await tx.autoContactControl.findUnique({where:{platform_mode:{platform:'XHS',mode:'REAL'}}});
  if(v?.xmin!==p.expectedControlXmin||c?.pauseReason!=='SUBMISSION_UNKNOWN'||c.pausedAt?.toISOString()!==p.expectedPausedAt||c.activeJobId||c.leaseUntil)throw Error('RECOVERY_PAUSE_CHANGED');
  const [user,account,removed,stop,identity]=await Promise.all([
   tx.user.findUnique({where:{id:actor.id}}),tx.platformAccount.findUnique({where:{id:p.accountId},include:{sessionReference:true}}),tx.auditLog.findUnique({where:{id:p.deletionAuditId}}),tx.auditLog.findUnique({where:{id:p.stopAuditId}}),tx.platformIdentity.findUnique({where:{platform_platformUserId:{platform:'XHS',platformUserId:p.recipientId}},include:{contactLedger:{where:{mode:'REAL'},include:{attempts:true}}}})
  ]);
  if(!user?.active||user.role!=='ADMIN'||!account||account.platform!=='XHS'||account.isDemo||account.archivedAt||accountSystemBlock(account)||account.sessionReference?.state!=='VERIFIED')throw Error('RECOVERY_ACCOUNT_BLOCKED');
  const m=removed?.metadata as Record<string,unknown>|undefined;
  if(removed?.actorId!==actor.id||removed.action!=='USER_CONFIRMED_EXACT_HISTORY_PERMANENT_DELETE'||removed.entityId!==p.attemptId||m?.attemptId!==p.attemptId||m.jobId!==p.jobId||m.priorOutcome!=='UNKNOWN'||m.userConfirmedIrrecoverable!==true||m.attemptsDeleted!==1||m.jobsDeleted!==1||m.platformPauseUnchanged!==true||removed.createdAt<=c.pausedAt||await tx.contactAttempt.count({where:{id:p.attemptId}})||await tx.autoContactJob.count({where:{id:p.jobId}}))throw Error('RECOVERY_DELETION_UNPROVEN');
  const event=executionEventSchema.safeParse(stop?.metadata);
  if(stop?.actorId!==actor.id||stop.action!=='AUTO_CONTACT_EXECUTION_STAGE'||stop.entityId!=='auto-contact:'+p.jobId||Math.abs(stop.createdAt.getTime()-c.pausedAt.getTime())>1000||!event.success||event.data.stage!=='TRANSPORT_STOP'||!event.data.stopped||event.data.journal.state!=='AVAILABLE'||!event.data.journal.records.some(r=>r.evidence?.identity==='MATCH')||event.data.journal.records.some(r=>r.evidence&&(r.evidence.identity!=='MATCH'||r.evidence.warnings.length>0)))throw Error('RECOVERY_SOURCE_UNPROVEN');
  if(!identity||identity.isDemo||identity.contactLedger.length!==1||identity.contactLedger[0].accountId!==account.id||identity.contactLedger[0].attempts.length)throw Error('RECOVERY_TARGET_CHANGED');
  const observation=await accountSendObservation(tx,account.id,new Date());
  if(!observation.canSend||observation.state!=='UNKNOWN'||observation.evidenceInvalid)throw Error('RECOVERY_FRESH_INSPECTION_REQUIRED');
  if(await tx.autoContactRule.count({where:{enabled:true}})||await tx.deviceExecutionLease.count()||await tx.autoContactJob.count({where:{status:{in:['QUEUED','WAITING_ACCOUNT','WAITING_QUOTA','MANUAL_READY','RESERVED','ATTEMPTED']}}})||await tx.contactAttempt.count({where:{mode:'REAL',OR:[{outcome:{in:['RESERVED','ATTEMPTED']}},{outcome:'UNKNOWN',accountIdSnapshot:account.id},{outcome:'UNKNOWN',createdAt:{gte:c.pausedAt}}]}}))throw Error('RECOVERY_ACTIVE_OR_NEW_RISK');
  // Retain a channel/account-independent quarantine for the old target; no body,
  // score, claimed result or send record is recreated.
  await tx.auditLog.create({data:{actorId:actor.id,entityId:p.attemptId,action:recoveryAction,metadata:{platform:'XHS',recipientId:p.recipientId,accountId:p.accountId,deletedAttemptId:p.attemptId,deletedJobId:p.jobId,deletionAuditId:p.deletionAuditId,stopAuditId:p.stopAuditId,previousPausedAt:p.expectedPausedAt,reviewedControlXmin:p.expectedControlXmin,observationAt:observation.checkedAt,outcome:'UNRESOLVED',reason:'USER_EXPLICIT_RECOVERY_AFTER_CURRENT_ACCOUNT_INSPECTION',recipientQuarantined:true,automaticContactEnabled:false,submissions:0}}});
  await tx.autoContactControl.update({where:{platform_mode:{platform:'XHS',mode:'REAL'}},data:{pauseReason:null,pausedAt:null}});
  return {recovered:true,recipientQuarantined:true,automaticContactEnabled:false};
 });
}
