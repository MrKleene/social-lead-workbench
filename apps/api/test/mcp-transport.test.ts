import { CollectionService } from '../src/collection/service';
import { Db } from '../src/common/db';
import { CollectionQueue } from '../src/collection/queue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startXhsFixture } from './fixtures/xhs-mcp-server';
import { XhsHttpTransport } from '../src/collection/mcp/transport';
import { endpointUrl, mcpSettings, requireMcp, ReadTool } from '../src/collection/mcp/policy';
import { XhsMcpAdapter } from '../src/collection/adapters/xhs-mcp';
import { collect } from '../src/collection/collector';
import { limits } from '../src/collection/contract';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); vi.unstubAllEnvs(); });
async function setup(options = {}) {
    const fixture = await startXhsFixture(options); cleanup.push(fixture.stop);
    const transport = new XhsHttpTransport(fixture.url, 'XHS_FIXTURE'); cleanup.push(() => transport.close());
    return { ...fixture, transport, adapter: new XhsMcpAdapter(transport, true, 'XHS_FIXTURE') };
}
const signal = () => AbortSignal.timeout(2000);
const config = { name: '离线契约', platform: 'XHS' as const, mode: 'XHS_FIXTURE' as const, keywords: ['部署咨询'], excludeWords: ['广告'], batchLimit: 1, enabled: true };
describe('真实协议，仅离线端点', () => {
    it('默认关闭，配置检查不发网络请求', () => {
        expect(mcpSettings({})).toEqual({ enabled: false, reason: 'REAL_DISABLED' });
        vi.stubEnv('XHS_MCP_ENABLED', '0'); expect(() => requireMcp('XHS_MCP')).toThrow('REAL_DISABLED');
    });
    it.each(['http://localhost:22222/mcp','http://127.0.0.1:18060/mcp','http://127.0.0.1:18061/mcp','http://127.0.0.1:80/mcp','http://127.0.0.1:65536/mcp','http://127.1:22222/mcp','http://2130706433:22222/mcp','http://user:pass@127.0.0.1:22222/mcp','http://127.0.0.1:22222/mcp?token=x','https://127.0.0.1:22222/mcp','http://169.254.169.254:22222/mcp','http://127.0.0.1:22222/other'])('拒绝不安全端点 %s', url => { expect(() => endpointUrl(url)).toThrow('ENDPOINT_INVALID'); });
    it.each([false,true])('初始化、工具发现、搜索、嵌套回复和释放会话（SSE=%s）', async sse => {
        const f = await setup({ sse });
        const result = await collect(f.adapter, config, async () => false);
        expect(result).toMatchObject({ status: 'PARTIAL', reason: 'MCP_WINDOW_ONLY' });
        expect(result.posts[0]).toMatchObject({ windowRead: true, complete: false });
        expect(result.posts[0].comments).toHaveLength(5);
        expect(result.posts[0].comments.find(c => c.id === 'fixture-xhs-deep')?.parentId).toBe('fixture-xhs-reply');
        expect(f.state.calls.map(c => c.name)).toEqual(['check_login_status', 'search_feeds', 'get_feed_detail']);
        expect(f.state.calls[2].args).toEqual({ feed_id: 'offline-post', xsec_token: 'fictional-reference-never-persist', load_all_comments: false, click_more_replies: false });
        expect(JSON.stringify(result)).not.toContain('fictional-reference');
        await f.adapter.close(); expect(f.state.sessions.size).toBe(0); expect(f.state.forbidden).toBe(0);
    });
    it('广告发现的工具也不能扩展调用白名单', async () => {
        const f = await setup(); await f.transport.connect(signal());
        for (const name of ['post_comment_to_feed','get_login_qrcode','list_notifications']) await expect(f.transport.call(name as ReadTool, {}, signal())).rejects.toMatchObject({ code: 'UNSUPPORTED' });
        await expect(f.transport.call('get_feed_detail', { feed_id:'p',xsec_token:'x',load_all_comments:true },signal())).rejects.toMatchObject({code:'INVALID_DATA'});
        expect(f.state.calls).toHaveLength(0);
    });
    it.each([{ name: 'unexpected-real-server' }, { missingTool: true }])('服务器身份/缺失工具不进入读取 %s', async options => {
        const f = await setup(options);
        await expect(f.adapter.prepare(signal())).rejects.toMatchObject({ code: options.name ? 'PROFILE_MISMATCH' : 'MCP_TOOLS_MISSING' });
        expect(f.state.calls).toHaveLength(0);
    });
    it.each([['LOGIN_EXPIRED','LOGIN_EXPIRED'],['RESTRICTED','RESTRICTED'],['RATE_LIMITED','RATE_LIMITED'],['SESSION_EXPIRED','MCP_SESSION_EXPIRED'],['REDIRECT','MCP_PROTOCOL'],['MALFORMED','INVALID_DATA'],['SOURCE_UNAVAILABLE','SOURCE_UNAVAILABLE']])('异常 %s 安全分类为 %s', async (scenario, code) => {
        const f = await setup(); f.state.scenario = scenario as typeof f.state.scenario;
        const result = await collect(f.adapter, config, async () => false);
        expect(result.reason).toBe(code); expect(result.status).toBe('FAILED'); expect(result.posts).toHaveLength(0);
        expect(JSON.stringify(result)).not.toContain('fixture-private-value');
        if (scenario === 'RATE_LIMITED') expect(result.retryAfterMs).toBe(120000);
    });
    it('大响应有大小上限且不会继续解析或泄漏正文', async () => { const f = await setup(); f.state.scenario = 'OVERSIZED'; const result = await collect(f.adapter, config, async () => false); expect(result.status).toBe('FAILED'); expect(result.posts).toHaveLength(0); expect(JSON.stringify(result).length).toBeLessThan(300); });
    it('挂起读取超时，不自行重试', async () => {
        const f = await setup(); f.state.scenario = 'TIMEOUT';
        const result = await collect(f.adapter, config, async () => false, { ...limits, callMs: 80 });
        expect(result.reason).toBe('TIMEOUT'); expect(f.state.calls).toHaveLength(1);
    });
    it('运行中暂停会中止读取且不产生来源', async () => {
        const f = await setup(); f.state.scenario = 'TIMEOUT'; let paused = false;
        const timer = setTimeout(() => paused = true, 40);
        try { const result = await collect(f.adapter, config, async () => paused); expect(result.status).toBe('PAUSED'); expect(result.posts).toHaveLength(0); }
        finally { clearTimeout(timer); }
    });
    it('预算包含建立会话，缺失完整窗口不建立起点', async () => {
        const f = await setup(); const result = await collect(f.adapter, config, async () => false, { ...limits, requests: 2 });
        expect(result.reason).toBe('BUDGET'); expect(result.posts).toHaveLength(0); expect(f.state.calls.map(c => c.name)).toEqual(['check_login_status','search_feeds']);
    });
});


describe('独立登录验证环境：仅离线验证', () => {
    it('即使入口或worker被直接调用，也在访问数据库/队列前拒绝采集', async () => {
        vi.stubEnv('XHS_MCP_LOGIN_ONLY', '1');
        const transaction = vi.fn(), enqueue = vi.fn();
        const service = new CollectionService({ $transaction: transaction } as unknown as Db, { enqueue } as unknown as CollectionQueue);
        const actor = { id: 'offline-admin', role: 'ADMIN' as const, name: '离线管理员', email: 'admin@offline.invalid' };
        await expect(service.start(actor, 'offline-config', 'BASELINE', 'offline-request')).rejects.toThrow('采集已禁用');
        await expect(service.create(actor, config)).rejects.toThrow('采集已禁用');
        await expect(service.execute('offline-run')).rejects.toMatchObject({ code: 'REAL_DISABLED' });
        expect(transaction).not.toHaveBeenCalled(); expect(enqueue).not.toHaveBeenCalled();
    });
    it('只允许登录状态；搜索、详情、二维码、发送全部拒绝', async () => {
        vi.stubEnv('XHS_MCP_LOGIN_ONLY', '1');
        const f = await setup(); await f.adapter.prepare(signal());
        for (const name of ['search_feeds','get_feed_detail','get_login_qrcode','post_comment_to_feed']) {
            await expect(f.transport.call(name as ReadTool, {}, signal())).rejects.toMatchObject({code:'UNSUPPORTED'});
        }
        expect(f.state.calls.map(c => c.name)).toEqual(['check_login_status']);
    });
    it('只向锁定的真实模式loopback端点加入一次性传输鉴权；不污染响应', async () => {
        vi.stubEnv('XHS_MCP_LOGIN_ONLY', '1'); vi.stubEnv('XHS_MCP_AUTH_TOKEN', 'a'.repeat(64));
        const f = await startXhsFixture({ authToken: 'a'.repeat(64) }); cleanup.push(f.stop);
        const originalFetch = globalThis.fetch, observed: string[] = [];
        const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
            observed.push(new Headers(init?.headers).get('authorization') || '');
            return originalFetch(input, init);
        });
        try {
            expect(() => new XhsHttpTransport(f.url,'XHS_FIXTURE')).toThrow('UNSUPPORTED');
            const transport = new XhsHttpTransport(f.url,'XHS_MCP');
            try { await transport.connect(signal()); const result = await transport.call('check_login_status',{},signal()); expect(JSON.stringify(result)).not.toContain('a'.repeat(64)); }
            finally { await transport.close(); }
            expect(observed.length).toBeGreaterThan(0); expect(observed.every(value => value === `Bearer ${'a'.repeat(64)}`)).toBe(true);
        } finally { spy.mockRestore(); }
    });
});

describe('owned account transport contract',()=>{
 it('accepts only explicit owned bearer, retains read-only allowlist and hides payload tokens',async()=>{
  const token='a'.repeat(64),fixture=await startXhsFixture({authToken:token});cleanup.push(fixture.stop);
  vi.stubEnv('XHS_MCP_AUTH_TOKEN','');vi.stubEnv('XHS_MCP_LOGIN_ONLY','0');
  const transport=new XhsHttpTransport(fixture.url,'XHS_MCP',{token,callMs:3000});cleanup.push(()=>transport.close());
  const adapter=new XhsMcpAdapter(transport,true,'XHS_MCP');
  const result=await collect(adapter,{...config,mode:'XHS_MCP'},async()=>false);
  expect(result.status).toBe('PARTIAL');expect(result.posts[0].comments[0].userId).toBe('user-root');
  for(const name of ['post_comment_to_feed','reply_comment_in_feed','send_message','get_login_qrcode','delete_cookies'])await expect(transport.call(name as ReadTool,{},signal())).rejects.toMatchObject({code:'UNSUPPORTED'});
  expect(fixture.state.forbidden).toBe(0);expect(JSON.stringify(result)).not.toContain('fictional-reference');
 });
});

describe('owned transport deadlines',()=>{
 it('reports bounded SDK timeout without retry or exposing server text',async()=>{
  const token='b'.repeat(64),fixture=await startXhsFixture({authToken:token});cleanup.push(fixture.stop);
  const transport=new XhsHttpTransport(fixture.url,'XHS_MCP',{token,callMs:30});cleanup.push(()=>transport.close());
  await transport.connect(signal());fixture.state.scenario='TIMEOUT';
  await expect(transport.call('search_feeds',{keyword:'无偿选题'},signal())).rejects.toMatchObject({code:'TIMEOUT'});
  expect(fixture.state.calls).toHaveLength(1);
 });
});
