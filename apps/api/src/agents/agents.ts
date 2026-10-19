import {
  Controller,
  Get,
  Module,
  Post,
  Req,
  Res,
  ForbiddenException,
} from "@nestjs/common";
import type { Request, Response } from "express";
@Controller("agent")
class AgentsController {
  @Get("protocol") protocol() {
    return {
      version: 1,
      enabled: false,
      taskTypes: ["HEALTHCHECK"],
      platformCallsEnabled: false,
    };
  }
  @Post("claim") claim(@Req() req: Request, @Res() res: Response) {
    // Disabled before credentials/provisioning are approved. No token bypass and no real jobs.
    if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.ip || ""))
      throw new ForbiddenException();
    return res
      .status(503)
      .json({
        code: "AGENT_DISABLED",
        message: "Agent 配对与领取未启用；不会分发平台任务",
      });
  }
}
@Module({ controllers: [AgentsController] })
export class AgentsModule {}
