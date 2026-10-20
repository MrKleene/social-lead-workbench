import { Controller, Get, Post, Patch, Delete, Param, Req, Inject, Module, UseGuards, NotFoundException } from "@nestjs/common";
import { z } from "zod";
import { AuthModule, AuthedRequest, SessionGuard } from "../auth/auth";
import { scope } from "../auth/security";
import { Db } from "../common/db";
import { parse } from "../common/validation";
import { LeadsModule } from "../leads/leads";
import { LeadsService } from "../leads/leads.service";
import { DevicesModule } from "../devices/devices";
import { LoginRuntime } from "../accounts/login-runtime";
import { AccountReadService } from "./account-read.service";
import { CollectionService } from "./service";
import { CollectionQueue } from "./queue";
import { configInput, scenarioSchema } from "./contract";
@Controller("collection")
@UseGuards(SessionGuard)
class CollectionController {
    constructor(
    @Inject(CollectionService)
    private service: CollectionService) { }
    @Get("mcp/readiness")
    readiness(@Req() r: AuthedRequest) { return this.service.readiness(r.actor); }
    @Post("mcp/check")
    check(@Req() r: AuthedRequest) { parse(z.object({}).strict(), r.body); return this.service.checkReadiness(r.actor); }
    @Get("configs")
    list(
    @Req()
    r: AuthedRequest) { return this.service.list(r.actor); }
    @Get("configs/:id")
    detail(
    @Req()
    r: AuthedRequest, 
    @Param("id")
    id: string) { return this.service.detail(r.actor, id); }
    @Post("configs")
    create(
    @Req()
    r: AuthedRequest) { return this.service.create(r.actor, parse(configInput, r.body)); }
    @Patch("configs/:id")
    update(
    @Req()
    r: AuthedRequest, 
    @Param("id")
    id: string) { const b = parse(z.object({ config: configInput, revision: z.number().int().positive() }).strict(), r.body); return this.service.change(r.actor, id, b.config, b.revision, true); }
    @Patch("configs/:id/enabled")
    toggle(
    @Req()
    r: AuthedRequest, 
    @Param("id")
    id: string) { const b = parse(z.object({ enabled: z.boolean(), revision: z.number().int().positive() }).strict(), r.body); return this.service.change(r.actor, id, { enabled: b.enabled }, b.revision, false); }
    @Delete("configs/:id")
    archive(
    @Req()
    r: AuthedRequest, 
    @Param("id")
    id: string) { const b = parse(z.object({ revision: z.number().int().positive() }).strict(), r.body); return this.service.change(r.actor, id, { enabled: false, archivedAt: new Date() }, b.revision, false); }
    @Post("configs/:id/runs")
    run(
    @Req()
    r: AuthedRequest, 
    @Param("id")
    id: string) { const b = parse(z.object({ scenario: scenarioSchema, requestKey: z.string().uuid(), mode: z.enum(["MOCK", "XHS_FIXTURE", "XHS_MCP"]), accountId:z.string().min(1).max(100).optional(), consent:z.literal("account-read-window-v1").optional() }).strict(), r.body); return this.service.start(r.actor, id, b.scenario, b.requestKey, b.mode, b.accountId, b.consent); }
    @Post("runs/:id/pause")
    pause(
    @Req()
    r: AuthedRequest, 
    @Param("id")
    id: string) { parse(z.object({}).strict(), r.body); return this.service.pauseRun(r.actor, id); }
}
@Controller("notices")
@UseGuards(SessionGuard)
class NoticesController {
    constructor(
    @Inject(Db)
    private db: Db, 
    @Inject(LeadsService)
    private leads: LeadsService) { }
    @Get()
    list(
    @Req()
    r: AuthedRequest) { return this.db.collectionNotice.findMany({ where: { lead: scope(r.actor) }, include: { lead: { select: { id: true, identity: { select: { nickname: true } }, ownerId: true } }, reads: { where: { userId: r.actor.id }, select: { readAt: true } } }, take: 100, orderBy: { createdAt: "desc" } }); }
    @Post(":id/read")
    async read(
    @Req()
    r: AuthedRequest, 
    @Param("id")
    id: string) { parse(z.object({}).strict(), r.body); const notice = await this.db.collectionNotice.findFirst({ where: { id, lead: scope(r.actor) } }); if (!notice)
        throw new NotFoundException(); return this.leads.locked(r.actor, notice.leadId, tx => tx.noticeRead.upsert({ where: { noticeId_userId: { noticeId: id, userId: r.actor.id } }, create: { noticeId: id, userId: r.actor.id }, update: {} })); }
}
@Module({ imports: [AuthModule, LeadsModule, DevicesModule], controllers: [CollectionController, NoticesController], providers: [CollectionService, CollectionQueue, LoginRuntime, AccountReadService], exports: [CollectionService] })
export class CollectionModule {
}
