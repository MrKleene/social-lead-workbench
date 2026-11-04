import 'reflect-metadata';
import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Db} from '../src/common/db';
import {recoverUserReviewedDeletedSend,recipientRecoveryBlocked} from '../src/auto-contact/user-reviewed-recovery';
const url=process.env.TEST_DATABASE_URL;if(!url||new URL(url).pathname!=='/crm_test')throw Error('isolated crm_test only');
const db=new Db({datasources:{db:{url}}});let actor:any;
beforeAll(()=>db.$connect());afterAll(async()=>{await db.$executeRawUnsafe('TRUNCATE "User", "PlatformAccount", "PlatformIdentity", "AutoContactControl", "AutoContactRule", "ContactAttempt", "AutoContactJob", "DeviceExecutionLease" CASCADE');await db.$disconnect();});
beforeEach(async()=>{await db.$executeRawUnsafe('TRUNCATE "User", "PlatformAccount", "PlatformIdentity", "AutoContactControl", "AutoContactRule", "ContactAttempt", "AutoContactJob", "DeviceExecutionLease" CASCADE');actor=await db.user.create({data:{email:randomUUID()+'@example.invalid',name:'synthetic admin',passwordHash:'synthetic',role:'ADMIN',active:true}});});
async function fixture(){
 const now=new Date(),paused=new Date(now.getTime()-10000),sessionKey=randomUUID(),deviceId=randomUUID(),runtimeId=randomUUID(),senderId='a'.repeat(24),recipientId='b'.repeat(24);
 const account=await db.platformAccount.create({data:{platform:'XHS',label:'synthetic',isDemo:false,status:'UNCONNECTED',loginPlatformUserId:senderId,loginSessionKey:sessionKey,sessionReference:{create:{deviceId,sessionKey,provider:'real',state:'VERIFIED',checkedRuntimeId:runtimeId}}}});
 const identity=await db.platformIdentity.create({data:{platform:'XHS',platformUserId:recipientId,nickname:'synthetic recipient',isDemo:false}});
 await db.contactLedger.create({data:{identityId:identity.id,mode:'REAL',accountId:account.id}});
 await db.accountDay.create({data:{accountId:account.id,day:'REAL:Asia/Shanghai:2000-01-01',occupied:1}});
 const attemptId:string=randomUUID(),jobId:string=randomUUID();
 const deletion=await db.auditLog.create({data:{actorId:actor.id,entityId:attemptId,action:'USER_CONFIRMED_EXACT_HISTORY_PERMANENT_DELETE',metadata:{attemptId,jobId,priorOutcome:'UNKNOWN',userConfirmedIrrecoverable:true,attemptsDeleted:1,jobsDeleted:1,platformPauseUnchanged:true}}});
 const evidence={identity:'MATCH',title:'synthetic',pathname:'/user/profile/[SENDER]',warnings:[],screenshotState:'NOT_CAPTURED'};
 const stop=await db.auditLog.create({data:{actorId:actor.id,entityId:'auto-contact:'+jobId,action:'AUTO_CONTACT_EXECUTION_STAGE',createdAt:paused,metadata:{stage:'TRANSPORT_STOP',protocolAttemptId:randomUUID(),stopped:true,journal:{state:'AVAILABLE',records:[{sequence:1,attemptId:randomUUID(),stage:'RESTRICTION_CHECK',at:paused.toISOString(),evidence}]}}}});
 const observation=await db.auditLog.create({data:{actorId:actor.id,entityId:account.id,action:'ACCOUNT_SEND_OBSERVATION',metadata:{state:'UNKNOWN',source:'SAME_SESSION',observedAt:now.toISOString(),evidence,binding:{sessionKey,deviceId,runtimeId,senderId}}}});
 await db.autoContactControl.create({data:{platform:'XHS',mode:'REAL',pauseReason:'SUBMISSION_UNKNOWN',pausedAt:paused}});
 const [v]=await db.$queryRaw<{xmin:string}[]>`SELECT xmin::text AS xmin FROM "AutoContactControl" WHERE platform='XHS' AND mode='REAL'`;
 return {account,observation,stop,deletion,input:{accountId:account.id,recipientId,attemptId,jobId,deletionAuditId:deletion.id,stopAuditId:stop.id,expectedControlXmin:v.xmin,expectedPausedAt:paused.toISOString(),acknowledgeUnresolvedOutcome:true as const}};
}
it('explicit recovery retains quotas and deleted rows, quarantines only original recipient, never enables or sends',async()=>{
 const f=await fixture(),quota=await db.accountDay.findMany(),ledger=await db.contactLedger.findMany();
 expect(await recoverUserReviewedDeletedSend(db,actor,f.input)).toMatchObject({recovered:true,automaticContactEnabled:false});
 expect(await recipientRecoveryBlocked(db,'XHS',f.input.recipientId)).toBe(true);expect(await recipientRecoveryBlocked(db,'XHS','other')).toBe(false);expect(await recipientRecoveryBlocked(db,'DY',f.input.recipientId)).toBe(false);
 expect(await db.autoContactControl.findFirst()).toMatchObject({pauseReason:null});expect(await db.autoContactRule.count()).toBe(0);expect(await db.contactAttempt.count()).toBe(0);expect(await db.autoContactJob.count()).toBe(0);expect(await db.accountDay.findMany()).toEqual(quota);expect(await db.contactLedger.findMany()).toEqual(ledger);
 await expect(recoverUserReviewedDeletedSend(db,actor,f.input)).rejects.toThrow('RECOVERY_PAUSE_CHANGED');
});
it.each(['sales','pause-rewrite','platform-risk','account-risk','verification','stale','binding','missing-delete','wrong-job','unknown-source','unstopped','warning','new-unknown','same-account-unknown','target','active'])('recovery refuses %s without clearing control',async kind=>{
 const f=await fixture();let who=actor;
 if(kind==='sales')who={...actor,role:'SALES'};
 if(kind==='pause-rewrite')await db.autoContactControl.updateMany({data:{pauseReason:'SUBMISSION_UNKNOWN'}});
 if(kind==='platform-risk')await db.autoContactControl.updateMany({data:{pauseReason:'ACCOUNT_RESTRICTED'}});
 if(kind==='account-risk')await db.platformAccount.update({where:{id:f.account.id},data:{status:'RESTRICTED'}});
 if(kind==='verification')await db.accountSessionReference.update({where:{accountId:f.account.id},data:{state:'EXPIRED'}});
 if(kind==='stale'||kind==='binding'){const m=f.observation.metadata as any;if(kind==='stale')m.observedAt=new Date(0).toISOString();else m.binding.sessionKey='changed';await db.auditLog.update({where:{id:f.observation.id},data:{metadata:m}});}
 if(kind==='missing-delete')f.input.deletionAuditId='absent';if(kind==='wrong-job')f.input.jobId='other';if(kind==='unknown-source')f.input.stopAuditId='absent';
 if(kind==='unstopped'||kind==='warning'){const m=f.stop.metadata as any;if(kind==='unstopped')m.stopped=false;else m.journal.records[0].evidence.warnings=[{code:'VERIFICATION',text:'synthetic'}];await db.auditLog.update({where:{id:f.stop.id},data:{metadata:m}});}
 if(kind==='new-unknown'||kind==='same-account-unknown'){const ledger=await db.contactLedger.findFirstOrThrow();await db.contactAttempt.create({data:{ledgerId:ledger.id,requestKey:randomUUID(),kind:'FIRST',mode:'REAL',channel:'COMMENT',outcome:'UNKNOWN',actorId:actor.id,day:'old',accountIdSnapshot:kind==='new-unknown'?'other':f.account.id,createdAt:kind==='new-unknown'?new Date():new Date(0)}});}
 if(kind==='target')f.input.recipientId='other';if(kind==='active')await db.autoContactControl.updateMany({data:{activeJobId:'busy'}});
 const before=await db.autoContactControl.findMany();await expect(recoverUserReviewedDeletedSend(db,who,f.input)).rejects.toThrow();expect(await db.autoContactControl.findMany()).toEqual(before);expect(await db.auditLog.count({where:{action:'USER_REVIEWED_DELETED_SEND_RECOVERY'}})).toBe(0);
});
