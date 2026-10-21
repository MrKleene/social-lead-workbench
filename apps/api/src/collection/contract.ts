import { commentRulesSchema } from '@crm/contracts';
import { z } from "zod";
const normalize = (value: string) => value.normalize("NFKC").toLowerCase();
const word = z.string().trim().min(1).max(40);
export const configInput = z.object({
    commentRules: commentRulesSchema.nullable().optional(),
    name: z.string().trim().min(1).max(80), platform: z.enum(["XHS", "DOUYIN"]),
    mode: z.enum(["MOCK", "XHS_FIXTURE", "XHS_MCP"]), keywords: z.array(word).min(1).max(8),
    excludeWords: z.array(word).max(20), batchLimit: z.number().int().min(1).max(10),
    enabled: z.boolean(),
    defaultReplyTemplateId: z.string().min(1).max(100).nullable().optional(),
}).strict().refine(v => v.mode === "MOCK" || v.platform === "XHS", "MCP只支持小红书")
    .refine(v => new Set(v.keywords.map(normalize)).size === v.keywords.length, "关键词不能重复")
    .refine(v => !!v.commentRules || !v.keywords.some(k => v.excludeWords.some(e => normalize(k).includes(normalize(e)))), "排除词不能覆盖搜索关键词");
export type ConfigInput = z.infer<typeof configInput>;
export const scenarioSchema = z.enum(["BASELINE", "NEW", "PARTIAL", "TIMEOUT", "LOGIN_EXPIRED", "RESTRICTED", "MISSING", "DELETED", "READ_WINDOW"]);
export type Scenario = z.infer<typeof scenarioSchema>;
export type Failure = "TIMEOUT" | "LOGIN_EXPIRED" | "RESTRICTED" | "INVALID_DATA" | "BUDGET" | "PAUSED" | "REAL_DISABLED" | "UNSUPPORTED" | "RATE_LIMITED" | "ENDPOINT_INVALID" | "PROFILE_MISMATCH" | "MCP_PROTOCOL" | "MCP_TOOLS_MISSING" | "MCP_SESSION_EXPIRED" | "SOURCE_UNAVAILABLE" | "DEVICE_UNAVAILABLE" | "ACCOUNT_CHANGED" | "IDENTITY_MISMATCH" | "AUTHORIZATION_ENDED";
export class ReadFailure extends Error {
    constructor(public code: Failure, public retryAfterMs?: number) { super(code); }
}
export const postSchema = z.object({ id: z.string().min(1).max(200), title: z.string().max(500), body: z.string().max(20000).optional() });
export const commentSchema = z.object({
    id: z.string().min(1).max(200), userId: z.string().min(1).max(200), nickname: z.string().min(1).max(200),
    text: z.string().min(1).max(10000), parentId: z.string().max(200).optional(), hasReplies: z.boolean().default(false),
});
export type Post = z.infer<typeof postSchema>;
export type Comment = z.infer<typeof commentSchema>;
export type Page<T> = {
    items: T[];
    next?: string;
    complete: boolean;
    deletedIds?: string[];
};
export interface ReadAdapter {
    readonly platform: "XHS" | "DOUYIN";
    readonly mode: "MOCK" | "XHS_FIXTURE" | "XHS_MCP";
    prepare?(signal: AbortSignal): Promise<void>;
    close?(): Promise<void>;
    search(keyword: string, cursor: string | undefined, signal: AbortSignal): Promise<Page<Post>>;
    post(post: Post, signal: AbortSignal): Promise<Post>;
    comments(post: Post, cursor: string | undefined, signal: AbortSignal): Promise<Page<Comment>>;
    replies(post: Post, parentId: string, cursor: string | undefined, signal: AbortSignal): Promise<Page<Comment>>;
}
export const limits = { requests: 32, pagesPerStream: 4, comments: 100, callMs: 3000, runMs: 20000 } as const;
export function classify(text: string, keywords: string[], exclude: string[]) {
    const normalized = normalize(text);
    const hits = keywords.filter(k => normalized.includes(normalize(k)));
    if (!hits.length || exclude.some(w => normalized.includes(normalize(w))))
        return null;
    const help = /请问|求助|如何|怎么|需要|求推荐|能否|可以.*吗/.test(normalized);
    return { keywords: hits, classification: help ? "POSSIBLE_HELP" : "RELATED_ONLY" };
}
