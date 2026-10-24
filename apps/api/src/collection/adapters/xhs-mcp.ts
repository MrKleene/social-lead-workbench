import {commentChunkSchema,commentCheckpointSchema,type CommentCheckpoint,type CommentChunkReceipt} from '@crm/contracts';
import {validateChunk} from '../comment-checkpoint';
import {searchFailureReason,searchFailureObservation} from './search-failure';
import * as commentPolicy from '../../../../../runtime/comment-read-policy.cjs';
import {safeSearchObservation,boundedReadConfigSchema,boundedReadReportSchema,type BoundedReadConfig, safeCoverageDiagnostic,savedNickname,savedPublishedAt,safeAvatarSourceDiagnostic} from '@crm/contracts';
import { z } from "zod";
import {inspectXhsCover,inspectXhsDetailCover,inspectXhsAvatar} from "./xhs-cover";
import { ReadAdapter, ReadFailure, Post, Comment, Page, commentSchema } from "../contract";
import { ReadOnlyMcpTransport } from "../mcp/transport";
import { McpMode, ReadTool } from "../mcp/policy";
import {invalidSource,parseSource} from '../diagnostics';
import {savedPostReference,postReferenceSchema,type PostReference} from "../post-reference";
export type { ReadOnlyMcpTransport } from "../mcp/transport";
const envelope = z.object({ isError: z.boolean().optional(), content: z.array(z.object({ type: z.string(), text: z.string().max(2 * 1024 * 1024).optional() })).max(8) });
function text(input: unknown, stage:'prepare'|'search'|'post'): string {
    const value = parseSource(envelope,input,stage);
    const text = value.content.filter(c => c.type === "text").map(c => c.text || "").join("\n");
    if (value.isError) {
        if(stage==='post'&&/^(?:获取Feed详情失败: )?CONTINUATION_(?:EXPIRED|MISMATCH|LIMIT)$/.test(text.trim()))throw new ReadFailure("MCP_SESSION_EXPIRED");
        const searchReason=stage==='search'?searchFailureReason(text):undefined;
        const observation=stage==='search'?searchFailureObservation(text):undefined;
        const searchDiagnostic=searchReason?{version:1 as const,stage:'search' as const,kind:'UPSTREAM_ERROR' as const,searchReason,...(observation?{searchObservation:observation}:{})}:undefined;
        switch(searchReason){case 'LOGIN_EXPIRED':case 'RATE_LIMITED':case 'RESTRICTED':case 'SOURCE_UNAVAILABLE':case 'TIMEOUT':throw new ReadFailure(searchReason,undefined,searchDiagnostic);}
        if (/未登录|登录失效|login/i.test(text)) throw new ReadFailure("LOGIN_EXPIRED");
        if (/频繁|限流|rate.?limit/i.test(text)) throw new ReadFailure("RATE_LIMITED");
        if (/限制|封禁|验证码|restricted/i.test(text)) throw new ReadFailure("RESTRICTED");
        if (/不存在|不可见|未找到|not found/i.test(text)) throw new ReadFailure("SOURCE_UNAVAILABLE");
        if (/超时|timeout/i.test(text)) throw new ReadFailure("TIMEOUT");
        throw new ReadFailure("INVALID_DATA",undefined,{version:1,stage,kind:"UPSTREAM_ERROR",...(searchDiagnostic||{})});
    }
    if (!text) throw invalidSource(stage,"EMPTY_RESPONSE");
    return text;
}
const rawId = z.string().regex(/^[A-Za-z0-9_-]{1,150}$/);
const rawUser=z.object({userId:rawId,nickname:z.unknown().optional(),nickName:z.unknown().optional(),avatar:z.unknown().optional(),avatarSource:z.unknown().optional()});
const rawComment = z.object({ id: rawId, noteId: rawId.optional(), content: z.string(), userInfo: rawUser, createTime:z.unknown().optional(), subCommentCount: z.string().regex(/^\d*$/).optional(), subComments: z.array(z.unknown()).max(100).nullish() });
/** Pinned upstream exposes no comment cursor input. Only the returned finite window is consumed. */
export class XhsMcpAdapter implements ReadAdapter {
    readonly platform = "XHS" as const;
    private chunkStates=new Map<string,{token:string;receipt:CommentChunkReceipt;confirmed:boolean;window:BoundedReadConfig;ordinal:number}>();
    private checkpoints=new Map<string,CommentCheckpoint>();
    supportsChunks(){return !!this.readWindow&&this.transport.supportsCommentChunks?.()===true;}
    restoreCheckpoint(post:Post,c:CommentCheckpoint){this.checkpoints.set(post.id,commentCheckpointSchema.parse(c));}
    chunkReceipt(post:Post){return this.chunkStates.get(post.id)?.receipt;}
    confirmCheckpoint(post:Post){const c=this.chunkStates.get(post.id);if(c){c.confirmed=true;this.checkpoints.set(post.id,c.receipt.checkpoint);}}
    async finishChunks(post:Post,signal:AbortSignal){
        const c=this.chunkStates.get(post.id);if(!c)return;if(!c.confirmed)throw new ReadFailure('INVALID_DATA');
        const ref=this.tokens.get(post.id)||(()=>{const r=savedPostReference(post.sourceReference,post.id);return r?{rawId:r.postId,token:r.token}:undefined;})();if(!ref)throw new ReadFailure('INVALID_DATA');
        const value=await this.read('get_feed_detail',{feed_id:ref.rawId,xsec_token:ref.token,load_all_comments:false,click_more_replies:false,read_window:c.window,read_chunks:{mode:'FINISH',token:c.token,ack:c.receipt.hash}},signal);
        parseSource(z.object({feed_id:z.literal(ref.rawId),data:z.object({chunkAck:z.literal(true)})}),value,'post');this.chunkStates.delete(post.id);this.continuations.delete(post.id);
    }
    private tokens = new Map<string, { rawId: string; token: string }>();
    private continuations=new Map<string,{token:string,window:BoundedReadConfig,ordinal:number}>();
    private usedContinuationTokens=new Set<string>();
    private details = new Map<string, { roots: Comment[]; replies: Map<string, Comment[]> }>();
    constructor(private transport: ReadOnlyMcpTransport, private allowed = false, readonly mode: McpMode = "XHS_MCP", private readWindow:BoundedReadConfig|undefined=commentPolicy.enabled&&mode==='XHS_MCP'&&process.env.CRM_PERSISTENT==='1'&&process.env.CRM_ACCOUNT_READ_ENABLED==='1'?boundedReadConfigSchema.parse(commentPolicy.readWindow):undefined) {}
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
    async close() { this.chunkStates.clear();this.checkpoints.clear();this.tokens.clear(); this.details.clear();this.continuations.clear();this.usedContinuationTokens.clear(); await this.transport.close?.(); }
    private async read(name: ReadTool, args: Record<string, unknown>, signal: AbortSignal) {
        if (!this.allowed) throw new ReadFailure("REAL_DISABLED");
        const stage=name==='search_feeds'?'search':'post';
        const body=text(await this.transport.call(name,args,signal),stage);
        try{return JSON.parse(body) as unknown;}catch{throw invalidSource(stage,'JSON_PARSE');}
    }
    async search(keyword: string, cursor: string | undefined, signal: AbortSignal): Promise<Page<Post>> {
        if (cursor) throw new ReadFailure("UNSUPPORTED");
        const data = parseSource(z.object({ searchObservation:z.unknown().optional(),feeds: z.array(z.object({ id: rawId, xsecToken: z.string().min(1).max(4096), noteCard: z.object({ displayTitle: z.string().max(500).nullish(), cover:z.unknown().optional() }).optional() })).max(200).nullable() }),await this.read("search_feeds", { keyword }, signal),"search");
        const observation=safeSearchObservation(data.searchObservation);
        const count=data.feeds?.length||0;
        const consistent=observation&&observation.acceptedCount===count;
        const searchEvidence={evidence:consistent?'AVAILABLE' as const:data.searchObservation===undefined?'LEGACY_UNAVAILABLE' as const:'INVALID_DIAGNOSTIC' as const,returnedCount:count,...(consistent?{observation}:{})};
        return { searchEvidence,items: (data.feeds || []).map(f => { const id = this.id(f.id); this.tokens.set(id, { rawId: f.id, token: f.xsecToken }); const cover=inspectXhsCover(f.noteCard?.cover);return { id, title: f.noteCard?.displayTitle ?? "", coverUrl:cover.url,imageDiagnostics:{searchCover:cover.diagnostic} }; }), complete: false };
    }
    async post(post: Post, signal: AbortSignal, remainingComments?:number, diagnosticOnly=false,resume?:{token:string,window:BoundedReadConfig,ordinal:number}): Promise<Post> {
        const chunkMode=!diagnosticOnly&&this.supportsChunks(),priorChunk=this.chunkStates.get(post.id);
        if(chunkMode&&priorChunk&&!priorChunk.confirmed)throw new ReadFailure("INVALID_DATA");
        let readWindow=resume?.window||(diagnosticOnly?undefined:this.readWindow);
        if(readWindow&&remainingComments!==undefined){if(!Number.isInteger(remainingComments)||remainingComments<1)throw new ReadFailure("BUDGET");readWindow={...readWindow,max_comments:Math.min(readWindow.max_comments,remainingComments),max_roots:Math.min(readWindow.max_roots,remainingComments)};}
        if(readWindow){boundedReadConfigSchema.parse(readWindow);if(!this.transport.supportsBoundedComments?.())throw new ReadFailure("UNSUPPORTED");}
        // Normal search warms tokens; a scoped saved-post run intentionally never searches.
        // Its server-loaded reference must independently match the exact public post ID.
        const saved = this.mode==='XHS_MCP' ? savedPostReference(post.sourceReference,post.id) : undefined;
        if(this.mode==='XHS_MCP'&&post.sourceReference!==undefined&&!saved)throw invalidSource('post','IDENTITY_CONFLICT','noteId');
        const reference = this.tokens.get(post.id) || (saved?{rawId:saved.postId,token:saved.token}:undefined);
        if (!reference) throw invalidSource('post','SCHEMA_VALIDATION','xsecToken');
        const data = parseSource(z.object({ feed_id: rawId.optional(), data: z.object({ chunk:z.unknown().optional(), continuation:z.unknown().optional(), boundedRead:z.unknown().optional(), coverageDiagnostic:z.unknown().optional(), avatarSourceDiagnostic:z.unknown().optional(), note: z.object({ noteId: rawId.optional(), title: z.string().max(500).nullish(), desc: z.string().max(20000).nullish(), imageList:z.unknown().optional(),user:z.unknown().optional(),time:z.unknown().optional() }), comments: z.object({ list: z.array(z.unknown()).max(100).nullable(), hasMore: z.boolean().optional(), cursor: z.string().optional() }) }) }),await this.read("get_feed_detail", { feed_id: reference.rawId, xsec_token: reference.token, load_all_comments: false, click_more_replies: false, ...(readWindow?{read_window:readWindow}:{}),...(chunkMode?{read_chunks:priorChunk?{mode:"RESUME",token:priorChunk.token,ack:priorChunk.receipt.hash}:{mode:"START",...(this.checkpoints.has(post.id)?{checkpoint:this.checkpoints.get(post.id)}:{})}}:readWindow&&this.transport.supportsCommentContinuation?.()?{read_continuation:resume?{mode:"RESUME",token:resume.token}:{mode:"START"}}:{}) }, signal),"post");
        if(saved&&!data.feed_id&&!data.data.note.noteId)throw invalidSource('post','IDENTITY_CONFLICT','noteId');
        if ((data.feed_id && data.feed_id !== reference.rawId) || (data.data.note.noteId && data.data.note.noteId !== reference.rawId)) throw invalidSource("post","IDENTITY_CONFLICT","noteId");
        const boundedRead=readWindow?parseSource(boundedReadReportSchema,data.data.boundedRead,'post'):undefined;
        // A handle stays solely in this account-owned adapter. Never snapshot/log it.
        this.continuations.delete(post.id);
        if(data.data.continuation!==undefined){
            const c=parseSource(z.discriminatedUnion('state',[z.object({state:z.literal('AVAILABLE'),token:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),z.object({state:z.literal('ENDED')}).strict()]),data.data.continuation,'post');
            if(!readWindow||!this.transport.supportsCommentContinuation?.()||!boundedRead||boundedRead.window!==(resume?resume.ordinal+1:1))throw invalidSource('post','SCHEMA_VALIDATION');
            if(c.state==='AVAILABLE'){
                if(!['ROOT_PAGE_BUDGET','REPLY_CLICK_BUDGET','TIMEOUT'].includes(boundedRead.reason)||boundedRead.window>=8||this.usedContinuationTokens.has(c.token))throw invalidSource('post','SCHEMA_VALIDATION');
                this.usedContinuationTokens.add(c.token);this.continuations.set(post.id,{token:c.token,window:readWindow,ordinal:boundedRead.window});
            }
        }else if(resume&&!chunkMode)throw invalidSource('post','SCHEMA_VALIDATION');
        const chunk=chunkMode?parseSource(commentChunkSchema,data.data.chunk,'post'):undefined;
        if(!chunkMode&&data.data.chunk!==undefined)throw invalidSource('post','SCHEMA_VALIDATION');
        const replies = new Map<string, Comment[]>(), seen = new Map<string,{signature:string;value:Comment}>(), active=new Set<string>();
        let count = 0;
        const normalize = (input: unknown, parentId?: string, depth = 0): Comment => {
            if (++count > 100 || depth > 8) throw new ReadFailure("BUDGET");
            const c = parseSource(rawComment,input,'post'), id = this.id(c.id);
            if(c.noteId && c.noteId!==reference.rawId)throw invalidSource('post','IDENTITY_CONFLICT','noteId');
            // Display-only changes are harmless. Identity, text, tree and parent conflicts remain fatal.
            const signature=JSON.stringify({comment:c,parentId:parentId||null},(key,value)=>['nickname','nickName','avatar','avatarSource','createTime'].includes(key)?undefined:value),prior=seen.get(id);
            if(active.has(id)||(prior&&prior.signature!==signature))throw invalidSource('post','DUPLICATE_CONFLICT','id');
            if(prior)return prior.value;
            active.add(id);
            const nested = (c.subComments || []).map(r => normalize(r, id, depth + 1));
            replies.set(id,[...new Map(nested.map(c=>[c.id,c])).values()]);
            const avatar=inspectXhsAvatar(c.userInfo.avatar,c.userInfo.avatarSource);
            const value=parseSource(commentSchema,{id,userId:this.id(c.userInfo.userId),nickname:savedNickname(c.userInfo.nickname)||savedNickname(c.userInfo.nickName),authorAvatarUrl:avatar.url,imageDiagnostics:{authorAvatar:avatar.diagnostic},publishedAt:savedPublishedAt(c.createTime),text:c.content,parentId,hasReplies:nested.length>0||Number(c.subCommentCount||0)>0},'post');
            active.delete(id);seen.set(id,{signature,value});return value;
        };
        // Validate the entire received tree before exposing any of it to ingestion.
        let roots = [...new Map((data.data.comments.list || []).map(c => normalize(c)).map(c=>[c.id,c])).values()];
        if(chunk){
            if(!readWindow||!boundedRead||boundedRead.window!==(priorChunk?priorChunk.ordinal+1:1)||data.data.comments.list?.length)throw invalidSource('post','SCHEMA_VALIDATION');
            roots=[];replies.clear();const flat:Comment[]=[];
            for(const row of chunk.rows){const c=normalize(row.comment,row.parent||undefined);flat.push(c);if(!row.parent)roots.push(c);else{const list=replies.get(row.parent)||[];list.push(c);replies.set(row.parent,list);}}
            // normalize installs empty child arrays; rebuild parent buckets after all rows.
            replies.clear();for(const c of flat)if(c.parentId)replies.set(c.parentId,[...(replies.get(c.parentId)||[]),c]);
            const receipt={checkpoint:chunk.checkpoint,hash:chunk.hash,replaying:chunk.replaying,remainingAnchors:chunk.remainingAnchors};
            validateChunk(this.checkpoints.get(post.id)||{version:1,sequence:0,marks:[]},receipt,reference.rawId,flat);
            this.chunkStates.set(post.id,{token:chunk.token,receipt,confirmed:false,window:readWindow,ordinal:boundedRead.window!});
            if(chunk.canContinue)this.continuations.set(post.id,{token:chunk.token,window:readWindow,ordinal:boundedRead.window!});
        }
        if(!chunk&&boundedRead&&(boundedRead.state==='COMPLETE'||data.data.continuation!==undefined)){
            const retained=boundedRead.retained.loaded;
            if(!retained||retained.roots!==roots.length||retained.uniqueKnown!==seen.size||retained.replies!==seen.size-roots.length)throw invalidSource('post','SCHEMA_VALIDATION','data.comments.list');
        }
        this.details.set(post.id, { roots, replies });
        const author=rawUser.safeParse(data.data.note.user),cover=inspectXhsDetailCover(data.data.note.imageList),avatar=inspectXhsAvatar(author.success?author.data.avatar:data.data.note.user==null?undefined:{});
        return { ...post,boundedRead,...(boundedRead?{boundedReadWindows:(resume||priorChunk)?[...(post.boundedReadWindows||[]),boundedRead]:[boundedRead]}:{}),coverageDiagnostic:safeCoverageDiagnostic(data.data.coverageDiagnostic),sourceReference:this.mode==="XHS_MCP"&&(data.feed_id||data.data.note.noteId)?savedPostReference({postId:reference.rawId,token:reference.token,source:post.sourceReference?.source||"pc_feed"},post.id):undefined,authorNickname:author.success?savedNickname(author.data.nickname)||savedNickname(author.data.nickName):undefined,authorAvatarUrl:avatar.url,imageDiagnostics:{...post.imageDiagnostics,detailCover:cover.diagnostic,authorAvatar:avatar.diagnostic,avatarSource:safeAvatarSourceDiagnostic(data.data.avatarSourceDiagnostic)},publishedAt:savedPublishedAt(data.data.note.time), coverUrl:post.coverUrl||cover.url, title: data.data.note.title || post.title, ...(data.data.note.desc!=null?{body:data.data.note.desc}:{}) };
    }
    /** One bounded detail call. The caller owns account authorization and the device lease. */
    async postReference(value:PostReference,signal:AbortSignal,mode:'INITIAL_WINDOW'|'BOUNDED_REPLIES'='INITIAL_WINDOW'):Promise<Post>{
        const ref=postReferenceSchema.parse(value),id=this.id(ref.postId);
        if(mode==='BOUNDED_REPLIES'&&!this.readWindow)throw new ReadFailure("UNSUPPORTED");
        if(!this.allowed)throw new ReadFailure("REAL_DISABLED");
        await this.transport.connect?.(signal);
        this.tokens.set(id,{rawId:ref.postId,token:ref.token});
        try{const post=await this.post({id,title:'',sourceReference:ref},signal,undefined,mode==='INITIAL_WINDOW');if(this.mode==='XHS_MCP'&&!post.sourceReference)throw invalidSource('post','IDENTITY_CONFLICT','noteId');return post;}finally{this.tokens.delete(id);}
    }
    canContinuePost(post:Post){return this.continuations.has(post.id);}
    async continuePost(post:Post,signal:AbortSignal,remainingComments?:number):Promise<Post>{const next=this.continuations.get(post.id);if(!next)throw new ReadFailure('UNSUPPORTED');this.continuations.delete(post.id);return this.post(post,signal,this.supportsChunks()?remainingComments:undefined,false,next);}
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
