import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CallToolResultSchema, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { ReadFailure } from '../contract';
import { endpointUrl, loginCheckOnly, McpMode, ReadTool, toolArguments } from './policy';
export interface ReadOnlyMcpTransport {
  supportsBoundedComments?():boolean;
  supportsCommentContinuation?():boolean;
  connect?(signal: AbortSignal): Promise<void>;
  close?(): Promise<void>;
  call(name: ReadTool, args: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
}
/** One finite session per run/probe. No OAuth, cookies, reconnect, URL supplied by an HTTP caller, or server-push stream. */
export class XhsHttpTransport implements ReadOnlyMcpTransport {
  private client = new Client({ name: 'crm-xhs-readonly', version: '1.0.0' }, { capabilities: {} });
  private transport: StreamableHTTPClientTransport;
  private lifetime = new AbortController();
  private operation?: AbortSignal;
  private connected = false;
  private boundedComments=false;
  private commentContinuation=false;
  supportsCommentContinuation(){return this.commentContinuation;}
  supportsBoundedComments(){return this.boundedComments;}
  private requests = 0;
  private loginOnly = loginCheckOnly();
  private callMs = 3000;
  private authToken = process.env.XHS_MCP_AUTH_TOKEN || '';
  constructor(url: URL, private mode: McpMode, owned?: { token: string; callMs: number }) {
    // Only a server-owned per-account child supplies these options. Never HTTP input.
    if (owned) { this.authToken = owned.token; this.loginOnly = false; this.callMs = owned.callMs; }

    const endpoint = endpointUrl(url.href).href;
    if (this.authToken && ((!this.loginOnly && !owned) || mode !== 'XHS_MCP' || !/^[a-f0-9]{64}$/.test(this.authToken))) throw new ReadFailure('UNSUPPORTED');
    this.transport = new StreamableHTTPClientTransport(new URL(endpoint), {
      requestInit: { redirect: 'error', credentials: 'omit' },
      reconnectionOptions: { maxRetries: 0, initialReconnectionDelay: 1000, maxReconnectionDelay: 1000, reconnectionDelayGrowFactor: 1 },
      fetch: async (input, init) => {
        if (String(input) !== endpoint) throw new ReadFailure('ENDPOINT_INVALID');
        // The client does not subscribe to unsolicited events or auto-reconnect.
        if (init?.method === 'GET') return new Response(null, { status: 405 });
        if (!['POST', 'DELETE'].includes(init?.method || '')) throw new ReadFailure('UNSUPPORTED');
        if (++this.requests > 40) throw new ReadFailure('BUDGET');
        const headers = new Headers(init?.headers);
        if (headers.has('cookie') || headers.has('authorization')) throw new ReadFailure('UNSUPPORTED');
        if (this.authToken) headers.set('authorization', `Bearer ${this.authToken}`);
        if (init?.method === 'POST') {
          const body = JSON.parse(String(init.body));
          if (!['initialize', 'notifications/initialized', 'tools/list', 'tools/call', 'notifications/cancelled'].includes(body.method)) throw new ReadFailure('UNSUPPORTED');
          if (body.method === 'tools/call') this.validate(body.params.name, body.params.arguments);
        }
        const signal = AbortSignal.any([this.lifetime.signal, this.operation || AbortSignal.timeout(2000), ...(init?.signal ? [init.signal] : [])]);
        const response = await fetch(endpoint, { ...init, headers, signal, redirect: 'error', credentials: 'omit' });
        if (response.status === 429) {
          const raw = response.headers.get('retry-after');
          const ms = raw && /^\d+$/.test(raw) ? Number(raw) * 1000 : raw ? Date.parse(raw) - Date.now() : 0;
          if (ms > 86400000) throw new ReadFailure('RESTRICTED'); // Long server cooldown needs administrator review, never retry early.
          throw new ReadFailure('RATE_LIMITED', Number.isFinite(ms) && ms > 0 ? ms : undefined);
        }
        if (response.status === 401) throw new ReadFailure('LOGIN_EXPIRED');
        if (response.status === 403) throw new ReadFailure('RESTRICTED');
        if (response.status === 404 && headers.has('mcp-session-id')) throw new ReadFailure('MCP_SESSION_EXPIRED');
        if (response.status >= 300 && response.status < 400) throw new ReadFailure('ENDPOINT_INVALID');
        let size = 0;
        const body = response.body?.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) {
          size += chunk.byteLength;
          if (size > 2 * 1024 * 1024) throw new ReadFailure('INVALID_DATA');
          controller.enqueue(chunk);
        } }));
        return new Response(body, { status: response.status, headers: response.headers });
      },
    });
  }
  private validate(name: string, args: unknown) {
    if (this.loginOnly && name !== 'check_login_status') throw new ReadFailure('UNSUPPORTED');
    if (!Object.hasOwn(toolArguments, name)) throw new ReadFailure('UNSUPPORTED');
    if (!toolArguments[name as ReadTool].safeParse(args).success) throw new ReadFailure('INVALID_DATA');
  }
  private async bounded<T>(signal: AbortSignal, fn: () => Promise<T>): Promise<T> {
    this.operation = signal;
    try { return await fn(); }
    catch (error) {
      if (error instanceof ReadFailure) throw error;
      if (signal.aborted || (error instanceof McpError && error.code === ErrorCode.RequestTimeout)) throw new ReadFailure('TIMEOUT');
      // Never return SDK/server error text: it can contain URLs or response tokens.
      throw new ReadFailure('MCP_PROTOCOL');
    } finally { this.operation = undefined; }
  }
  async connect(signal: AbortSignal) {
    if (this.connected) return;
    await this.bounded(signal, async () => {
      await this.client.connect(this.transport, { signal, timeout: 3000 });
      if (this.mode === 'XHS_FIXTURE' && this.client.getServerVersion()?.name !== 'crm-xhs-offline-fixture') throw new ReadFailure('PROFILE_MISMATCH');
      const names = new Set<string>(), cursors = new Set<string>();
      let cursor: string | undefined;
      for (let page = 0; page < 4; page++) {
        const result = await this.client.listTools(cursor ? { cursor } : {}, { signal, timeout: 3000 });
        for (const tool of result.tools) {names.add(tool.name);if(tool.name==='get_feed_detail'&&tool.description?.includes('crm-bounded-comments-v1')&&Object.hasOwn(tool.inputSchema.properties||{},'read_window'))this.boundedComments=true;if(tool.name==='get_feed_detail'&&tool.description?.includes('crm-comment-continuation-v1')&&Object.hasOwn(tool.inputSchema.properties||{},'read_continuation'))this.commentContinuation=true;}
        if (!result.nextCursor) break;
        if (cursors.has(result.nextCursor) || page === 3) throw new ReadFailure('MCP_PROTOCOL');
        cursors.add(result.nextCursor); cursor = result.nextCursor;
      }
      if ((this.loginOnly ? ['check_login_status'] : Object.keys(toolArguments)).some(name => !names.has(name))) throw new ReadFailure('MCP_TOOLS_MISSING');
      this.connected = true;
    });
  }
  async call(name: ReadTool, args: Record<string, unknown>, signal: AbortSignal) {
    this.validate(name, args);
    if(name==='get_feed_detail'&&args.read_window!==undefined&&!this.boundedComments)throw new ReadFailure('UNSUPPORTED');
    if(name==='get_feed_detail'&&args.read_continuation!==undefined&&(!this.commentContinuation||args.read_window===undefined))throw new ReadFailure('UNSUPPORTED');
    if (!this.connected) throw new ReadFailure('MCP_PROTOCOL');
    return this.bounded(signal, () => this.client.callTool({ name, arguments: args }, CallToolResultSchema, { signal, timeout: this.callMs }));
  }
  async close() {
    this.operation = AbortSignal.timeout(1000);
    try { if (this.transport.sessionId) await this.transport.terminateSession(); } catch { /* session cleanup is best effort, bounded */ }
    finally { this.lifetime.abort(); await this.client.close().catch(() => {}); this.connected = false; }
  }
}
