import { z } from 'zod';
import type { ContactTarget } from './contact-policy';
export type SendRequest = ContactTarget & {
    accountId: string;
    platform: string;
    channel: 'COMMENT' | 'DM';
    content: string;
    requestKey: string;
};
export type SendResult = {
    kind: 'CONFIRMED';
    receipt: string;
} | {
    kind: 'FAILED';
    reason: string;
} | {
    kind: 'UNKNOWN';
    reason: string;
} | {
    kind: 'RISK';
    reason: 'RATE_LIMITED' | 'VERIFICATION' | 'BANNED' | 'PLATFORM_REFUSED';
};
export interface ContactSender {
    readonly mode: 'REAL' | 'SIMULATION';
    capability(platform: string, channel: string): boolean;
    healthy(accountId: string): Promise<boolean>;
    send(request: SendRequest, signal?: AbortSignal): Promise<SendResult>;
    reconcile?(request: SendRequest, receipt: string): Promise<SendResult>;
}
// The approved workbench MCP integration exposes only read tools; no supported sender is connected.
// No environment switch or HTTP request can turn this adapter into a sender.
export class UnavailableContactSender implements ContactSender {
    readonly mode = 'REAL' as const;
    capability() { return false; }
    async healthy() { return false; }
    async send(): Promise<SendResult> { throw Error('SENDER_UNAVAILABLE'); }
}
export const CONTACT_SENDER = Symbol('CONTACT_SENDER');
export const senderUnavailable = '真实评论/私信适配器尚未接通；仅保存规则，不能开启发送。';
const resultSchema = z.discriminatedUnion('kind', [z.object({ kind: z.literal('CONFIRMED'), receipt: z.string().trim().min(1).max(500) }).strict(), z.object({ kind: z.literal('FAILED'), reason: z.string().max(500) }).strict(), z.object({ kind: z.literal('UNKNOWN'), reason: z.string().max(500) }).strict(), z.object({ kind: z.literal('RISK'), reason: z.enum(['RATE_LIMITED', 'VERIFICATION', 'BANNED', 'PLATFORM_REFUSED']) }).strict()]);
export function normalizeSendResult(raw: unknown): SendResult { const result = resultSchema.safeParse(raw); return result.success ? result.data : { kind: 'UNKNOWN', reason: '发送结果结构或回执不可信，保留占用' }; }
