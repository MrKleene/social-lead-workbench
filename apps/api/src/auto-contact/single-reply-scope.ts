import {z} from 'zod';
import {singleReplyBuildHashes,singleReplyScopeVersion,singleReplyPurpose} from './single-reply-builds';
import {XHS_REPLY_PROTOCOL} from './xhs-reply-protocol';
const id=z.string().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/), platformId=z.string().regex(/^[a-f0-9]{24}$/);
const legacyScopeSchema=z.object({
 scopeVersion:z.literal(singleReplyScopeVersion),purpose:z.literal(singleReplyPurpose),protocol:z.literal(XHS_REPLY_PROTOCOL),
 previousNotAttemptedId:id.optional(),
 availabilityVersion:z.number().int().nonnegative(),approvalId:z.string().uuid(),accountId:id,senderId:platformId,reviewId:id,reviewVersion:z.number().int().nonnegative(),templateId:id,
 postId:platformId,commentId:platformId,recipientId:platformId,comment:z.string().min(1).max(20000),content:z.string().min(1).max(4000),
 binarySha256:z.enum(singleReplyBuildHashes),maximumSubmissions:z.literal(1),retryCount:z.literal(0),expiresAt:z.string().datetime(),
 // Exact legacy metadata snapshot; null is the new neutral login state. Neither grants sending.
 pausedReason:z.literal('登录已验证；只读采集须逐次确认，发送禁用').nullable(),
}).strict();
// Separate explicit operator authority for one evidence-producing submission.
// This is application authorization, never a platform "can send" assertion.
export const controlledScopeVersion='workbench.single-reply-authorization.v3' as const;
export const controlledPurpose='CAPTURE_EXACT_COMMENT_RECEIPT_ONCE' as const;
const captureScopeSchema=legacyScopeSchema.extend({
 scopeVersion:z.literal(controlledScopeVersion),purpose:z.literal(controlledPurpose),
 binarySha256:z.string().regex(/^[a-f0-9]{64}$/),
 receiptCapture:z.literal('workbench.reply-receipt-capture.v1'),
 previousNotAttemptedId:id.optional(),
 recoveryWorkflowId:z.string().uuid().optional(),
 excludedPostIds:z.array(platformId).min(1).max(100),
 excludedRecipientIds:z.array(platformId).min(1).max(100),
}).strict().refine(s=>!!s.previousNotAttemptedId===!!s.recoveryWorkflowId&&(!s.recoveryWorkflowId||s.recoveryWorkflowId!==s.approvalId),'EXPLICIT_RECOVERY_WORKFLOW_REQUIRED').refine(s=>!s.excludedPostIds.includes(s.postId)&&!s.excludedRecipientIds.includes(s.recipientId),'EXCLUDED_TARGET');
export const singleReplyScopeSchema=z.union([legacyScopeSchema,captureScopeSchema]);
export type SingleReplyScope=z.infer<typeof singleReplyScopeSchema>;
