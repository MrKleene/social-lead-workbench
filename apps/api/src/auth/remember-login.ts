import { HttpException, UnauthorizedException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { Db } from "../common/db";
import { digest, token } from "./security";

export const SESSION_MS = 8 * 3600000;
export const REMEMBER_MS = 30 * 86400000;
export const ROTATION_RACE_MS = 10000;
export const validToken = (raw: unknown): raw is string =>
  typeof raw === "string" && /^[a-f0-9]{64}$/.test(raw);
export const sessionExpiry = (now: number, deadline?: Date) =>
  new Date(Math.min(now + SESSION_MS, deadline?.getTime() ?? Infinity));

export async function lockUser(tx: Prisma.TransactionClient, userId: string) {
  // All auth mutations lock user first, then grant, including the password trigger.
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
}
export async function revokeGrant(tx: Prisma.TransactionClient, id: string) {
  await tx.refreshGrant.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
  await tx.session.deleteMany({ where: { refreshGrantId: id } });
}
export async function revokeUserAuth(db: Db, userId: string) {
  await db.$transaction(async tx => {
    await lockUser(tx, userId);
    await tx.refreshGrant.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.session.deleteMany({ where: { userId } });
  });
}
export async function revokeCookies(db: Db, sessionRaw: unknown, refreshRaw: unknown) {
  // Accept expired/used cookies for logout, but never authenticate using them.
  const session = validToken(sessionRaw) ? await db.session.findUnique({ where: { id: digest(sessionRaw) } }) : null;
  const refresh = validToken(refreshRaw) ? await db.refreshToken.findUnique({ where: { id: digest(refreshRaw) }, include: { grant: true } }) : null;
  const grants = new Map<string, string>();
  if (session?.refreshGrantId) grants.set(session.refreshGrantId, session.userId);
  if (refresh) grants.set(refresh.grantId, refresh.grant.userId);
  // Usually one grant. Separate transactions avoid multi-user lock ordering issues.
  for (const [id, userId] of grants) await db.$transaction(async tx => {
    await lockUser(tx, userId);
    await revokeGrant(tx, id);
  });
  if (session) await db.session.deleteMany({ where: { id: session.id } });
}
export async function rotateRefresh(db: Db, raw: unknown, ip: string) {
  if (!validToken(raw)) throw new UnauthorizedException("登录已过期，请重新登录");
  const window = Math.floor(Date.now() / 60000);
  for (const [key, limit] of [[`refresh-ip:${ip}`, 120], [`refresh-token:${digest(raw)}`, 20]] as const) {
    const keyHash = digest(`${key}:${window}`);
    const bucket = await db.loginBucket.upsert({ where: { key: keyHash }, create: { key: keyHash, expiresAt: new Date((window + 1) * 60000) }, update: { count: { increment: 1 } } });
    if (bucket.count > limit) throw new HttpException("登录续期请求过多，请稍后重试", 429);
  }
  const known = await db.refreshToken.findUnique({ where: { id: digest(raw) }, include: { grant: true } });
  if (!known) throw new UnauthorizedException("登录已过期，请重新登录");
  const result = await db.$transaction(async tx => {
    await lockUser(tx, known.grant.userId);
    const current = await tx.refreshToken.findUnique({ where: { id: known.id }, include: { grant: { include: { user: true } } } });
    const now = Date.now();
    if (!current) return { state: "invalid" } as const;
    const grant = current.grant;
    if (grant.revokedAt || grant.expiresAt.getTime() <= now || !grant.user.active) {
      await revokeGrant(tx, grant.id);
      return { state: "invalid" } as const;
    }
    if (current.usedAt) {
      // A racing tab gets no credentials and no cookie writes. It can re-read /me
      // after the winner's cookie arrives. Later replay revokes the entire family.
      if (now - current.usedAt.getTime() <= ROTATION_RACE_MS) return { state: "race" } as const;
      await revokeGrant(tx, grant.id);
      return { state: "invalid" } as const;
    }
    const sessionRaw = token(), refreshRaw = token();
    const expiresAt = sessionExpiry(now, grant.expiresAt);
    await tx.refreshToken.update({ where: { id: current.id }, data: { usedAt: new Date(now) } });
    await tx.refreshToken.create({ data: { id: digest(refreshRaw), grantId: grant.id } });
    await tx.session.deleteMany({ where: { refreshGrantId: grant.id } });
    await tx.session.create({ data: { id: digest(sessionRaw), userId: grant.userId, refreshGrantId: grant.id, csrfToken: grant.csrfToken, expiresAt } });
    const { id, email, name, role } = grant.user;
    return { state: "ok", raw: sessionRaw, refreshRaw, expiresAt, rememberUntil: grant.expiresAt, csrfToken: grant.csrfToken, user: { id, email, name, role } } as const;
  });
  // Throw only after committing revocation.
  if (result.state === "race") throw new HttpException("另一页面正在续期，请稍后重试", 409);
  if (result.state !== "ok") throw new UnauthorizedException("登录已过期，请重新登录");
  return result;
}
