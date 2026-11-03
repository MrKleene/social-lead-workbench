import { ConflictException, Inject, Injectable, NotFoundException, BadRequestException, } from "@nestjs/common";
import { ContactStage, Prisma } from "@prisma/client";
import { Db,historyDisplay } from "../common/db";
import { Actor, requireAdmin, requireOwner, scope } from "../auth/security";
const include = {
    identity: { include: { comments: { take: 8, orderBy: { observedAt: "desc" }, include: { post: true, matches: { select: { keywords: true, classification: true, isBaseline: true, assessment:true } } } } } },
    owner: { select: { id: true, name: true } },
} as const;
@Injectable()
export class LeadsService {
    constructor(
    @Inject(Db)
    private db: Db) { }
    async list(actor: Actor) {
        return historyDisplay(this.db).lead.findMany({
            where: scope(actor),
            include,
            orderBy: { createdAt: "desc" },
            take: 500,
        });
    }
    async detail(actor: Actor, id: string) {
        const lead = await historyDisplay(this.db).lead.findFirst({
            where: { id, ...scope(actor) },
            include: {
                ...include,
                identity: {
                    include: {
                        comments: {
                            include: { post: true, matches: { select: { keywords: true, classification: true, isBaseline: true, assessment:true } } },
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
    async contact(actor: Actor, id: string, stage: ContactStage, note: string | undefined, confirmed: boolean, version: number) {
        if ((stage === 'CONTACTED' || stage === 'INTERESTED') && (!confirmed || !note || note.trim().length < 5))
            throw new BadRequestException('请确认你已自行在平台联系，并记录实际沟通依据');
        return this.locked(actor, id, async (tx, lead) => {
            if (lead.version !== version) throw new ConflictException('线索已更新，请刷新');
            const previous = await tx.lead.findUniqueOrThrow({ where: { id } });
            if (previous.contactStage === stage) return previous;
            if (stage === 'INTERESTED' && previous.contactStage !== 'CONTACTED')
                throw new BadRequestException('请先记录已人工联系，再根据实际回复标记有意向');
            const contacted = stage === 'CONTACTED' || stage === 'INTERESTED';
            if(contacted && previous.doNotContact) throw new ConflictException('此线索已标为勿联系');
            const result = await tx.lead.update({ where: { id }, data: {
                contactStage: stage, contactNote: note?.trim() || null,
                ...(contacted ? { contactedAt: previous.contactedAt || new Date() } : {}),
                version: { increment: 1 },
            } });
            await tx.auditLog.create({ data: { actorId: actor.id, action: 'LEAD_CONTACT_STAGE_RECORDED', entityId: id,
                metadata: { from: previous.contactStage, to: stage, selfReportedContact: contacted, platformMessageSent: false } } });
            return result;
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
