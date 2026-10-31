import {accountSystemBlock} from '../accounts/account-execution-policy';
import type {Db} from '../common/db';
import {requireAdmin,type Actor} from '../auth/security';
import {DeviceService} from '../devices/device.service';
import {LoginRuntime,type SessionDriver} from '../accounts/login-runtime';
import {XhsRestrictionInspectionTransport,XHS_PROFILE_RESTRICTION_PROTOCOL} from './xhs-restriction-transport';
import {accountSendObservation,restrictionState,sendObservationSchema} from './send-observation';
import {contactLock} from './contact-lock';
/** Fresh same-saved-session profile observation before bounded collection.
 * Absence of a visible warning is only an observation, never send permission. */
export async function inspectBoundedAccount(db:Db,devices:DeviceService,runtime:LoginRuntime,actor:Actor,scope:{workflowId:string;accountId:string;senderId:string;binarySha256:string},signal:AbortSignal){
 requireAdmin(actor);
 const account=await db.platformAccount.findUnique({where:{id:scope.accountId},include:{sessionReference:true}}),ref=account?.sessionReference;
 const previous=await accountSendObservation(db,scope.accountId,new Date());
 if(!account||account.isDemo||accountSystemBlock(account)||account.loginPlatformUserId!==scope.senderId||!account.loginSessionKey||ref?.sessionKey!==account.loginSessionKey||ref?.provider!=='real'||ref.deviceId!==runtime.deviceId()||!['VERIFIED','UNVERIFIED','CONNECTION_ERROR'].includes(ref.state)||previous.state!=='UNKNOWN'||previous.evidenceInvalid)throw Error('ACCOUNT_RESTRICTED_OR_CHANGED');
 await db.$transaction(async tx=>{await contactLock(tx);if(await tx.auditLog.count({where:{entityId:scope.workflowId,action:'BOUNDED_PROFILE_CHECK_STARTED'}}))throw Error('PROFILE_CHECK_ALREADY_CONSUMED');await tx.auditLog.create({data:{actorId:actor.id,entityId:scope.workflowId,action:'BOUNDED_PROFILE_CHECK_STARTED',metadata:{accountId:scope.accountId,senderId:scope.senderId,submissions:0}}});});
 const permit=await devices.acquire(actor,scope.accountId);let transport:XhsRestrictionInspectionTransport|undefined,driver:SessionDriver|undefined,stopped=true;
 try{
  const combined=AbortSignal.any([signal,permit.signal,AbortSignal.timeout(60000)]);
  if(await runtime.inspect(scope.accountId,ref.sessionKey,runtime.deviceId(),'real',permit.root)!=='UNVERIFIED')throw Error('SESSION_METADATA_MISMATCH');
  await db.$transaction(tx=>devices.assertPermit(tx,permit));
  driver=await runtime.openSavedForRestrictionInspection(scope.accountId,ref.sessionKey,combined,permit.root,scope.binarySha256);stopped=false;
  if(!driver.replyEndpoint)throw Error('ENDPOINT_MISSING');
  transport=new XhsRestrictionInspectionTransport(driver.replyEndpoint(),{enabled:true,reviewedSha256:scope.binarySha256});
  const outcome=await transport.inspect({protocol:XHS_PROFILE_RESTRICTION_PROTOCOL,accountId:scope.accountId,senderId:scope.senderId},combined);stopped=await transport.close();
  if(outcome.kind!=='READ_ONLY_RESULT'||!stopped||!outcome.result.processStopped)throw Error('PROFILE_CHECK_UNAVAILABLE');
  const r=outcome.result,o=r.observation;
  const evidence={identity:o.identity,title:o.title,pathname:o.pathname,warnings:o.warnings,screenshotState:'NOT_CAPTURED' as const};
  await db.$transaction(async tx=>{
   await contactLock(tx);await devices.assertPermit(tx,permit);
   const current=await tx.platformAccount.findUnique({where:{id:scope.accountId},include:{sessionReference:true}});if(current?.version!==account.version||current.loginPlatformUserId!==scope.senderId||current.loginSessionKey!==account.loginSessionKey||current.sessionReference?.sessionKey!==ref.sessionKey||current.sessionReference?.deviceId!==ref.deviceId||current.sessionReference?.deviceKeyId!==ref.deviceKeyId)throw Error('ACCOUNT_CHANGED');
   await tx.auditLog.create({data:{actorId:actor.id,entityId:scope.workflowId,action:'BOUNDED_PROFILE_CHECK_FINISHED',metadata:{accountId:scope.accountId,senderId:scope.senderId,kind:r.kind,code:r.code,observedAt:r.observedAt,evidence,stopped:true,submissions:0}}});
   if(['IDENTITY_MISMATCH','IDENTITY_UNVERIFIED'].includes(r.kind)){await tx.accountSessionReference.update({where:{accountId:scope.accountId},data:{state:r.kind==='IDENTITY_MISMATCH'?'NEEDS_REVIEW':'EXPIRED',checkedRuntimeId:null,checkingUntil:null}});}
   if(r.kind==='OBSERVED_NO_RESTRICTION'&&o.identity==='MATCH'&&!o.warnings.length){
    await tx.accountSessionReference.update({where:{accountId:scope.accountId},data:{state:'VERIFIED',verifiedAt:new Date(),checkedRuntimeId:runtime.runtimeId,checkingUntil:null}});
   }
   if(o.identity==='MATCH'){
    const observation=sendObservationSchema.parse({state:restrictionState(o.warnings.map(w=>w.code)),source:'SAME_SESSION',observedAt:r.observedAt,evidence,requestKey:scope.workflowId,binding:{sessionKey:ref.sessionKey,deviceId:runtime.deviceId(),runtimeId:runtime.runtimeId,senderId:scope.senderId}});
    await tx.auditLog.create({data:{actorId:actor.id,entityId:scope.accountId,action:'ACCOUNT_SEND_OBSERVATION',metadata:observation}});
    if(observation.state!=='UNKNOWN'){
     await tx.autoContactControl.upsert({where:{platform_mode:{platform:'XHS',mode:'REAL'}},create:{platform:'XHS',mode:'REAL',pauseReason:'ACCOUNT_RESTRICTED',pausedAt:new Date()},update:{pauseReason:'ACCOUNT_RESTRICTED',pausedAt:new Date()}});
     await tx.autoContactRule.updateMany({where:{platform:'XHS',mode:'REAL'},data:{enabled:false}});
    }
   }
  });
  if(r.kind!=='OBSERVED_NO_RESTRICTION'||o.identity!=='MATCH'||o.warnings.length)throw Error('PROFILE_RESTRICTED_OR_UNVERIFIED');
  return {accountId:scope.accountId,senderId:scope.senderId,observedAt:r.observedAt,kind:r.kind,evidence,stopped:true,sendPermission:false};
 }finally{
  if(transport)stopped=await transport.close();else if(driver?.replyEndpoint)stopped=await driver.replyEndpoint().stop().catch(()=>false);
  if(stopped)await permit.release();
  else await db.$transaction(async tx=>{await contactLock(tx);await tx.autoContactControl.upsert({where:{platform_mode:{platform:'XHS',mode:'REAL'}},create:{platform:'XHS',mode:'REAL',pauseReason:'STOP_UNCONFIRMED',pausedAt:new Date()},update:{pauseReason:'STOP_UNCONFIRMED',pausedAt:new Date()}});await tx.autoContactRule.updateMany({where:{platform:'XHS',mode:'REAL'},data:{enabled:false}});});
 }
}
