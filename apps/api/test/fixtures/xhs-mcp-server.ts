import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
export type FixtureScenario = 'BASELINE' | 'NEW' | 'LOGIN_EXPIRED' | 'RESTRICTED' | 'RATE_LIMITED' | 'TIMEOUT' | 'MALFORMED' | 'SESSION_EXPIRED' | 'REDIRECT' | 'OVERSIZED' | 'SOURCE_UNAVAILABLE';
/** Offline JSON-RPC/Streamable HTTP fixture. It never imports platform SDKs, credentials or network clients. */
export async function startXhsFixture(options: { sse?: boolean; name?: string; missingTool?: boolean; authToken?: string } = {}) {
    const state = { scenario: 'BASELINE' as FixtureScenario, calls: [] as { name: string; args: Record<string, unknown> }[], methods: [] as string[], sessions: new Set<string>(), closed: 0, forbidden: 0 };
    const keywords = new Map<string, string>();
    const envelope = (value: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
    const server = createServer(async (req, res) => {
        if (req.url !== '/mcp' || !['POST', 'DELETE'].includes(req.method || '') || req.headers.cookie || (options.authToken ? req.headers.authorization !== `Bearer ${options.authToken}` : req.headers.authorization)) { state.forbidden++; res.writeHead(403).end(); return; }
        const session = String(req.headers['mcp-session-id'] || '');
        if (req.method === 'DELETE') { state.sessions.delete(session); keywords.delete(session); state.closed++; res.writeHead(200).end(); return; }
        let raw = ''; for await (const chunk of req) raw += String(chunk);
        const message = JSON.parse(raw); state.methods.push(message.method);
        const reply = (result: unknown) => {
            const body = JSON.stringify({ jsonrpc: '2.0', id: message.id, result });
            res.writeHead(200, { 'content-type': options.sse ? 'text/event-stream' : 'application/json' });
            res.end(options.sse ? `event: message\ndata: ${body}\n\n` : body);
        };
        if (message.method === 'initialize') {
            const id = randomUUID(); state.sessions.add(id); res.setHeader('mcp-session-id', id);
            reply({ protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: options.name || 'crm-xhs-offline-fixture', version: '1.0.0' } }); return;
        }
        if (!state.sessions.has(session)) { res.writeHead(404).end(); return; }
        if (message.method.startsWith('notifications/')) { res.writeHead(202).end(); return; }
        if (message.method === 'tools/list') {
            const names = ['check_login_status', 'search_feeds', ...(options.missingTool ? [] : ['get_feed_detail']), 'post_comment_to_feed', 'get_login_qrcode', 'list_notifications'];
            reply({ tools: names.map(name => ({ name, inputSchema: { type: 'object' } })) }); return;
        }
        if (message.method !== 'tools/call') { res.writeHead(400).end(); return; }
        const { name, arguments: args } = message.params; state.calls.push({ name, args });
        if (!['check_login_status', 'search_feeds', 'get_feed_detail'].includes(name)) { state.forbidden++; res.writeHead(403).end(); return; }
        if (state.scenario === 'SESSION_EXPIRED') { res.writeHead(404).end(); return; }
        if (state.scenario === 'RATE_LIMITED') { res.writeHead(429, { 'retry-after': '120' }).end(); return; }
        if (state.scenario === 'REDIRECT') { res.writeHead(302, { location: 'http://127.0.0.1:18060/mcp' }).end(); return; }
        if (state.scenario === 'TIMEOUT') return; // Client must abort; stop() destroys open sockets.
        if (state.scenario === 'OVERSIZED') { reply(envelope({ data: 'x'.repeat(2200000) })); return; }
        if (state.scenario === 'RESTRICTED') { reply({ isError: true, content: [{ type: 'text', text: '账号限制 fixture-private-value' }] }); return; }
        if (name === 'check_login_status') { reply({ content: [{ type: 'text', text: state.scenario === 'LOGIN_EXPIRED' ? '❌ 未登录\n请使用 get_login_qrcode' : '✅ 已登录\n用户名: 虚构离线账号' }] }); return; }
        if (name === 'search_feeds') {
            keywords.set(session, args.keyword);
            reply(envelope({ feeds: [{ id: 'offline-post', xsecToken: 'fictional-reference-never-persist', noteCard: { displayTitle: '离线 MCP 有限评论窗口' } }] })); return;
        }
        if (state.scenario === 'SOURCE_UNAVAILABLE') { reply({isError:true,content:[{type:'text',text:'笔记不存在或不可见'}]}); return; }
        const keyword = keywords.get(session) || '部署咨询';
        const comment = (id: string, content: string, subComments: unknown[] = []): unknown => ({ id, noteId: 'offline-post', content, userInfo: { userId: `user-${id}`, nickname: `离线样例 ${id}` }, subCommentCount: String(subComments.length), subComments: subComments.length ? subComments : null });
        const list = [comment('root', `请问${keyword}怎么开始？`, [comment('reply', `${keyword}相关经验`, [comment('deep', `需要${keyword}帮助`)])]), comment('excluded', `${keyword}广告`), comment('irrelevant', '无关内容')];
        if (state.scenario === 'NEW') list.push(comment('later', `求助${keyword}的后续方案`));
        if (state.scenario === 'MALFORMED') list.push({ id: 'bad', content: 'missing user' });
        reply(envelope({ feed_id: 'offline-post', data: { note: { noteId: 'offline-post', title: '离线 MCP 有限评论窗口' }, comments: { list, hasMore: true, cursor: 'unsupported-cursor-never-submit' } } }));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    if (port === 18060) { server.close(); throw new Error('Refuse protected port'); }
    return { state, url: new URL(`http://127.0.0.1:${port}/mcp`), stop: async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); } };
}
