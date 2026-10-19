import { z } from "zod";
import { Comment, Post, Page, ReadAdapter, ReadFailure, ConfigInput, commentSchema, postSchema, limits } from "./contract";
export type PostRead = {
    post: Post;
    comments: Comment[];
    deletedIds: string[];
    complete: boolean;
};
export type ReadResult = {
    posts: PostRead[];
    requests: number;
    status: string;
    reason?: string;
};
/** No timers or polling survive this finite invocation. */
export async function collect(adapter: ReadAdapter, config: ConfigInput, cancelled: () => Promise<boolean>, budget: {
    requests: number;
    pagesPerStream: number;
    comments: number;
    callMs: number;
    runMs: number;
} = limits): Promise<ReadResult> {
    if (adapter.mode !== "MOCK")
        throw new ReadFailure("REAL_DISABLED");
    const result: ReadResult = { posts: [], requests: 0, status: "COMPLETE" };
    const started = Date.now();
    let comments = 0;
    async function call<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
        if (await cancelled())
            throw new ReadFailure("PAUSED");
        if (result.requests >= budget.requests || Date.now() - started >= budget.runMs)
            throw new ReadFailure("BUDGET");
        result.requests++;
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout>;
        try {
            return await Promise.race([fn(controller.signal), new Promise<never>((_, reject) => {
                    timer = setTimeout(() => { controller.abort(); reject(new ReadFailure("TIMEOUT")); }, Math.min(budget.callMs, budget.runMs - (Date.now() - started)));
                })]);
        }
        finally {
            clearTimeout(timer!);
        }
    }
    async function pages<T>(fn: (cursor: string | undefined, signal: AbortSignal) => Promise<Page<T>>, schema: z.ZodType<T>, consume: (items: T[], deleted: string[]) => Promise<void>): Promise<boolean> {
        let cursor: string | undefined;
        const seen = new Set<string>();
        for (let n = 0; n < budget.pagesPerStream; n++) {
            const raw = await call(signal => fn(cursor, signal));
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
        const found = new Map<string, Post>();
        for (const keyword of config.keywords) {
            const complete = await pages((c, s) => adapter.search(keyword, c, s), postSchema, async (items) => { for (const p of items)
                if (found.size < config.batchLimit)
                    found.set(p.id, p); });
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
            const post = postSchema.parse(await call(s => adapter.post(item, s)));
            if (post.id !== item.id)
                throw new ReadFailure("INVALID_DATA");
            const entry: PostRead = { post, comments: [], deletedIds: [], complete: false };
            result.posts.push(entry);
            const roots: Comment[] = [];
            const add = async (items: Comment[], deleted: string[]) => {
                for (const c of items) {
                    if (++comments > budget.comments)
                        throw new ReadFailure("BUDGET");
                    entry.comments.push(c);
                }
                entry.deletedIds.push(...deleted);
            };
            let complete = await pages((c, s) => adapter.comments(post, c, s), commentSchema, async (items, deleted) => { roots.push(...items); await add(items, deleted); });
            for (const root of roots.filter(c => c.hasReplies)) {
                const all = await pages((c, s) => adapter.replies(post, root.id, c, s), commentSchema, async (items, deleted) => {
                    if (items.some(c => c.parentId !== root.id))
                        throw new ReadFailure("INVALID_DATA");
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
            if (!complete) {
                result.status = "PARTIAL";
                result.reason = "COMMENTS_PARTIAL";
            }
        }
    }
    catch (error) {
        result.reason = error instanceof ReadFailure ? error.code : "INVALID_DATA";
        result.status = result.reason === "PAUSED" ? "PAUSED" : result.reason === "BUDGET" ? "PARTIAL" : "FAILED";
    }
    return result;
}
