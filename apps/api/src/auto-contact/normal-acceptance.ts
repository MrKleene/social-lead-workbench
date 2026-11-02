import {autoReviewScope} from '../comment-review/auto-review-scope';
import {ConflictException} from '@nestjs/common';
import {z} from 'zod';
import type {Prisma,NormalAutomationAcceptance,AutoContactRule} from '@prisma/client';
import type {Db} from '../common/db';
import {wholePostRequestPolicy,type SemanticOutbound} from '@crm/contracts';
import {ruleHash,contactTarget,eligibilityHash} from './contact-policy';
import {semanticHash} from '../collection/capture-archive';
import {estimateWholePostCost} from '../collection/model-cost-estimate';

type Store=Db|Prisma.TransactionClient;
const id=z.string().min(1).max(200);
export const normalAcceptanceInput=z.object({
 id:z.string().uuid(),consent:z.literal('normal-automation-acceptance-once-v1'),requestKey:z.string().uuid(),
 channel:z.enum(['COMMENT','DM']).default('COMMENT'),
 configId:id,configRevision:z.number().int().positive(),savedPostId:id.optional(),
 selection:z.enum(['SAVED_POST','CONFIG_SEARCH']).default('SAVED_POST'),maxPosts:z.number().int().min(1).max(3).default(1),
 readAccountId:id.optional(),ruleId:id,ruleVersion:z.number().int().nonnegative(),policyVersion:z.number().int().nonnegative(),
 modelVersion:z.number().int().nonnegative(),priceVersion:id,
 targets:z.array(z.object({commentId:id,recipientId:id}).strict()).min(1).max(20).optional(),
 maxInputTokens:z.number().int().min(1).max(1000000),maxOutputTokens:z.number().int().min(1).max(131072),
 maxEstimatedMicros:z.number().int().min(1).max(100000000),expiresAt:z.string().datetime(),
}).strict();
export const replyExceptionInput=z.object({consent:z.literal('normal-reply-score95-once-v1'),postId:id,reviewId:id,expiresAt:z.string().datetime()}).strict();
export const normalAcceptanceScope=normalAcceptanceInput.omit({consent:true}).extend({
 dmTemplate:z.object({id,version:z.number().int().nonnegative(),bodyHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict().optional(),
 replyOnly:z.object({reviewId:id,postId:id,platformPostId:id,commentId:id,recipientId:id,score:z.literal(95),reviewHash:id,sourceHash:id}).strict().optional(),
 reviewConfigRevision:z.number().int().positive().optional(),platformPostId:id.optional(),replyAccountId:id,ruleHash:id,policyId:id,policyRevision:z.number().int().positive(),model:id,mode:z.enum(['REAL','SIMULATION']),
}).refine(s=>s.channel==='DM'?!!s.dmTemplate:!s.dmTemplate,{message:'私信验收必须绑定模板；评论验收不能携带私信模板'});
export type AcceptanceScope=z.infer<typeof normalAcceptanceScope>;
// STOPPED retains the envelope until explicit close, so exhaustion never opens a
// gap in which unrelated work or another envelope can silently become eligible.
export async function activeAcceptance(db:Store){return db.normalAutomationAcceptance.findFirst({where:{state:{in:['ACTIVE','STOPPED']}}});}
export function liveAcceptance(row:NormalAutomationAcceptance){return row.state==='ACTIVE'&&Date.parse(normalAcceptanceScope.parse(row.scope).expiresAt)>Date.now();}
export function acceptanceConflict():never{throw new ConflictException('本次限定验收范围、期限或总次数不符；未调用外部服务，不自动解除限制');}
/** The template is part of the finite consent, not merely a UI selection. */
export async function acceptanceDmTemplate(db:Store,rule:AutoContactRule){
 if(rule.channel!=='DM'||rule.channels.length!==1||rule.channels[0]!=='DM'||!rule.templateId||rule.templateVersion===null||!rule.content.trim()||rule.content.trim()!==rule.content||rule.content.length>1000||/[\r\n\0]|\{\{|\}\}/.test(rule.content))return null;
 const template=await db.replyTemplate.findUnique({where:{id:rule.templateId}});
 if(!template||template.channel!=='DM'||template.version!==rule.templateVersion||template.body!==rule.content)return null;
 return {id:template.id,version:template.version,bodyHash:semanticHash({body:template.body})};
}
export async function acceptanceRuleAllowed(db:Store,rule:AutoContactRule){
 const a=await activeAcceptance(db);if(!a)return true;const s=normalAcceptanceScope.parse(a.scope);
 if(!liveAcceptance(a)||s.ruleId!==rule.id||s.ruleVersion!==rule.version||s.ruleHash!==ruleHash(rule)||s.mode!==rule.mode||s.channel!==rule.channel||rule.channels.length!==1||rule.channels[0]!==s.channel)return false;
 if(s.channel==='DM'){const template=await acceptanceDmTemplate(db,rule);if(!template||semanticHash(template)!==semanticHash(s.dmTemplate))return false;}
 return true;
}
export async function acceptanceCollectionStart(db:Store,input:{actorId:string;configId:string;revision:number;requestKey:string;accountId?:string;plan?:{savedPostId?:string;freshPostsOnly?:boolean;restartCheckpoint?:boolean;postsPerRound:number;rounds:number;commentPages:number}}){
 const a=await activeAcceptance(db);if(!a)return null;const s=normalAcceptanceScope.parse(a.scope);
 if(s.replyOnly||!liveAcceptance(a)||a.actorId!==input.actorId||s.configId!==input.configId||s.configRevision!==input.revision||s.requestKey!==input.requestKey||s.readAccountId!==input.accountId||!input.plan||input.plan.savedPostId!==s.savedPostId||!!input.plan.freshPostsOnly!==(s.selection==='CONFIG_SEARCH')||input.plan.restartCheckpoint||input.plan.postsPerRound!==s.maxPosts||input.plan.rounds!==1||input.plan.commentPages!==1)acceptanceConflict();
 return a;
}
export async function acceptanceRunAllowed(db:Store,runId:string){
 const a=await activeAcceptance(db)??await db.normalAutomationAcceptance.findUnique({where:{runId}});
 return !a||liveAcceptance(a)&&!normalAcceptanceScope.parse(a.scope).replyOnly&&a.runId===runId;
}
/** Recollection may create a new immutable archive version of the selected platform post. */
export async function bindAcceptancePost(db:Store,runId:string,postId:string){
 const a=await activeAcceptance(db);if(!a)return acceptanceRunAllowed(db,runId);const s=normalAcceptanceScope.parse(a.scope);
 const post=await db.capturedPost.findUnique({where:{id:postId}});
 if(s.replyOnly||!liveAcceptance(a)||a.runId!==runId||!post||(s.selection==='SAVED_POST'&&post.platformPostId!==s.platformPostId)||post.configId!==s.configId||post.lastRunId!==runId)return false;
 const posts=await db.normalAcceptancePost.findMany({where:{acceptanceId:a.id}});
 if(posts.some(p=>p.postId===postId))return true;
 if(posts.length>=s.maxPosts)return false;
 await db.normalAcceptancePost.create({data:{acceptanceId:a.id,postId}});
 if(!a.capturedPostId)await db.normalAutomationAcceptance.update({where:{id:a.id},data:{capturedPostId:postId}});
 return true;
}
/** An incomplete capture can be excluded, never promoted or dispatched. */
export async function coverageSkipped(db:Store,a:NormalAutomationAcceptance,job:{postId:string;runId:string;status:string;reason:string|null}){
 if(job.status!=='SKIPPED'||job.runId!==a.runId||!job.reason?.startsWith('覆盖未通过：'))return false;
 const [post,claim]=await Promise.all([db.capturedPost.findUnique({where:{id:job.postId}}),db.normalAcceptancePost.findUnique({where:{acceptanceId_postId:{acceptanceId:a.id,postId:job.postId}}})]);
 return !!post&&post.lastRunId===a.runId&&post.coverage!=='COMPLETE'&&!!claim&&!claim.modelCallId&&!claim.reviewIds.length;
}
export async function blockingAcceptanceJobs(db:Store,a:NormalAutomationAcceptance,statuses:string[]){
 const jobs=await db.autoReviewJob.findMany({where:{runId:a.runId!,status:{in:statuses}}});
 for(const job of jobs)if(!await coverageSkipped(db,a,job))return true;return false;
}
export async function acceptanceReviewConfigRevision(db:Store,runId:string,original:number){
 const a=await db.normalAutomationAcceptance.findUnique({where:{runId}});return a&&liveAcceptance(a)?normalAcceptanceScope.parse(a.scope).reviewConfigRevision??original:original;
}
export async function acceptanceReviewAllowed(db:Store,job:{id:string;runId:string;postId:string;policyId:string;policyVersion:number},modelVersion?:number){
 const a=await activeAcceptance(db)??await db.normalAutomationAcceptance.findUnique({where:{runId:job.runId}});
 if(!a)return true;const s=normalAcceptanceScope.parse(a.scope),actor=await db.user.findUnique({where:{id:a.actorId}});
 return !s.replyOnly&&!!actor?.active&&actor.role==='ADMIN'&&liveAcceptance(a)&&a.runId===job.runId&&!!await db.normalAcceptancePost.findUnique({where:{acceptanceId_postId:{acceptanceId:a.id,postId:job.postId}}})&&s.policyId===job.policyId&&s.policyVersion===job.policyVersion&&(modelVersion===undefined||modelVersion===s.modelVersion);
}
/** Called under the existing provider lock both before reservation and dispatch.
 * A durable claim is never refunded, including pre-HTTP failures and next-day retries. */
export async function guardAcceptanceModel(db:Store,input:{autoJobId?:string;policyId?:string;modelVersion:number;model:string;rows:{id:string;captureId:string|null}[];payload:SemanticOutbound;callId?:string}){
 const job=input.autoJobId?await db.autoReviewJob.findUnique({where:{id:input.autoJobId}}):null;
 const captureIds=input.rows.flatMap(r=>r.captureId?[r.captureId]:[]);
 const sourceRuns=!job&&captureIds.length?await db.capturedComment.findMany({where:{id:{in:captureIds}},select:{lastRunId:true}}):[];
 const a=await activeAcceptance(db)??(job?await db.normalAutomationAcceptance.findUnique({where:{runId:job.runId}}):sourceRuns.length?await db.normalAutomationAcceptance.findFirst({where:{runId:{in:sourceRuns.map(c=>c.lastRunId)}}}):null);
 if(!a)return null;
 const s=normalAcceptanceScope.parse(a.scope);
 if(s.replyOnly||!job||!await acceptanceReviewAllowed(db,job,input.modelVersion)||input.policyId!==s.policyId||input.model!==s.model||input.payload.requestPolicy!==wholePostRequestPolicy)acceptanceConflict();
 // Bind every actual outbound row to the current captured run, not merely the displayed post.
 const captures=await db.capturedComment.findMany({where:{id:{in:input.rows.flatMap(r=>r.captureId?[r.captureId]:[])}}});
 const members=new Set((await autoReviewScope(db,job.postId,a.runId!)).map(c=>c.id));
 if(captures.length!==input.rows.length||captures.some(c=>!members.has(c.id)))acceptanceConflict();
 const post=await db.normalAcceptancePost.findUniqueOrThrow({where:{acceptanceId_postId:{acceptanceId:a.id,postId:job.postId}}});
 if(post.modelCallId&&post.modelCallId!==input.callId)acceptanceConflict();
 if(input.callId&&(post.modelCallId!==input.callId||JSON.stringify([...post.reviewIds].sort())!==JSON.stringify(input.rows.map(r=>r.id).sort())))acceptanceConflict();
 if(s.maxPosts>1&&(!a.batchPlanned||post.payloadHash!==semanticHash(input.payload)||await blockingAcceptanceJobs(db,a,['FAILED','CANCELLED','SKIPPED'])))acceptanceConflict();
 const estimate=estimateWholePostCost(input.payload,input.model);
 if(!estimate.fits||estimate.priceVersion!==s.priceVersion||estimate.inputTokensUpper>s.maxInputTokens||estimate.outputTokens>s.maxOutputTokens||estimate.estimatedMicros===null||estimate.estimatedMicros>s.maxEstimatedMicros)acceptanceConflict();
 if(s.maxPosts>1){const plans=await db.normalAcceptancePost.findMany({where:{acceptanceId:a.id}});if(plans.some(p=>p.estimatedMicros===null)||plans.reduce((n,p)=>n+(p.estimatedMicros??0),0)>s.maxEstimatedMicros||post.estimatedMicros!==estimate.estimatedMicros)acceptanceConflict();}
 return {a,estimate,postId:job.postId};
}
export async function claimAcceptanceModel(db:Store,id:string,callId:string,reviewIds:string[],estimate:ReturnType<typeof estimateWholePostCost>,postId:string){
 const a=await db.normalAutomationAcceptance.findUniqueOrThrow({where:{id}}),s=normalAcceptanceScope.parse(a.scope);
 if(s.replyOnly||!liveAcceptance(a)||await db.normalAcceptancePost.count({where:{acceptanceId:id,modelCallId:{not:null}}})>=s.maxPosts)acceptanceConflict();
 const result=await db.normalAcceptancePost.updateMany({where:{acceptanceId:id,postId,modelCallId:null},data:{modelCallId:callId,reviewIds,estimatedMicros:estimate.estimatedMicros}});
 if(result.count!==1)acceptanceConflict();
 await db.normalAutomationAcceptance.update({where:{id},data:{modelCallId:a.modelCallId??callId,reviewIds:{push:reviewIds},modelClaimedAt:a.modelClaimedAt??new Date()}});
 await db.auditLog.create({data:{action:'NORMAL_ACCEPTANCE_MODEL_CLAIMED',entityId:id,metadata:{callId,postId,maximumCalls:s.maxPosts,perPostMaximum:1,estimate} as Prisma.InputJsonValue}});
}
export async function acceptanceSendThreshold(db:Store,rule:AutoContactRule,reviewId:string){
 const a=await activeAcceptance(db);if(!a||!liveAcceptance(a))return rule.threshold;const s=normalAcceptanceScope.parse(a.scope);return s.ruleId===rule.id&&s.ruleVersion===rule.version&&s.replyOnly?.reviewId===reviewId?s.replyOnly.score:rule.threshold;
}
export async function acceptanceSendAllowed(db:Store,rule:AutoContactRule,reviewId:string,jobId?:string){
 const r=await db.semanticReview.findUnique({where:{id:reviewId},include:{capture:{include:{post:true}}}});
 const runId=r?.capture?.lastRunId;
 const a=await activeAcceptance(db)??(runId?await db.normalAutomationAcceptance.findUnique({where:{runId}}):null);
 if(!a){
  if(rule.mode!=='REAL')return true;
  // A normal enable authorizes new collection runs, not old results edited or
  // re-evaluated after enable. Recheck at reservation and final RPC as well.
  if(!r?.capture||!rule.authorizedAt||r.updatedAt<rule.authorizedAt)return false;
  const sourceIds=[r.runId,r.capture.runId,r.capture.lastRunId];
  if(sourceIds.some(id=>typeof id!=='string'||!id))return false;
  const ids=[...new Set(sourceIds)];
  return await db.collectionRun.count({where:{id:{in:ids},createdAt:{gte:rule.authorizedAt}}})===ids.length;
 }
 const s=normalAcceptanceScope.parse(a.scope);
 if(!r||!liveAcceptance(a)||!await acceptanceRuleAllowed(db,rule)||rule.id!==s.ruleId||!r.capture?.postId||runId!==a.runId||!a.reviewIds.includes(reviewId)||!a.modelCallId||a.sendJobId&&a.sendJobId!==jobId)return false;
 const target=contactTarget(r,r.capture,r.capture?.post??null);
 if(!target)return false;
 if(s.replyOnly){
  const e=s.replyOnly;if(rule.threshold!==100||r.id!==e.reviewId||r.score!==e.score||r.capture.postId!==e.postId||r.capture.post.coverage!=='COMPLETE'||target.postId!==e.platformPostId||target.commentId!==e.commentId||target.recipientId!==e.recipientId||eligibilityHash(r)!==e.reviewHash||semanticHash({capture:r.capture.snapshot,post:r.capture.post.snapshot})!==e.sourceHash)return false;
 }else if(s.selection==='CONFIG_SEARCH'){
  // The user authorizes a category within this one newly captured post; no
  // need to choose or approve an individual recipient before collection.
  if(rule.threshold!==100||r.score!==100||target.postId!==r.capture?.post.platformPostId)return false;
 }else if(target.postId!==s.platformPostId||!s.targets?.some(t=>t.commentId===target.commentId&&t.recipientId===target.recipientId))return false;
 const posts=await db.normalAcceptancePost.findMany({where:{acceptanceId:a.id}}),post=posts.find(p=>p.postId===r.capture?.postId);
 if(!post?.modelCallId||!post.reviewIds.includes(reviewId))return false;
 if(s.maxPosts>1){
  if(!a.batchPlanned||posts.some(p=>p.estimatedMicros===null||p.reviewIds.length&&!p.modelCallId))return false;
  if(await blockingAcceptanceJobs(db,a,['PENDING','PROCESSING','FAILED','CANCELLED','SKIPPED']))return false;
  const ids=posts.flatMap(p=>p.modelCallId?[p.modelCallId]:[]);if(await db.semanticModelCall.count({where:{id:{in:ids},status:'COMPLETED'}})!==ids.length)return false;
 }
 return (await db.semanticModelCall.findUnique({where:{id:post.modelCallId}}))?.status==='COMPLETED';
}

/** Called under contactLock. Turn off the bound switches on expiry or a final
 * outcome, retaining all claims and the blocking envelope until explicit close. */
export async function settleAcceptance(db:Store){
 const a=await activeAcceptance(db);if(!a||a.state!=='ACTIVE')return;
 const s=normalAcceptanceScope.parse(a.scope);
 let reason=!liveAcceptance(a)?'EXPIRED':null;
 // Arming freezes the exact old evaluation before the normal rule enable.
 if(!reason&&s.replyOnly&&(await db.autoContactRule.findUnique({where:{id:s.ruleId}}))?.version===s.ruleVersion-1)return;
 if(!reason&&s.maxPosts>1){const posts=await db.normalAcceptancePost.findMany({where:{acceptanceId:a.id}}),ids=posts.flatMap(p=>p.modelCallId?[p.modelCallId]:[]);if(await db.semanticModelCall.count({where:{id:{in:ids},status:{notIn:['RESERVED','COMPLETED']}}})||a.runId&&await blockingAcceptanceJobs(db,a,['FAILED','CANCELLED','SKIPPED']))reason='MODEL_FAILED_OR_SCOPE_CHANGED';}
 if(!reason&&a.sendJobId){const j=await db.autoContactJob.findUnique({where:{id:a.sendJobId}});if(j&&!['RESERVED','ATTEMPTED'].includes(j.status))reason='SUBMISSION_FINISHED';}
 if(!reason&&a.runId&&!a.sendJobId){
  const run=await db.collectionRun.findUnique({where:{id:a.runId}});
  const jobs=await db.autoReviewJob.findMany({where:{runId:a.runId,policyId:s.policyId}});
  const model= a.modelCallId?await db.semanticModelCall.findUnique({where:{id:a.modelCallId}}):null;
  if(run&&!['QUEUED','RUNNING'].includes(run.status)&&!jobs.some(j=>['PENDING','PROCESSING'].includes(j.status))&&model?.status!=='RESERVED'){
   if(!a.modelCallId||model?.status!=='COMPLETED')reason='NO_MODEL_RESULT';
   else if(!await db.autoContactJob.count({where:{ruleId:s.ruleId,reviewId:{in:a.reviewIds},status:{in:['QUEUED','WAITING_ACCOUNT','WAITING_QUOTA','RESERVED','ATTEMPTED']}}}))reason='NO_ELIGIBLE_RECIPIENT';
  }
 }
 if(!reason)return;
 await db.autoContactRule.updateMany({where:{id:s.ruleId},data:{enabled:false}});
 await db.commentReviewPolicy.updateMany({where:{id:s.policyId},data:{autoEnabled:false}});
 if(a.runId){await db.collectionRun.updateMany({where:{id:a.runId,status:{in:['QUEUED','RUNNING']}},data:{cancelRequested:true}});await db.autoReviewJob.updateMany({where:{runId:a.runId,status:'PENDING'},data:{status:'CANCELLED',reason:'限定验收已结束'}});}
 await db.normalAutomationAcceptance.update({where:{id:a.id},data:{state:'STOPPED'}});
 await db.auditLog.create({data:{action:'NORMAL_ACCEPTANCE_STOPPED',entityId:a.id,metadata:{reason,consumedModel:!!a.modelCallId,consumedSend:!!a.sendJobId}}});
}
/** Under contactLock; the attempt is consumed before any sender call, never on result. */
export async function claimAcceptanceSend(db:Store,rule:AutoContactRule,reviewId:string,jobId:string,accountId:string){
 if(!await acceptanceSendAllowed(db,rule,reviewId,jobId))return false;
 const a=await activeAcceptance(db);if(!a)return true;const s=normalAcceptanceScope.parse(a.scope);
 if(s.replyAccountId!==accountId)return false;
 const claim=await db.normalAutomationAcceptance.updateMany({where:{id:a.id,state:'ACTIVE',sendJobId:null},data:{sendJobId:jobId,sendClaimedAt:new Date()}});
 if(claim.count!==1)return false;
 await db.auditLog.create({data:{action:'NORMAL_ACCEPTANCE_SEND_CLAIMED',entityId:a.id,metadata:{jobId,maximumSubmissions:1}}});return true;
}
