import {accountSystemBlock} from '../accounts/account-execution-policy';
import {exactReplyDeployment,type ExactReplyDeployment} from './xhs-reply-deployment';
import {singleReplyScopeSchema,controlledPurpose} from './single-reply-scope';
import {semanticHash} from '../collection/capture-archive';
import {z} from 'zod';
import {contactLock} from './contact-lock';
import type {Prisma} from '@prisma/client';
import {executionEventSchema,type ExecutionEvent} from './reply-stage-journal';
import {restrictionResultSchema} from './xhs-restriction-transport';
export const sendObservationSchema=z.object({
 state:z.enum(['RESTRICTED','VERIFY_REQUIRED','RATE_LIMITED','REPLY_DISABLED','UNKNOWN']),
 source:z.enum(['SAME_SESSION','USER_REPORT']),
 observedAt:z.string().datetime(),
 evidence:restrictionResultSchema.shape.observation.pick({identity:true,title:true,pathname:true,warnings:true}).extend({screenshotState:z.literal('NOT_CAPTURED')}).strict().optional(),
 requestKey:z.string().regex(/^[A-Za-z0-9:_-]{1,200}$/).optional(),
}).strict();
export type SendObservation=z.infer<typeof sendObservationSchema>;
export function restrictionState(codes:string[]):SendObservation['state'] {
 if(codes.some(c=>['BANNED','MUTED','ACCOUNT_CONTENT_RESTRICTED'].includes(c)))return 'RESTRICTED';
 if(codes.some(c=>['VERIFICATION','SESSION_LIMIT'].includes(c)))return 'VERIFY_REQUIRED';
 if(codes.includes('RATE_LIMITED'))return 'RATE_LIMITED';
 if(codes.some(c=>['COMMENT_RESTRICTED','ACCESS_ERROR'].includes(c)))return 'REPLY_DISABLED';
 return 'UNKNOWN';
}
export async function recordSendExecution(tx:Prisma.TransactionClient, actorId:string, accountId:string, requestKey:string, action:'SINGLE_REPLY_EXECUTION_STAGE'|'AUTO_CONTACT_EXECUTION_STAGE',event:ExecutionEvent, senderId:string){
 const safe=executionEventSchema.parse(event);
 await contactLock(tx);
 const account=await tx.platformAccount.findUnique({where:{id:accountId}});
 if(!account||account.isDemo||account.platform!=='XHS'||account.loginPlatformUserId!==senderId)throw Error('SEND_EVIDENCE_ACCOUNT_MISMATCH');
 // Last durable application boundary before RPC: a concurrent restriction cannot
 // pass this boundary using a stale health result. Controlled evidence capture must additionally prove its durable one-use scope.
 if(safe.stage==='RPC_INTENT'){
  if(accountSystemBlock(account))throw Error('SEND_PERMISSION_UNVERIFIED');
  const control=await tx.autoContactControl.findUnique({where:{platform_mode:{platform:account.platform,mode:'REAL'}}});
  const observation=await accountSendObservation(tx,accountId,new Date());
  if(control?.pauseReason||observation.state!=='UNKNOWN'||observation.evidenceInvalid)throw Error('SEND_PERMISSION_UNVERIFIED');
  if(!observation.canSend){
   if(action!=='SINGLE_REPLY_EXECUTION_STAGE'||control?.activeJobId!==requestKey||!control.leaseUntil||control.leaseUntil<=new Date())throw Error('SEND_PERMISSION_UNVERIFIED');
   const starts=await tx.auditLog.findMany({where:{entityId:requestKey,action:'SINGLE_REPLY_TEST_AUTHORIZED_RESERVED'}});
   const metadata=starts[0]?.metadata as Record<string,unknown>|undefined;
   const parsed=singleReplyScopeSchema.safeParse(metadata?.scope);
   const attempt=await tx.contactAttempt.findUnique({where:{requestKey}});
   const priorIntent=await tx.auditLog.count({where:{entityId:requestKey,action,metadata:{path:['stage'],equals:'RPC_INTENT'}}});
   if(starts.length!==1||starts[0].actorId!==actorId||!parsed.success||parsed.data.purpose!==controlledPurpose||
    parsed.data.accountId!==accountId||parsed.data.senderId!==senderId||requestKey!=='single-reply:'+parsed.data.approvalId||
    Date.parse(parsed.data.expiresAt)<=Date.now()||metadata?.scopeHash!==semanticHash(parsed.data)||
    attempt?.outcome!=='ATTEMPTED'||attempt.actorId!==actorId||attempt.accountIdSnapshot!==accountId||attempt.id!==metadata?.attemptId||priorIntent!==0)throw Error('SEND_PERMISSION_UNVERIFIED');
  }
 }

 await tx.auditLog.create({data:{actorId,entityId:requestKey,action,metadata:safe}});
 if(safe.stage==='TRANSPORT_STOP') for(const row of safe.journal.records){
  if(row.attemptId!==safe.protocolAttemptId)throw Error('SEND_EVIDENCE_ATTEMPT_MISMATCH');
  if(!row.evidence||row.evidence.identity!=='MATCH')continue;
  const observation=sendObservationSchema.parse({state:restrictionState(row.evidence.warnings.map(w=>w.code)),source:'SAME_SESSION',observedAt:row.at,evidence:row.evidence,requestKey});
  await tx.auditLog.create({data:{actorId,entityId:accountId,action:'ACCOUNT_SEND_OBSERVATION',metadata:observation}});
  if(observation.state!=='UNKNOWN'){
   // Never release active leases, attempts, original-day quota or recipient locks.
   // Dispatch recovery handles a process interruption as UNKNOWN independently.
   const now=new Date();
   await tx.autoContactControl.upsert({where:{platform_mode:{platform:account.platform,mode:'REAL'}},create:{platform:account.platform,mode:'REAL',pauseReason:'ACCOUNT_RESTRICTED',pausedAt:now},update:{pauseReason:'ACCOUNT_RESTRICTED',pausedAt:now}});
   await tx.autoContactRule.updateMany({where:{platform:account.platform,mode:'REAL'},data:{enabled:false}});
   await tx.platformAccount.update({where:{id:accountId},data:{status:'RESTRICTED',pauseReason:observation.state,version:{increment:1}}});
  }

 }
}
/** Application readiness, not a platform-issued permission. The platform may
 * reject the next submission despite a clean read. Every submission still performs
 * same-session checks before/after click; restrictions and UNKNOWN latch stops.
 * No new can-send API or always-false provider is required to graduate the release. */
export function automaticSendReady(observation:SendObservation|null,now:Date,deployment:ExactReplyDeployment=exactReplyDeployment){
 const age=observation?now.getTime()-Date.parse(observation.observedAt):Infinity;
 return deployment.enabled&&deployment.responseMappingReviewed===true&&deployment.sendEligibilityReviewed===true&&!!deployment.reviewedSha256&&
  observation?.state==='UNKNOWN'&&observation.source==='SAME_SESSION'&&observation.evidence?.identity==='MATCH'&&age>=0&&age<=300000;
}
/** Restriction observations are append-only. No empty page or elapsed time clears a
 * prior restriction. A future recovery workflow needs separate reviewed evidence. */
export async function accountSendObservation(tx:Prisma.TransactionClient,accountId:string,now:Date){
 const blocked=await tx.auditLog.findFirst({where:{entityId:accountId,action:'ACCOUNT_SEND_OBSERVATION',metadata:{path:['state'],not:'UNKNOWN'}},orderBy:{createdAt:'desc'}});
 const row=blocked??await tx.auditLog.findFirst({where:{entityId:accountId,action:'ACCOUNT_SEND_OBSERVATION'},orderBy:{createdAt:'desc'}});
 const parsed=sendObservationSchema.safeParse(row?.metadata);
 const observation=parsed.success?parsed.data:null;
 const age=observation?now.getTime()-Date.parse(observation.observedAt):Infinity;
 const ready=automaticSendReady(observation,now);
 return {state:observation?.state??'UNKNOWN',evidenceInvalid:!!row&&!parsed.success,canSend:ready,checkedAt:observation?.observedAt??null,stale:age<0||age>300000,source:observation?.source??null,evidence:observation?.evidence??null,automaticSendReady:ready,qualificationBasis:'RESTRICTION_OBSERVATION_ONLY' as const,reason:observation&&observation.state!=='UNKNOWN'?'账号受限，禁止发送或换号继续':ready?'应用发送条件已满足；提交时仍检查限制，不能保证平台接受或展示':'平台未提供只读发送许可；应用回执部署或限制检查尚未就绪，独立单次取证须精确授权并现场检查限制'};
}
