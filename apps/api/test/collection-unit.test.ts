import { previewReply, replyDraft } from '@crm/contracts';
import { describe, it, expect, vi } from "vitest";
import { classify, configInput, limits, ReadAdapter, ReadFailure } from "../src/collection/contract";
import { MockAdapter } from "../src/collection/adapters/mock";
import { XhsMcpAdapter } from "../src/collection/adapters/xhs-mcp";
import { collect } from "../src/collection/collector";
import { parse } from "../src/common/validation";
const config = { name: "测试", platform: "XHS" as const, mode: "MOCK" as const, keywords: ["法律咨询"], excludeWords: ["广告"], batchLimit: 1, enabled: true };
const envelope = (v: unknown) => ({ content: [{ type: "text", text: JSON.stringify(v) }] });
describe("只读采集契约与预算", () => {
    it("配置严格拒绝未知模式、空词、重复、覆盖排除词和超预算", () => {
        for (const patch of [{ mode: "UNKNOWN" }, { keywords: [] }, { keywords: [" "] }, { keywords: ["a", "A"] }, { keywords: ["ＡＩ", "ai"] }, { keywords: ["ＡＩ咨询"], excludeWords: ["ai"] }, { excludeWords: ["法律"] }, { batchLimit: 0 }, { batchLimit: 11 }, { unknown: true }])
            expect(configInput.safeParse({ ...config, ...patch }).success).toBe(false);
    });
    it("校验错误给出可操作原因，不回显输入内容", () => {
        expect(() => parse(configInput, { ...config, keywords: ["ＡＩ", "ai"] })).toThrow("关键词不能重复");
        expect(() => parse(configInput, { ...config, excludeWords: ["法律"] })).toThrow("排除词不能覆盖搜索关键词");
        expect(() => parse(configInput, { ...config, batchLimit: 999 })).toThrow("输入格式错误");
    });
    it("规则区分可能求助/仅相关/排除，文字不是联系同意", () => {
        expect(classify("请问法律咨询如何开始？", config.keywords, [])).toEqual({ keywords: ["法律咨询"], classification: "POSSIBLE_HELP" });
        expect(classify("从事法律咨询", config.keywords, [])?.classification).toBe("RELATED_ONLY");
        expect(classify("广告：法律咨询", config.keywords, config.excludeWords)).toBeNull();
        expect(classify("无关内容", config.keywords, [])).toBeNull();
    });
    it("搜索分页、帖子、顶层和楼中楼，稳定ID不依赖运行", async () => {
        const a = await collect(new MockAdapter("XHS", "BASELINE"), config, async () => false);
        const b = await collect(new MockAdapter("XHS", "BASELINE"), config, async () => false);
        expect(a.status).toBe("COMPLETE");
        expect(a.posts).toEqual(b.posts);
        expect(a.posts[0].comments).toHaveLength(4);
        expect(a.posts[0].comments.some(c => c.parentId)).toBe(true);
        expect(a.requests).toBe(6);
    });
    it("多关键词达到帖子预算后保留请求供评论与楼中楼读取", async () => {
        const adapter = new MockAdapter("XHS", "BASELINE");
        const search = vi.spyOn(adapter, "search");
        const r = await collect(adapter, { ...config, keywords: Array.from({ length: 8 }, (_, i) => `关键词${i}`) }, async () => false, { ...limits, requests: 8 });
        expect(r.status).toBe("COMPLETE");
        expect(r.posts[0].comments).toHaveLength(4);
        expect(search.mock.calls.every(args => args[0] === "关键词0")).toBe(true);
        expect(r.requests).toBe(6);
    });
    it("全半角匹配与校验采用同一规则", () => {
        expect(classify("请问ＡＩ咨询如何开始", ["ai咨询"], [])?.classification).toBe("POSSIBLE_HELP");
        expect(classify("ＡＩ咨询广告", ["ai咨询"], ["广告"])).toBeNull();
    });
    it("首次局部读取不宣称完整", async () => { const r = await collect(new MockAdapter("XHS", "PARTIAL"), config, async () => false); expect(r.status).toBe("PARTIAL"); expect(r.posts[0].complete).toBe(false); });
    it("循环游标有限终止", async () => { const a = new MockAdapter("XHS", "BASELINE"); a.search = async () => ({ items: [], next: "loop", complete: false }); const r = await collect(a, config, async () => false); expect(r.status).toBe("PARTIAL"); expect(r.requests).toBe(2); });
    it("请求预算强制停止", async () => { const r = await collect(new MockAdapter("XHS", "BASELINE"), config, async () => false, { ...limits, requests: 2 }); expect(r.reason).toBe("BUDGET"); expect(r.requests).toBe(2); });
    it("超时中止挂起读取", async () => { const a = new MockAdapter("XHS", "BASELINE"); a.search = () => new Promise(() => { }); const r = await collect(a, config, async () => false, { ...limits, callMs: 10 }); expect(r.reason).toBe("TIMEOUT"); });
    it("取消任务不发起读取", async () => { const a = new MockAdapter("XHS", "BASELINE"); const spy = vi.spyOn(a, "search"); expect((await collect(a, config, async () => true)).status).toBe("PAUSED"); expect(spy).not.toHaveBeenCalled(); });
    it("真实适配器被引擎硬拒绝", async () => { const transport = { call: vi.fn() }; await expect(collect(new XhsMcpAdapter(transport), config, async () => false)).rejects.toMatchObject({ code: "REAL_DISABLED" }); expect(transport.call).not.toHaveBeenCalled(); });
    it("XHS默认禁用、无发送接口", async () => { const call = vi.fn(); const a = new XhsMcpAdapter({ call }); await expect(a.search("示例", undefined, new AbortController().signal)).rejects.toMatchObject({ code: "REAL_DISABLED" }); expect(call).not.toHaveBeenCalled(); expect(a).not.toHaveProperty("send"); });
    it("XHS使用注入假传输解析搜索和楼中楼，未知分页保持局部", async () => {
        const call = vi.fn().mockResolvedValueOnce(envelope({ feeds: [{ id: "p1", xsecToken: "fictional-reference", noteCard: { displayTitle: "模拟标题" } }] })).mockResolvedValueOnce(envelope({ data: { note: { title: "模拟标题" }, comments: { hasMore: false, list: [{ id: "c1", content: "求助", userInfo: { userId: "u1", nickname: "虚构" }, subComments: [{ id: "r1", content: "补充", userInfo: { userId: "u1", nickname: "虚构" } }] }] } } }));
        const a = new XhsMcpAdapter({ call }, true), signal = new AbortController().signal;
        const s = await a.search("测试", undefined, signal);
        expect(s.complete).toBe(false);
        await a.post(s.items[0], signal);
        expect((await a.comments(s.items[0], undefined, signal)).items[0].hasReplies).toBe(true);
        expect((await a.replies(s.items[0], "c1", undefined, signal)).items[0].parentId).toBe("c1");
        expect((await a.comments(s.items[0], undefined, signal)).complete).toBe(false);
        expect(call.mock.calls.map(c => c[0])).toEqual(["search_feeds", "get_feed_detail"]);
        expect(call.mock.calls[1][1]).toMatchObject({ load_all_comments: false, click_more_replies: false });
    });
    it.each([["未登录", "LOGIN_EXPIRED"], ["账号限制", "RESTRICTED"], ["超时", "TIMEOUT"]])("XHS错误 %s 分类", async (text, code) => { const a = new XhsMcpAdapter({ call: async () => ({ isError: true, content: [{ type: "text", text }] }) }, true); await expect(a.search("示例", undefined, new AbortController().signal)).rejects.toMatchObject({ code }); });
    it("不完整/无稳定ID数据被拒绝", async () => { const a = new MockAdapter("XHS", "BASELINE"); a.comments = async () => ({ items: [{ id: "", userId: "u", nickname: "n", text: "t", hasReplies: false }], complete: true }); expect((await collect(a, config, async () => false)).reason).toBe("INVALID_DATA"); });
});

describe('话术安全预览', () => {
    it('只替换白名单字段，不递归执行来源中的模板或HTML', () => {
        const p = previewReply('你好{{昵称}} {{专业}} {{未知}}', { 昵称: '<script>{{关键词}}</script>' });
        expect(p.text).toBe('你好<script>{{关键词}}</script> 【缺少来源字段：专业】 【未知字段：未知】');
        expect(p.missing).toEqual(['专业']); expect(p.unknown).toEqual(['未知']);
    });
    it('原型属性和损坏占位符不可作为合法话术保存', () => {
        for (const body of ['{{constructor}}', '{{__proto__}}', '{{昵称}', 'x'.repeat(2001)])
            expect(replyDraft.safeParse({ name:'测试',channel:'DM',body }).success).toBe(false);
        expect(replyDraft.safeParse({ name:'测试',channel:'DM',body:'{{ 昵称 }}，你好' }).success).toBe(true);
    });
});


describe('optional safe post covers (synthetic upstream only)',()=>{
 const cover='https://sns-webpic-qc.xhscdn.com/fictional-cover!webp';
 it.each(['http://sns-webpic-qc.xhscdn.com/p','https://evil.example/p','https://sns-webpic-qc.xhscdn.com.evil.example/p','https://user:secret@sns-webpic-qc.xhscdn.com/p','https://sns-webpic-qc.xhscdn.com/p?token=secret','https://sns-webpic-qc.xhscdn.com/p#secret','https://127.0.0.1/p','data:image/png;base64,abc','https://sns-webpic-qc.xhscdn.com/%3Ftoken','https://sns-webpic-qc.xhscdn.com:444/p'])('rejects unsafe optional URL without discarding text: %s',async value=>{
  const {postSchema}=await import('../src/collection/contract');expect(postSchema.parse({id:'p',title:'合成标题',coverUrl:value})).toEqual({id:'p',title:'合成标题',coverUrl:undefined});
 });
 it.each([
  [{urlDefault:cover},[{urlDefault:'https://sns-webpic-qn.xhscdn.com/detail'}],cover],
  [null,[{urlDefault:cover}],cover],
  [{urlDefault:'https://evil.example/token',urlPre:cover},undefined,cover],
  [{infoList:[{url:cover}]},undefined,cover],
  [42,'bad',undefined],
 ])('extracts observed cover or first detail image without new calls',async(raw,images,expected)=>{
  const call=vi.fn().mockResolvedValueOnce(envelope({feeds:[{id:'p1',xsecToken:'fake-secret-not-to-store',noteCard:{displayTitle:'合成帖子',cover:raw}}]})).mockResolvedValueOnce(envelope({data:{note:{title:'合成帖子',imageList:images},comments:{list:[]}}}));
  const a=new XhsMcpAdapter({call},true),signal=new AbortController().signal;const search=await a.search('合成',undefined,signal),post=await a.post(search.items[0],signal);
  expect(post.coverUrl).toBe(expected);expect(JSON.stringify(post)).not.toContain('fake-secret');expect(call).toHaveBeenCalledTimes(2);
 });
 it('cover metadata is absent from model snapshot and comment hash',async()=>{
  const {semanticSnapshot,snapshotHash}=await import('../src/collection/semantic-evaluator');const comment={id:'c',userId:'u',nickname:'合成',text:'求助',hasReplies:false};
  const plain={id:'p',title:'合成'};const a=semanticSnapshot(plain,comment,undefined,false,true),b=semanticSnapshot({...plain,coverUrl:cover},comment,undefined,false,true);expect(b).toEqual(a);expect(snapshotHash(b)).toBe(snapshotHash(a));
 });
});
