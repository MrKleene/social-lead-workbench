import { z } from 'zod';
export const autoContactConsent = 'auto-contact-rule-v1';
export const contactTimezone = 'Asia/Shanghai';
export const autoContactRuleInput = z.object({ preserveAccountLimits:z.boolean().optional(), version: z.number().int().nonnegative(), platform: z.enum(['XHS', 'DOUYIN']), policyId: z.string().min(1).max(200), policyRevision: z.number().int().positive(), threshold: z.number().int().min(0).max(100), channel: z.enum(['COMMENT', 'DM']), channels:z.array(z.enum(['COMMENT','DM'])).max(2).refine(v=>new Set(v).size===v.length).optional(), templateId:z.string().min(1).max(100).nullable().optional(),templateVersion:z.number().int().nonnegative().nullable().optional(), content: z.string().max(1000), accounts: z.array(z.object({ id: z.string().min(1).max(200), version: z.number().int().positive(), dailyLimit: z.number().int().min(0).max(1000) }).strict()).max(100).refine(a => new Set(a.map(x => x.id)).size === a.length) }).strict();
export type AutoContactRuleInput = z.infer<typeof autoContactRuleInput>;
export const autoContactToggleInput = z.object({ version: z.number().int().positive(), enabled: z.boolean(), consent: z.literal(autoContactConsent).optional(), hash: z.string().max(100).optional() }).strict();
export const contactStatuses = ['PENDING_ACTION', 'MANUAL_READY', 'QUEUED', 'WAITING_QUOTA', 'WAITING_ACCOUNT', 'RESERVED', 'ATTEMPTED', 'CONFIRMED', 'SIMULATED_SUCCESS', 'FAILED', 'UNKNOWN', 'CANCELLED', 'SKIPPED', 'BLOCKED_POST'] as const;
export const contactStatusLabel: Record<string, string> = { PENDING_ACTION:'待处理 · 需手动确认', MANUAL_READY:'本次发送已确认', BLOCKED_POST:'帖子状态阻断 · 需重新确认', QUEUED: '排队中', WAITING_QUOTA: '等待额度', WAITING_ACCOUNT: '等待可用账号', RESERVED: '已预占', ATTEMPTED: '已尝试，待回执', CONFIRMED: '平台已确认', SIMULATED_SUCCESS: '模拟完成 · 未发送', FAILED: '确认失败', UNKNOWN: '结果未知 · 保留占用', CANCELLED: '已取消', SKIPPED: '未执行' };
export type AutoContactRule = {
    id: string;
    channels?: ('COMMENT'|'DM')[];
    templateId?:string|null;
    templateVersion?:number|null;
    accountLimits: {
        id: string;
        dailyLimit: number;
    }[];
    model: string;
    platform: 'XHS' | 'DOUYIN';
    policyId: string;
    policyRevision: number;
    threshold: number;
    channel: 'COMMENT' | 'DM';
    content: string;
    accountIds: string[];
    enabled: boolean;
    version: number;
    authorizedAt: string | null;
    mode: string;
    hash: string;
    pauseReason: string | null;
};
export type SendEligibilityView={state:'RESTRICTED'|'VERIFY_REQUIRED'|'RATE_LIMITED'|'REPLY_DISABLED'|'UNKNOWN';canSend:boolean;checkedAt:string|null;stale:boolean;source:string|null;reason:string;evidence:unknown};
export type ContactAccount = {
    workbenchStatus?:string;
    systemBlockReason?:string|null;
    loginState?:string;canCheck?:boolean;
    sendEligibility?:SendEligibilityView;
    id: string;
    version: number;
    label: string;
    platform: string;
    dailyLimit: number;
    authorizedLimit: number;
    isDemo: boolean;
    healthy: boolean;
    occupied: number;
    confirmed: number;
    reserved: number;
    unknown: number;
    remaining: number;
};
export type RecentSendAttempt={id:string;accountLabel:string;outcome:string;day:string;createdAt:string;attemptedAt:string|null;confirmedAt:string|null;platformReceipt:string|null;resolutionNote:string|null;executionEvidence:{at:string;event:unknown}[]};
export type AutoContactOverview = {
    recentAttempts?:RecentSendAttempt[];
    capabilities?:{platform:string;channel:string;available:boolean;supported:boolean}[];
    rules: AutoContactRule[];
    accounts: ContactAccount[];
    policies: {
        id: string;
        target: string;
        name?:string;
        revision: number;
    }[];
    capability: {
        recognition?:string;
        sending?:string;
        available: boolean;
        reason: string;
    };
    timezone: string;
    day: string;
};
export type AutoContactJobView = {
    executionEvidence?:{at:string;event:unknown}[];
    availability?:import('./post-availability').PostAvailabilityView;
    sourceSnapshot?:unknown;
    id: string;
    status: string;
    reason: string | null;
    platform: string;
    recipientId: string;
    postId: string;
    commentId: string;
    channel: string;
    content: string;
    mode: string;
    ruleVersion: number;
    reviewVersion: number;
    accountId: string | null;
    accountLabel: string | null;
    createdAt: string;
    updatedAt: string;
    evidence: {
        score: number;
        modelVersion: string;
        target: string;
        policyRevision: number;
        quotes: unknown;
        inputPolicy: string | null;
        observationPolicy: string | null;
    };
    attempt: null | {
        accountIdSnapshot?:string|null;
        historySnapshot?:{accountLabel?:string;senderPlatformId?:string|null}|null;
        outcome: string;
        day: string;
        createdAt: string;
        attemptedAt: string | null;
        confirmedAt: string | null;
        platformReceipt: string | null;
        resolutionNote: string | null;
    };
};

export type ReplyHistoryItem = {
    id: string; mode: string; channel: string; origin: 'RULE' | 'SINGLE_TEST'; outcome: string; displayStatus: string;
    senderId: string | null; senderName: string | null; senderNameSource: string;
    recipientId: string | null; recipientName: string | null; postId: string | null; postTitle: string | null; postUrl: string | null;
    commentId: string | null; originalComment: string | null; content: string;
    createdAt: string; attemptedAt: string | null; confirmedAt: string | null; platformReceipt: string | null; reason: string | null; day: string;
    executionEvidence: { at: string; event: unknown }[];
};
export type ReplyHistoryPage = { items: ReplyHistoryItem[]; total: number; allTotal: number; confirmedTotal: number; offset: number; limit: number; mode: string };

/** Whole-run counts; reviewJobs span historical versions, contacts span all rules in the current sender mode. */
export type JourneySummary = {reviews:Record<string,number>;reviewJobs:Record<string,number>;contacts:Record<string,number>;matches:number;highRelevance?:number};
