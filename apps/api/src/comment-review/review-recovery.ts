import {ConflictException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {autoReviewInputPolicy,wholePostRequestPolicy,type SemanticSnapshot} from '@crm/contracts';
import {z} from 'zod';
import type {Db} from '../common/db';
import {requireAdmin,type Actor} from '../auth/security';
import {semanticHash} from '../collection/capture-archive';
import {wasHistoryArchived} from '../history-archive/archive-guard';
import {autoReviewScope} from './auto-review-scope';
import {lockReview} from './review-policy.service';

const schema=z.object({requestId:z.string().uuid(),runId:z.string().min(1),policyId:z.string().min(1),policyVersion:z.number().int(),modelVersion:z.number().int(),jobIds:z.array(z.string()).min(1).max(3),expectedComments:z.number().int().min(1).max(1000)}).strict();
export const missingConsentReason='整帖单次调用需要重新确认自动授权';
function fail():never{throw new ConflictException('补审范围、原取消原因或授权已变化；未开始补审');}

/** Internal, explicit recovery only. Never called by timers or collection callbacks.
 * A fresh review snapshot leaves old/archived evaluations and their audit intact.
 * Jobs are claimed here, not requeued: only the caller dispatches these exact plans.
 * Caller must hold contactLock on a separate connection throughout preparation and
 * evaluation, verify all sending rules remain off, and never invoke contact workers. */
export async function prepareReviewRecovery(db:Db,actor:Actor,raw:unknown){
 requireAdmin(actor);const input=schema.parse(raw);
 if(new Set(input.jobIds).size!==input.jobIds.length)fail();
 return db.$transaction(async tx=>{await lockReview(tx);
  const user=await tx.user.findUnique({where:{id:actor.id}});if(!user?.active||user.role!=='ADMIN')fail();
  // One-time intent: a consumed or uncertain request is inspected, never prepared twice.
  if(await tx.auditLog.count({where:{entityId:input.requestId,action:'COMMENT_REVIEW_RECOVERY_PREPARED'}}))fail();
  if(await tx.autoContactRule.count({where:{enabled:true}})||await tx.autoContactJob.count({where:{status:{in:['QUEUED','MANUAL_READY','WAITING_ACCOUNT','WAITING_QUOTA','RESERVED','ATTEMPTED']}}})||await tx.contactAttempt.count({where:{outcome:{in:['RESERVED','ATTEMPTED']}}})||await tx.normalAutomationAcceptance.count({where:{state:{in:['ACTIVE','STOPPED']}}}))fail();
  if(await tx.collectionRun.count({where:{status:{in:['QUEUED','RUNNING']}}})||await tx.autoReviewJob.count({where:{status:{in:['PENDING','PROCESSING']}}})||await tx.manualReviewJob.count({where:{status:{in:['PENDING','PROCESSING','RUNNING','QUEUED']}}})||await tx.semanticModelCall.count({where:{status:'RESERVED'}})||await tx.deviceExecutionLease.count({where:{expiresAt:{gt:new Date()}}}))fail();
  if(await wasHistoryArchived(tx,'CollectionRun',input.runId))fail();
  const run=await tx.collectionRun.findUnique({where:{id:input.runId},include:{config:true}});
  const policy=await tx.commentReviewPolicy.findUnique({where:{id:input.policyId}});
  const model=await tx.modelSettings.findFirst();
  if(!run||!['COMPLETE','PARTIAL'].includes(run.status)||run.cancelRequested||!run.config.enabled||run.config.archivedAt||run.config.revision!==run.revision||!policy?.autoEnabled||policy.version!==input.policyVersion||policy.autoModelVersion!==input.modelVersion||policy.autoActorId!==actor.id||model?.version!==input.modelVersion)fail();
  const consent=await tx.auditLog.findFirst({where:{entityId:policy.id,action:'COMMENT_REVIEW_AUTO_CONSENT',metadata:{path:['policyVersion'],equals:policy.version}},orderBy:{createdAt:'desc'}});
  const metadata=consent?.metadata as Record<string,unknown>|null;
  if(!consent||consent.actorId!==actor.id||metadata?.enabled!==true||metadata.modelVersion!==input.modelVersion||metadata.requestPolicy!==wholePostRequestPolicy)fail();
  const jobs=await tx.autoReviewJob.findMany({where:{runId:run.id,policyId:policy.id},orderBy:{createdAt:'asc'}});
  if(jobs.length!==input.jobIds.length||jobs.some(j=>!input.jobIds.includes(j.id)||j.status!=='CANCELLED'||j.reason!==missingConsentReason||j.processed!==0||j.inputPolicyVersion!==autoReviewInputPolicy))fail();
  const scopes=await Promise.all(jobs.map(j=>autoReviewScope(tx,j.postId,run.id)));
  if(scopes.reduce((n,cs)=>n+cs.length,0)!==input.expectedComments||scopes.some(cs=>!cs.length))fail();
  const plans:{jobId:string;postId:string;reviewIds:string[];count:number}[]=[];
  for(let i=0;i<jobs.length;i++){
   const j=jobs[i],reviewIds:string[]=[];
   for(const c of scopes[i]){
    const s=c.snapshot as unknown as SemanticSnapshot,rules={version:1,target:policy.target,reviewThreshold:0};
    const key=semanticHash({recovery:input.requestId,policyId:policy.id,revision:policy.revision,content:c.contentHash,captureId:c.id,runId:run.id,model:model!.model});
    const row=await tx.semanticReview.create({data:{policyId:policy.id,policyRevision:policy.revision,sourceContentHash:c.contentHash,configId:c.configId,runId:run.id,revision:policy.revision,captureId:c.id,analysisKey:key,snapshotHash:key,selectedModel:model!.model,ruleHash:semanticHash(rules),contextVersion:c.contextVersion,platform:run.config.platform,platformUserId:s.userId,snapshot:c.snapshot as Prisma.InputJsonValue,rules,isDemo:c.isDemo,state:'UNANALYSED',reason:'已授权本轮补审；不发送'}});reviewIds.push(row.id);
   }
   const claim=await tx.autoReviewJob.updateMany({where:{id:j.id,status:'CANCELLED',reason:missingConsentReason,processed:0,policyVersion:j.policyVersion},data:{status:'PROCESSING',policyVersion:policy.version,reason:'已授权仅本轮模型补审；不发送'}});if(claim.count!==1)fail();
   plans.push({jobId:j.id,postId:j.postId,reviewIds,count:reviewIds.length});
  }
  await tx.auditLog.create({data:{actorId:actor.id,entityId:input.requestId,action:'COMMENT_REVIEW_RECOVERY_PREPARED',metadata:{...input,plans,originalJobs:jobs.map(j=>({id:j.id,status:j.status,reason:j.reason,policyVersion:j.policyVersion})),modelOnly:true,priorResultsPreserved:true}}});
  return {requestId:input.requestId,runId:run.id,plans};
 },{timeout:30000});
}
