import {accountSystemBlock} from '../accounts/account-execution-policy';
import {verifyCaptureRecoveryChain} from './capture-recovery-chain';
import {accountSendObservation} from './send-observation';
import {postAvailability,postSendBlock} from '../collection/post-availability';
import {publicPostSnapshot} from '../collection/post-reference';
import type {Prisma} from '@prisma/client';
import type { Db } from '../common/db';
import { requireAdmin, type Actor } from '../auth/security';
import { contactLock, contactNow, type ContactDb } from './contact-settings.service';
import { contactTarget, eligible, eligibilityHash, quotaBucket } from './contact-policy';
import { semanticHash } from '../collection/capture-archive';
import { savedPostReference } from '../collection/post-reference';
import { normalizeSendResult, type SendRequest, type SendResult } from './contact-sender';
import type { XhsReplyBinding } from './xhs-reply-protocol';
import {singleReplyScopeSchema,type SingleReplyScope} from './single-reply-scope';
export {singleReplyScopeSchema,type SingleReplyScope} from './single-reply-scope';
export type SingleReplyContext={request:SendRequest;binding:XhsReplyBinding;sessionKey:string;accountVersion:number;actor:Actor;scope:SingleReplyScope};
export type SingleReplyResult={result:SendResult;protocolCalls:number;submission:'NOT_ATTEMPTED'|'AT_MOST_ONCE_UNKNOWN'|'CONFIRMED_ONCE';identityVerified:boolean;stopped:boolean};
export interface SingleReplyExecutor { capable(scope:SingleReplyScope):boolean; run(context:SingleReplyContext,beforeSubmit:()=>Promise<boolean>,signal:AbortSignal):Promise<SingleReplyResult>; }
const refuse=()=>{throw Error('SINGLE_REPLY_SCOPE_OR_STATE_CHANGED');};
/** Operator-only one-shot service, deliberately no HTTP route, queue or enabled rule.
 * Audit + reservation are atomic under the same lock/ledger/day as automatic contact.
 * Re-entering an approval returns its receipt and never invokes an executor again. */
export class SingleReplyTestService {
 constructor(private db:Db,private executor:SingleReplyExecutor){}
 private async validate(tx:ContactDb,actor:Actor,s:SingleReplyScope){
  const now=await contactNow(tx),expires=new Date(s.expiresAt);if(expires<=now||expires.getTime()>now.getTime()+3600000)refuse();
  const [a,r,t,u,p,m]=await Promise.all([
   tx.platformAccount.findUnique({where:{id:s.accountId},include:{sessionReference:true}}),
   tx.semanticReview.findUnique({where:{id:s.reviewId},include:{capture:{include:{post:true,config:{select:{platform:true}}}}}}),
   tx.replyTemplate.findUnique({where:{id:s.templateId},include:{_count:{select:{configs:true}}}}),
   tx.user.findUnique({where:{id:actor.id}}),
   tx.commentReviewPolicy.findUnique({where:{id:'workspace'}}),tx.modelSettings.findFirst({select:{model:true}}),
  ]);
  if(!u?.active||u.role!=='ADMIN'||!a||a.archivedAt||a.isDemo||a.platform!=='XHS'||accountSystemBlock(a)||a.pauseReason!==s.pausedReason||a.loginProvider!=='real'||a.loginPlatformUserId!==s.senderId||!a.loginSessionKey||a.sessionReference?.provider!=='real'||a.sessionReference.state!=='VERIFIED'||a.sessionReference.sessionKey!==a.loginSessionKey)refuse();
  const observation=await accountSendObservation(tx,s.accountId,now);
  if(observation.state!=='UNKNOWN'||observation.evidenceInvalid)refuse();
  if(!r||r.isDemo||r.version!==s.reviewVersion||r.platform!=='XHS'||r.capture?.config.platform!=='XHS'||!eligible(r,91)||r.policyId!==p?.id||r.policyRevision!==p?.revision||r.selectedModel!==m?.model)refuse();
  if(!t||t.body!==s.content||t.channel!=='COMMENT'||t._count.configs!==0)refuse();
  const target=contactTarget(r!,r!.capture,r!.capture?.post??null),snapshot=r!.snapshot as Record<string,unknown>;
  if(!target||target.postId!==s.postId||target.commentId!==s.commentId||target.recipientId!==s.recipientId||snapshot.comment!==s.comment)refuse();
  const availability=await postAvailability(tx,'XHS',s.postId);if(postSendBlock(availability,now,r!.updatedAt,s.availabilityVersion))refuse();
  const ref=savedPostReference((r!.capture!.post.snapshot as Record<string,unknown>).sourceReference,s.postId);if(!ref)refuse();
  const identity=await tx.platformIdentity.findUnique({where:{platform_platformUserId:{platform:'XHS',platformUserId:s.recipientId}},include:{lead:true}});
  if(identity?.lead&&(identity.lead.doNotContact||(!identity.lead.isDemo&&(identity.lead.contactedAt||['CONTACTED','INTERESTED'].includes(identity.lead.contactStage)))))refuse();
  if(await tx.autoContactRule.count({where:{enabled:true}}))refuse();
  const day=quotaBucket('REAL',now),hash=semanticHash({review:eligibilityHash(r!),accountVersion:a!.version,session:semanticHash(a!.loginSessionKey),templateVersion:t!.version,availabilityVersion:availability?.version??0,day});
  return {account:a!,reference:ref!,day,hash,source:{post:publicPostSnapshot(r!.capture!.post.snapshot),comment:r!.snapshot}};
 }
 async execute(actor:Actor,input:unknown,signal:AbortSignal=AbortSignal.timeout(90000)){
  requireAdmin(actor);const s=singleReplyScopeSchema.parse(input),key='single-reply:'+s.approvalId,scopeHash=semanticHash(s);
  const reserved=await this.db.$transaction(async tx=>{
   await contactLock(tx);
   const prior=await tx.contactAttempt.findUnique({where:{requestKey:key}});
   if(prior)return {existing:true as const,attempt:prior};
   if(!this.executor.capable(s))throw Error('SINGLE_REPLY_RUNTIME_UNAVAILABLE');
   const v=await this.validate(tx,actor,s);
   const control=await tx.autoContactControl.findUnique({where:{platform_mode:{platform:'XHS',mode:'REAL'}}});
   if(control?.activeJobId||control?.pauseReason)throw Error('PLATFORM_BUSY_OR_PAUSED');
   const identity=await tx.platformIdentity.upsert({where:{platform_platformUserId:{platform:'XHS',platformUserId:s.recipientId}},create:{platform:'XHS',platformUserId:s.recipientId,nickname:'',isDemo:false},update:{}});
   const ledger=await tx.contactLedger.findUnique({where:{identityId_mode:{identityId:identity.id,mode:'REAL'}},include:{attempts:true}});
   const blocking=ledger?.attempts.filter(a=>a.outcome!=='CANCELLED')??[];
   if(s.previousNotAttemptedId){
    if(s.purpose==='CAPTURE_EXACT_COMMENT_RECEIPT_ONCE'){
     if(ledger?.accountId!==s.accountId)throw Error('RECIPIENT_ALREADY_RESERVED_OR_CONTACTED');
     await verifyCaptureRecoveryChain(tx,actor.id,s,ledger.attempts);
    }else{
    // Legacy one-shot recovery retains its single-predecessor restriction.
    // No record is rewritten/deleted; unknown/success/in-flight rows never pass.
    if(ledger?.accountId!==s.accountId||ledger.attempts.some(a=>a.outcome==='CANCELLED'&&(a.attemptedAt||a.confirmedAt||a.platformReceipt))||blocking.length!==1||blocking[0].id!==s.previousNotAttemptedId)throw Error('RECIPIENT_ALREADY_RESERVED_OR_CONTACTED');
    const old=blocking[0];
    if(old.outcome!=='FAILED'||old.mode!=='REAL'||old.channel!=='COMMENT'||old.confirmedAt||old.platformReceipt||old.accountIdSnapshot!==s.accountId||old.actorId!==actor.id||old.content!==s.content)throw Error('PREVIOUS_SUBMISSION_NOT_PROVEN_ABSENT');
    const events=await tx.auditLog.findMany({where:{entityId:old.requestKey,action:{in:['SINGLE_REPLY_TEST_AUTHORIZED_RESERVED','SINGLE_REPLY_TEST_FINISHED']}}});
    const starts=events.filter(e=>e.action==='SINGLE_REPLY_TEST_AUTHORIZED_RESERVED'),ends=events.filter(e=>e.action==='SINGLE_REPLY_TEST_FINISHED');
    const start=starts[0]?.metadata as Record<string,any>|undefined,end=ends[0]?.metadata as Record<string,any>|undefined;
    const priorScope=start?.scope as Record<string,unknown>|undefined;
    const same=priorScope&&['accountId','senderId','postId','commentId','recipientId','comment','content','purpose','protocol','scopeVersion'].every(k=>priorScope[k]===s[k as keyof SingleReplyScope]);
    if(starts.length!==1||ends.length!==1||!same||priorScope?.approvalId===s.approvalId||start?.attemptId!==old.id||end?.attemptId!==old.id||start?.scopeHash!==semanticHash(priorScope)||end?.scopeHash!==start?.scopeHash||end?.result!=='NOT_ATTEMPTED'||end?.submission!=='NOT_ATTEMPTED'||end?.stopped!==true||end?.pause!==null)throw Error('PREVIOUS_SUBMISSION_NOT_PROVEN_ABSENT');
    }
   }else if(blocking.length)throw Error('RECIPIENT_ALREADY_RESERVED_OR_CONTACTED');
   await tx.$queryRaw`SELECT id FROM "PlatformAccount" WHERE id=${s.accountId} FOR UPDATE`;
   const usage=await tx.accountDay.findUnique({where:{accountId_day:{accountId:s.accountId,day:v.day}}});
   if(v.account.dailyLimit<=0||(usage?.occupied??0)>=v.account.dailyLimit)throw Error('QUOTA_EXHAUSTED');
   const l=ledger?(s.previousNotAttemptedId?ledger:await tx.contactLedger.update({where:{id:ledger.id},data:{accountId:s.accountId}})):await tx.contactLedger.create({data:{identityId:identity.id,mode:'REAL',accountId:s.accountId}});
   const attempt=await tx.contactAttempt.create({data:{ledgerId:l.id,requestKey:key,kind:'FIRST',mode:'REAL',channel:'COMMENT',content:s.content,outcome:'RESERVED',day:v.day,actorId:actor.id,accountIdSnapshot:s.accountId,historySnapshot:{previousNotAttemptedId:s.previousNotAttemptedId??null,platform:'XHS',recipientId:s.recipientId,postId:s.postId,commentId:s.commentId,accountId:s.accountId,accountLabel:v.account.label,senderPlatformId:s.senderId,source:v.source} as Prisma.InputJsonValue}});
   await tx.accountDay.upsert({where:{accountId_day:{accountId:s.accountId,day:v.day}},create:{accountId:s.accountId,day:v.day,occupied:1},update:{occupied:{increment:1}}});
   await tx.autoContactControl.upsert({where:{platform_mode:{platform:'XHS',mode:'REAL'}},create:{platform:'XHS',mode:'REAL',activeJobId:key,leaseUntil:new Date(Date.now()+120000)},update:{activeJobId:key,leaseUntil:new Date(Date.now()+120000)}});
   await tx.auditLog.create({data:{actorId:actor.id,entityId:key,action:'SINGLE_REPLY_TEST_AUTHORIZED_RESERVED',metadata:{scope:s,scopeHash,validationHash:v.hash,attemptId:attempt.id,automaticContactEnabled:false}}});
   return {existing:false as const,attempt,v};
  });
  if(reserved.existing)return {reused:true,attemptId:reserved.attempt.id,outcome:reserved.attempt.outcome,execution:'NO_NEW_EXECUTION'};
  const {attempt,v}=reserved;
  const abort=new AbortController(),combined=AbortSignal.any([signal,abort.signal]);let dispatched=false,timer:ReturnType<typeof setTimeout>|undefined;
  const beforeSubmit=()=>this.db.$transaction(async tx=>{
   await contactLock(tx);if(dispatched||combined.aborted)return false;
   const current=await tx.contactAttempt.findUnique({where:{id:attempt.id}}),control=await tx.autoContactControl.findUnique({where:{platform_mode:{platform:'XHS',mode:'REAL'}}});
   if(current?.outcome!=='RESERVED'||control?.activeJobId!==key||control.pauseReason)return false;
   const checked=await this.validate(tx,actor,s);if(checked.hash!==v.hash)return false;
   const usage=await tx.accountDay.findUnique({where:{accountId_day:{accountId:s.accountId,day:v.day}}});if(!usage||usage.occupied<=0||usage.occupied>checked.account.dailyLimit)return false;
   await tx.contactAttempt.update({where:{id:attempt.id},data:{outcome:'ATTEMPTED',attemptedAt:await contactNow(tx),version:{increment:1}}});
   await tx.auditLog.create({data:{actorId:actor.id,entityId:key,action:'SINGLE_REPLY_TEST_DISPATCHED_ONCE',metadata:{attemptId:attempt.id,scopeHash}}});dispatched=true;return true;
  });
  let outcome:SingleReplyResult;
  try{
   outcome=await Promise.race([this.executor.run({request:{platform:'XHS',channel:'COMMENT',accountId:s.accountId,requestKey:key,postId:s.postId,commentId:s.commentId,recipientId:s.recipientId,content:s.content},binding:{accountId:s.accountId,senderId:s.senderId,postReference:v.reference},sessionKey:v.account.loginSessionKey!,accountVersion:v.account.version,actor,scope:s},beforeSubmit,combined),new Promise<SingleReplyResult>(resolve=>{timer=setTimeout(()=>{abort.abort();resolve({result:{kind:'BLOCKED',reason:'STOP_UNCONFIRMED'},protocolCalls:dispatched?1:0,submission:dispatched?'AT_MOST_ONCE_UNKNOWN':'NOT_ATTEMPTED',identityVerified:false,stopped:false});},90000);})]);
  }catch{abort.abort();outcome={result:{kind:'BLOCKED',reason:'STOP_UNCONFIRMED'},protocolCalls:dispatched?1:0,submission:dispatched?'AT_MOST_ONCE_UNKNOWN':'NOT_ATTEMPTED',identityVerified:false,stopped:false};}finally{clearTimeout(timer);}
  const result=normalizeSendResult(outcome.result);
  await this.db.$transaction(async tx=>{
   await contactLock(tx);const current=await tx.contactAttempt.findUniqueOrThrow({where:{id:attempt.id}});
   if(!['RESERVED','ATTEMPTED'].includes(current.outcome))return;
   const failed=result.kind==='FAILED'&&outcome.stopped&&outcome.submission==='NOT_ATTEMPTED';
   // This exact approved candidate has no verified response mapping. Never confirm.
   await tx.contactAttempt.update({where:{id:attempt.id},data:{outcome:failed?'FAILED':'UNKNOWN',resolutionNote:failed?'单次测试：候选确认提交前停止，未发送':'单次测试：未获得可靠平台回执；禁止重发',version:{increment:1}}});
   if(failed)await tx.accountDay.update({where:{accountId_day:{accountId:s.accountId,day:attempt.day}},data:{occupied:{decrement:1}}});
   const pause=result.kind==='RISK'?result.reason:!outcome.stopped||result.kind==='BLOCKED'?'STOP_UNCONFIRMED':!failed?'SUBMISSION_UNKNOWN':null;
   await tx.autoContactControl.updateMany({where:{platform:'XHS',mode:'REAL',activeJobId:key},data:{activeJobId:null,leaseUntil:null,...(pause?{pauseReason:pause,pausedAt:await contactNow(tx)}:{})}});
   if(pause)await tx.autoContactRule.updateMany({where:{platform:'XHS',mode:'REAL'},data:{enabled:false}});
   await tx.auditLog.create({data:{actorId:actor.id,entityId:key,action:'SINGLE_REPLY_TEST_FINISHED',metadata:{attemptId:attempt.id,scopeHash,result:failed?'NOT_ATTEMPTED':'UNKNOWN',resultReason:result.kind==='CONFIRMED'?'UNCONFIRMED':result.reason,protocolCalls:outcome.protocolCalls,submission:outcome.submission,identityVerified:outcome.identityVerified,stopped:outcome.stopped,pause}}});
  });
  return {reused:false,attemptId:attempt.id,outcome:result.kind==='FAILED'&&outcome.stopped&&outcome.submission==='NOT_ATTEMPTED'?'FAILED':'UNKNOWN',...outcome};
 }
}
