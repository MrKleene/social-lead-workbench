import {summarizePartial} from './run-coverage';
import { z } from "zod";
import {searchAttemptSchema,type SearchAttempt,type CollectionDiagnostic} from "@crm/contracts";
import {diagnose,invalidSource} from "./diagnostics";
import { Comment, Post, Page, ReadAdapter, ReadFailure, ConfigInput, commentSchema, postSchema, limits, isReadFailure } from "./contract";
import * as commentPolicy from "./comment-read-policy.cjs";
export type PostRead = {
    chunk?:import("@crm/contracts").CommentChunkReceipt;
    chunkComments?:Comment[];
    post: Post;
    comments: Comment[];
    deletedIds: string[];
    complete: boolean;
    windowRead?: boolean;
    stopReason?:string;
};
export type ReadResult = {
    selection?:'SAVED_POST';
    searchIncomplete?:boolean;
    /** 本轮实际搜过的关键词及各自新增篇数；新随机计划才会记录。 */
    searchPlanUsage?:{keyword:string;found:number}[];
    /** 计划关键词按序搜完仍不足 batchLimit（不是平台限制或读取异常）。 */
    searchExhausted?:boolean;
    searchAttempts?:SearchAttempt[];
    diagnostic?:CollectionDiagnostic;
    discarded?:boolean;
    posts: PostRead[];
    requests: number;
    status: string;
    reason?: string;
    retryAfterMs?: number;
};
export type PostTimeBudget={baseMs:number;perCommentMs:number;minMs:number;maxMs:number;defaultMs:number};
export type LongReadPacing={everyMs:number;minMs:number;maxMs:number};
export type SearchGap={minMs:number;maxMs:number};
/** 与 keyword-plan.cjs 的种子计划配套：按种子和词序确定性抽 1~remaining 的配额。 */
export function keywordQuota(seed:string,ordinal:number,remaining:number):number{
 if(!Number.isInteger(remaining)||remaining<1)return 0;
 let h=0x811c9dc5;for(let i=0;i<seed.length;i++){h^=seed.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}
 let a=(h^Math.imul(ordinal+1,0x9e3779b9))>>>0;
 a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;
 const value=((t^(t>>>14))>>>0)/4294967296;
 if(!Number.isFinite(value))return 1;
 return 1+Math.min(remaining-1,Math.floor(value*remaining));
}
/**
 * Exception backstop for one post, derived from the platform-declared comment count.
 * The declared count is platform-wide evidence, so the deadline is capped: a post that
 * outgrows it keeps what was read, is marked partial, and the run moves on.
 */
export function postTimeBudgetMs(declared:number|null|undefined,budget:PostTimeBudget=commentPolicy.postTimeBudget as PostTimeBudget):number{
 if(declared==null||!Number.isFinite(declared)||declared<0)return budget.defaultMs;
 return Math.min(budget.maxMs,Math.max(budget.minMs,budget.baseMs+declared*budget.perCommentMs));
}
function declaredComments(post:Post):number|undefined{
 const read=post.boundedRead;if(!read)return undefined;
 const summary=read.chunkSummary?.declared;if(summary?.state==='EXACT'&&summary.value!==null)return summary.value;
 const total=read.final?.total;if(total?.state==='EXACT'&&total.value!==null)return total.value;
 return undefined;
}
/** No timers or polling survive this finite invocation. */
export async function collect(adapter: ReadAdapter, config: ConfigInput, cancelled: () => Promise<boolean>, budget: {
    requests: number;
    pagesPerStream: number;
    comments: number;
    callMs: number;
    runMs: number;
    postBudget?: PostTimeBudget;
    pacing?: LongReadPacing;
    searchGap?: SearchGap;
    /** 历史已完整采集（run_posts.coverage='COMPLETE'）的帖子 ID；搜索选帖时直接跳过，PARTIAL 不在其中。 */
    completedPostIds?: ReadonlySet<string>;
} = limits, progress?: (result:ReadResult)=>Promise<void>, selectedPost?:Post,beforePost?:(post:Post)=>Promise<void>,postFinished?:(post:PostRead)=>Promise<void>,selectPost?:(post:Post)=>boolean,observe?:(stage:CollectionDiagnostic['stage'])=>Promise<void>): Promise<ReadResult> {
    if (adapter.mode !== config.mode || adapter.platform !== config.platform)
        throw new ReadFailure("REAL_DISABLED");
    const result: ReadResult = { posts: [], requests: 0, status: "COMPLETE" };
    const started = Date.now(),roundDeadline=started+budget.runMs;
    let comments = 0, postOrdinal=0,keywordOrdinal=0,lastLongPause=started;
    let stage:CollectionDiagnostic['stage']='prepare';
    const checkpoint=async()=>{const previous=stage;stage='checkpoint';await observe?.(stage);await progress?.(result);stage=previous;};
    const checkCancelled=async()=>{try{return await cancelled();}catch(error){throw new ReadFailure(isReadFailure(error)?error.code:'INVALID_DATA',isReadFailure(error)?error.retryAfterMs:undefined,diagnose(error,'authorization'));}};
    async function call<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
        if (await checkCancelled())
            throw new ReadFailure("PAUSED");
        if (result.requests >= budget.requests || Date.now() - started >= budget.runMs)
            throw new ReadFailure("BUDGET");
        await observe?.(stage);
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
                        catch (error) { reject(isReadFailure(error) ? error : new ReadFailure("INVALID_DATA")); controller.abort(); }
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
        if(adapter.mode==='XHS_MCP'&&!adapter.supportsChunks?.())budget={...budget,comments:Math.min(100,budget.comments)};
        const found = new Map<string, Post>();
        if(selectedPost){found.set(selectedPost.id,postSchema.parse(selectedPost));result.selection='SAVED_POST';}
        const searchPlan: string[] = selectedPost ? [] : config.keywords;
        const seeded = !selectedPost && !!config.searchSeed;
        const gap: SearchGap = budget.searchGap ?? commentPolicy.searchGap as SearchGap;
        for (let index = 0; index < searchPlan.length; index++) {
            const keyword = searchPlan[index], legacyQuota = config.keywordLimits?.[index];
            const remaining = seeded ? config.batchLimit - found.size : undefined;
            // 新随机计划：这个关键词本轮最多贡献 1~剩余篇数；旧计划仍按权重配额。
            const quota = seeded ? keywordQuota(config.searchSeed!, index, remaining!) : legacyQuota;
            if (quota !== undefined && quota <= 0)
                break;
            // 词与词之间按正常人翻页节奏停顿；只在新的随机计划下生效。
            if (seeded && index > 0) {
                const wait = gap.minMs + Math.floor(Math.random() * Math.max(0, gap.maxMs - gap.minMs + 1));
                if (wait > 0) {
                    if (Date.now() + wait >= roundDeadline)
                        break;
                    if (await checkCancelled())
                        throw new ReadFailure("PAUSED");
                    await new Promise((resolve) => setTimeout(resolve, wait));
                }
            }
            stage='search';keywordOrdinal++;
            let addedHere=0;
            const complete = await pages((c, s) => adapter.search(keyword, c, s, config.searchFilters), postSchema, async (items) => { for (const p of items) {
                // A planned keyword only contributes its own quota; unused slots roll to the next keyword.
                if (found.size >= config.batchLimit || (quota !== undefined && addedHere >= quota))
                    break;
                if (!selectPost||selectPost(p)) {
                    // 历史已完整读过的帖子不再重复打开；PARTIAL 记录不在集合里，允许本轮重采补齐。
                    if (budget.completedPostIds?.has(p.id)) continue;
                    found.set(p.id, p); addedHere++;
                }
            } }, adapter.mode==="MOCK"?limits.pagesPerStream:1);
            if (seeded)
                result.searchPlanUsage = [...(result.searchPlanUsage ?? []), { keyword, found: addedHere }];
            // 搜索只读首页是常态：先记录证据，是否降级由 summarizePartial 统一裁决。
            result.searchIncomplete=(result.searchIncomplete??false)||!complete;
            // Reserve the remaining request budget for the posts already selected.
            // The frozen search plan defines this finite batch, not exhaustive search coverage.
            if (found.size >= config.batchLimit)
                break;
        }
        // 计划内关键词按序搜完仍不满批次：这是候选池不足，不是读取异常。
        if (!selectedPost && found.size < config.batchLimit)
            result.searchExhausted = true;
        for (const item of found.values()) {
            if(comments>=budget.comments)throw new ReadFailure('BUDGET');
            postOrdinal++;stage='post';await beforePost?.(item);
            const postBudget=budget.postBudget??commentPolicy.postTimeBudget as PostTimeBudget;
            const postStartedAt=Date.now();
            lastLongPause=postStartedAt;
            let post = postSchema.parse(await call(s => adapter.post(item, s, budget.comments-comments)));
            if (post.id !== item.id)
                throw new ReadFailure("INVALID_DATA");
            const entry: PostRead = { stopReason:post.boundedRead?.reason, post, comments: [], deletedIds: [], complete: false };
            result.posts.push(entry);
            // One post may be long, but never longer than the round's remaining time.
            const postDeadline=Math.min(postStartedAt+postTimeBudgetMs(declaredComments(post),postBudget),roundDeadline);
            let budgetStopped=false;
            if(!adapter.chunkReceipt?.(post))await checkpoint();
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
            entry.chunk=adapter.chunkReceipt?.(post);
            if(adapter.receivedComments){const rows=z.array(commentSchema).max(200).parse(adapter.receivedComments(post));entry.chunkComments=entry.chunk?rows:undefined;await add(rows,[]);}
            adapter.confirmCheckpoint?.(post);
            // The bounded MCP response already contains the retained tree. Save first,
            // then stop on terminal read failures; never issue cached-tree page calls
            // that could mask cancellation or consume the remaining request budget.
            if(post.boundedRead){
                // Checkpoint each confirmed window before continuing the SAME live page.
                // The adapter owns opaque handles; never persist them or retry an uncertain call.
                const pacing=(budget.pacing??commentPolicy.longReadPacing) as LongReadPacing;
                while(adapter.continuePost&&adapter.canContinuePost?.(post)&&comments<budget.comments){
                    if(Date.now()>=postDeadline){budgetStopped=true;break;}
                    // A long continuous read takes one longer human reading pause; it is a
                    // waiting point, never a stop, and cancellation still wins.
                    if(pacing.everyMs>0&&Date.now()-lastLongPause>=pacing.everyMs){
                        if(await checkCancelled())throw new ReadFailure("PAUSED");
                        const span=Math.max(0,pacing.maxMs-pacing.minMs);
                        await new Promise(resolve=>setTimeout(resolve,pacing.minMs+Math.floor(Math.random()*(span+1))));
                        lastLongPause=Date.now();
                    }
                    entry.windowRead=true;entry.complete=false;entry.stopReason=post.boundedRead?.reason;await checkpoint();
                    stage='post';
                    const next=postSchema.parse(await call(s=>adapter.continuePost!(post,s,budget.comments-comments)));
                    if(next.id!==post.id||!next.boundedRead)throw invalidSource('post','IDENTITY_CONFLICT','id');
                    post=next;entry.post=post;entry.stopReason=post.boundedRead!.reason;
                    stage='received_comments';
                    const before=entry.comments.length;
                    entry.chunk=adapter.chunkReceipt?.(post);
            if(adapter.receivedComments){const rows=z.array(commentSchema).max(200).parse(adapter.receivedComments(post));entry.chunkComments=entry.chunk?rows:undefined;await add(rows,[]);}
            adapter.confirmCheckpoint?.(post);
                    await checkpoint();
                    if(entry.comments.length===before&&!entry.chunk)break;
                }
                entry.windowRead=true;entry.complete=post.boundedRead!.state==='COMPLETE';entry.stopReason=post.boundedRead!.reason;if(!entry.complete){result.status='PARTIAL';result.reason=post.boundedRead!.reason;}await checkpoint();
                if(entry.chunk&&adapter.finishChunks)await call(s=>adapter.finishChunks!(post,s));
                // Exception backstop: the post's own deadline is spent. Keep what was read,
                // mark this post partial and let the round continue with the next post.
                if(budgetStopped){
                    // Distinguish one post's deadline from the round ceiling: the former
                    // lets the next post run, the latter has no time left for it.
                    const roundExpired=Date.now()>=roundDeadline,reason=roundExpired?'ROUND_TIME_BUDGET':'POST_TIME_BUDGET';
                    entry.complete=false;entry.stopReason=reason;result.status='PARTIAL';result.reason=reason;await postFinished?.(entry);
                    if(roundExpired)break;
                    continue;
                }
                const reason=post.boundedRead!.reason;
                // 平台限流/风控是账号级停止信号：本轮已读内容保留，剩余帖不再读取。
                if(reason==='PLATFORM_LIMIT'){result.status='PARTIAL';result.reason=reason;break;}
                if(reason==='CANCELLED')throw new ReadFailure('PAUSED');
                if(reason==='TIMEOUT')throw new ReadFailure('TIMEOUT');
                // 页面状态丢失（READ_FAILED）说明这一篇读不下去，但已读内容有效：
                // 按覆盖不完整继续下一篇，不要因为单篇把整轮作废。
                if(reason==='READ_FAILED'){result.status='PARTIAL';result.reason=reason;continue;}
                if(['INVALID_RESPONSE','IDENTITY_CONFLICT','DEPTH_LIMIT'].includes(reason)){result.status='FAILED';break;}
                await postFinished?.(entry);
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
            await postFinished?.(entry);
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
        result.reason = isReadFailure(error) ? error.code : "INVALID_DATA";
        if (isReadFailure(error)) result.retryAfterMs = error.retryAfterMs;
        if (result.reason === "INVALID_DATA") {result.discarded=result.posts.length>0;result.posts = [];}
        result.status = result.reason === "PAUSED" ? "PAUSED" : result.reason === "BUDGET" ? "PARTIAL" : "FAILED";
    }
    summarizePartial(result);
    return result;
}