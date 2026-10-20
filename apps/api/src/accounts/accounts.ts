import {
  Controller,
  Delete,
  Get,
  Header,
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
import { AccountLoginService } from './account-login.service';
import { LoginRuntime } from './login-runtime';
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
@Controller("accounts")
@UseGuards(SessionGuard)
class AccountLoginController {
  constructor(@Inject(AccountLoginService) private login: AccountLoginService) {}
  @Get('login-capabilities') @Header('Cache-Control','no-store, private') capabilities(@Req() r:AuthedRequest){return this.login.capabilities(r.actor);}
  @Post(':id/login') @Header('Cache-Control','no-store, private') start(@Req() r:AuthedRequest,@Param('id') id:string){const b=parse(z.object({requestKey:z.string().uuid(),consent:z.literal('local-session-v1')}).strict(),r.body);return this.login.start(r.actor,id,b.requestKey,b.consent);}
  @Post(':id/login/check') @Header('Cache-Control','no-store, private') check(@Req() r:AuthedRequest,@Param('id') id:string){const b=parse(z.object({requestKey:z.string().uuid()}).strict(),r.body);return this.login.check(r.actor,id,b.requestKey);}
  @Post(':id/login/cancel') @Header('Cache-Control','no-store, private') cancel(@Req() r:AuthedRequest,@Param('id') id:string){const b=parse(z.object({requestKey:z.string().uuid()}).strict(),r.body);return this.login.cancel(r.actor,id,b.requestKey);}
  @Post(':id/login/offline') @Header('Cache-Control','no-store, private') offline(@Req() r:AuthedRequest,@Param('id') id:string){const b=parse(z.object({requestKey:z.string().uuid(),scenario:z.enum(['SUCCESS','MISSING_ID','ERROR','EXPIRED'])}).strict(),r.body);return this.login.simulate(r.actor,id,b.requestKey,b.scenario);}
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
  controllers: [AccountLoginController, AccountsController, AccountContactController],
  providers: [AccountsService, AccountLoginService, LoginRuntime],
})
export class AccountsModule {}
