import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { SendRequest, SendResult } from './contact-sender';
import { postReferenceSchema } from '../collection/post-reference';

/** Pure protocol validation; only the separate reviewed transport may supply envelopes. */
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
// Fixed enums only. Raw platform errors, IDs, URLs, content and tokens are rejected.
const identityCheck=z.enum(['UNKNOWN','MATCH','MISMATCH']);
export const diagnosticSchema=z.object({
 stage:z.enum(['VALIDATE','INSPECT','SELECT','RECHECK','SUBMIT','READBACK','CLOSE']),
 code:z.enum(['PROFILE_ENTRY_UNAVAILABLE','SELECTION_ALREADY_USED','REPLY_EVENT_OBSERVER_UNAVAILABLE','REPLY_CLICK_DISPATCH_UNCERTAIN','REPLY_CLICK_EVENT_UNVERIFIED','REPLY_FRAME_UNSUPPORTED','REPLY_POINT_UNAVAILABLE','REPLY_POINTER_MOVE_FAILED','REPLY_BUTTON_DISABLED','REPLY_POINT_OFFSCREEN','REPLY_POINT_MOVED','REPLY_POINT_HIDDEN','REPLY_POINT_COVERED','SELECTION_OBSERVATION_UNAVAILABLE','SELECTION_OBSERVATION_INVALID','RECEIPT_CAPTURE_UNAVAILABLE','RECEIPT_MAPPING_UNREVIEWED','ACCOUNT_CHANGED','RECEIPT_NOT_UNIQUE','SELECTION_STEP_MISSING','RESTRICTION_UNVERIFIED','JOURNAL_UNAVAILABLE','PREFLIGHT_NAVIGATION_UNVERIFIED','PREFLIGHT_REFERENCE_UNVERIFIED','INVALID_COMMAND','STATE_UNAVAILABLE','STATE_INVALID','STATE_USER_MISSING','STATE_POST_MISSING','STATE_POST_MISMATCH','STATE_COMMENTS_MISSING','DEPTH_LIMIT','ROW_LIMIT','POST_MISMATCH','EXACT_TARGET_MISSING_OR_AMBIGUOUS','TARGET_MISMATCH','TARGET_CHANGED','COMPOSER_ALREADY_OPEN','COMPOSER_DRAFT_PRESENT','COMPOSER_HIDDEN','COMPOSER_ACTIVE','COMPOSER_TARGET_BOUND','COMPOSER_NOT_DEFAULT','COMPOSER_AMBIGUOUS','COMPOSER_UNRECOGNIZED','COMPOSER_BINDING_UNVERIFIED','COMPOSER_BAR_INACTIVE','COMPOSER_HEADER_MISSING','COMPOSER_EDITOR_UNFOCUSED','COMPOSER_PLACEHOLDER_ACTIVE','COMPOSER_NOT_ACTIVE','BINDING_EMPTY','BINDING_STATE_MISSING','BINDING_USER_MISSING','SUBMIT_NOT_READY','BINDING_INVALID','BINDING_TARGET_MISMATCH','BINDING_AUTHOR_MISMATCH','BINDING_POST_MISMATCH','BINDING_ACCOUNT_MISMATCH','EXACT_TARGET_NOT_VISIBLE','AUTHOR_AMBIGUOUS','EXACT_TARGET_MISSING','AUTHOR_MISMATCH','REPLY_BUTTON_AMBIGUOUS','BUTTON_TARGET_MISMATCH','CONTENT_CHANGED','COMPOSER_CHANGED','SUBMIT_AMBIGUOUS','NOT_SUBMITTED','CANCELLED','DRIVER_ERROR','DRIVER_PANIC','STOP_UNCONFIRMED','UNCONFIRMED','RATE_LIMITED','VERIFICATION','BANNED','PLATFORM_REFUSED']),
 checks:z.object({post:identityCheck,sender:identityCheck,target:identityCheck,author:identityCheck}).strict(),
}).strict();
const common = {
    diagnostic: diagnosticSchema.optional(),
    protocol: z.literal(XHS_REPLY_PROTOCOL), attemptId: z.string().uuid(),
    requestKey: opaqueId, accountId: opaqueId,
    // A bounded transport must acknowledge termination, including on cancellation.
    // A caller's timeout or AbortSignal alone is not such an acknowledgement.
    processStopped: z.boolean(),
};
const resultSchema = z.discriminatedUnion('kind', [
    z.object({...common,kind:z.literal('UNKNOWN'),reason:z.enum(['UNCONFIRMED','DRIVER_PANIC','JOURNAL_UNAVAILABLE','STOP_UNCONFIRMED','BUSY','REQUEST_CONFLICT','INSTANCE_PAUSED','NO_RECEIPT'])}).strict(),
    z.object({...common,kind:z.literal('ACCEPTED'),reason:z.literal('RECEIPT_UNCONFIRMED')}).strict(),
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
 * Unreviewed binaries and missing capabilities remain unavailable. */
export function verifyXhsReplyResult(command: XhsReplyCommand, raw: unknown): SendResult {
    const parsed = resultSchema.safeParse(raw);
    if (!parsed.success) return unknown();
    const r = parsed.data;
    if (r.attemptId !== command.attemptId || r.requestKey !== command.requestKey || r.accountId !== command.accountId)
        return unknown();
    if (r.kind === 'RISK') return { kind: 'RISK', reason: r.reason };
    if (!r.processStopped) return unknown();
    if(r.kind==='UNKNOWN'||r.kind==='ACCEPTED') return {kind:'UNKNOWN',reason:`${r.kind}/${r.reason}${r.diagnostic?` [${r.diagnostic.stage}/${r.diagnostic.code}]`:''}；保留占用，禁止重发`};
    if (r.kind === 'NOT_SENT') {
        const d=r.diagnostic;
        const detail=d?` [${d.stage}/${d.code}; post=${d.checks.post},sender=${d.checks.sender},target=${d.checks.target},author=${d.checks.author}]`:'';
        return { kind:'FAILED',reason:'发送前已停止：'+r.reason+detail };
    }
    const matches = (o: z.infer<typeof observationSchema>) =>
        o.postId === command.postId && o.parentCommentId === command.targetCommentId &&
        o.recipientId === command.recipientId && o.senderId === command.senderId &&
        o.contentSha256 === command.contentSha256 && o.commentId !== command.targetCommentId;
    if (!matches(r.response) || !matches(r.readback) || r.response.commentId !== r.readback.commentId)
        return unknown();
    // Only the platform-created reply ID is saved; echoed request/target IDs are not receipts.
    return { kind: 'CONFIRMED', receipt: r.response.commentId };
}

/** Diagnostic-only projection. Never retain raw envelopes or accept this as a receipt. */
export function replyResultDiagnostic(command:XhsReplyCommand,raw:unknown){
 const base=z.object({protocol:z.literal(command.protocol),attemptId:z.literal(command.attemptId),requestKey:z.literal(command.requestKey),accountId:z.literal(command.accountId),kind:z.enum(['UNKNOWN','ACCEPTED','NOT_SENT','RISK','CONFIRMED']),diagnostic:z.unknown().optional()}).safeParse(raw);
 if(!base.success)return {kind:'INVALID' as const,envelopeValid:false};
 const diagnostic=diagnosticSchema.safeParse(base.data.diagnostic);
 return {kind:base.data.kind,envelopeValid:resultSchema.safeParse(raw).success,...(diagnostic.success?{diagnostic:{stage:diagnostic.data.stage,code:diagnostic.data.code}}:{})};
}
