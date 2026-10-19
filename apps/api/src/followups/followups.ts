import {
  Controller,
  Inject,
  Module,
  Param,
  Post,
  Req,
  UseGuards,
  Injectable,
  ConflictException,
} from "@nestjs/common";
import { z } from "zod";
import { AuthModule, AuthedRequest, SessionGuard } from "../auth/auth";
import { Actor } from "../auth/security";
import { LeadsModule } from "../leads/leads";
import { LeadsService } from "../leads/leads.service";
import { dateOrNull, parse } from "../common/validation";
const schema = z
  .object({
    content: z.string().trim().min(1).max(4000),
    nextFollowUpAt: dateOrNull,
    status: z.enum(["PENDING_REVIEW", "FOLLOWING", "CLOSED"]),
    version: z.number().int().nonnegative(),
  })
  .strict();
@Injectable()
export class FollowupsService {
  constructor(@Inject(LeadsService) private leads: LeadsService) {}
  add(actor: Actor, id: string, b: z.infer<typeof schema>) {
    return this.leads.locked(actor, id, async (tx, lead) => {
      if (lead.version !== b.version)
        throw new ConflictException("线索已更新，请刷新后重试");
      const next = b.nextFollowUpAt ? new Date(b.nextFollowUpAt) : null;
      const followup = await tx.followUp.create({
        data: {
          leadId: id,
          authorId: actor.id,
          content: b.content,
          nextFollowUpAt: next,
        },
      });
      await tx.lead.update({
        where: { id },
        data: {
          nextFollowUpAt: next,
          status: b.status,
          version: { increment: 1 },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "FOLLOWUP_CREATED",
          entityId: id,
          metadata: { followupId: followup.id },
        },
      });
      return followup;
    });
  }
}
@Controller("leads")
@UseGuards(SessionGuard)
class FollowupsController {
  constructor(@Inject(FollowupsService) private service: FollowupsService) {}
  @Post(":id/followups") add(
    @Req() req: AuthedRequest,
    @Param("id") id: string,
  ) {
    return this.service.add(req.actor, id, parse(schema, req.body));
  }
}
@Module({
  imports: [AuthModule, LeadsModule],
  controllers: [FollowupsController],
  providers: [FollowupsService],
  exports: [FollowupsService],
})
export class FollowupsModule {}
