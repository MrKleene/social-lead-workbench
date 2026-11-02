import type { ReplyHistoryItem } from '@crm/contracts';
import { executionEventSchema } from './reply-stage-journal';

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, max = 2000) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
const publicId = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(value) ? value : null;
const placeholder = (value: string | null) => !value || /待扫码|待授权|待登录|历史账号/.test(value);
type Audit = { action: string; metadata: unknown; createdAt: Date };
type Attempt = { id: string; requestKey: string; jobId: string | null; mode: string; channel: string | null; outcome: string; content: string | null; day: string; createdAt: Date; attemptedAt: Date | null; confirmedAt: Date | null; platformReceipt: string | null; resolutionNote: string | null; historySnapshot: unknown };

/** Read-only projection. Never use current account/recipient identity to rewrite a historical sender. */
export function replyHistoryItem(a: Attempt, audit: Audit[]): ReplyHistoryItem {
    const h = object(a.historySnapshot), source = object(h.source), comment = object(source.comment), post = object(source.post);
    const senderId = publicId(h.senderPlatformId), recipientId = publicId(h.recipientId), postId = publicId(h.postId), commentId = publicId(h.commentId);
    const executionEvidence = audit.filter(x => ['SINGLE_REPLY_EXECUTION_STAGE', 'AUTO_CONTACT_EXECUTION_STAGE'].includes(x.action)).flatMap(x => {
        const parsed = executionEventSchema.safeParse(x.metadata);
        return parsed.success ? [{ at: x.createdAt.toISOString(), event: parsed.data }] : [];
    });
    const records = executionEvidence.flatMap(x => x.event.stage === 'TRANSPORT_STOP' && x.event.journal?.state === 'AVAILABLE' ? x.event.journal.records : []);
    const titles = (pathname: string) => [...new Set(records.flatMap(r => r.stage === 'RESTRICTION_CHECK' && r.evidence?.identity === 'MATCH' && r.evidence.pathname === pathname && r.evidence.title ? [r.evidence.title.replace(/ - 小红书$/, '').trim()] : []))];
    const senderTitles = titles('/user/profile/[SENDER]'), postTitles = titles('/explore/[POST]');
    const frozenNickname = text(h.senderNickname, 200), savedLabel = text(h.accountLabel, 200);
    const senderName = senderId && senderTitles.length === 1 ? senderTitles[0] : frozenNickname ?? (!placeholder(savedLabel) ? savedLabel : null);
    const notAttempted = a.outcome === 'FAILED' && !a.platformReceipt && !a.confirmedAt && audit.some(x => {
        const m = object(x.metadata);
        return x.action === 'SINGLE_REPLY_TEST_FINISHED' && m.attemptId === a.id && m.result === 'NOT_ATTEMPTED' && m.submission === 'NOT_ATTEMPTED' && m.stopped === true;
    });
    // Missing evidence never turns a historical failure/unknown into a definite non-submission.
    return {
        id: a.id, jobId:a.jobId, canVerifyDm:a.channel==='DM'&&a.mode==='REAL'&&a.outcome==='UNKNOWN'&&(!!a.jobId||a.requestKey.startsWith('dm:')), mode: a.mode, channel: a.channel ?? 'UNKNOWN', origin: a.jobId ? 'RULE' : 'SINGLE_TEST', outcome: a.outcome,
        displayStatus: notAttempted ? 'NOT_ATTEMPTED' : a.outcome, senderId, senderName,
        senderNameSource: senderId && senderTitles.length === 1 ? '发送时同会话身份核验' : frozenNickname ? '发送时昵称快照' : senderName ? '发送时账号名称' : '未保存昵称',
        recipientId, recipientName: publicId(comment.userId) === recipientId && recipientId ? text(comment.authorNickname, 200) : null,
        postId, postTitle: text(post.title) ?? text(comment.title) ?? (postId && postTitles.length === 1 ? postTitles[0] : null),
        postUrl: h.platform === 'XHS' && postId && /^[a-f0-9]{24}$/.test(postId) ? `https://www.xiaohongshu.com/explore/${postId}` : null,
        commentId, originalComment: publicId(comment.commentId) === commentId && commentId ? text(comment.comment, 10000) : null,
        content: a.content ?? '', createdAt: a.createdAt.toISOString(), attemptedAt: a.attemptedAt?.toISOString() ?? null,
        confirmedAt: a.confirmedAt?.toISOString() ?? null, platformReceipt: a.platformReceipt, reason: a.resolutionNote,
        day: a.day, executionEvidence,
    };
}
