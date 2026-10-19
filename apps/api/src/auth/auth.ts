import {
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Inject,
  Injectable,
  Module,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  ForbiddenException,
  HttpException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { Db } from "../common/db";
import {
  Actor,
  assertOrigin,
  assertSession,
  digest,
  hashPassword,
  token,
  verifyPassword,
} from "./security";
import { parse } from "../common/validation";
import { z } from "zod";
export type AuthedRequest = Request & {
  actor: Actor;
  sessionId: string;
  csrfToken: string;
};
const actorSelect = { id: true, name: true, email: true, role: true } as const;
const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.COOKIE_SECURE === "true",
  path: "/api",
  maxAge: 8 * 60 * 60 * 1000,
});
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(Db) private db: Db) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const raw = req.cookies?.crm_session;
    assertSession(typeof raw === "string" && raw.length === 64);
    const session = await this.db.session.findUnique({
      where: { id: digest(raw) },
      include: { user: true },
    });
    assertSession(
      !!session && session.expiresAt > new Date() && session.user.active,
    );
    if (!session) throw new UnauthorizedException();
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      assertOrigin(req.get("origin"));
      if (req.get("x-csrf-token") !== session.csrfToken)
        throw new ForbiddenException("CSRF 校验失败");
    }
    req.actor = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role: session.user.role,
    };
    req.sessionId = session.id;
    req.csrfToken = session.csrfToken;
    return true;
  }
}
@Injectable()
export class AuthService {
  private dummy = hashPassword(token());
  constructor(@Inject(Db) private db: Db) {}
  async login(email: string, password: string, ip: string) {
    const window = Math.floor(Date.now() / 900000);
    for (const [key, limit] of [
      [`ip:${ip}`, 30],
      [`email:${email}`, 10],
    ] as const) {
      const bucket = await this.db.loginBucket.upsert({
        where: { key: digest(`${key}:${window}`) },
        create: {
          key: digest(`${key}:${window}`),
          expiresAt: new Date((window + 1) * 900000),
        },
        update: { count: { increment: 1 } },
      });
      if (bucket.count > limit)
        throw new HttpException("登录尝试过多，请稍后再试", 429);
    }
    const user = await this.db.user.findUnique({ where: { email } });
    const valid = await verifyPassword(
      user?.passwordHash || (await this.dummy),
      password,
    );
    if (!user || !user.active || !valid)
      throw new UnauthorizedException("邮箱或密码错误");
    const raw = token(),
      csrfToken = token();
    await this.db.$transaction(async (tx) => {
      await tx.session.create({
        data: {
          id: digest(raw),
          userId: user.id,
          csrfToken,
          expiresAt: new Date(Date.now() + 8 * 3600000),
        },
      });
      await tx.auditLog.create({
        data: { actorId: user.id, action: "AUTH_LOGIN", entityId: user.id },
      });
    });
    return {
      raw,
      csrfToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }
}
@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private auth: AuthService,
    @Inject(Db) private db: Db,
  ) {}
  @Post("login") async login(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    assertOrigin(req.get("origin"));
    if (!req.is("application/json"))
      throw new ForbiddenException("仅接受 JSON 请求");
    const body = parse(
      z
        .object({
          email: z
            .email()
            .max(254)
            .transform((v) => v.toLowerCase()),
          password: z.string().min(1).max(256),
        })
        .strict(),
      req.body,
    );
    const result = await this.auth.login(
      body.email,
      body.password,
      req.ip || "unknown",
    );
    if (typeof req.cookies?.crm_session === "string")
      await this.db.session.deleteMany({
        where: { id: digest(req.cookies.crm_session) },
      });
    res.cookie("crm_session", result.raw, cookieOptions());
    return { user: result.user, csrfToken: result.csrfToken };
  }
  @Get("me") @UseGuards(SessionGuard) me(@Req() req: AuthedRequest) {
    return { user: req.actor, csrfToken: req.csrfToken };
  }
  @Post("logout") @UseGuards(SessionGuard) async logout(
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.db.session.deleteMany({ where: { id: req.sessionId } });
    res.clearCookie("crm_session", cookieOptions());
    return { ok: true };
  }
}
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionGuard],
  exports: [SessionGuard],
})
export class AuthModule {}
