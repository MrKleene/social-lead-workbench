import type { Platform } from '@/lib/types';
export type ConfigDraft = {
    name: string;
    platform: Platform;
    mode: 'MOCK';
    keywords: string[];
    excludeWords: string[];
    batchLimit: number;
    enabled: boolean;
};
export type Run = {
    id: string;
    scenario: string;
    status: string;
    reason: string | null;
    requests: number;
    observed: number;
    matched: number;
    added: number;
    notices: number;
    createdAt: string;
    finishedAt: string | null;
};
export type Config = ConfigDraft & {
    id: string;
    revision: number;
    activeRunId: string | null;
    nextAllowedAt: string | null;
    pauseReason: string | null;
    runs: Run[];
};
export type ConfigDetail = Config & {
    matches: {
        id: string;
        keywords: string[];
        classification: string;
        isBaseline: boolean;
        comment: {
            originalText: string;
            platformCommentId: string;
            parentPlatformCommentId: string | null;
            post: {
                title: string;
            };
            identity: {
                nickname: string;
                lead: {
                    id: string;
                } | null;
            };
        };
    }[];
    monitors: {
        id: string;
        baselineAt: string | null;
        coverage: string;
        observations: {
            id: string;
            state: string;
        }[];
    }[];
};
export type Notice = {
    id: string;
    title: string;
    createdAt: string;
    reads: {
        readAt: string;
    }[];
    lead: {
        id: string;
        identity: {
            nickname: string;
        };
    };
};
export const scenarios: Record<string, string> = { BASELINE: '初始评论快照', NEW: '增加一条求助评论', PARTIAL: '分页不完整', TIMEOUT: '读取超时', LOGIN_EXPIRED: '登录失效', RESTRICTED: '账号受限', MISSING: '评论暂时缺失', DELETED: '明确删除信号' };
export const runLabels: Record<string, string> = { QUEUED: '排队中', RUNNING: '读取中', COMPLETE: '批次完成', PARTIAL: '部分完成', FAILED: '失败', PAUSED: '已暂停' };
export const reasonLabels: Record<string, string> = { SEARCH_PARTIAL: '搜索覆盖不完整', COMMENTS_PARTIAL: '评论覆盖不完整', COMMENT_PARTIAL: '评论覆盖不完整', TIMEOUT: '读取超时，等待手动重试', LOGIN_EXPIRED: '登录失效，配置已暂停', RESTRICTED: '账号受限，配置已暂停', INVALID_DATA: '来源数据不完整或冲突', BUDGET: '达到本轮预算', PAUSED: '运行已暂停', MANUAL_PAUSE: '已手动暂停', CONFIG_PAUSED: '配置已暂停', QUEUE_UNAVAILABLE: '模拟队列不可用', REAL_DISABLED: '真实平台禁止运行' };
