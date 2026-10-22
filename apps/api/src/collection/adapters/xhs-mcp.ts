import {savedNickname,savedPublishedAt} from '@crm/contracts';
import { z } from "zod";
import {inspectXhsCover,inspectXhsDetailCover,inspectXhsAvatar} from "./xhs-cover";
import { ReadAdapter, ReadFailure, Post, Comment, Page, commentSchema } from "../contract";
import { ReadOnlyMcpTransport } from "../mcp/transport";
import { McpMode, ReadTool } from "../mcp/policy";
import {invalidSource,parseSource} from '../diagnostics';
export type { ReadOnlyMcpTransport } from "../mcp/transport";
const envelope = z.object({ isError: z.boolean().optional(), content: z.array(z.object({ type: z.string(), text: z.string().max(2 * 1024 * 1024).optional() })).max(8) });
function text(input: unknown, stage:'prepare'|'search'|'post'): string {
    const value = parseSource(envelope,input,stage);
    const text = value.content.filter(c => c.type === "text").map(c => c.text || "").join("\n");
    if (value.isError) {
        if (/未登录|登录失效|login/i.test(text)) throw new ReadFailure("LOGIN_EXPIRED");
        if (/频繁|限流|rate.?limit/i.test(text)) throw new ReadFailure("RATE_LIMITED");
        if (/限制|封禁|验证码|restricted/i.test(text)) throw new ReadFailure("RESTRICTED");
        if (/不存在|不可见|未找到|not found/i.test(text)) throw new ReadFailure("SOURCE_UNAVAILABLE");
        if (/超时|timeout/i.test(text)) throw new ReadFailure("TIMEOUT");
        throw invalidSource(stage,"UPSTREAM_ERROR");
    }
    if (!text) throw invalidSource(stage,"EMPTY_RESPONSE");
    return text;
}
const rawId = z.string().regex(/^[A-Za-z0-9_-]{1,150}$/);
const rawUser=z.object({userId:rawId,nickname:z.unknown().optional(),nickName:z.unknown().optional(),avatar:z.unknown().optional()});
const rawComment = z.object({ id: rawId, noteId: rawId.optional(), content: z.string(), userInfo: rawUser, createTime:z.unknown().optional(), subCommentCount: z.string().regex(/^\d*$/).optional(), subComments: z.array(z.unknown()).max(100).nullish() });
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
        const result = text(await this.transport.call("check_login_status", {}, signal),"prepare");
        // This upstream tool returns a human-readable status, not JSON. Do not store the username.
        if (/未登录|登录失效/.test(result)) throw new ReadFailure("LOGIN_EXPIRED");
        if (!/^✅ 已登录(?:\n|$)/.test(result)) throw new ReadFailure("INVALID_DATA");
    }
    async close() { this.tokens.clear(); this.details.clear(); await this.transport.close?.(); }
    private async read(name: ReadTool, args: Record<string, unknown>, signal: AbortSignal) {
        if (!this.allowed) throw new ReadFailure("REAL_DISABLED");
        const stage=name==='search_feeds'?'search':'post';
        const body=text(await this.transport.call(name,args,signal),stage);
        try{return JSON.parse(body) as unknown;}catch{throw invalidSource(stage,'JSON_PARSE');}
    }
    async search(keyword: string, cursor: string | undefined, signal: AbortSignal): Promise<Page<Post>> {
        if (cursor) throw new ReadFailure("UNSUPPORTED");
        const data = parseSource(z.object({ feeds: z.array(z.object({ id: rawId, xsecToken: z.string().min(1).max(4096), noteCard: z.object({ displayTitle: z.string().max(500).nullish(), cover:z.unknown().optional() }).optional() })).max(200).nullable() }),await this.read("search_feeds", { keyword }, signal),"search");
        return { items: (data.feeds || []).map(f => { const id = this.id(f.id); this.tokens.set(id, { rawId: f.id, token: f.xsecToken }); const cover=inspectXhsCover(f.noteCard?.cover);return { id, title: f.noteCard?.displayTitle ?? "", coverUrl:cover.url,imageDiagnostics:{searchCover:cover.diagnostic} }; }), complete: false };
    }
    async post(post: Post, signal: AbortSignal): Promise<Post> {
        const reference = this.tokens.get(post.id);
        if (!reference) throw new ReadFailure("INVALID_DATA");
        const data = parseSource(z.object({ feed_id: rawId.optional(), data: z.object({ note: z.object({ noteId: rawId.optional(), title: z.string().max(500).nullish(), desc: z.string().max(20000).nullish(), imageList:z.unknown().optional(),user:z.unknown().optional(),time:z.unknown().optional() }), comments: z.object({ list: z.array(z.unknown()).max(100).nullable(), hasMore: z.boolean().optional(), cursor: z.string().optional() }) }) }),await this.read("get_feed_detail", { feed_id: reference.rawId, xsec_token: reference.token, load_all_comments: false, click_more_replies: false }, signal),"post");
        if ((data.feed_id && data.feed_id !== reference.rawId) || (data.data.note.noteId && data.data.note.noteId !== reference.rawId)) throw invalidSource("post","IDENTITY_CONFLICT","noteId");
        const replies = new Map<string, Comment[]>(), seen = new Map<string,{signature:string;value:Comment}>(), active=new Set<string>();
        let count = 0;
        const normalize = (input: unknown, parentId?: string, depth = 0): Comment => {
            if (++count > 100 || depth > 8) throw new ReadFailure("BUDGET");
            const c = parseSource(rawComment,input,'post'), id = this.id(c.id);
            if(c.noteId && c.noteId!==reference.rawId)throw invalidSource('post','IDENTITY_CONFLICT','noteId');
            // Display-only changes are harmless. Identity, text, tree and parent conflicts remain fatal.
            const signature=JSON.stringify({comment:c,parentId:parentId||null},(key,value)=>['nickname','nickName','avatar','createTime'].includes(key)?undefined:value),prior=seen.get(id);
            if(active.has(id)||(prior&&prior.signature!==signature))throw invalidSource('post','DUPLICATE_CONFLICT','id');
            if(prior)return prior.value;
            active.add(id);
            const nested = (c.subComments || []).map(r => normalize(r, id, depth + 1));
            replies.set(id,[...new Map(nested.map(c=>[c.id,c])).values()]);
            const avatar=inspectXhsAvatar(c.userInfo.avatar);
            const value=parseSource(commentSchema,{id,userId:this.id(c.userInfo.userId),nickname:savedNickname(c.userInfo.nickname)||savedNickname(c.userInfo.nickName),authorAvatarUrl:avatar.url,imageDiagnostics:{authorAvatar:avatar.diagnostic},publishedAt:savedPublishedAt(c.createTime),text:c.content,parentId,hasReplies:nested.length>0||Number(c.subCommentCount||0)>0},'post');
            active.delete(id);seen.set(id,{signature,value});return value;
        };
        // Validate the entire received tree before exposing any of it to ingestion.
        const roots = [...new Map((data.data.comments.list || []).map(c => normalize(c)).map(c=>[c.id,c])).values()];
        this.details.set(post.id, { roots, replies });
        const author=rawUser.safeParse(data.data.note.user),cover=inspectXhsDetailCover(data.data.note.imageList),avatar=inspectXhsAvatar(author.success?author.data.avatar:data.data.note.user==null?undefined:{});
        return { ...post,authorNickname:author.success?savedNickname(author.data.nickname)||savedNickname(author.data.nickName):undefined,authorAvatarUrl:avatar.url,imageDiagnostics:{...post.imageDiagnostics,detailCover:cover.diagnostic,authorAvatar:avatar.diagnostic},publishedAt:savedPublishedAt(data.data.note.time), coverUrl:post.coverUrl||cover.url, title: data.data.note.title || post.title, ...(data.data.note.desc!=null?{body:data.data.note.desc}:{}) };
    }
    receivedComments(post:Post):Comment[]{const d=this.details.get(post.id);return d?[...d.roots,...[...d.replies.values()].flat()]:[];}
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
