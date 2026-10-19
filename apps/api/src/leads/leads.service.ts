import { ConflictException, Inject, Injectable, NotFoundException, BadRequestException, } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Db } from "../common/db";
import { Actor, requireAdmin, requireOwner, scope } from "../auth/security";
const include = {
    identity: true,
    owner: { select: { id: true, name: true } },
} as const;
@Injectable()
export class LeadsService {
    constructor(
    @Inject(Db)
    private db: Db) { }
    async list(actor: Actor) {
        return this.db.lead.findMany({
            where: scope(actor),
            include,
            orderBy: { createdAt: "desc" },
            take: 500,
        });
    }
    async detail(actor: Actor, id: string) {
        const lead = await this.db.lead.findFirst({
            where: { id, ...scope(actor) },
            include: {
                ...include,
                identity: {
                    include: {
                        comments: {
                            include: { post: true, matches: { select: { keywords: true, classification: true, isBaseline: true } } },
                            orderBy: { observedAt: "desc" },
                        },
                    },
                },
                followups: {
                    include: { author: { select: { name: true } } },
                    orderBy: { createdAt: "desc" },
                },
                tasks: { orderBy: { createdAt: "desc" } },
            },
        });
        if (!lead)
            throw new NotFoundException("线索不存在或无权访问");
        return lead;
    }
    async locked<T>(actor: Actor, id: string, fn: (tx: Prisma.TransactionClient, lead: {
        id: string;
        ownerId: string | null;
        version: number;
    }) => Promise<T>) {
        return this.db.$transaction(async (tx) => {
            const rows = await tx.$queryRaw<Array<{
                id: string;
                ownerId: string | null;
                version: number;
            }>> `SELECT id, "ownerId", version FROM "Lead" WHERE id=${id} FOR UPDATE`;
            if (!rows[0])
                throw new NotFoundException("线索不存在");
            requireOwner(actor, rows[0]);
            return fn(tx, rows[0]);
        });
    }
    async assign(actor: Actor, id: string, ownerId: string | null, version: number) {
        requireAdmin(actor);
        return this.locked(actor, id, async (tx, lead) => {
            if (lead.version !== version)
                throw new ConflictException("线索已更新，请刷新后重试");
            if (ownerId &&
                !(await tx.user.findFirst({
                    where: { id: ownerId, active: true, role: "SALES" },
                })))
                throw new BadRequestException("请选择有效的销售负责人");
            const result = await tx.lead.update({
                where: { id },
                data: { ownerId, version: { increment: 1 } },
                include,
            });
            await tx.auditLog.create({
                data: {
                    actorId: actor.id,
                    action: "LEAD_ASSIGNED",
                    entityId: id,
                    metadata: { from: lead.ownerId, to: ownerId },
                },
            });
            return result;
        });
    }
    async assignBatch(actor: Actor, items: {
        id: string;
        version: number;
    }[], ownerId: string | null) {
        requireAdmin(actor);
        return this.db.$transaction(async (tx) => {
            if (ownerId && !await tx.user.findFirst({ where: { id: ownerId, role: "SALES", active: true } }))
                throw new BadRequestException("请选择有效的销售负责人");
            for (const item of [...items].sort((a, b) => a.id.localeCompare(b.id))) {
                const [lead] = await tx.$queryRaw<{
                    id: string;
                    ownerId: string | null;
                    version: number;
                }[]> `SELECT id, "ownerId", version FROM "Lead" WHERE id=${item.id} FOR UPDATE`;
                if (!lead)
                    throw new NotFoundException("所选线索不存在");
                if (lead.version !== item.version)
                    throw new ConflictException("部分线索已变化，整批未保存，请刷新后重试");
                await tx.lead.update({ where: { id: item.id }, data: { ownerId, version: { increment: 1 } } });
                await tx.auditLog.create({ data: { actorId: actor.id, action: "LEAD_BATCH_ASSIGNED", entityId: item.id, metadata: { from: lead.ownerId, to: ownerId, batchSize: items.length } } });
            }
            return { updated: items.length };
        });
    }
    async review(actor: Actor, id: string, note: string, version: number) {
        return this.locked(actor, id, async (tx, lead) => {
            if (lead.version !== version)
                throw new ConflictException("线索已更新，请刷新");
            const result = await tx.lead.update({
                where: { id },
                data: {
                    reviewNote: note,
                    reviewedAt: new Date(),
                    version: { increment: 1 },
                },
            });
            await tx.auditLog.create({
                data: {
                    actorId: actor.id,
                    action: "LEAD_REVIEWED_NOT_CONSENT",
                    entityId: id,
                },
            });
            return result;
        });
    }
}
