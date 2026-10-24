import {boundedReadLabels} from '@crm/contracts';
import type {SemanticRules,CommentRules,RunMetrics,Assessment} from '@crm/contracts';
import type { Platform } from '@/lib/types';
export type ConfigDraft = {
    semanticRules?:SemanticRules|null;
    commentRules?:CommentRules|null;
    name: string;
    platform: Platform;
    mode: 'MOCK' | 'XHS_FIXTURE' | 'XHS_MCP';
    keywords: string[];
    excludeWords: string[];
    batchLimit: number;
    enabled: boolean;
    defaultReplyTemplateId?: string | null;
};
export type Run = {
    coveragePostLabels?:{postRef:string;title:string}[];
    snapshot?:{name?:string;keywords?:string[]};
    capturedPosts?:number;capturedCommentsCount?:number;readPlan?:{rounds:number;postsPerRound:number;commentPages:number;savedPostId?:string}|null;
    metrics?:RunMetrics|null;
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
        assessment?:Assessment|null;
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
        lastRunId: string | null;
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
export const scenarios: Record<string, string> = { READ_WINDOW: '读取有限窗口', BASELINE: '初始评论快照', NEW: '增加一条求助评论', PARTIAL: '分页不完整', TIMEOUT: '读取超时', LOGIN_EXPIRED: '登录失效', RESTRICTED: '账号受限', MISSING: '评论暂时缺失', DELETED: '明确删除信号' };
export const runLabels: Record<string, string> = { QUEUED: '排队中', RUNNING: '读取中', COMPLETE: '批次完成', PARTIAL: '部分完成', FAILED: '失败', PAUSED: '已暂停' };
export const reasonLabels: Record<string, string> = { ...boundedReadLabels, AUTHORIZATION_ENDED:'本次授权已结束；请重新核验并手动确认', DEVICE_UNAVAILABLE:'设备撤销、离线或认证失败，已停止', ACCOUNT_CHANGED:'账号或会话已变化，停止执行', IDENTITY_MISMATCH:'平台稳定账号 ID 不匹配，已暂停，需人工核查', SEARCH_PARTIAL: '搜索覆盖不完整', COMMENTS_PARTIAL: '评论覆盖不完整', COMMENT_PARTIAL: '评论覆盖不完整', TIMEOUT: '读取超时，等待手动重试', LOGIN_EXPIRED: '登录失效，配置已暂停', RESTRICTED: '账号受限，配置已暂停', INVALID_DATA: '来源数据不完整或冲突', BUDGET: '达到本轮预算', PAUSED: '运行已暂停', MANUAL_PAUSE: '已手动暂停', CONFIG_PAUSED: '配置已暂停', QUEUE_UNAVAILABLE: '采集队列不可用', REAL_DISABLED: 'MCP开关关闭，未发起平台读取', SOURCE_UNAVAILABLE: '来源暂不可用，保留已有证据，不推断已删除', MCP_WINDOW_ONLY: '仅已读窗口；评论分页和完整覆盖未验证', RATE_LIMITED: '服务限流，账号/配置已暂停；核查后手动恢复，不自动换号', ENDPOINT_INVALID: '服务端端点配置不符合只读策略', PROFILE_MISMATCH: '服务端模式与配置不一致', MCP_PROTOCOL: 'MCP连接或协议异常，请管理员检查', MCP_TOOLS_MISSING: '服务缺少必要的只读工具', MCP_SESSION_EXPIRED: 'MCP会话已失效，请管理员检查后手动重试', CHECKING: '检查已发起，稍后手动刷新；中断后需等待退避', UNVERIFIED: '尚未检查连接', READY: '仅本次检查成功，不代表持续连接或完整覆盖' };

export type McpReadiness = { captureArchiveVersion?:number; enabled: boolean; accountBound?:boolean; maxPosts?:number; device?:{name:string;online:boolean}|null; accounts?:{id:string;label:string;platformUserId:string|null;eligible:boolean;reason:string}[]; loginOnly?: boolean; configurationOnly?: boolean; mode: ConfigDraft['mode'] | null; reason: string; lastCheck: { createdAt: string; metadata: { mode: ConfigDraft['mode']; reason: string; nextAllowedAt?: string } } | null; coverage: 'WINDOW_ONLY'; automaticPolling: false };
