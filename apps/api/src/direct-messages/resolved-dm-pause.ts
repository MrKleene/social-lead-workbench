import type {Prisma} from '@prisma/client';
import type {Actor} from '../auth/security';
import {accountSystemBlock,recordedAccountBlocks} from '../accounts/account-execution-policy';
import {dmDigest,validDmMessageId} from './dm-send-protocol';

/** Under contactLock. Resolve only the same DB transaction's proven DM latch.
 * No sender, platform read, rule enable, quota refund or UNKNOWN rewrite. */
export async function resolveConfirmedDmPause(tx:Prisma.TransactionClient,actor:Actor,attemptId:string){
 const no=(reason:string)=>({resolved:false,reason});
 const controls=await tx.$queryRaw<{xmin:string}[]>`SELECT xmin::text AS xmin FROM "AutoContactControl" WHERE platform='XHS' AND mode='REAL' FOR UPDATE`;
 const control=await tx.autoContactControl.findUnique({where:{platform_mode:{platform:'XHS',mode:'REAL'}}});
 if(!control?.pauseReason)return no('NO_PAUSE');
 if(control.pauseReason!=='DM_SUBMISSION_UNKNOWN'||!control.pausedAt||control.activeJobId||control.leaseUntil||controls.length!==1||BigInt(controls[0].xmin)<=2n)return no('PAUSE_CHANGED_OR_ACTIVE');
 const a=await tx.contactAttempt.findUnique({where:{id:attemptId},include:{ledger:{include:{identity:true}}}}),user=await tx.user.findUnique({where:{id:actor.id}});
 if(!user?.active||user.role!=='ADMIN'||!a||a.actorId!==actor.id||a.mode!=='REAL'||a.channel!=='DM'||a.jobId||a.outcome!=='CONFIRMED'||!a.confirmedAt||!a.attemptedAt||!a.platformReceipt||!a.content||!a.accountIdSnapshot||!a.requestKey.startsWith('dm:')||a.ledger.identity.platform!=='XHS')return no('CONFIRMED_DM_REQUIRED');
 const account=await tx.platformAccount.findUnique({where:{id:a.accountIdSnapshot},include:{sessionReference:true}}),snap=a.historySnapshot as {senderPlatformId?:string;recipientId?:string}|null;
 if(!account||account.isDemo||account.archivedAt||accountSystemBlock(account)||(await recordedAccountBlocks(tx,[account.id])).has(account.id)||account.sessionReference?.state!=='VERIFIED'||!account.loginPlatformUserId||snap?.senderPlatformId!==account.loginPlatformUserId||snap.recipientId!==a.ledger.identity.platformUserId)return no('ACCOUNT_CHANGED_OR_RESTRICTED');
 const finishes=await tx.auditLog.findMany({where:{entityId:a.requestKey,actorId:actor.id,action:'DM_EXECUTION_FINISHED'}}),proofs=await tx.auditLog.findMany({where:{entityId:a.requestKey,actorId:actor.id,action:'DM_UNKNOWN_READBACK_CONFIRMED'}});
 if(finishes.length!==1||proofs.length!==1)return no('PAUSE_SOURCE_OR_READBACK_MISSING');
 const finish=finishes[0],m=finish.metadata as any,p=proofs[0].metadata as any;
 const origin=await tx.$queryRaw<{xmin:string}[]>`SELECT xmin::text AS xmin FROM "AuditLog" WHERE id=${finish.id}`;
 // The original control update and execution audit commit together. A later
 // risk or even a same-value rewrite changes xmin and cannot be cleared here.
 if(origin.length!==1||origin[0].xmin!==controls[0].xmin||m?.attemptId!==a.id||m.dispatched!==true||m.result?.attemptId!==a.id||m.result.requestKey!==a.requestKey||m.result.kind!=='UNKNOWN'||m.result.stopped!==true||m.result.submissions!==1||Math.abs(finish.createdAt.getTime()-control.pausedAt.getTime())>5000||a.attemptedAt>control.pausedAt||a.confirmedAt<control.pausedAt)return no('PAUSE_SOURCE_NOT_EXACT');
 const observations=p?.proof?.observations;
 if(p?.attemptId!==a.id||p.previousOutcome!=='UNKNOWN'||p.proof?.stopped!==true||!Array.isArray(observations)||observations.length!==2||!observations[0]?.inspectionId||observations[0].inspectionId===observations[1]?.inspectionId||observations.some((o:any)=>o.messageId!==a.platformReceipt||!validDmMessageId(o.messageId,account.loginPlatformUserId!,a.ledger.identity.platformUserId)||o.senderId!==account.loginPlatformUserId||o.recipientId!==a.ledger.identity.platformUserId||o.contentSha256!==dmDigest(a.content!)||!Number.isFinite(Date.parse(o.observedAt))||Date.parse(o.observedAt)<finish.createdAt.getTime()||Date.parse(o.observedAt)>proofs[0].createdAt.getTime()+5000))return no('READBACK_NOT_EXACT');
 if(await tx.deviceExecutionLease.count()||await tx.contactAttempt.count({where:{mode:'REAL',OR:[{outcome:{in:['RESERVED','ATTEMPTED']}},{outcome:'UNKNOWN',OR:[{accountIdSnapshot:account.id},{ledger:{accountId:account.id}},{updatedAt:{gte:control.pausedAt}}]}]}}))return no('OTHER_UNRESOLVED_OR_ACTIVE_SEND');
 const quota=await tx.accountDay.findUnique({where:{accountId_day:{accountId:account.id,day:a.day}}});if(!quota||quota.occupied<1)return no('QUOTA_PROOF_MISSING');
 const cleared=await tx.autoContactControl.updateMany({where:{platform:'XHS',mode:'REAL',pauseReason:'DM_SUBMISSION_UNKNOWN',pausedAt:control.pausedAt,activeJobId:null,leaseUntil:null},data:{pauseReason:null,pausedAt:null}});
 if(cleared.count!==1)return no('PAUSE_CHANGED');
 await tx.auditLog.create({data:{actorId:actor.id,entityId:a.requestKey,action:'DM_CONFIRMED_OWN_PAUSE_RESOLVED',metadata:{attemptId:a.id,accountId:account.id,sourceAuditId:finish.id,readbackAuditId:proofs[0].id,sourceTransaction:origin[0].xmin,pausedAt:control.pausedAt.toISOString(),quotaRetained:true,unknownAttemptsRetained:true,rulesUnchanged:true}}});
 return {resolved:true,reason:'EXACT_CONFIRMED_DM_PAUSE'};
}
