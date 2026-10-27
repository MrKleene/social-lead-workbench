import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { SendRequest, SendResult } from './contact-sender';
import { postReferenceSchema } from '../collection/post-reference';

/** Offline protocol boundary only. No transport, binary launch, tool allowlist or DI registration. */
export const XHS_REPLY_PROTOCOL = 'workbench.xhs.exact-reply.v1' as const;
const platformId = z.string().regex(/^[a-f0-9]{24}$/);
const opaqueId = z.string().min(1).max(200).regex(/^[A-Za-z0-9:_-]+$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const bindingSchema = z.object({
    accountId: opaqueId,
    senderId: platformId,
    postReference: postReferenceSchema,
}).strict();
const requestSchema = z.object({
    platform: z.literal('XHS'), channel: z.literal('COMMENT'),
    accountId: opaqueId, requestKey: opaqueId,
    postId: platformId, commentId: platformId, recipientId: platformId,
    // Do not trim, template or generate user-authorized text.
    content: z.string().min(1).max(4000).refine(s => s.trim().length > 0),
}).strict();
export type XhsReplyBinding = z.infer<typeof bindingSchema>;
export function prepareXhsReply(request: SendRequest, binding: XhsReplyBinding) {
    const r = requestSchema.parse(request), b = bindingSchema.parse(binding);
    if (r.accountId !== b.accountId || r.postId !== b.postReference.postId)
        throw Error('XHS_REPLY_BINDING_MISMATCH');
    return {
        protocol: XHS_REPLY_PROTOCOL,
        attemptId: randomUUID(),
        requestKey: r.requestKey,
        accountId: r.accountId,
        senderId: b.senderId,
        postId: r.postId,
        targetCommentId: r.commentId,
        recipientId: r.recipientId,
        content: r.content,
        contentSha256: createHash('sha256').update(r.content, 'utf8').digest('hex'),
        // Pass in memory only. Never persist this token in a receipt or contact ledger.
        postReference: b.postReference,
    } as const;
}
export type XhsReplyCommand = ReturnType<typeof prepareXhsReply>;
const observationSchema = z.object({
    commentId: platformId,
    postId: platformId,
    parentCommentId: platformId,
    recipientId: platformId,
    senderId: platformId,
    contentSha256: digest,
}).strict();
const common = {
    protocol: z.literal(XHS_REPLY_PROTOCOL), attemptId: z.string().uuid(),
    requestKey: opaqueId, accountId: opaqueId,
    // A bounded transport must acknowledge termination, including on cancellation.
    // A caller's timeout or AbortSignal alone is not such an acknowledgement.
    processStopped: z.boolean(),
};
const resultSchema = z.discriminatedUnion('kind', [
    z.object({ ...common, kind: z.literal('CONFIRMED'),
        proof: z.literal('PLATFORM_RESPONSE_AND_READBACK'),
        response: observationSchema,
        readback: observationSchema,
        observedAfterSubmit: z.literal(true),
    }).strict(),
    z.object({ ...common, kind: z.literal('NOT_SENT'), phase: z.literal('BEFORE_SUBMIT'),
        reason: z.enum(['TARGET_MISSING', 'TARGET_MISMATCH', 'ACCOUNT_MISMATCH', 'CANCELLED']),
    }).strict(),
    z.object({ ...common, kind: z.literal('RISK'),
        reason: z.enum(['RATE_LIMITED', 'VERIFICATION', 'BANNED', 'PLATFORM_REFUSED']),
    }).strict(),
]);
const unknown = (): SendResult => ({ kind: 'UNKNOWN', reason: '回复目标、回执或停止状态未确认；保留占用，禁止重发' });
/** Only a reviewed, account-bound transport may supply this envelope. These fields are
 * checks, not authentication; never accept an envelope from an HTTP body or model output.
 * The currently installed MCP cannot produce this protocol and must remain unavailable. */
export function verifyXhsReplyResult(command: XhsReplyCommand, raw: unknown): SendResult {
    const parsed = resultSchema.safeParse(raw);
    if (!parsed.success) return unknown();
    const r = parsed.data;
    if (r.attemptId !== command.attemptId || r.requestKey !== command.requestKey || r.accountId !== command.accountId)
        return unknown();
    if (r.kind === 'RISK') return { kind: 'RISK', reason: r.reason };
    if (!r.processStopped) return unknown();
    if (r.kind === 'NOT_SENT') return { kind: 'FAILED', reason: '发送前已停止：' + r.reason };
    const matches = (o: z.infer<typeof observationSchema>) =>
        o.postId === command.postId && o.parentCommentId === command.targetCommentId &&
        o.recipientId === command.recipientId && o.senderId === command.senderId &&
        o.contentSha256 === command.contentSha256 && o.commentId !== command.targetCommentId;
    if (!matches(r.response) || !matches(r.readback) || r.response.commentId !== r.readback.commentId)
        return unknown();
    // Only the platform-created reply ID is saved; echoed request/target IDs are not receipts.
    return { kind: 'CONFIRMED', receipt: r.response.commentId };
}
