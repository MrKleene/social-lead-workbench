import { createHash, randomBytes } from "node:crypto";
import * as argon2 from "argon2";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { Role } from "@prisma/client";
export type Actor = { id: string; name: string; email: string; role: Role };
export const token = () => randomBytes(32).toString("hex");
export const digest = (input: string) =>
  createHash("sha256").update(input).digest("hex");
export const hashPassword = (password: string) =>
  argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
export const verifyPassword = async (hash: string, password: string) =>
  argon2.verify(hash, password).catch(() => false);
export function requireAdmin(actor: Actor) {
  if (actor.role !== "ADMIN")
    throw new ForbiddenException("仅管理员可执行此操作");
}
export function requireOwner(actor: Actor, lead: { ownerId: string | null }) {
  if (actor.role !== "ADMIN" && lead.ownerId !== actor.id)
    throw new ForbiddenException("无权访问此线索");
}
export const scope = (actor: Actor) =>
  actor.role === "ADMIN" ? {} : { ownerId: actor.id };
export function assertSession(valid: boolean): asserts valid {
  if (!valid) throw new UnauthorizedException("请重新登录");
}
export function assertOrigin(origin: string | undefined) {
  if (origin !== (process.env.APP_ORIGIN || "http://127.0.0.1:5173"))
    throw new ForbiddenException("请求来源验证失败");
}
