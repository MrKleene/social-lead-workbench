import {
  Controller,
  Get,
  Inject,
  Module,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthModule, AuthedRequest, SessionGuard } from "../auth/auth";
import { requireAdmin } from "../auth/security";
import { Db } from "../common/db";
@Controller("audit")
@UseGuards(SessionGuard)
class AuditController {
  constructor(@Inject(Db) private db: Db) {}
  @Get() list(@Req() req: AuthedRequest) {
    requireAdmin(req.actor);
    return this.db.auditLog.findMany({
      take: 100,
      orderBy: { createdAt: "desc" },
      include: { actor: { select: { name: true } } },
    });
  }
}
@Module({ imports: [AuthModule], controllers: [AuditController] })
export class AuditModule {}
