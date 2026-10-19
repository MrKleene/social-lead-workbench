import { Controller, Get, Inject, Module, Param, Patch, Req, UseGuards, } from "@nestjs/common";
import { z } from "zod";
import { AuthModule, AuthedRequest, SessionGuard } from "../auth/auth";
import { parse } from "../common/validation";
import { LeadsService } from "./leads.service";
@Controller("leads")
@UseGuards(SessionGuard)
class LeadsController {
    constructor(
    @Inject(LeadsService)
    private leads: LeadsService) { }
    @Get()
    list(
    @Req()
    req: AuthedRequest) {
        return this.leads.list(req.actor);
    }
    @Get(":id")
    detail(
    @Req()
    req: AuthedRequest, 
    @Param("id")
    id: string) {
        return this.leads.detail(req.actor, id);
    }
    @Patch("batch-owner")
    batchAssign(
    @Req()
    req: AuthedRequest) {
        const b = parse(z.object({
            items: z.array(z.object({ id: z.string().min(1), version: z.number().int().nonnegative() }).strict()).min(1).max(50).refine(items => new Set(items.map(v => v.id)).size === items.length),
            ownerId: z.string().min(1).nullable(),
        }).strict(), req.body);
        return this.leads.assignBatch(req.actor, b.items, b.ownerId);
    }
    @Patch(":id/owner")
    assign(
    @Req()
    req: AuthedRequest, 
    @Param("id")
    id: string) {
        const b = parse(z
            .object({
            ownerId: z.string().min(1).nullable(),
            version: z.number().int().nonnegative(),
        })
            .strict(), req.body);
        return this.leads.assign(req.actor, id, b.ownerId, b.version);
    }
    @Patch(":id/review")
    review(
    @Req()
    req: AuthedRequest, 
    @Param("id")
    id: string) {
        const b = parse(z
            .object({
            note: z.string().trim().min(5).max(2000),
            version: z.number().int().nonnegative(),
        })
            .strict(), req.body);
        return this.leads.review(req.actor, id, b.note, b.version);
    }
}
@Module({
    imports: [AuthModule],
    controllers: [LeadsController],
    providers: [LeadsService],
    exports: [LeadsService],
})
export class LeadsModule {
}
