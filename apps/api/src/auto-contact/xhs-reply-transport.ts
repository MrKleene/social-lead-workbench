import {replyJournalProtocol,type ExecutionRecorder,type ReplyJournal} from './reply-stage-journal';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { endpointUrl } from '../collection/mcp/policy';
import { prepareXhsReply, verifyXhsReplyResult, replyResultDiagnostic, XHS_REPLY_PROTOCOL, type XhsReplyBinding, type XhsReplyCommand } from './xhs-reply-protocol';
import type { SendRequest, SendResult } from './contact-sender';

export type OwnedReplyEndpoint = {
    url: URL; token: string; accountId: string; binarySha256: string;
    /** Stop the owned MCP/browser process group and confirm it exited. Never signal stored PIDs. */
    stop(): Promise<boolean>;
    readJournal?(attemptId:string):Promise<ReplyJournal>;
    diagnostics?():{categories:('PANIC'|'TIMEOUT'|'BROWSER_DISCONNECTED'|'OTHER')[];truncated:boolean};
};
const capabilitySchema = z.object({
    stageJournal:z.literal(replyJournalProtocol).optional(),
    protocol: z.literal(XHS_REPLY_PROTOCOL), enabled: z.boolean(), exactTarget: z.literal(true),
    cancellation: z.literal('context-and-owned-stop'), receiptMode: z.literal('FAIL_CLOSED'),
    confirmedResponseMapping: z.boolean(), channels: z.tuple([z.literal('COMMENT')]),
    sendTool: z.literal('workbench_reply_exact'), statusTool: z.literal('workbench_reply_status'),
}).strict();
const tools = ['workbench_reply_capabilities', 'workbench_reply_exact', 'workbench_reply_status'] as const;
const blocked = (): SendResult => ({ kind: 'BLOCKED', reason: 'STOP_UNCONFIRMED' });
const unknown = (): SendResult => ({ kind: 'UNKNOWN', reason: '本次发送或回执未确认，不重试、不换号' });
/** Separate finite send transport; never expands the collection/read allowlist.
 * Only server-owned endpoints and an explicitly reviewed hash can be supplied.
 * Missing enable flag, hash approval or new protocol keeps this UNAVAILABLE. */
export class XhsExactReplyTransport {
    private client = new Client({ name: 'crm-xhs-exact-reply', version: '1.0.0' }, { capabilities: {} });
    private wire: StreamableHTTPClientTransport;
    private operation?: AbortSignal;
    private lifetime = new AbortController();
    private ready = false;
    private confirmedMapping = false;
    private journalSupported=false;
    private started = false;
    private risk?: 'RATE_LIMITED' | 'PLATFORM_REFUSED';
    private used = false;
    private stopping?: Promise<boolean>;
    private requestCount = 0;
    private permittedCall?: { name: typeof tools[number]; arguments: Record<string, unknown> };
    constructor(private owned: OwnedReplyEndpoint, private approval: { enabled?: boolean; reviewedSha256?: string; requireJournal?:boolean; requireConfirmedMapping?:boolean } = {}) {
        const endpoint = endpointUrl(owned.url.href).href;
        if (!/^[a-f0-9]{64}$/.test(owned.token)) throw Error('REPLY_ENDPOINT_AUTH_INVALID');
        this.wire = new StreamableHTTPClientTransport(new URL(endpoint), {
            requestInit: { redirect: 'error', credentials: 'omit' },
            reconnectionOptions: { maxRetries: 0, initialReconnectionDelay: 1000, maxReconnectionDelay: 1000, reconnectionDelayGrowFactor: 1 },
            fetch: async (input, init) => {
                if (String(input) !== endpoint || ++this.requestCount > 16) throw Error('REPLY_REQUEST_BOUNDARY');
                if (init?.method === 'GET') return new Response(null, { status: 405 });
                if (!['POST', 'DELETE'].includes(init?.method ?? '')) throw Error('REPLY_METHOD_DENIED');
                const headers = new Headers(init?.headers);
                if (headers.has('cookie') || headers.has('authorization')) throw Error('REPLY_AUTH_OVERRIDE');
                headers.set('authorization', `Bearer ${owned.token}`);
                if (init?.method === 'POST') {
                    const rpc = JSON.parse(String(init.body));
                    if (!['initialize', 'notifications/initialized', 'tools/list', 'tools/call', 'notifications/cancelled'].includes(rpc.method)) throw Error('REPLY_RPC_DENIED');
                    if (rpc.method === 'tools/call' && (!this.permittedCall || rpc.params?.name !== this.permittedCall.name || JSON.stringify(rpc.params.arguments) !== JSON.stringify(this.permittedCall.arguments))) throw Error('REPLY_TOOL_DENIED');
                }
                const signal = AbortSignal.any([this.lifetime.signal, this.operation ?? AbortSignal.timeout(3000), ...(init?.signal ? [init.signal] : [])]);
                const response = await fetch(endpoint, { ...init, headers, signal, redirect: 'error', credentials: 'omit' });
                if (response.status === 429) { this.risk = 'RATE_LIMITED'; throw Error('REPLY_RATE_LIMITED'); }
                if (response.status === 403) { this.risk = 'PLATFORM_REFUSED'; throw Error('REPLY_PLATFORM_REFUSED'); }
                if (!response.ok && response.status !== 202) throw Error('REPLY_HTTP_FAILURE');
                let size = 0;
                const body = response.body?.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) { size += chunk.byteLength; if (size > 65536) throw Error('REPLY_RESPONSE_TOO_LARGE'); controller.enqueue(chunk); } }));
                return new Response(body, { status: response.status, headers: response.headers });
            },
        });
    }
    connectionFailure(): SendResult { return this.risk ? { kind: 'RISK', reason: this.risk } : { kind: 'FAILED', reason: '新发送协议未就绪，未提交' }; }
    capability() { return this.ready && !this.used; }
    async connect(signal: AbortSignal): Promise<boolean> {
        if (this.used || this.started) return this.capability();
        if (this.approval.enabled !== true || !/^[a-f0-9]{64}$/.test(this.approval.reviewedSha256 ?? '') || this.approval.reviewedSha256 !== this.owned.binarySha256) return false;
        this.started = true;
        this.operation = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
        try {
            await this.client.connect(this.wire, { signal: this.operation, timeout: 3000 });
            if (this.client.getServerVersion()?.name !== 'xiaohongshu-mcp') throw Error('REPLY_PROFILE_MISMATCH');
            const listed = await this.client.listTools({}, { signal: this.operation, timeout: 3000 });
            if (listed.nextCursor || tools.some(name => !listed.tools.some(t => t.name === name))) return false;
            const caps = capabilitySchema.safeParse(await this.call('workbench_reply_capabilities', {}, this.operation));
            this.journalSupported=caps.success&&caps.data.stageJournal===replyJournalProtocol;
            this.ready = caps.success && caps.data.enabled && (!this.approval.requireJournal || (this.journalSupported && !!this.owned.readJournal));
            this.confirmedMapping = caps.success && caps.data.confirmedResponseMapping;
            if(this.approval.requireConfirmedMapping && !this.confirmedMapping) this.ready=false;
            return this.ready;
        } catch { return false; }
        finally { this.operation = undefined; }
    }
    private async call(name: typeof tools[number], args: Record<string, unknown>, signal: AbortSignal) {
        this.permittedCall = { name, arguments: args }; this.operation = signal;
        try {
            const result = await this.client.callTool(this.permittedCall, CallToolResultSchema, { signal, timeout: 45000 });
            if (result.isError || !result.structuredContent) throw Error('REPLY_STRUCTURED_RESULT_REQUIRED');
            return result.structuredContent;
        } finally { this.permittedCall = undefined; this.operation = undefined; }
    }
    /** One attempt per owned process. Timeout, disconnect and close never retry send. */
    async send(request: SendRequest, binding: XhsReplyBinding, signal: AbortSignal, record?:ExecutionRecorder): Promise<SendResult> {
        if (!this.capability() || request.accountId !== this.owned.accountId) throw Error('SENDER_UNAVAILABLE');
        const command = prepareXhsReply(request, binding); this.used = true;
        const combined = AbortSignal.any([signal, AbortSignal.timeout(45000)]);
        const cancel = () => { void this.stop(); }; combined.addEventListener('abort', cancel, { once: true });
        let raw: unknown, result: SendResult = unknown(),intentRecorded=false;
        try {
            if (combined.aborted) throw Error('REPLY_CANCELLED');
            if(this.approval.requireJournal&&!record)throw Error('JOURNAL_REQUIRED');
            if(record){await record({stage:'RPC_INTENT',protocolAttemptId:command.attemptId});intentRecorded=true;}
            if (combined.aborted) throw Error('REPLY_CANCELLED');
            raw = await this.call('workbench_reply_exact', command, combined);
            result = verifyXhsReplyResult(command, raw);
            if(record)await record({stage:'RPC_RETURNED',protocolAttemptId:command.attemptId,...replyResultDiagnostic(command,raw)});
            if (result.kind === 'CONFIRMED' && !this.confirmedMapping) result = unknown();
        } catch (error) {
            if(result.kind!=='RISK')result=unknown();
            if(record&&intentRecorded)try{await record({stage:'RPC_ERROR',protocolAttemptId:command.attemptId,code:combined.aborted?'TIMEOUT_OR_CANCELLED':error instanceof Error&&error.message==='REPLY_RATE_LIMITED'?'RATE_LIMITED':error instanceof Error&&error.message==='REPLY_PLATFORM_REFUSED'?'PLATFORM_REFUSED':'TRANSPORT_ERROR'});}catch{/* durable journal still retained; outcome remains unknown */}
            if (error instanceof Error && error.message === 'REPLY_RATE_LIMITED') result = { kind: 'RISK', reason: 'RATE_LIMITED' };
            if (error instanceof Error && error.message === 'REPLY_PLATFORM_REFUSED') result = { kind: 'RISK', reason: 'PLATFORM_REFUSED' };
        } finally { combined.removeEventListener('abort', cancel); }
        if (this.risk) result = { kind: 'RISK', reason: this.risk };
        const stopped = await this.stop();
        if(record&&intentRecorded){
            const journal=stopped&&this.owned.readJournal?await this.owned.readJournal(command.attemptId).catch(()=>({state:'INVALID' as const,records:[]})):{state:'MISSING' as const,records:[]};
            try{await record({stage:'TRANSPORT_STOP',protocolAttemptId:command.attemptId,stopped,journal,...(this.owned.diagnostics?{processDiagnostics:this.owned.diagnostics()}:{} )});}catch{if(result.kind!=='RISK')result=unknown();}
            if(this.approval.requireJournal&&journal.state!=='AVAILABLE'&&result.kind!=='RISK')result=unknown();
        }
        // Preserve risk even if shutdown is uncertain; both paths pause the workflow.
        if (!stopped && result.kind !== 'RISK') return blocked();
        return result;
    }
    /** Read-only in-memory query. A restarted MCP returns UNKNOWN; never repeats send. */
    async reconcile(command: XhsReplyCommand, signal: AbortSignal): Promise<SendResult> {
        if (!this.ready || command.accountId !== this.owned.accountId || this.used) return unknown();
        this.used = true; let result: SendResult = unknown();
        try { result = verifyXhsReplyResult(command, await this.call('workbench_reply_status', command, signal)); } catch { /* unknown */ }
        if (result.kind === 'CONFIRMED' && !this.confirmedMapping) result = unknown();
        if (!await this.stop() && result.kind !== 'RISK') return blocked(); return result;
    }
    async stop(): Promise<boolean> {
        this.ready = false; this.lifetime.abort();
        return this.stopping ??= (async () => {
            let timer: ReturnType<typeof setTimeout> | undefined;
            try { return await Promise.race([this.owned.stop(), new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 2500); })]); }
            catch { return false; }
            finally { clearTimeout(timer); void this.client.close().catch(() => {}); }
        })();
    }
}
