import { z } from "zod";
import { ReadAdapter, ReadFailure, Post, Comment, Page, commentSchema } from "../contract";
import { ReadOnlyMcpTransport } from "../mcp/transport";
import { McpMode, ReadTool } from "../mcp/policy";
export type { ReadOnlyMcpTransport } from "../mcp/transport";
const envelope = z.object({ isError: z.boolean().optional(), content: z.array(z.object({ type: z.string(), text: z.string().max(2 * 1024 * 1024).optional() })).max(8) });
function text(input: unknown): string {
    const value = envelope.parse(input);
    const text = value.content.filter(c => c.type === "text").map(c => c.text || "").join("\n");
    if (value.isError) {
        if (/未登录|登录失效|login/i.test(text)) throw new ReadFailure("LOGIN_EXPIRED");
        if (/频繁|限流|rate.?limit/i.test(text)) throw new ReadFailure("RATE_LIMITED");
        if (/限制|封禁|验证码|restricted/i.test(text)) throw new ReadFailure("RESTRICTED");
        if (/不存在|不可见|未找到|not found/i.test(text)) throw new ReadFailure("SOURCE_UNAVAILABLE");
        if (/超时|timeout/i.test(text)) throw new ReadFailure("TIMEOUT");
        throw new ReadFailure("INVALID_DATA");
    }
    if (!text) throw new ReadFailure("INVALID_DATA");
    return text;
}
const rawId = z.string().regex(/^[A-Za-z0-9_-]{1,150}$/);
const rawComment = z.object({ id: rawId, noteId: rawId.optional(), content: z.string(), userInfo: z.object({ userId: rawId, nickname: z.string() }), subCommentCount: z.string().regex(/^\d*$/).optional(), subComments: z.array(z.unknown()).max(100).nullish() });
/** Pinned upstream exposes no comment cursor input. Only the returned finite window is consumed. */
export class XhsMcpAdapter implements ReadAdapter {
    readonly platform = "XHS" as const;
    private tokens = new Map<string, { rawId: string; token: string }>();
    private details = new Map<string, { roots: Comment[]; replies: Map<string, Comment[]> }>();
    constructor(private transport: ReadOnlyMcpTransport, private allowed = false, readonly mode: McpMode = "XHS_MCP") {}
    private id(value: string) {
        if (/^(demo-|fixture-)/.test(value)) throw new ReadFailure("INVALID_DATA");
        return this.mode === "XHS_FIXTURE" ? `fixture-xhs-${value}` : value;
    }
    async prepare(signal: AbortSignal) {
        if (!this.allowed) throw new ReadFailure("REAL_DISABLED");
        await this.transport.connect?.(signal);
        const result = text(await this.transport.call("check_login_status", {}, signal));
        // This upstream tool returns a human-readable status, not JSON. Do not store the username.
        if (/未登录|登录失效/.test(result)) throw new ReadFailure("LOGIN_EXPIRED");
        if (!/^✅ 已登录(?:\n|$)/.test(result)) throw new ReadFailure("INVALID_DATA");
    }
    async close() { this.tokens.clear(); this.details.clear(); await this.transport.close?.(); }
    private async read(name: ReadTool, args: Record<string, unknown>, signal: AbortSignal) {
        if (!this.allowed) throw new ReadFailure("REAL_DISABLED");
        return JSON.parse(text(await this.transport.call(name, args, signal))) as unknown;
    }
    async search(keyword: string, cursor: string | undefined, signal: AbortSignal): Promise<Page<Post>> {
        if (cursor) throw new ReadFailure("UNSUPPORTED");
        const data = z.object({ feeds: z.array(z.object({ id: rawId, xsecToken: z.string().min(1).max(4096), noteCard: z.object({ displayTitle: z.string().max(500).optional() }).optional() })).max(200).nullable() }).parse(await this.read("search_feeds", { keyword }, signal));
        return { items: (data.feeds || []).map(f => { const id = this.id(f.id); this.tokens.set(id, { rawId: f.id, token: f.xsecToken }); return { id, title: f.noteCard?.displayTitle || "未提供标题" }; }), complete: false };
    }
    async post(post: Post, signal: AbortSignal): Promise<Post> {
        const reference = this.tokens.get(post.id);
        if (!reference) throw new ReadFailure("INVALID_DATA");
        const data = z.object({ feed_id: rawId.optional(), data: z.object({ note: z.object({ noteId: rawId.optional(), title: z.string().max(500).optional(), desc: z.string().max(20000).nullish() }), comments: z.object({ list: z.array(z.unknown()).max(100).nullable(), hasMore: z.boolean().optional(), cursor: z.string().optional() }) }) }).parse(await this.read("get_feed_detail", { feed_id: reference.rawId, xsec_token: reference.token, load_all_comments: false, click_more_replies: false }, signal));
        if ((data.feed_id && data.feed_id !== reference.rawId) || (data.data.note.noteId && data.data.note.noteId !== reference.rawId)) throw new ReadFailure("INVALID_DATA");
        const replies = new Map<string, Comment[]>(), seen = new Set<string>();
        let count = 0;
        const normalize = (input: unknown, parentId?: string, depth = 0): Comment => {
            if (++count > 100 || depth > 8) throw new ReadFailure("BUDGET");
            const c = rawComment.parse(input), id = this.id(c.id);
            if (seen.has(id) || (c.noteId && c.noteId !== reference.rawId)) throw new ReadFailure("INVALID_DATA");
            seen.add(id);
            const nested = (c.subComments || []).map(r => normalize(r, id, depth + 1));
            replies.set(id, nested);
            return commentSchema.parse({ id, userId: this.id(c.userInfo.userId), nickname: c.userInfo.nickname, text: c.content, parentId, hasReplies: nested.length > 0 || Number(c.subCommentCount || 0) > 0 });
        };
        // Validate the entire received tree before exposing any of it to ingestion.
        const roots = (data.data.comments.list || []).map(c => normalize(c));
        this.details.set(post.id, { roots, replies });
        return { ...post, title: data.data.note.title || post.title, ...(data.data.note.desc?{body:data.data.note.desc}:{}) };
    }
    async comments(post: Post, cursor: string | undefined, _signal: AbortSignal): Promise<Page<Comment>> {
        if (!this.allowed) throw new ReadFailure("REAL_DISABLED");
        if (cursor) throw new ReadFailure("UNSUPPORTED");
        const detail = this.details.get(post.id);
        if (!detail) throw new ReadFailure("INVALID_DATA");
        return { items: detail.roots, complete: false };
    }
    async replies(post: Post, parentId: string, cursor: string | undefined, _signal: AbortSignal): Promise<Page<Comment>> {
        if (!this.allowed) throw new ReadFailure("REAL_DISABLED");
        if (cursor) throw new ReadFailure("UNSUPPORTED");
        const detail = this.details.get(post.id);
        if (!detail?.replies.has(parentId)) throw new ReadFailure("INVALID_DATA");
        return { items: detail.replies.get(parentId)!, complete: false };
    }
}
