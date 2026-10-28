import {
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Inject,
  Injectable,
  Module,
  Post,
  Param,
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
  requireAdmin,
} from "./security";
import { parse } from "../common/validation";
import { z } from "zod";
import { lockUser, revokeCookies, revokeUserAuth, rotateRefresh, sessionExpiry, SESSION_MS, REMEMBER_MS } from "./remember-login";
export type AuthedRequest = Request & {
  actor: Actor;
  sessionId: string;
  csrfToken: string;
};
export const cookieOptions = (path = "/api") => ({
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.COOKIE_SECURE === "true" || !!process.env.APP_ORIGIN?.startsWith("https://"),
  path,
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
      include: { user: true, refreshGrant: true },
    });
    assertSession(
      !!session && session.expiresAt > new Date() && session.user.active &&
        (!session.refreshGrantId || (!!session.refreshGrant && !session.refreshGrant.revokedAt && session.refreshGrant.expiresAt > new Date())),
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
  async login(email: string, password: string, ip: string, remember = false) {
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
    const refreshRaw = remember ? token() : null;
    const rememberUntil = remember ? new Date(Date.now() + REMEMBER_MS) : null;
    await this.db.$transaction(async (tx) => {
      await lockUser(tx, user.id);
      const current = await tx.user.findUnique({ where: { id: user.id } });
      if (!current?.active || current.passwordHash !== user.passwordHash) throw new UnauthorizedException("请重新登录");
      const grant = refreshRaw && rememberUntil ? await tx.refreshGrant.create({ data: {
        userId: user.id, csrfToken, expiresAt: rememberUntil,
        tokens: { create: { id: digest(refreshRaw) } },
      } }) : null;
      await tx.session.create({
        data: {
          id: digest(raw),
          userId: user.id,
          csrfToken,
          expiresAt: sessionExpiry(Date.now(), rememberUntil ?? undefined),
          refreshGrantId: grant?.id,
        },
      });
      await tx.auditLog.create({
        data: { actorId: user.id, action: "AUTH_LOGIN", entityId: user.id },
      });
    });
    return {
      raw,
      refreshRaw,
      rememberUntil,
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
          remember: z.boolean().default(false),
        })
        .strict(),
      req.body,
    );
    const result = await this.auth.login(
      body.email,
      body.password,
      req.ip || "unknown",
      body.remember,
    );
    await revokeCookies(this.db, req.cookies?.crm_session, req.cookies?.crm_refresh);
    res.setHeader("Cache-Control", "no-store");
    res.cookie("crm_session", result.raw, { ...cookieOptions(), maxAge: SESSION_MS });
    if (result.refreshRaw && result.rememberUntil) res.cookie("crm_refresh", result.refreshRaw, { ...cookieOptions("/api/auth"), expires: result.rememberUntil });
    else res.clearCookie("crm_refresh", cookieOptions("/api/auth"));
    return { user: result.user, csrfToken: result.csrfToken };
  }
  @Get("me") @UseGuards(SessionGuard) me(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    res.setHeader("Cache-Control", "no-store");
    return { user: req.actor, csrfToken: req.csrfToken };
  }
  @Post("refresh") async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.assertAuthRequest(req);
    res.setHeader("Cache-Control", "no-store");
    const result = await rotateRefresh(this.db, req.cookies?.crm_refresh, req.ip || "unknown");
    res.cookie("crm_session", result.raw, { ...cookieOptions(), expires: result.expiresAt });
    res.cookie("crm_refresh", result.refreshRaw, { ...cookieOptions("/api/auth"), expires: result.rememberUntil });
    return { user: result.user, csrfToken: result.csrfToken };
  }
  @Post("logout") async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // Origin + JSON/custom header protects logout even after the short session expires.
    this.assertAuthRequest(req);
    await revokeCookies(this.db, req.cookies?.crm_session, req.cookies?.crm_refresh);
    res.setHeader("Cache-Control", "no-store");
    res.clearCookie("crm_session", cookieOptions());
    res.clearCookie("crm_refresh", cookieOptions("/api/auth"));
    return { ok: true };
  }
  @Post("users/:userId/revoke") @UseGuards(SessionGuard)
  async revoke(@Req() req: AuthedRequest, @Param("userId") userId: string) {
    requireAdmin(req.actor);
    await revokeUserAuth(this.db, userId);
    return { ok: true };
  }
  private assertAuthRequest(req: Request) {
    assertOrigin(req.get("origin"));
    if (!req.is("application/json") || (req.get("x-crm-auth") !== "1" && !req.get("x-csrf-token"))) throw new ForbiddenException("登录请求校验失败");
  }

}
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionGuard],
  exports: [SessionGuard],
})
export class AuthModule {}
