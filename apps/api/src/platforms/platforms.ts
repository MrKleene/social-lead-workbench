import {
  Controller,
  Get,
  Inject,
  Module,
  Param,
  Post,
  Req,
  UseGuards,
  NotFoundException,
} from "@nestjs/common";
import { AuthModule, AuthedRequest, SessionGuard } from "../auth/auth";
import { requireAdmin, scope } from "../auth/security";
import { Db } from "../common/db";
export const capabilities = [
  {
    platform: "XHS",
    name: "小红书",
    status: "未接入",
    read: "历史小样本读取验证；本项目未连接，不保证规模或延迟",
    comment: false,
    directMessage: false,
    embeddedChat: false,
    reason: "历史测试账号受限，全部发送测试已停止；须重新人工核验",
  },
  {
    platform: "DOUYIN",
    name: "抖音",
    status: "规划中",
    read: "独立适配器尚未实现",
    comment: false,
    directMessage: false,
    embeddedChat: false,
    reason: "能力未验证",
  },
];
@Controller("platforms")
@UseGuards(SessionGuard)
class PlatformsController {
  constructor(@Inject(Db) private db: Db) {}
  @Get() async list(@Req() req: AuthedRequest) {
    return {
      capabilities,
      accounts: await this.db.platformAccount.findMany({
        where: {...scope(req.actor), archivedAt: null},
        select: {
          id: true,
          platform: true,
          label: true,
          status: true,
          isDemo: true,
          pauseReason: true,
        },
      }),
    };
  }
  @Post(":id/pause") async pause(
    @Req() req: AuthedRequest,
    @Param("id") id: string,
  ) {
    requireAdmin(req.actor);
    if (!(await this.db.platformAccount.findUnique({ where: { id } })))
      throw new NotFoundException();
    return this.db.$transaction(async (tx) => {
      const result = await tx.platformAccount.update({
        where: { id },
        data: {
          status: "PAUSED",
          version: { increment: 1 },
          pauseReason: "管理员暂停；本里程碑不启用采集或发送",
        },
      });
      await tx.auditLog.create({
        data: { actorId: req.actor.id, action: "ACCOUNT_PAUSED", entityId: id },
      });
      return result;
    });
  }
}
@Module({ imports: [AuthModule], controllers: [PlatformsController] })
export class PlatformsModule {}
