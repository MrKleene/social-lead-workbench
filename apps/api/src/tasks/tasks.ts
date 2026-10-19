import {
  Controller,
  Get,
  Inject,
  Module,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  NotFoundException,
} from "@nestjs/common";
import { z } from "zod";
import { AuthModule, AuthedRequest, SessionGuard } from "../auth/auth";
import { scope } from "../auth/security";
import { Db } from "../common/db";
import { LeadsModule } from "../leads/leads";
import { LeadsService } from "../leads/leads.service";
import { dateOrNull, parse } from "../common/validation";
@Controller("tasks")
@UseGuards(SessionGuard)
class TasksController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(LeadsService) private leads: LeadsService,
  ) {}
  @Get() list(@Req() req: AuthedRequest) {
    return this.db.task.findMany({
      where: { lead: scope(req.actor) },
      include: {
        lead: {
          select: {
            id: true,
            summary: true,
            identity: { select: { nickname: true } },
            owner: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
  }
  @Post() create(@Req() req: AuthedRequest) {
    const b = parse(
      z
        .object({
          leadId: z.string().min(1),
          title: z.string().trim().min(1).max(200),
          dueAt: dateOrNull,
        })
        .strict(),
      req.body,
    );
    return this.leads.locked(req.actor, b.leadId, async (tx) => {
      const task = await tx.task.create({
        data: {
          leadId: b.leadId,
          title: b.title,
          dueAt: b.dueAt ? new Date(b.dueAt) : null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: req.actor.id,
          action: "TASK_CREATED",
          entityId: b.leadId,
          metadata: { taskId: task.id },
        },
      });
      return task;
    });
  }
  @Patch(":id") async update(
    @Req() req: AuthedRequest,
    @Param("id") id: string,
  ) {
    const b = parse(
      z.object({ status: z.enum(["PENDING", "DONE", "PAUSED"]) }).strict(),
      req.body,
    );
    const task = await this.db.task.findFirst({
      where: { id, lead: scope(req.actor) },
    });
    if (!task) throw new NotFoundException("任务不存在或无权访问");
    return this.leads.locked(req.actor, task.leadId, async (tx) => {
      const result = await tx.task.update({ where: { id }, data: b });
      await tx.auditLog.create({
        data: {
          actorId: req.actor.id,
          action: "TASK_UPDATED",
          entityId: task.leadId,
          metadata: { taskId: id, status: b.status },
        },
      });
      return result;
    });
  }
}
@Module({ imports: [AuthModule, LeadsModule], controllers: [TasksController] })
export class TasksModule {}
