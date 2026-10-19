import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { CollectionConfig } from "@prisma/client";
import { Db } from "../common/db";
import { Actor, requireAdmin } from "../auth/security";
import { ConfigInput, Scenario, configInput, ReadAdapter, ReadFailure } from "./contract";
import { CollectionQueue } from "./queue";
import { MockAdapter } from "./adapters/mock";
import { collect } from "./collector";
import { commitRead } from "./ingestion";
@Injectable()
export class CollectionService {
    constructor(
    @Inject(Db)
    private db: Db, 
    @Inject(CollectionQueue)
    private queue: CollectionQueue) { }
    list(actor: Actor) { requireAdmin(actor); return this.db.collectionConfig.findMany({ where: { archivedAt: null }, include: { runs: { take: 1, orderBy: { createdAt: "desc" } } }, orderBy: { createdAt: "desc" }, take: 100 }); }
    async detail(actor: Actor, id: string) { requireAdmin(actor); const config = await this.db.collectionConfig.findUnique({ where: { id }, include: { runs: { orderBy: { createdAt: "desc" }, take: 20 }, matches: { orderBy: { createdAt: "desc" }, take: 50, include: { comment: { include: { post: true, identity: { include: { lead: { select: { id: true } } } } } } } }, monitors: { take: 10, orderBy: { id: "desc" }, include: { observations: { take: 100, orderBy: { lastSeenAt: "desc" } } } } } }); if (!config)
        throw new NotFoundException(); return config; }
    async create(actor: Actor, input: ConfigInput) { requireAdmin(actor); return this.db.$transaction(async (tx) => { const count = await tx.collectionConfig.count({ where: { archivedAt: null } }); if (count >= 100)
        throw new BadRequestException("最多100组配置"); if (input.defaultReplyTemplateId && !await tx.replyTemplate.findUnique({ where: { id: input.defaultReplyTemplateId } })) throw new BadRequestException("默认话术不存在，请重新选择"); const config = await tx.collectionConfig.create({ data: input }); await tx.auditLog.create({ data: { actorId: actor.id, action: "COLLECTION_CONFIG_CREATED", entityId: config.id } }); return config; }); }
    async change(actor: Actor, id: string, data: Partial<ConfigInput> & {
        archivedAt?: Date;
    }, revision: number, reset: boolean) {
        requireAdmin(actor);
        return this.db.$transaction(async (tx) => {
            const [current] = await tx.$queryRaw<CollectionConfig[]> `SELECT * FROM "CollectionConfig" WHERE id=${id} FOR UPDATE`;
            if (!current || current.archivedAt)
                throw new NotFoundException();
            if (current.revision !== revision)
                throw new ConflictException("配置已变化，请刷新");
            if (reset && current.activeRunId)
                throw new ConflictException("请先暂停当前运行再编辑");
            if (data.defaultReplyTemplateId && !await tx.replyTemplate.findUnique({ where: { id: data.defaultReplyTemplateId } })) throw new BadRequestException("默认话术不存在，请重新选择");
            const config = await tx.collectionConfig.update({ where: { id }, data: { ...data, ...(data.archivedAt ? { defaultReplyTemplateId: null } : {}), ...(reset ? { revision: { increment: 1 } } : {}), ...(data.enabled ? { pauseReason: null } : {}), ...(data.enabled === false ? { activeRunId: null } : {}) } });
            if (data.enabled === false)
                await tx.collectionRun.updateMany({ where: { configId: id, status: { in: ["QUEUED", "RUNNING"] } }, data: { cancelRequested: true, status: "PAUSED", reason: "CONFIG_PAUSED", finishedAt: new Date() } });
            await tx.auditLog.create({ data: { actorId: actor.id, action: data.archivedAt ? "COLLECTION_CONFIG_ARCHIVED" : reset ? "COLLECTION_CONFIG_UPDATED" : "COLLECTION_CONFIG_TOGGLED", entityId: id, metadata: { revision: config.revision, enabled: config.enabled } } });
            return config;
        });
    }
    async start(actor: Actor, id: string, scenario: Scenario, requestKey: string) {
        requireAdmin(actor);
        const run = await this.db.$transaction(async (tx) => {
            const [config] = await tx.$queryRaw<CollectionConfig[]> `SELECT * FROM "CollectionConfig" WHERE id=${id} FOR UPDATE`;
            if (!config || config.archivedAt)
                throw new NotFoundException();
            if (config.mode !== "MOCK")
                throw new ForbiddenException("真实采集尚未授权，禁止运行");
            const old = await tx.collectionRun.findUnique({ where: { requestKey } });
            if (old) {
                if (old.configId !== id || old.scenario !== scenario)
                    throw new ConflictException("请求键冲突");
                return { ...old, reused: true };
            }
            if (!config.enabled)
                throw new ConflictException("配置已暂停");
            if (config.nextAllowedAt && config.nextAllowedAt > new Date())
                throw new ConflictException("退避期间，请稍后手动重试");
            if (config.activeRunId)
                throw new ConflictException("已有运行，完成或暂停后再试");
            const snapshot = configInput.parse({ name: config.name, platform: config.platform, mode: config.mode, keywords: config.keywords, excludeWords: config.excludeWords, batchLimit: config.batchLimit, enabled: config.enabled });
            const created = await tx.collectionRun.create({ data: { configId: id, revision: config.revision, snapshot, scenario, requestKey } });
            await tx.collectionConfig.update({ where: { id }, data: { activeRunId: created.id } });
            await tx.auditLog.create({ data: { actorId: actor.id, action: "COLLECTION_REQUESTED_MOCK", entityId: created.id, metadata: { configId: id, scenario } } });
            return { ...created, reused: false };
        });
        if (!run.reused)
            try {
                await this.queue.enqueue(run.id);
            }
            catch {
                await this.db.$transaction([this.db.collectionRun.update({ where: { id: run.id }, data: { status: "FAILED", reason: "QUEUE_UNAVAILABLE", finishedAt: new Date() } }), this.db.collectionConfig.updateMany({ where: { id, activeRunId: run.id }, data: { activeRunId: null, nextAllowedAt: new Date(Date.now() + 30000) } })]);
                throw new ServiceUnavailableException("模拟队列不可用，30秒后可重试");
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
        const claim = await this.db.collectionRun.updateMany({ where: { id, status: "QUEUED", cancelRequested: false }, data: { status: "RUNNING", startedAt: new Date() } });
        if (!claim.count)
            return;
        const run = await this.db.collectionRun.findUniqueOrThrow({ where: { id } });
        try {
            const spec = configInput.parse(run.snapshot);
            if (adapter && (adapter.mode !== "MOCK" || adapter.platform !== spec.platform))
                throw new ReadFailure("REAL_DISABLED");
            const reader = adapter || new MockAdapter(spec.platform, run.scenario as Scenario);
            const result = await collect(reader, spec, async () => { const config = await this.db.collectionConfig.findUniqueOrThrow({ where: { id: run.configId } }); const fresh = await this.db.collectionRun.findUniqueOrThrow({ where: { id } }); return !config.enabled || !!config.archivedAt || config.revision !== run.revision || fresh.cancelRequested; });
            return await commitRead(this.db, run, result);
        }
        catch (error) {
            return commitRead(this.db, run, { posts: [], requests: 0, status: "FAILED", reason: error instanceof ReadFailure ? error.code : "INVALID_DATA" });
        }
    }
}
