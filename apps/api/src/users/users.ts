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
@Controller("users")
@UseGuards(SessionGuard)
class UsersController {
  constructor(@Inject(Db) private db: Db) {}
  @Get() list(@Req() req: AuthedRequest) {
    requireAdmin(req.actor);
    return this.db.user.findMany({
      where: { active: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    });
  }
}
@Module({ imports: [AuthModule], controllers: [UsersController] })
export class UsersModule {}
