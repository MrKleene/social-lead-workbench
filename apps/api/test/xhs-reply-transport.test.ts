import { afterEach, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { XhsExactReplyTransport } from '../src/auto-contact/xhs-reply-transport';
import { XHS_REPLY_PROTOCOL } from '../src/auto-contact/xhs-reply-protocol';
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
const req = { platform: 'XHS', channel: 'COMMENT' as const, accountId: 'account1', requestKey: 'job:1', postId: 'b'.repeat(24), commentId: 'c'.repeat(24), recipientId: 'd'.repeat(24), content: 'synthetic-only' };
const binding = { accountId: req.accountId, senderId: 'a'.repeat(24), postReference: { postId: req.postId, token: 'synthetic', source: 'pc_feed' as const } };
const caps = { protocol: XHS_REPLY_PROTOCOL, enabled: true, exactTarget: true, cancellation: 'context-and-owned-stop', receiptMode: 'FAIL_CLOSED', confirmedResponseMapping: true, channels: ['COMMENT'], sendTool: 'workbench_reply_exact', statusTool: 'workbench_reply_status' };
async function fixture(options: { enabled?: boolean; old?: boolean; mismatch?: boolean; badHash?: boolean; result?: string; stop?: boolean; hang?: boolean; http?: number; mapping?: boolean; handshakeHttp?: number; requireConfirmedMapping?:boolean; requireJournal?:boolean; journal?:boolean; capture?:boolean; captureOnce?:boolean } = {}) {
    const calls: string[] = []; let sendCount = 0;
    const server = createServer(async (request, response) => {
        let raw = ''; for await (const b of request) raw += b;
        expect(request.headers.authorization).toBe('Bearer ' + '1'.repeat(64));
        if (request.method === 'DELETE') { response.writeHead(200).end(); return; }
        const rpc = JSON.parse(raw); calls.push(rpc.method + ':' + (rpc.params?.name ?? ''));
        if (rpc.method.startsWith('notifications/')) { response.writeHead(202).end(); return; }
        let result: unknown;
        if (rpc.method === 'initialize' && options.handshakeHttp) { response.writeHead(options.handshakeHttp).end(); return; }
        if (rpc.method === 'initialize') result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'xiaohongshu-mcp', version: 'fixture' } };
        if (rpc.method === 'tools/list') result = { tools: (options.old ? ['check_login_status'] : ['workbench_reply_capabilities', 'workbench_reply_exact', 'workbench_reply_status']).map(name => ({ name, inputSchema: { type: 'object' } })) };
        if (rpc.params?.name === 'workbench_reply_capabilities') result = { content: [], structuredContent: { ...caps, ...(options.capture?{receiptCapture:'workbench.reply-receipt-capture.v1'}:{}), ...(options.journal?{stageJournal:"workbench.reply-stage-journal.v1"}:{}), confirmedResponseMapping: options.mapping ?? true, enabled: options.enabled ?? true } };
        if (rpc.params?.name === 'workbench_reply_exact') {
            sendCount++; if (options.hang) return;
            if (options.http) { response.writeHead(options.http).end(); return; }
            const c = rpc.params.arguments;
            if(options.captureOnce)expect(c.receiptMode).toBe('CAPTURE_ONCE');
            const o = { commentId: 'e'.repeat(24), postId: c.postId, parentCommentId: options.mismatch ? 'f'.repeat(24) : c.targetCommentId, recipientId: c.recipientId, senderId: c.senderId, contentSha256: c.contentSha256 };
            const base = { protocol: c.protocol, attemptId: c.attemptId, requestKey: c.requestKey, accountId: c.accountId, processStopped: true };
            const structuredContent = options.result === 'ACCEPTED' ? { ...base, kind: 'ACCEPTED', reason: 'RECEIPT_UNCONFIRMED' } : options.result === 'RISK' ? { ...base, kind: 'RISK', reason: 'RATE_LIMITED' } : options.result === 'OLD_ACK' ? { success: true } : { ...base, kind: 'CONFIRMED', proof: 'PLATFORM_RESPONSE_AND_READBACK', response: o, readback: o, observedAfterSubmit: true };
            result = { content: [], structuredContent };
        }
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result }));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    cleanup.push(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
    const stop = vi.fn(async () => options.stop !== false);
    const endpoint = { url: new URL(`http://127.0.0.1:${(server.address() as { port: number }).port}/mcp`), token: '1'.repeat(64), accountId: req.accountId, binarySha256: '2'.repeat(64), readJournal:async()=>({state:"AVAILABLE" as const,records:[]}), stop };
    const transport = new XhsExactReplyTransport(endpoint, { enabled: true, reviewedSha256: options.badHash ? '3'.repeat(64) : '2'.repeat(64),requireConfirmedMapping:options.requireConfirmedMapping,requireJournal:options.requireJournal,captureOnce:options.captureOnce });
    cleanup.push(() => transport.stop());
    return { transport, calls, stop, endpoint, sends: () => sendCount };
}
it('default OFF and hash mismatch cause zero RPCs', async () => {
    const f = await fixture({ badHash: true }); expect(await f.transport.connect(AbortSignal.timeout(1000))).toBe(false); expect(f.calls).toEqual([]);
    const off = new XhsExactReplyTransport(f.endpoint); expect(await off.connect(AbortSignal.timeout(1000))).toBe(false); expect(f.calls).toEqual([]); await off.stop();
});
it.each([{ old: true }, { enabled: false }])('old or disabled MCP never receives a send %j', async options => {
    const f = await fixture(options); expect(await f.transport.connect(AbortSignal.timeout(2000))).toBe(false);
    await expect(f.transport.send(req, binding, AbortSignal.timeout(1000))).rejects.toThrow('SENDER_UNAVAILABLE'); expect(f.sends()).toBe(0);
});
it('negotiates exact tools and confirms only matching synthetic response/readback', async () => {
    const f = await fixture(); expect(await f.transport.connect(AbortSignal.timeout(2000))).toBe(true);
    expect(await f.transport.send(req, binding, AbortSignal.timeout(2000))).toEqual({ kind: 'CONFIRMED', receipt: 'e'.repeat(24) }); expect(f.sends()).toBe(1); expect(f.stop).toHaveBeenCalledTimes(1);
    await expect(f.transport.send(req, binding, AbortSignal.timeout(1000))).rejects.toThrow('SENDER_UNAVAILABLE'); expect(f.sends()).toBe(1);
    expect(f.calls.some(x => /post_comment_to_feed|reply_comment_in_feed/.test(x))).toBe(false);
});
it.each([{ mismatch: true }, { result: 'ACCEPTED' }, { result: 'OLD_ACK' }])('does not upgrade incomplete evidence to success %j', async options => {
    const f = await fixture(options); await f.transport.connect(AbortSignal.timeout(2000)); expect((await f.transport.send(req, binding, AbortSignal.timeout(2000))).kind).toBe('UNKNOWN'); expect(f.sends()).toBe(1);
});
it.each([{ result: 'RISK' }, { http: 429 }, { http: 403 }])('preserves platform pause %j', async options => {
    const f = await fixture(options); await f.transport.connect(AbortSignal.timeout(2000)); expect((await f.transport.send(req, binding, AbortSignal.timeout(2000))).kind).toBe('RISK'); expect(f.sends()).toBe(1);
});
it('unconfirmed shutdown blocks the workflow even after a synthetic receipt', async () => {
    const f = await fixture({ stop: false }); await f.transport.connect(AbortSignal.timeout(2000)); expect(await f.transport.send(req, binding, AbortSignal.timeout(2000))).toEqual({ kind: 'BLOCKED', reason: 'STOP_UNCONFIRMED' });
});
it('cancellation stops owned process and never retries the send', async () => {
    const f = await fixture({ hang: true }); await f.transport.connect(AbortSignal.timeout(2000)); const r = await f.transport.send(req, binding, AbortSignal.timeout(50)); expect(r.kind).toBe('UNKNOWN'); expect(f.sends()).toBe(1); expect(f.stop).toHaveBeenCalledTimes(1);
});
it('cancellation with unknown process exit remains blocked', async () => {
    const f = await fixture({ hang: true, stop: false }); await f.transport.connect(AbortSignal.timeout(2000)); expect((await f.transport.send(req, binding, AbortSignal.timeout(50))).kind).toBe('BLOCKED'); expect(f.sends()).toBe(1);
});
it('account and DM mismatch are rejected before a write', async () => {
    const f = await fixture(); await f.transport.connect(AbortSignal.timeout(2000)); await expect(f.transport.send({ ...req, accountId: 'other' }, binding, AbortSignal.timeout(1000))).rejects.toThrow(); await expect(f.transport.send({ ...req, channel: 'DM' }, binding, AbortSignal.timeout(1000))).rejects.toThrow(); expect(f.sends()).toBe(0);
});

it('candidate without reviewed response mapping cannot return CONFIRMED', async()=>{ const f=await fixture({mapping:false}); await f.transport.connect(AbortSignal.timeout(2000)); expect((await f.transport.send(req,binding,AbortSignal.timeout(2000))).kind).toBe('UNKNOWN'); });
it.each([429,403])('risk during negotiation is retained without sending: %s',async handshakeHttp=>{const f=await fixture({handshakeHttp});expect(await f.transport.connect(AbortSignal.timeout(2000))).toBe(false);expect(f.transport.connectionFailure().kind).toBe('RISK');expect(f.sends()).toBe(0);});

it('required durable capability blocks an old installed binary before send',async()=>{const f=await fixture({requireJournal:true});expect(await f.transport.connect(AbortSignal.timeout(2000))).toBe(false);expect(f.sends()).toBe(0);});
it('persists protocol intent then diagnostic and owned stop with no resend',async()=>{const f=await fixture({requireJournal:true,journal:true,result:'ACCEPTED'});await f.transport.connect(AbortSignal.timeout(2000));const stages:any[]=[];const r=await f.transport.send(req,binding,AbortSignal.timeout(2000),async e=>{stages.push(e);if(e.stage==='RPC_INTENT')expect(f.sends()).toBe(0);});expect(r.kind).toBe('UNKNOWN');expect(stages.map(e=>e.stage)).toEqual(['RPC_INTENT','RPC_RETURNED','TRANSPORT_STOP']);expect(stages[1]).toMatchObject({kind:'ACCEPTED',envelopeValid:true});expect(stages[2].stopped).toBe(true);expect(f.sends()).toBe(1);});
it('failed durable pre-RPC audit prevents dispatch without retry',async()=>{const f=await fixture({requireJournal:true,journal:true});await f.transport.connect(AbortSignal.timeout(2000));const r=await f.transport.send(req,binding,AbortSignal.timeout(2000),async()=>{throw Error('synthetic database unavailable')});expect(r.kind).toBe('FAILED');expect(f.sends()).toBe(0);expect(f.stop).toHaveBeenCalledTimes(1);});
it('transport cancellation persists fixed error and stop observation',async()=>{const f=await fixture({journal:true,requireJournal:true,hang:true});await f.transport.connect(AbortSignal.timeout(2000));const stages:any[]=[];const r=await f.transport.send(req,binding,AbortSignal.timeout(50),async e=>{stages.push(e)});expect(r.kind).toBe('UNKNOWN');expect(stages.map(e=>e.stage)).toEqual(['RPC_INTENT','RPC_ERROR','TRANSPORT_STOP']);expect(stages[1].code).toBe('TIMEOUT_OR_CANCELLED');expect(f.sends()).toBe(1);});
it('a failed audit cannot erase a platform risk response',async()=>{const f=await fixture({requireJournal:true,journal:true,result:'RISK'});await f.transport.connect(AbortSignal.timeout(2000));const r=await f.transport.send(req,binding,AbortSignal.timeout(2000),async e=>{if(e.stage!=='RPC_INTENT')throw Error('audit unavailable')});expect(r).toEqual({kind:'RISK',reason:'RATE_LIMITED'});expect(f.sends()).toBe(1);});

it('production mapping prerequisite blocks before protocol submit when mapping is unreviewed',async()=>{const f=await fixture({mapping:false,requireConfirmedMapping:true});expect(await f.transport.connect(AbortSignal.timeout(3000))).toBe(false);expect(f.sends()).toBe(0);await f.transport.stop();});

it('first controlled capture works without claimed mapping and cannot claim confirmation',async()=>{
 const f=await fixture({captureOnce:true,capture:true,journal:true,requireJournal:true,mapping:false});
 expect(await f.transport.connect(AbortSignal.timeout(2000))).toBe(true);
 expect((await f.transport.send(req,binding,AbortSignal.timeout(2000),async()=>{})).kind).toBe('UNKNOWN');expect(f.sends()).toBe(1);
 await expect(f.transport.send(req,binding,AbortSignal.timeout(1000),async()=>{})).rejects.toThrow();expect(f.sends()).toBe(1);
});
it.each([{capture:false,journal:true,requireJournal:true},{capture:true,journal:false,requireJournal:true},{capture:true,journal:true,requireJournal:false}])('capture refuses missing protocol/durability %j',async options=>{
 const f=await fixture({...options,captureOnce:true,mapping:false});expect(await f.transport.connect(AbortSignal.timeout(2000))).toBe(false);expect(f.sends()).toBe(0);
});

it('durable intent refusal proves zero protocol invocation, even with no process journal',async()=>{
 const f=await fixture({captureOnce:true,capture:true,journal:true,requireJournal:true,mapping:false});await f.transport.connect(AbortSignal.timeout(2000));
 const r=await f.transport.send(req,binding,AbortSignal.timeout(2000),async()=>{throw Error('synthetic concurrent restriction')});expect(r.kind).toBe('FAILED');expect(f.sends()).toBe(0);expect(f.transport.submissionInvocations()).toBe(0);expect(f.stop).toHaveBeenCalledTimes(1);
});
