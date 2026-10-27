import {z} from 'zod';
import type {SemanticReview,CapturedComment,CapturedPost} from '@prisma/client';
import {eligible,contactTarget} from './contact-policy';
const id=z.string().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/),platformId=z.string().regex(/^[a-f0-9]{24}$/);
export const boundedFlowScopeSchema=z.object({
 workflowId:z.string().uuid(),purpose:z.literal('COLLECT_REVIEW_CAPTURE_ONCE'),
 accountId:id,senderId:platformId,configId:id,configRevision:z.number().int().positive(),policyId:id,policyRevision:z.number().int().positive(),policyVersion:z.number().int().nonnegative(),model:z.string().min(1).max(100),modelConfigurationVersion:z.number().int().nonnegative(),
 binarySha256:z.string().regex(/^[a-f0-9]{64}$/),content:z.string().min(1).max(4000),threshold:z.literal(91),maximumPosts:z.literal(1),maximumModelCalls:z.literal(1),maximumSubmissions:z.literal(1),retryCount:z.literal(0),
 excludedPostIds:z.array(platformId).min(1).max(100),excludedRecipientIds:z.array(platformId).min(1).max(100),expiresAt:z.string().datetime(),
}).strict();
export type BoundedFlowScope=z.infer<typeof boundedFlowScopeSchema>;
type Row=SemanticReview&{capture:CapturedComment&{post:CapturedPost}|null};
/** Automatic deterministic rule selection from this exact new run and model batch.
 * No caller/model-selected recipient, old review, insufficient context or prior
 * ledger can enter the exact one-shot sender. Its transactional guards recheck. */
export function chooseBoundedCandidate(rows:Row[],scope:BoundedFlowScope,runId:string,postId:string,blockedRecipients:ReadonlySet<string>){
 return rows.filter(r=>{
  const p=r.capture?.post,t=contactTarget(r,r.capture,p??null);
  return !r.isDemo&&r.platform==='XHS'&&r.policyId===scope.policyId&&r.policyRevision===scope.policyRevision&&r.selectedModel===scope.model&&eligible(r,scope.threshold)&&
   r.capture?.lastRunId===runId&&p?.lastRunId===runId&&p?.id===postId&&t&&!scope.excludedPostIds.includes(t.postId)&&!scope.excludedRecipientIds.includes(t.recipientId)&&!blockedRecipients.has(t.recipientId);
 }).sort((a,b)=>(b.score??0)-(a.score??0)||a.id.localeCompare(b.id))[0]??null;
}
