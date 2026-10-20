import {
  Controller,
  Delete,
  Get,
  Inject,
  Module,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { AuthModule, AuthedRequest, SessionGuard } from "../auth/auth";
import { parse } from "../common/validation";
import { AccountsService } from "./accounts.service";
const version = z.number().int().nonnegative();
const metadata = z.object({
  label: z.string().trim().min(1).max(80),
  ownerId: z.string().min(1).nullable(),
  dailyLimit: z.number().int().min(0).max(1000),
  status: z.enum(["UNCONNECTED", "PAUSED", "RESTRICTED"]),
  pauseReason: z.string().trim().min(1).max(300).nullable(),
});
@Controller("accounts")
@UseGuards(SessionGuard)
class AccountsController {
  constructor(@Inject(AccountsService) private service: AccountsService) {}
  @Get() list(@Req() r: AuthedRequest) {
    return this.service.list(r.actor);
  }
  @Post() create(@Req() r: AuthedRequest) {
    return this.service.create(
      r.actor,
      parse(
        metadata.extend({ platform: z.enum(["XHS", "DOUYIN"]) }).strict(),
        r.body,
      ),
    );
  }
  @Patch(":id") update(@Req() r: AuthedRequest, @Param("id") id: string) {
    const { version: v, ...data } = parse(
      metadata.extend({ version }).strict(),
      r.body,
    );
    return this.service.update(r.actor, id, v, data);
  }
  @Delete(":id") archive(@Req() r: AuthedRequest, @Param("id") id: string) {
    const b = parse(z.object({ version }).strict(), r.body);
    return this.service.update(r.actor, id, b.version, {
      archivedAt: new Date(),
    });
  }
}
@Controller("leads/:id/account-contact")
@UseGuards(SessionGuard)
class AccountContactController {
  constructor(@Inject(AccountsService) private service: AccountsService) {}
  @Get() state(@Req() r: AuthedRequest, @Param("id") id: string) {
    return this.service.contactState(r.actor, id);
  }
  @Patch("block") block(@Req() r: AuthedRequest, @Param("id") id: string) {
    const b = parse(
      z
        .object({
          blocked: z.boolean(),
          note: z.string().trim().min(5).max(500),
          version,
        })
        .strict(),
      r.body,
    );
    return this.service.block(r.actor, id, b.blocked, b.note, b.version);
  }
  @Post() reserve(@Req() r: AuthedRequest, @Param("id") id: string) {
    const b = parse(
      z
        .object({
          accountId: z.string().min(1),
          requestKey: z.string().uuid(),
          kind: z.enum(["FIRST", "FOLLOWUP"]),
        })
        .strict(),
      r.body,
    );
    return this.service.reserve(r.actor, id, b.accountId, b.requestKey, b.kind);
  }
  @Patch(":attemptId") resolve(
    @Req() r: AuthedRequest,
    @Param("id") id: string,
    @Param("attemptId") attemptId: string,
  ) {
    const b = parse(
      z
        .object({
          outcome: z.enum(["UNKNOWN", "FAILED", "SIMULATED_SUCCESS"]),
          note: z.string().trim().min(5).max(500),
          version,
          pauseReason: z
            .enum(["RATE_LIMITED", "VERIFICATION", "BANNED"])
            .optional(),
        })
        .strict(),
      r.body,
    );
    return this.service.resolve(
      r.actor,
      id,
      attemptId,
      b.outcome,
      b.note,
      b.version,
      b.pauseReason,
    );
  }
}
@Module({
  imports: [AuthModule],
  controllers: [AccountsController, AccountContactController],
  providers: [AccountsService],
})
export class AccountsModule {}
