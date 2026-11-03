import {ConflictException} from '@nestjs/common';
import type {Prisma} from '@prisma/client';
import {z} from 'zod';
import {semanticInputPolicy,wholePostRequestPolicy} from '@crm/contracts';
import {requireAdmin,type Actor} from '../auth/security';

const snapshotSchema=z.object({id:z.string(),version:z.number().int(),revision:z.number().int(),target:z.string(),autoEnabled:z.boolean(),autoModelVersion:z.number().int().nullable(),autoActorId:z.string().nullable(),consentId:z.string().nullable()}).strict();
function fail():never{throw new ConflictException('原自动匹配授权或恢复范围已变化；未恢复');}
type Tx=Prisma.TransactionClient;

/** Internal operator helper, called under lockReview in the preparation transaction.
 * Persist this receipt in FINITE_DM_ACCEPTANCE_PREPARED before changing settings. */
export async function captureReviewRestore(tx:Tx,id:string){
 const p=await tx.commentReviewPolicy.findUniqueOrThrow({where:{id}});
 const consent=p.autoEnabled?await tx.auditLog.findFirst({where:{entityId:id,action:'COMMENT_REVIEW_AUTO_CONSENT',metadata:{path:['policyVersion'],equals:p.version}},orderBy:{createdAt:'desc'}}):null;
 const m=consent?.metadata as Record<string,unknown>|null;
 if(p.autoEnabled&&(!consent||consent.actorId!==p.autoActorId||m?.enabled!==true||m.modelVersion!==p.autoModelVersion||m.requestPolicy!==wholePostRequestPolicy))fail();
 return snapshotSchema.parse({id:p.id,version:p.version,revision:p.revision,target:p.target,autoEnabled:p.autoEnabled,autoModelVersion:p.autoModelVersion,autoActorId:p.autoActorId,consentId:consent?.id??null});
}

/** Restore only a previously captured authorization, never manufacture a new one.
 * Caller owns lockReview and the surrounding transaction, including other settings.
 * No jobs are requeued, no model is called, and no sending rule is changed here. */
export async function restoreReviewAuthorization(tx:Tx,actor:Actor,restorationId:string,expectedVersion:number){
 requireAdmin(actor);
 const user=await tx.user.findUnique({where:{id:actor.id}});if(!user?.active||user.role!=='ADMIN')fail();
 const receipt=await tx.auditLog.findFirst({where:{entityId:restorationId,action:'FINITE_DM_ACCEPTANCE_PREPARED'},orderBy:{createdAt:'asc'}});
 const parsed=snapshotSchema.safeParse((receipt?.metadata as Record<string,unknown>|null)?.reviewRestore);
 if(!receipt||receipt.actorId!==actor.id||!parsed.success)fail();
 const before=parsed.data!;
 const envelope=await tx.normalAutomationAcceptance.findUnique({where:{id:restorationId}});
 const scope=envelope?.scope as Record<string,unknown>|undefined;
 if(!envelope||envelope.state!=='CLOSED'||envelope.actorId!==actor.id||scope?.policyId!==before.id||scope.policyRevision!==before.revision||scope.policyVersion!==expectedVersion||(before.autoEnabled&&scope.modelVersion!==before.autoModelVersion))fail();
 const current=await tx.commentReviewPolicy.findUnique({where:{id:before.id}});
 if(!current||current.version!==expectedVersion||current.version<=before.version||current.autoEnabled||current.revision!==before.revision||current.target!==before.target)fail();
 if(await tx.autoReviewJob.count({where:{policyId:before.id,status:{in:['PENDING','PROCESSING']}}}))fail();
 if(before.autoEnabled){
  const consent=before.consentId?await tx.auditLog.findUnique({where:{id:before.consentId}}):null;
  const m=consent?.metadata as Record<string,unknown>|null;
  const [owner,model]=await Promise.all([before.autoActorId?tx.user.findUnique({where:{id:before.autoActorId}}):null,tx.modelSettings.findFirst()]);
  if(!consent||consent.entityId!==before.id||consent.action!=='COMMENT_REVIEW_AUTO_CONSENT'||consent.actorId!==before.autoActorId||m?.enabled!==true||m.policyVersion!==before.version||m.modelVersion!==before.autoModelVersion||m.requestPolicy!==wholePostRequestPolicy||!owner?.active||owner.role!=='ADMIN'||!model?.consent||model.consentInputPolicy!==semanticInputPolicy||model.version!==before.autoModelVersion)fail();
 }
 const updated=await tx.commentReviewPolicy.updateMany({where:{id:before.id,version:expectedVersion,autoEnabled:false,revision:before.revision,target:before.target},data:{autoEnabled:before.autoEnabled,autoModelVersion:before.autoModelVersion,autoActorId:before.autoActorId,version:{increment:1}}});
 if(updated.count!==1)fail();
 const row=await tx.commentReviewPolicy.findUniqueOrThrow({where:{id:before.id}});
 // Preserve consent lineage explicitly. This is a restoration, not a new user click.
 await tx.auditLog.create({data:{actorId:before.autoEnabled?before.autoActorId:actor.id,entityId:before.id,action:'COMMENT_REVIEW_AUTO_CONSENT',metadata:{enabled:row.autoEnabled,modelVersion:row.autoModelVersion,policyVersion:row.version,requestPolicy:wholePostRequestPolicy,restorationId,restoredBy:actor.id,restoredFromConsentId:before.consentId,restoredFromPolicyVersion:before.version,preparationAuditId:receipt.id}}});
 return row;
}
