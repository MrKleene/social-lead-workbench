import { z } from "zod";
import {searchAttemptSchema,type SearchAttempt,type CollectionDiagnostic} from "@crm/contracts";
import {diagnose,invalidSource} from "./diagnostics";
import { Comment, Post, Page, ReadAdapter, ReadFailure, ConfigInput, commentSchema, postSchema, limits } from "./contract";
export type PostRead = {
    post: Post;
    comments: Comment[];
    deletedIds: string[];
    complete: boolean;
    windowRead?: boolean;
    stopReason?:string;
};
export type ReadResult = {
    searchAttempts?:SearchAttempt[];
    diagnostic?:CollectionDiagnostic;
    discarded?:boolean;
    posts: PostRead[];
    requests: number;
    status: string;
    reason?: string;
    retryAfterMs?: number;
};
/** No timers or polling survive this finite invocation. */
export async function collect(adapter: ReadAdapter, config: ConfigInput, cancelled: () => Promise<boolean>, budget: {
    requests: number;
    pagesPerStream: number;
    comments: number;
    callMs: number;
    runMs: number;
} = limits, progress?: (result:ReadResult)=>Promise<void>): Promise<ReadResult> {
    if (adapter.mode !== config.mode || adapter.platform !== config.platform)
        throw new ReadFailure("REAL_DISABLED");
    const result: ReadResult = { posts: [], requests: 0, status: "COMPLETE" };
    const started = Date.now();
    let comments = 0, postOrdinal=0,keywordOrdinal=0;
    let stage:CollectionDiagnostic['stage']='prepare';
    const checkpoint=async()=>{const previous=stage;stage='checkpoint';await progress?.(result);stage=previous;};
    const checkCancelled=async()=>{try{return await cancelled();}catch(error){throw new ReadFailure(error instanceof ReadFailure?error.code:'INVALID_DATA',error instanceof ReadFailure?error.retryAfterMs:undefined,diagnose(error,'authorization'));}};
    async function call<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
        if (await checkCancelled())
            throw new ReadFailure("PAUSED");
        if (result.requests >= budget.requests || Date.now() - started >= budget.runMs)
            throw new ReadFailure("BUDGET");
        result.requests++;
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout>;
        let polling: ReturnType<typeof setInterval>;
        let checking = false;
        try {
            return await Promise.race([fn(controller.signal), new Promise<never>((_, reject) => {
                    timer = setTimeout(() => { reject(new ReadFailure("TIMEOUT")); controller.abort(); }, Math.min(budget.callMs, budget.runMs - (Date.now() - started)));
                    polling = setInterval(async () => {
                        if (checking) return;
                        checking = true;
                        try { if (await checkCancelled()) { reject(new ReadFailure("PAUSED")); controller.abort(); } }
                        catch (error) { reject(error instanceof ReadFailure ? error : new ReadFailure("INVALID_DATA")); controller.abort(); }
                        finally { checking = false; }
                    }, 100);
                })]);
        }
        finally {
            clearTimeout(timer!);
            clearInterval(polling!);
        }
    }
    async function pages<T>(fn: (cursor: string | undefined, signal: AbortSignal) => Promise<Page<T>>, schema: z.ZodType<T>, consume: (items: T[], deleted: string[]) => Promise<void>, pageLimit=budget.pagesPerStream): Promise<boolean> {
        let cursor: string | undefined;
        const seen = new Set<string>();
        for (let n = 0; n < pageLimit; n++) {
            const raw = await call(signal => fn(cursor, signal));
            if(stage==='search'&&adapter.mode!=='MOCK'){
                const supplied={keywordOrdinal,requestStep:result.requests,...(raw.searchEvidence||{evidence:'LEGACY_UNAVAILABLE',returnedCount:raw.items.length})};
                const safe=searchAttemptSchema.safeParse(supplied);
                (result.searchAttempts??=[]).push(safe.success?safe.data:{keywordOrdinal,requestStep:result.requests,evidence:'INVALID_DIAGNOSTIC',returnedCount:null});
            }
            const page = z.object({ items: z.array(schema).max(200), next: z.string().min(1).optional(), complete: z.boolean(), deletedIds: z.array(z.string().min(1).max(200)).max(200).optional() }).parse(raw);
            await consume(page.items, page.deletedIds || []);
            if (!page.next)
                return page.complete;
            if (seen.has(page.next))
                return false;
            seen.add(page.next);
            cursor = page.next;
        }
        return false;
    }
    try {
        if (adapter.prepare) await call(s => adapter.prepare!(s));
        const found = new Map<string, Post>();
        for (const keyword of config.keywords) {
            stage='search';keywordOrdinal++;
            const complete = await pages((c, s) => adapter.search(keyword, c, s), postSchema, async (items) => { for (const p of items)
                if (found.size < config.batchLimit)
                    found.set(p.id, p); }, adapter.mode==="MOCK"?limits.pagesPerStream:1);
            if (!complete) {
                result.status = "PARTIAL";
                result.reason = "SEARCH_PARTIAL";
            }
            // Reserve the remaining request budget for the posts already selected.
            // Keyword order defines this finite batch, not exhaustive search coverage.
            if (found.size >= config.batchLimit)
                break;
        }
        for (const item of found.values()) {
            if(comments>=budget.comments)throw new ReadFailure('BUDGET');
            postOrdinal++;stage='post';
            const post = postSchema.parse(await call(s => adapter.post(item, s, budget.comments-comments)));
            if (post.id !== item.id)
                throw new ReadFailure("INVALID_DATA");
            const entry: PostRead = { stopReason:post.boundedRead?.reason, post, comments: [], deletedIds: [], complete: false };
            result.posts.push(entry);
            await checkpoint();
            const roots: Comment[] = [];
            const add = async (items: Comment[], deleted: string[]) => {
                for (const c of items) {
                    const prior=entry.comments.find(x=>x.id===c.id);
                    if(prior){if(prior.text!==c.text||prior.userId!==c.userId||prior.parentId!==c.parentId)throw invalidSource(stage,"DUPLICATE_CONFLICT","id");continue;}
                    comments++;
                    entry.comments.push(c);
                }
                entry.deletedIds.push(...deleted);
                await checkpoint();
                if(comments>budget.comments)throw new ReadFailure("BUDGET");
            };
            stage='received_comments';
            if(adapter.receivedComments)await add(z.array(commentSchema).max(200).parse(adapter.receivedComments(post)),[]);
            // The bounded MCP response already contains the retained tree. Save first,
            // then stop on terminal read failures; never issue cached-tree page calls
            // that could mask cancellation or consume the remaining request budget.
            if(post.boundedRead){
                entry.windowRead=true;result.status='PARTIAL';result.reason=post.boundedRead.reason;await checkpoint();
                const reason=post.boundedRead.reason;
                if(reason==='PLATFORM_LIMIT')throw new ReadFailure('RESTRICTED');
                if(reason==='CANCELLED')throw new ReadFailure('PAUSED');
                if(reason==='TIMEOUT')throw new ReadFailure('TIMEOUT');
                if(['READ_FAILED','INVALID_RESPONSE','IDENTITY_CONFLICT','DEPTH_LIMIT'].includes(reason)){result.status='FAILED';break;}
                continue;
            }
            stage='comments';
            let complete = await pages((c, s) => adapter.comments(post, c, s), commentSchema, async (items, deleted) => { roots.push(...items); await add(items, deleted); });
            const expanded = new Set<string>();
            for (let i = 0; i < roots.length; i++) {
                const root = roots[i];
                if (!root.hasReplies || expanded.has(root.id)) continue;
                expanded.add(root.id);
                stage='replies';
                const all = await pages((c, s) => adapter.replies(post, root.id, c, s), commentSchema, async (items, deleted) => {
                    if (items.some(c => c.parentId !== root.id))
                        throw new ReadFailure("INVALID_DATA");
                    roots.push(...items);
                    await add(items, deleted);
                });
                complete = complete && all;
            }
            const unique = new Map<string, Comment>();
            for (const c of entry.comments) {
                const old = unique.get(c.id);
                if (old && (old.text !== c.text || old.userId !== c.userId || old.parentId !== c.parentId))
                    throw new ReadFailure("INVALID_DATA");
                unique.set(c.id, c);
            }
            entry.comments = [...unique.values()];
            entry.complete = complete;
            entry.windowRead = true;
            await checkpoint();
            if (!complete) {
                result.status = "PARTIAL";
                result.reason = adapter.mode === "MOCK" ? "COMMENTS_PARTIAL" : "MCP_WINDOW_ONLY";
            }
        }
    }
    catch (error) {
        result.diagnostic=diagnose(error,stage,postOrdinal,result.requests);
        if(stage==='search'&&result.diagnostic.searchObservation&&!(result.searchAttempts||[]).some(a=>a.requestStep===result.requests)){
            const observation=result.diagnostic.searchObservation;
            (result.searchAttempts??=[]).push({keywordOrdinal,requestStep:result.requests,evidence:'AVAILABLE',returnedCount:observation.acceptedCount,observation});
        }
        result.reason = error instanceof ReadFailure ? error.code : "INVALID_DATA";
        if (error instanceof ReadFailure) result.retryAfterMs = error.retryAfterMs;
        if (result.reason === "INVALID_DATA") {result.discarded=result.posts.length>0;result.posts = [];}
        result.status = result.reason === "PAUSED" ? "PAUSED" : result.reason === "BUDGET" ? "PARTIAL" : "FAILED";
    }
    return result;
}
