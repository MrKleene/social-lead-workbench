import type { SemanticReview, CapturedComment, CapturedPost } from '@prisma/client';
import { semanticHash } from '../collection/capture-archive';
export const shanghaiDay = (now: Date) => new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
export const quotaBucket = (mode: string, now: Date) => `${mode}:Asia/Shanghai:${shanghaiDay(now)}`;
export type ContactTarget = {
    recipientId: string;
    postId: string;
    commentId: string;
};
/** Bind the author of the reviewed comment, never snapshot.targetComment (the old reply's target). */
export function contactTarget(review: SemanticReview, capture: CapturedComment | null, post: CapturedPost | null): ContactTarget | null {
    const s = review.snapshot as Record<string, unknown>, c = capture?.snapshot as Record<string, unknown> | undefined;
    const id = (v: unknown) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(v);
    if (!capture || !post || !id(s.userId) || !id(s.postId) || !id(s.commentId) || review.platformUserId !== s.userId || capture.platformCommentId !== s.commentId || post.platformPostId !== s.postId || c?.userId !== s.userId || c?.commentId !== s.commentId || c?.postId !== s.postId || c?.comment !== s.comment || capture.isDemo !== review.isDemo)
        return null;
    return { recipientId: s.userId as string, postId: s.postId as string, commentId: s.commentId as string };
}
export function eligible(review: SemanticReview, threshold: number) { const result = review.result as {
    decision?: string;
    evidence?: {
        source?: string;
        quote?: string;
    }[];
} | null, s = review.snapshot as {
    comment?: string;
}; return review.state === 'EVALUATED' && review.score !== null && review.score >= threshold && review.context === 'SUFFICIENT' && result?.decision === 'MATCH' && ['PENDING', 'APPROVED'].includes(review.reviewStatus) && !!result.evidence?.length && result.evidence.some(e => e.source === 'COMMENT' && typeof e.quote === 'string' && e.quote.length > 0 && s.comment?.includes(e.quote)); }
export function eligibilityHash(r: SemanticReview) { return semanticHash({ id: r.id, version: r.version, score: r.score, context: r.context, result: r.result, model: r.modelVersion, selectedModel: r.selectedModel, policy: r.policyId, revision: r.policyRevision, snapshot: r.snapshot, input: r.evaluationInput, status: r.reviewStatus }); }
export function ruleHash(r: {
    channelPlans?:unknown;
    channels?:string[];
    accountLimits: unknown;
    model: string;
    platform: string;
    policyId: string;
    policyRevision: number;
    threshold: number;
    channel: string;
    content: string;
    accountIds: string[];
    version: number;
    mode: string;
}) { return semanticHash({ ...(Array.isArray(r.channelPlans)&&r.channelPlans.length?{channelPlans:r.channelPlans,recipientPolicy:"per-channel-v1"}:{}), ...(r.channels&&(r.channels.length!==1||r.channels[0]!==r.channel)?{channels:r.channels}:{}), model: r.model, platform: r.platform, policyId: r.policyId, policyRevision: r.policyRevision, threshold: r.threshold, channel: r.channel, content: r.content, accounts: r.accountIds, limits: r.accountLimits, version: r.version, mode: r.mode, timezone: 'Asia/Shanghai', sufficientOnly: true, repeatRecipients: false, scope: 'evaluated-after-authorization' }); }
