import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Optional, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { CollectionConfig, Prisma } from "@prisma/client";
import { Db } from "../common/db";
import { Actor, requireAdmin } from "../auth/security";
import { ConfigInput, Scenario, configInput, ReadAdapter, ReadFailure } from "./contract";
import { CollectionQueue } from "./queue";
import { MockAdapter } from "./adapters/mock";
import { XhsMcpAdapter } from "./adapters/xhs-mcp";
import { XhsHttpTransport } from "./mcp/transport";
import { accountReadMode, loginCheckOnly, mcpSettings, requireMcp } from "./mcp/policy";
import { AccountReadService } from "./account-read.service";
import { collect } from "./collector";
import { commitRead } from "./ingestion";
@Injectable()
export class CollectionService {
    constructor(
    @Inject(Db)
    private db: Db, 
    @Inject(CollectionQueue)
    private queue: CollectionQueue, @Optional() @Inject(AccountReadService) private accountReads?: AccountReadService) { }
    private probeBusy = false;
    private gate(mode: string) {
        if(accountReadMode() && mode === accountReadMode()) return;
        if (loginCheckOnly() && !(process.env.CRM_PERSISTENT === "1" && mode === "MOCK")) throw new ForbiddenException("当前为登录状态验证环境，采集已禁用");
        if (mode === "MOCK") return;
        try { requireMcp(mode); } catch (error) { const code = error instanceof ReadFailure ? error.code : "REAL_DISABLED";
            throw new ForbiddenException(`${code}：只读采集未开放或服务端模式不符，请管理员检查配置`); }
    }
    async readiness(actor: Actor) {
        requireAdmin(actor);
        if(accountReadMode() && this.accountReads) return this.accountReads.readiness(actor);
        const settings = mcpSettings();
        const last = await this.db.auditLog.findFirst({ where: { action: { in: ["MCP_READINESS_CHECK", "MCP_READINESS_STARTED"] } }, orderBy: { createdAt: "desc" }, select: { createdAt: true, metadata: true } });
        return { enabled: settings.enabled, mode: settings.enabled ? settings.mode : null, reason: settings.enabled ? "UNVERIFIED" : settings.reason, lastCheck: last, loginOnly: loginCheckOnly(), configurationOnly: process.env.CRM_PERSISTENT === "1", tools: loginCheckOnly() ? ["check_login_status"] : ["check_login_status", "search_feeds", "get_feed_detail"], coverage: "WINDOW_ONLY", automaticPolling: false };
    }
    async checkReadiness(actor: Actor) {
        requireAdmin(actor);
        if(accountReadMode() && this.accountReads) return this.accountReads.readiness(actor);
        const settings = mcpSettings();
        if (!settings.enabled) throw new ForbiddenException(settings.reason);
        if (this.probeBusy) throw new ConflictException("检查正在进行，请稍后查看状态");
        const probe = await this.db.$transaction(async tx => {
            // Serialize probes across API processes; a crashed probe's lease expires without a scheduler.
            await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(1833724485)`;
            const last = await tx.auditLog.findFirst({ where: { action: { in: ["MCP_READINESS_CHECK", "MCP_READINESS_STARTED"] } }, orderBy: { createdAt: "desc" } });
            const metadata = last?.metadata as { nextAllowedAt?: string } | null;
            if (metadata?.nextAllowedAt && new Date(metadata.nextAllowedAt) > new Date()) throw new ConflictException("检查退避中，请在允许时间后手动重试");
            return tx.auditLog.create({ data: { actorId: actor.id, action: "MCP_READINESS_STARTED", entityId: "xhs-readonly", metadata: { mode: settings.mode, reason: "CHECKING", nextAllowedAt: new Date(Date.now() + 30000).toISOString() } } });
        });
        this.probeBusy = true;
        const reader = new XhsMcpAdapter(new XhsHttpTransport(settings.url, settings.mode), true, settings.mode);
        let reason = "READY", retryAfterMs = 30000;
        try { await reader.prepare(AbortSignal.timeout(3000)); }
        catch (error) { reason = error instanceof ReadFailure ? error.code : "INVALID_DATA"; if (error instanceof ReadFailure) retryAfterMs = Math.max(retryAfterMs, error.retryAfterMs || 0); }
        finally { await reader.close(); this.probeBusy = false; }
        await this.db.auditLog.create({ data: { actorId: actor.id, action: "MCP_READINESS_CHECK", entityId: "xhs-readonly", metadata: { probeId: probe.id, mode: settings.mode, reason, nextAllowedAt: new Date(Date.now() + retryAfterMs).toISOString() } } });
        return this.readiness(actor);
    }
    list(actor: Actor) { requireAdmin(actor); return this.db.collectionConfig.findMany({ where: { archivedAt: null }, include: { runs: { take: 1, orderBy: { createdAt: "desc" } } }, orderBy: { createdAt: "desc" }, take: 100 }); }
    async detail(actor: Actor, id: string) { requireAdmin(actor); const config = await this.db.collectionConfig.findUnique({ where: { id }, include: { runs: { orderBy: { createdAt: "desc" }, take: 20 }, matches: { orderBy: { createdAt: "desc" }, take: 50, include: { comment: { include: { post: true, identity: { include: { lead: { select: { id: true } } } } } } } }, monitors: { take: 10, orderBy: { id: "desc" }, include: { observations: { take: 100, orderBy: { lastSeenAt: "desc" } } } } } }); if (!config)
        throw new NotFoundException(); return config; }
    async create(actor: Actor, input: ConfigInput) { requireAdmin(actor); input = configInput.parse(input); if(accountReadMode() && input.mode !== "MOCK" && input.batchLimit>3) throw new BadRequestException("本轮最多3篇帖子"); this.gate(input.mode); return this.db.$transaction(async (tx) => { const count = await tx.collectionConfig.count({ where: { archivedAt: null } }); if (count >= 100)
        throw new BadRequestException("最多100组配置"); if (input.defaultReplyTemplateId && !await tx.replyTemplate.findUnique({ where: { id: input.defaultReplyTemplateId } })) throw new BadRequestException("默认话术不存在，请重新选择"); const config = await tx.collectionConfig.create({ data: {...input,commentRules:input.commentRules||Prisma.DbNull} }); await tx.auditLog.create({ data: { actorId: actor.id, action: "COLLECTION_CONFIG_CREATED", entityId: config.id } }); return config; }); }
    async change(actor: Actor, id: string, data: Partial<ConfigInput> & {
        archivedAt?: Date;
    }, revision: number, reset: boolean) {
        requireAdmin(actor);
        if(accountReadMode() && data.batchLimit && data.batchLimit>3 && data.mode!=="MOCK")throw new BadRequestException("本轮最多3篇帖子");
        return this.db.$transaction(async (tx) => {
            const [current] = await tx.$queryRaw<CollectionConfig[]> `SELECT * FROM "CollectionConfig" WHERE id=${id} FOR UPDATE`;
            if (!current || current.archivedAt)
                throw new NotFoundException();
            if (current.revision !== revision)
                throw new ConflictException("配置已变化，请刷新");
            if (reset || data.enabled === true) this.gate(data.mode || current.mode);
            if (reset && current.activeRunId)
                throw new ConflictException("请先暂停当前运行再编辑");
            if (data.defaultReplyTemplateId && !await tx.replyTemplate.findUnique({ where: { id: data.defaultReplyTemplateId } })) throw new BadRequestException("默认话术不存在，请重新选择");
            const config = await tx.collectionConfig.update({ where: { id }, data: { ...data, commentRules:data.commentRules===undefined?undefined:data.commentRules||Prisma.DbNull, ...(data.archivedAt ? { defaultReplyTemplateId: null } : {}), ...(reset ? { revision: { increment: 1 } } : {}), ...(data.enabled ? { pauseReason: null } : {}), ...(data.enabled === false ? { activeRunId: null } : {}) } });
            if (data.enabled === false)
                await tx.collectionRun.updateMany({ where: { configId: id, status: { in: ["QUEUED", "RUNNING"] } }, data: { cancelRequested: true, status: "PAUSED", reason: "CONFIG_PAUSED", finishedAt: new Date() } });
            await tx.auditLog.create({ data: { actorId: actor.id, action: data.archivedAt ? "COLLECTION_CONFIG_ARCHIVED" : reset ? "COLLECTION_CONFIG_UPDATED" : "COLLECTION_CONFIG_TOGGLED", entityId: id, metadata: { revision: config.revision, enabled: config.enabled } } });
            return config;
        });
    }
    async start(actor: Actor, id: string, scenario: Scenario, requestKey: string, mode: ConfigInput["mode"] = "MOCK", accountId?:string, consent?:string) {
        requireAdmin(actor);
        if (loginCheckOnly() && !accountReadMode()) throw new ForbiddenException("当前为登录状态验证环境，采集已禁用");
        const run = await this.db.$transaction(async (tx) => {
            const [config] = await tx.$queryRaw<CollectionConfig[]> `SELECT * FROM "CollectionConfig" WHERE id=${id} FOR UPDATE`;
            if (!config || config.archivedAt)
                throw new NotFoundException();
            this.gate(config.mode);
            if (config.mode !== mode) throw new BadRequestException("采集模式与配置不一致");
            if ((mode === "MOCK") === (scenario === "READ_WINDOW")) throw new BadRequestException("场景与采集模式不一致");
            const old = await tx.collectionRun.findUnique({ where: { requestKey } });
            if (old) {
                if (old.configId !== id || old.scenario !== scenario || (old.execution as {accountId?:string;actorId?:string}|null)?.accountId !== accountId || (old.execution && (old.execution as {actorId:string}).actorId !== actor.id))
                    throw new ConflictException("请求键冲突");
                return { ...old, reused: true };
            }
            if (!config.enabled)
                throw new ConflictException("配置已暂停");
            if (config.nextAllowedAt && config.nextAllowedAt > new Date())
                throw new ConflictException("退避期间，请稍后手动重试");
            if (config.activeRunId)
                throw new ConflictException("已有运行，完成或暂停后再试");
            const snapshot = configInput.parse({ name: config.name, platform: config.platform, mode: config.mode, commentRules:config.commentRules, keywords: config.keywords, excludeWords: config.excludeWords, batchLimit: config.batchLimit, enabled: config.enabled });
            if(accountReadMode() && mode !== 'MOCK' && snapshot.batchLimit>3)throw new BadRequestException('本轮最多3篇帖子');
            const execution=accountReadMode() && mode !== 'MOCK' ? await this.accountReads!.authorize(tx,actor,mode,accountId,consent) : undefined;
            const created = await tx.collectionRun.create({ data: { configId: id, revision: config.revision, snapshot, scenario, requestKey, ...(execution?{execution}:{}) } });
            await tx.collectionConfig.update({ where: { id }, data: { activeRunId: created.id } });
            await tx.auditLog.create({ data: { actorId: actor.id, action: config.mode === "MOCK" ? "COLLECTION_REQUESTED_MOCK" : "COLLECTION_REQUESTED_MCP", entityId: created.id, metadata: { configId: id, scenario, mode: config.mode } } });
            return { ...created, reused: false };
        });
        if (!run.reused)
            try {
                await this.queue.enqueue(run.id, mode === "MOCK" ? "MOCK_READ" : "XHS_READ");
            }
            catch {
                await this.db.$transaction([this.db.collectionRun.update({ where: { id: run.id }, data: { status: "FAILED", reason: "QUEUE_UNAVAILABLE", finishedAt: new Date() } }), this.db.collectionConfig.updateMany({ where: { id, activeRunId: run.id }, data: { activeRunId: null, nextAllowedAt: new Date(Date.now() + 30000) } })]);
                throw new ServiceUnavailableException("采集队列不可用，30秒后可重试");
            }
        return run;
    }
    async pauseRun(actor: Actor, id: string) {
        requireAdmin(actor);
        const run = await this.db.collectionRun.findUnique({ where: { id } });
        if (!run)
            throw new NotFoundException();
        return this.db.$transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM "CollectionConfig" WHERE id=${run.configId} FOR UPDATE`;
            const current = await tx.collectionRun.findUniqueOrThrow({ where: { id } });
            if (!["QUEUED", "RUNNING"].includes(current.status))
                return current;
            const paused = await tx.collectionRun.update({ where: { id }, data: { cancelRequested: true, status: "PAUSED", reason: "MANUAL_PAUSE", finishedAt: new Date() } });
            await tx.collectionConfig.update({ where: { id: run.configId }, data: { activeRunId: null } });
            await tx.auditLog.create({ data: { actorId: actor.id, action: "COLLECTION_PAUSED", entityId: id } });
            return paused;
        });
    }
    /** Queue redelivery is safe: only QUEUED claims are accepted. Stale jobs can be explicitly paused then retried. */
    async execute(id: string, adapter?: ReadAdapter) {
        if (loginCheckOnly() && !accountReadMode()) throw new ReadFailure("REAL_DISABLED");
        const claim = await this.db.collectionRun.updateMany({ where: { id, status: "QUEUED", cancelRequested: false }, data: { status: "RUNNING", startedAt: new Date() } });
        if (!claim.count)
            return;
        const run = await this.db.collectionRun.findUniqueOrThrow({ where: { id } });
        let reader: ReadAdapter | undefined;
        let owned: Awaited<ReturnType<AccountReadService['open']>> | undefined;
        const cancelled=async()=>{const config=await this.db.collectionConfig.findUniqueOrThrow({where:{id:run.configId}}),fresh=await this.db.collectionRun.findUniqueOrThrow({where:{id}});return !config.enabled||!!config.archivedAt||config.revision!==run.revision||fresh.cancelRequested||fresh.status!=='RUNNING';};
        try {
            const spec = configInput.parse(run.snapshot);
            if (adapter && (adapter.mode !== spec.mode || adapter.platform !== spec.platform))
                throw new ReadFailure("REAL_DISABLED");
            if (spec.mode === "MOCK") reader = adapter || new MockAdapter(spec.platform, run.scenario as Scenario);
            else if(accountReadMode()) {
                if(adapter||!this.accountReads||spec.mode!==accountReadMode()||spec.batchLimit>3)throw new ReadFailure('REAL_DISABLED');
                owned=await this.accountReads.open(run.execution,cancelled);reader=owned.reader;
            }
            else { if(run.execution)throw new ReadFailure('REAL_DISABLED'); const settings = requireMcp(spec.mode); reader = adapter || new XhsMcpAdapter(new XhsHttpTransport(settings.url, settings.mode), true, settings.mode); }
            const result = await collect(reader, spec, async () => { if(owned)await owned.check(); else if(spec.mode!=="MOCK")requireMcp(spec.mode);return cancelled(); }, owned?{requests:32,pagesPerStream:1,comments:100,callMs:40000,runMs:150000}:undefined, async progress=>{await this.db.collectionRun.updateMany({where:{id,status:'RUNNING'},data:{requests:progress.requests,observed:progress.posts.reduce((n,p)=>n+p.comments.length,0)}});});
            if(owned && result.status==='FAILED'){result.discarded=result.discarded||result.posts.length>0;result.posts=[];}
            const finished=await commitRead(this.db, run, result,owned?.commitGuard);
            if(owned)await this.accountReads!.failure(run.execution,result.reason);
            return finished;
        }
        catch (error) {
            const reason=error instanceof ReadFailure?error.code:"INVALID_DATA";
            const failed=await commitRead(this.db, run, { posts: [], requests: 0, status: "FAILED", reason });
            if(run.execution)await this.accountReads?.failure(run.execution,reason);
            return failed;
        } finally { if(owned)await owned.close();else await reader?.close?.(); }
    }
}
