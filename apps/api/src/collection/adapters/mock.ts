import { createHash } from "node:crypto";
import { Comment, Page, Post, ReadAdapter, ReadFailure, Scenario } from "../contract";
/** Explicitly fictional fixtures. IDs derive from platform+keyword, never run ID or nickname. */
export class MockAdapter implements ReadAdapter {
    readonly mode = "MOCK" as const;
    private words = new Map<string, string>();
    constructor(readonly platform: "XHS" | "DOUYIN", private scenario: Scenario) { }
    async search(keyword: string, cursor?: string): Promise<Page<Post>> {
        if (["TIMEOUT", "LOGIN_EXPIRED", "RESTRICTED"].includes(this.scenario))
            throw new ReadFailure(this.scenario as "TIMEOUT");
        const id = `demo-collect-${createHash("sha256").update(keyword).digest("hex").slice(0, 12)}`;
        const post = `${id}-${cursor ? "b" : "a"}`;
        this.words.set(post, keyword);
        return { items: [{ id: post, title: `【模拟】${keyword}讨论` }], next: cursor ? undefined : "page-2", complete: !!cursor };
    }
    async post(post: Post) { return post; }
    private root(post: Post, n: string, text: string): Comment {
        return { id: `${post.id}-c${n}`, userId: `${post.id}-u${n}`, nickname: `模拟用户${n}`, text, hasReplies: n === "1" };
    }
    async comments(post: Post, cursor?: string): Promise<Page<Comment>> {
        const k = this.words.get(post.id)!;
        if (!cursor)
            return { items: this.scenario === "MISSING" || this.scenario === "DELETED" ? [] : [this.root(post, "1", `【模拟】请问${k}如何开始？`)], next: "comments-2", complete: false,
                deletedIds: this.scenario === "DELETED" ? [`${post.id}-c1`] : [] };
        const items = [this.root(post, "2", `【模拟】正在从事${k}相关工作。`), this.root(post, "4", `【模拟】广告：${k}推广。`)];
        if (this.scenario === "NEW")
            items.push(this.root(post, "3", `【模拟】需要${k}，可以介绍吗？`));
        return { items, complete: this.scenario !== "PARTIAL" };
    }
    async replies(post: Post, parentId: string): Promise<Page<Comment>> {
        const k = this.words.get(post.id)!;
        return { items: [{ ...this.root(post, "1", `【模拟】补充求助：${k}需要哪些材料？`), id: `${post.id}-reply1`, parentId, hasReplies: false }], complete: true };
    }
}
