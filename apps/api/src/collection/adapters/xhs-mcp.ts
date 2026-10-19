import { z } from "zod";
import { ReadAdapter, ReadFailure, Post, Comment, Page } from "../contract";
/** Injectable transport ONLY. No network implementation, credentials, endpoint or registration in this milestone. */
export interface ReadOnlyMcpTransport {
    call(name: "search_feeds" | "get_feed_detail", args: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
}
function payload(input: unknown): unknown {
    const envelope = z.object({ isError: z.boolean().optional(), content: z.array(z.object({ type: z.string(), text: z.string().optional() })) }).parse(input);
    if (envelope.isError) {
        const text = envelope.content.map(c => c.text || "").join(" ");
        if (/未登录|登录失效|login/i.test(text))
            throw new ReadFailure("LOGIN_EXPIRED");
        if (/限制|封禁|频繁|restricted/i.test(text))
            throw new ReadFailure("RESTRICTED");
        if (/超时|timeout/i.test(text))
            throw new ReadFailure("TIMEOUT");
        throw new ReadFailure("INVALID_DATA");
    }
    const text = envelope.content.find(c => c.type === "text")?.text;
    if (!text)
        throw new ReadFailure("INVALID_DATA");
    return JSON.parse(text);
}
const user = z.object({ userId: z.string().min(1), nickname: z.string().min(1) });
const rawComment = z.object({ id: z.string().min(1), content: z.string(), userInfo: user, subCommentCount: z.string().optional(), subComments: z.array(z.object({ id: z.string().min(1), content: z.string(), userInfo: user })).optional() });
/** Based on upstream read tool schema. Unknown paging/deletion coverage is conservatively PARTIAL. */
export class XhsMcpAdapter implements ReadAdapter {
    readonly platform = "XHS" as const;
    readonly mode = "XHS_MCP" as const;
    private tokens = new Map<string, string>();
    private details = new Map<string, {
        post: Post;
        roots: Comment[];
        replies: Map<string, Comment[]>;
        complete: boolean;
    }>();
    constructor(private transport: ReadOnlyMcpTransport, private allowed = false) { }
    private async read(name: "search_feeds" | "get_feed_detail", args: Record<string, unknown>, signal: AbortSignal) {
        if (!this.allowed)
            throw new ReadFailure("REAL_DISABLED");
        return payload(await this.transport.call(name, args, signal));
    }
    async search(keyword: string, cursor: string | undefined, signal: AbortSignal): Promise<Page<Post>> {
        if (cursor)
            throw new ReadFailure("UNSUPPORTED");
        const data = z.object({ feeds: z.array(z.object({ id: z.string().min(1), xsecToken: z.string().min(1), noteCard: z.object({ displayTitle: z.string().optional() }).optional() })).max(200) }).parse(await this.read("search_feeds", { keyword }, signal));
        return { items: data.feeds.map(f => { this.tokens.set(f.id, f.xsecToken); return { id: f.id, title: f.noteCard?.displayTitle || "未提供标题" }; }), complete: false };
    }
    async post(post: Post, signal: AbortSignal): Promise<Post> {
        const token = this.tokens.get(post.id);
        if (!token)
            throw new ReadFailure("INVALID_DATA");
        const data = z.object({ data: z.object({ note: z.object({ title: z.string().optional() }).optional(), comments: z.object({ list: z.array(rawComment).max(100), hasMore: z.boolean().optional() }) }) }).parse(await this.read("get_feed_detail", { feed_id: post.id, xsec_token: token, load_all_comments: false, click_more_replies: false, max_comment_items: 100 }, signal));
        const replies = new Map<string, Comment[]>();
        const roots = data.data.comments.list.map(c => {
            replies.set(c.id, (c.subComments || []).map(r => ({ id: r.id, userId: r.userInfo.userId, nickname: r.userInfo.nickname, text: r.content, parentId: c.id, hasReplies: false })));
            return { id: c.id, userId: c.userInfo.userId, nickname: c.userInfo.nickname, text: c.content, hasReplies: Number(c.subCommentCount || 0) > 0 || !!c.subComments?.length };
        });
        const normalized = { ...post, title: data.data.note?.title || post.title };
        // Upstream hasMore does not prove full reply coverage; no deletion signal is exposed.
        this.details.set(post.id, { post: normalized, roots, replies, complete: false });
        return normalized;
    }
    async comments(post: Post, cursor: string | undefined, _signal: AbortSignal): Promise<Page<Comment>> {
        if (!this.allowed)
            throw new ReadFailure("REAL_DISABLED");
        if (cursor)
            throw new ReadFailure("UNSUPPORTED");
        const d = this.details.get(post.id);
        if (!d)
            throw new ReadFailure("INVALID_DATA");
        return { items: d.roots, complete: false };
    }
    async replies(post: Post, parentId: string, cursor: string | undefined, _signal: AbortSignal): Promise<Page<Comment>> {
        if (!this.allowed)
            throw new ReadFailure("REAL_DISABLED");
        if (cursor)
            throw new ReadFailure("UNSUPPORTED");
        return { items: this.details.get(post.id)?.replies.get(parentId) || [], complete: false };
    }
}
