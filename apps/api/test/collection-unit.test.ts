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


import {savedNickname,safeAvatarUrl,savedPublishedAt} from '@crm/contracts';
import {semanticSnapshot,snapshotHash} from '../src/collection/semantic-evaluator';
describe('optional upstream display metadata, fictional transport only',()=>{
 const epoch=1792599000,iso='2026-10-21T16:10:00.000Z',avatar='https://sns-avatar-qc.xhscdn.com/avatar/fictional.jpg';
 it('accepts numeric epoch seconds/milliseconds and normalized ISO, rejects ambiguous or invalid times',()=>{
  for(const v of [epoch,epoch*1000,iso,'2026-10-21T16:10:00Z'])expect(savedPublishedAt(v)).toBe(iso);
  for(const v of [null,{},'',String(epoch),'昨天',0,-1,Infinity,NaN,1.5,999999999999999,'2026-02-30T00:00:00Z','2026-10-21','2026-10-21T16:10:00+08:00'])expect(savedPublishedAt(v)).toBeUndefined();
 });
 it('ignores malformed names and credential-bearing/unapproved avatar URLs',()=>{
  expect(savedNickname(' 虚构昵称 ')).toBe('虚构昵称');for(const v of [null,{},123,'','n'.repeat(201),'name\nother'])expect(savedNickname(v)).toBeUndefined();
  expect(safeAvatarUrl(avatar)).toBe(avatar);
  for(const v of [null,{},'http://sns-avatar-qc.xhscdn.com/avatar/a','https://evil.example/avatar/a','https://sns-avatar-qc.xhscdn.com.evil.example/avatar/a','https://user:secret@sns-avatar-qc.xhscdn.com/avatar/a','https://sns-avatar-qc.xhscdn.com/avatar/a?token=secret','https://sns-avatar-qc.xhscdn.com/avatar/a#secret','https://sns-avatar-qc.xhscdn.com/avatar/%2f','https://sns-avatar-qc.xhscdn.com:444/avatar/a'])expect(safeAvatarUrl(v)).toBeUndefined();
 });
 it.each([false,true])('pinned userInfo nickname/nickName/avatar and createTime on roots and replies; malformed=%s',async malformed=>{
  const user={userId:'u1',nickname:malformed?{}:'虚构昵称',nickName:malformed?null:'备用昵称',avatar:malformed?'https://evil.example/private?key=fictional':avatar};
  const reply={id:'r1',content:'回复正文',userInfo:{userId:'u2',nickName:'虚构回复'},createTime:epoch*1000};
  const c={id:'c1',content:'评论正文',userInfo:user,createTime:malformed?'昨天':epoch,subComments:[reply]};
  const call=vi.fn().mockResolvedValueOnce(envelope({feeds:[{id:'p1',xsecToken:'fictional-only'}]})).mockResolvedValueOnce(envelope({data:{note:{noteId:'p1',title:'虚构标题',user,time:malformed?null:epoch},comments:{list:[c]}}}));
  const adapter=new XhsMcpAdapter({call},true),signal=new AbortController().signal,p=(await adapter.search('虚构',undefined,signal)).items[0],detail=await adapter.post(p,signal);
  const [root]=adapter.receivedComments(p),[child]=(await adapter.replies(p,'c1',undefined,signal)).items;
  expect(root).toMatchObject({id:'c1',userId:'u1',text:'评论正文',nickname:malformed?'':'虚构昵称'});expect(root.authorAvatarUrl).toBe(malformed?undefined:avatar);expect(root.publishedAt).toBe(malformed?undefined:iso);expect(detail.publishedAt).toBe(malformed?undefined:iso);
  expect(child).toMatchObject({nickname:'虚构回复',publishedAt:iso,parentId:'c1'});expect(call).toHaveBeenCalledTimes(2);expect(JSON.stringify(detail)).not.toContain('fictional-only');
 });
 it('same comment with changed display metadata is not a conflicting content identity',async()=>{
  const c={id:'c1',content:'虚构正文',userInfo:{userId:'u1',nickname:'旧昵称'},createTime:epoch};
  const call=vi.fn().mockResolvedValueOnce(envelope({feeds:[{id:'p1',xsecToken:'fictional-only'}]})).mockResolvedValueOnce(envelope({data:{note:{title:'虚构'},comments:{list:[c,{...c,userInfo:{...c.userInfo,nickname:'新昵称',avatar},createTime:epoch*1000}]}}}));
  const a=new XhsMcpAdapter({call},true),signal=new AbortController().signal,p=(await a.search('虚构',undefined,signal)).items[0];await a.post(p,signal);expect(a.receivedComments(p)).toHaveLength(1);
 });
 it('display changes do not alter semantic input or its historical content hash',()=>{
  const post={id:'p',title:'虚构'},c={id:'c',userId:'u',nickname:'旧昵称',text:'正文',hasReplies:false};
  const original=semanticSnapshot(post,c,undefined,false,true),next=semanticSnapshot({...post,authorNickname:'新作者',authorAvatarUrl:avatar,publishedAt:iso},{...c,nickname:'新昵称',authorAvatarUrl:avatar,publishedAt:iso},undefined,false,true);
  expect(next).toEqual(original);expect(snapshotHash(next)).toBe(snapshotHash(original));expect(JSON.stringify(next)).not.toContain(avatar);
 });
});


describe('safe persisted image diagnostics, synthetic values only',()=>{
 it('classifies missing/empty/unsupported values and each security boundary without storing input',async()=>{
  const {inspectImageUrl,safeImageDiagnostics}=await import('@crm/contracts');
  const cases:[unknown,string][]=[[undefined,'NOT_RETURNED'],['','EMPTY'],[{},'UNSUPPORTED_FORMAT'],['not-a-url','URL_FORMAT'],['http://sns-avatar-qc.xhscdn.com/avatar/a','PROTOCOL'],['https://evil.example/avatar/a','HOST'],['https://sns-avatar-qc.xhscdn.com/avatar/a?token=FAKE_SECRET','URL_COMPONENTS'],['https://sns-avatar-qc.xhscdn.com/other/a','PATH'],['https://sns-avatar-qc.xhscdn.com/avatar/a','ACCEPTED']];
  const {inspectXhsAvatar}=await import('../src/collection/adapters/xhs-cover');
  for(const [input,reason] of cases){expect(inspectImageUrl(input,'avatar').reason).toBe(reason);const d=inspectXhsAvatar(input).diagnostic;expect(d.outcomes).toEqual([{reason,count:1}]);expect(safeImageDiagnostics({authorAvatar:d})).toEqual({authorAvatar:d});expect(JSON.stringify(d)).not.toMatch(/FAKE_SECRET|https?:|evil|avatar\//);}
  expect(safeImageDiagnostics({authorAvatar:{version:1,shape:'EMPTY',fieldCount:1,outcomes:[{reason:'EMPTY',count:1}],raw:'FAKE_SECRET'}})).toBeUndefined();
 });
 it('examines supported candidates, counts rejected fallback and preserves the existing first-image policy',async()=>{
  const {inspectXhsCover,inspectXhsDetailCover}=await import('../src/collection/adapters/xhs-cover');const cover='https://sns-webpic-qc.xhscdn.com/fictional';
  const value=inspectXhsCover({urlDefault:'http://sns-webpic-qc.xhscdn.com/a',urlPre:cover,infoList:[{url:'https://evil.example/secret?token=FAKE_SECRET'}]});
  expect(value.url).toBe(cover);expect(value.diagnostic).toMatchObject({shape:'SUPPORTED',fieldCount:3});expect(value.diagnostic.outcomes).toEqual(expect.arrayContaining([{reason:'ACCEPTED',count:2},{reason:'URL_COMPONENTS',count:1}]));expect(JSON.stringify(value.diagnostic)).not.toMatch(/FAKE_SECRET|https?:/);
  expect(inspectXhsCover({infoList:cover}).url).toBeUndefined();expect(inspectXhsCover({infoList:[cover]}).diagnostic.outcomes).toContainEqual({reason:'UNSUPPORTED_FORMAT',count:1});
  expect(inspectXhsDetailCover([{urlDefault:'http://sns-webpic-qn.xhscdn.com/a'},{urlDefault:cover}]).url).toBeUndefined();
  expect(inspectXhsCover('unsupported').diagnostic.shape).toBe('UNSUPPORTED');expect(inspectXhsDetailCover([]).diagnostic.shape).toBe('EMPTY');
 });
 it('carries controlled diagnostic through post/comment validation; identity and semantic hashes ignore it',async()=>{
  const {postSchema,commentSchema}=await import('../src/collection/contract');
  const c={id:'c',content:'合成正文',userInfo:{userId:'u',avatar:'http://sns-avatar-qc.xhscdn.com/avatar/FAKE_SECRET'},subComments:[{id:'r',content:'回复',userInfo:{userId:'u2',avatar:''}}]};
  const call=vi.fn().mockResolvedValueOnce(envelope({feeds:[{id:'p',xsecToken:'FAKE_SECRET',noteCard:{cover:{urlDefault:'http://sns-webpic-qc.xhscdn.com/a'}}}]})).mockResolvedValueOnce(envelope({data:{note:{title:'虚构',imageList:[{urlDefault:'https://sns-webpic-qc.xhscdn.com/a'}]},comments:{list:[c]}}}));
  const a=new XhsMcpAdapter({call},true),signal=new AbortController().signal,p=(await a.search('虚构',undefined,signal)).items[0],post=postSchema.parse(await a.post(p,signal)),[comment,reply]=a.receivedComments(post).map(c=>commentSchema.parse(c));
  expect(post.imageDiagnostics?.searchCover?.httpsUpgrades).toBe(1);expect(post.imageDiagnostics?.detailCover?.outcomes).toContainEqual({reason:'ACCEPTED',count:1});expect(comment.imageDiagnostics?.authorAvatar?.outcomes).toEqual([{reason:'PROTOCOL',count:1}]);expect(reply.imageDiagnostics?.authorAvatar?.outcomes).toEqual([{reason:'EMPTY',count:1}]);
  expect(JSON.stringify([post,comment,reply])).not.toContain('FAKE_SECRET');expect(semanticSnapshot(post,comment,undefined,false,false)).toEqual(semanticSnapshot({...post,imageDiagnostics:undefined},{...comment,imageDiagnostics:undefined},undefined,false,false));expect(call).toHaveBeenCalledTimes(2);
 });
});


describe('source titles and narrowly scoped cover compatibility',()=>{
 it.each([[undefined,undefined,''],[null,null,''],['','',''],['搜索原文','', '搜索原文'],['搜索原文','详情原文','详情原文'],['','详情原文','详情原文'],[' 原文 👩🏽‍🎓 ','',' 原文 👩🏽‍🎓 ']])('keeps actual text and never invents a missing title',async(searchTitle,detailTitle,expected)=>{
  const call=vi.fn().mockResolvedValueOnce(envelope({feeds:[{id:'p',xsecToken:'FICTIONAL',noteCard:{displayTitle:searchTitle}}]})).mockResolvedValueOnce(envelope({data:{note:{noteId:'p',title:detailTitle,desc:'真实结构的合成正文'},comments:{list:[]}}}));
  const a=new XhsMcpAdapter({call},true),signal=new AbortController().signal,search=(await a.search('虚构',undefined,signal)).items[0],post=await a.post(search,signal);
  expect(search.title).toBe(searchTitle??'');expect(post.title).toBe(expected);expect(JSON.stringify(post)).not.toContain('未提供标题');expect(call).toHaveBeenCalledTimes(2);
 });
 it('does not accept page errors or conflicting identities as titleless posts',async()=>{
  for(const detail of [{isError:true,content:[{type:'text',text:'未登录'}]},envelope({data:{note:{noteId:'different',title:''},comments:{list:[]}}}),envelope({login:'required'})]){
   const call=vi.fn().mockResolvedValueOnce(envelope({feeds:[{id:'p',xsecToken:'FICTIONAL'}]})).mockResolvedValueOnce(detail);const a=new XhsMcpAdapter({call},true),signal=new AbortController().signal,p=(await a.search('虚构',undefined,signal)).items[0];await expect(a.post(p,signal)).rejects.toThrow();
  }
 });
 it('upgrades only exact reviewed qc unsigned cover paths, not other hosts, avatars or malformed URLs',async()=>{
  const {inspectXhsCover,inspectXhsAvatar}=await import('../src/collection/adapters/xhs-cover');
  const value=inspectXhsCover({urlDefault:'http://sns-webpic-qc.xhscdn.com/fake/a!webp'});expect(value.url).toBe('https://sns-webpic-qc.xhscdn.com/fake/a!webp');expect(value.diagnostic).toMatchObject({httpsUpgrades:1,urlClasses:[{protocol:'HTTP',host:'ALLOWED',count:1}]});
  for(const raw of ['http://sns-webpic-qn.xhscdn.com/a','http://evil.example/a','http://sns-webpic-qc.xhscdn.com.evil.example/a','http://sns-webpic-qc.xhscdn.com:80/a','http://sns-webpic-qc.xhscdn.com:443/a','http://user:secret@sns-webpic-qc.xhscdn.com/a','http://sns-webpic-qc.xhscdn.com/a?token=secret','http://sns-webpic-qc.xhscdn.com/a#secret','http://sns-webpic-qc.xhscdn.com/%61','http://sns-webpic-qc.xhscdn.com/\\evil.example/a','//sns-webpic-qc.xhscdn.com/a','ftp://sns-webpic-qc.xhscdn.com/a','data:text/plain,secret'])expect(inspectXhsCover({urlDefault:raw}).url).toBeUndefined();
  expect(inspectXhsAvatar('http://sns-avatar-qc.xhscdn.com/avatar/a').url).toBeUndefined();
 });
 it('classifies rejected protocols and hosts without exposing arbitrary values; v1 records remain valid',async()=>{
  const {imageUrlClass,safeImageDiagnostics}=await import('@crm/contracts');expect(imageUrlClass('http://evil.example/private?token=secret','cover')).toEqual({protocol:'HTTP',host:'OTHER'});expect(imageUrlClass('https://sns-webpic-qn.xhscdn.com/a','cover')).toEqual({protocol:'HTTPS',host:'ALLOWED'});expect(imageUrlClass('SECRET','cover')).toEqual({protocol:'INVALID',host:'UNAVAILABLE'});
  const old={authorAvatar:{version:1,truncated:false,shape:'EMPTY',fieldCount:1,outcomes:[{reason:'EMPTY',count:1}]}};expect(safeImageDiagnostics(old)).toEqual(old);expect(safeImageDiagnostics({authorAvatar:{...old.authorAvatar,urlClasses:[{protocol:'secret',host:'OTHER',count:1}]}})).toBeUndefined();
 });
});


describe('saved-post selection: synthetic source only',()=>{
 it('bypasses all keyword search and keeps existing cancellation/budget/checkpoint behavior',async()=>{
  const adapter=new MockAdapter('XHS','BASELINE'),search=vi.spyOn(adapter,'search');
  const target=(await new MockAdapter('XHS','BASELINE').search(config.keywords[0],undefined)).items[0];
  const seen:number[]=[];
  const r=await collect(adapter,config,async()=>false,limits,async p=>{seen.push(p.posts[0]?.comments.length||0);},target);
  expect(search).not.toHaveBeenCalled();expect(r.selection).toBe('SAVED_POST');expect(r.searchAttempts).toBeUndefined();expect(r.posts).toHaveLength(1);expect(r.posts[0].post.id).toBe(target.id);expect(r.posts[0].comments).toHaveLength(4);expect(seen.at(-1)).toBe(4);
  const cancelled=await collect(adapter,config,async()=>true,limits,undefined,target);expect(cancelled.status).toBe('PAUSED');
  const exhausted=await collect(adapter,config,async()=>false,{...limits,requests:1},undefined,target);expect(exhausted.reason).toBe('BUDGET');
 });
 it('rejects wrong detail identity and does not search as a fallback',async()=>{
  const adapter=new MockAdapter('XHS','BASELINE');adapter.search=vi.fn();adapter.post=async()=>({id:'other',title:'合成'});
  const r=await collect(adapter,config,async()=>false,limits,undefined,{id:'selected',title:'合成'});expect(r.status).toBe('FAILED');expect(r.reason).toBe('INVALID_DATA');expect(adapter.search).not.toHaveBeenCalled();
 });
});
