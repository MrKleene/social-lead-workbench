import "reflect-metadata";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Db } from "../src/common/db";
import {
  AccountsService,
  utcDay,
  type AccountInput,
} from "../src/accounts/accounts.service";
import { AppModule } from "../src/app";
import { configure } from "../src/bootstrap";
import { hashPassword, type Actor } from "../src/auth/security";
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/crm_test")
  throw new Error("Requires isolated crm_test");
const db = new Db({ datasources: { db: { url } } }),
  service = new AccountsService(db);
const tag = `accounts-${randomUUID()}`,
  password = randomUUID();
let admin: Actor, a: Actor, b: Actor, app: INestApplication;
const accounts: string[] = [],
  identities: string[] = [],
  users: string[] = [];
const input = (ownerId: string | null = a.id): AccountInput => ({
  platform: "XHS",
  label: tag,
  ownerId,
  dailyLimit: 10,
  status: "UNCONNECTED",
  pauseReason: null,
});
async function account(data: Partial<AccountInput> = {}) {
  const row = await service.create(admin, { ...input(), ...data });
  accounts.push(row.id);
  return row;
}
async function lead(
  options: {
    userId?: string;
    nickname?: string;
    platform?: "XHS" | "DOUYIN";
    reviewed?: boolean;
    isDemo?: boolean;
    ownerId?: string;
  } = {},
) {
  const identity = await db.platformIdentity.create({
    data: {
      platform: options.platform || "XHS",
      platformUserId: options.userId ?? randomUUID(),
      nickname: options.nickname || "同名模拟用户",
      isDemo: options.isDemo ?? true,
    },
  });
  identities.push(identity.id);
  return db.lead.create({
    data: {
      identityId: identity.id,
      summary: tag,
      evidence: "虚构测试数据",
      ownerId: options.ownerId || a.id,
      reviewedAt: options.reviewed === false ? null : new Date(),
      isDemo: options.isDemo ?? true,
    },
  });
}
const reserve = (
  l: { id: string },
  c: { id: string },
  key = randomUUID(),
  actor = a,
  kind: "FIRST" | "FOLLOWUP" = "FIRST",
) => service.reserve(actor, l.id, c.id, key, kind);
async function finish(
  l: { id: string },
  attempt: { id: string; version: number },
  outcome: "UNKNOWN" | "FAILED" | "SIMULATED_SUCCESS",
  pause?: "RATE_LIMITED" | "VERIFICATION" | "BANNED",
) {
  return service.resolve(
    a,
    l.id,
    attempt.id,
    outcome,
    "模拟测试核查依据",
    attempt.version,
    pause,
  );
}
beforeAll(async () => {
  const hash = await hashPassword(password);
  const rows = await Promise.all(
    ["ADMIN", "SALES", "SALES"].map((role, i) =>
      db.user.create({
        data: {
          name: `${tag}-${i}`,
          email: `${tag}-${i}@example.invalid`,
          role: role as "ADMIN" | "SALES",
          passwordHash: hash,
        },
      }),
    ),
  );
  [admin, a, b] = rows;
  users.push(...rows.map((r) => r.id));
  const mod = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Db)
    .useValue(db)
    .compile();
  app = mod.createNestApplication({ bodyParser: false });
  configure(app);
  await app.init();
}, 30000);
afterAll(async () => {
  vi.restoreAllMocks();
  await db.auditLog.deleteMany({ where: { actorId: { in: users } } });
  await db.lead.deleteMany({ where: { identityId: { in: identities } } });
  await db.platformIdentity.deleteMany({ where: { id: { in: identities } } });
  await db.platformAccount.deleteMany({ where: { id: { in: accounts } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await app?.close();
  await db.$disconnect();
});
describe("account center / isolated PostgreSQL", () => {
  it("enforces CRUD admin, owner scoping, optimistic versions and archive retention", async () => {
    const c = await account();
    expect((await service.list(a)).accounts.some((r) => r.id === c.id)).toBe(
      true,
    );
    expect((await service.list(b)).accounts.some((r) => r.id === c.id)).toBe(
      false,
    );
    await expect(service.create(a, input())).rejects.toThrow();
    await expect(service.update(a, c.id, 0, input())).rejects.toThrow();
    await expect(
      service.update(admin, c.id, 0, { ...input(), ownerId: admin.id }),
    ).rejects.toThrow();
    const updated = await service.update(admin, c.id, 0, {
      ...input(b.id),
      label: "更名模拟账号",
    });
    expect(updated.ownerId).toBe(b.id);
    await expect(service.update(admin, c.id, 0, input())).rejects.toThrow(
      "账号已变化",
    );
    expect((await service.list(a)).accounts.some((r) => r.id === c.id)).toBe(
      false,
    );
    await service.update(admin, c.id, 1, { archivedAt: new Date() });
    expect((await service.list(b)).accounts.some((r) => r.id === c.id)).toBe(
      false,
    );
    expect(
      await db.platformAccount.findUnique({ where: { id: c.id } }),
    ).not.toBeNull();
  });
  it("requires real HTTP session + CSRF and rejects unknown login/credential inputs", async () => {
    const api = request(app.getHttpServer());
    expect((await api.get("/api/accounts")).status).toBe(401);
    const login = await api
      .post("/api/auth/login")
      .set("Origin", "http://127.0.0.1:5173")
      .send({ email: admin.email, password });
    expect(login.status).toBe(201);
    const cookie = login.headers["set-cookie"][0].split(";")[0];
    expect(
      (
        await api
          .post("/api/accounts")
          .set("Cookie", cookie)
          .set("Origin", "http://127.0.0.1:5173")
          .send(input())
      ).status,
    ).toBe(403);
    const invalid = await api
      .post("/api/accounts")
      .set("Cookie", cookie)
      .set("Origin", "http://127.0.0.1:5173")
      .set("x-csrf-token", login.body.csrfToken)
      .send({ ...input(), cookie: "FORBIDDEN_FIELD" });
    expect(invalid.status).toBe(400);
    const salesLogin = await api
      .post("/api/auth/login")
      .set("Origin", "http://127.0.0.1:5173")
      .send({ email: b.email, password });
    const salesCookie = salesLogin.headers["set-cookie"][0].split(";")[0];
    expect(
      (
        await api
          .post("/api/accounts")
          .set("Cookie", salesCookie)
          .set("Origin", "http://127.0.0.1:5173")
          .set("x-csrf-token", salesLogin.body.csrfToken)
          .send(input())
      ).status,
    ).toBe(403);
  });
  it("serializes cross-account first contact; unknown stays occupied; failed never rotates", async () => {
    const l = await lead(),
      c = await account(),
      other = await account();
    const results = await Promise.allSettled([
      reserve(l, c),
      reserve(l, other),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const ok = results.find((r) => r.status === "fulfilled")!;
    if (ok.status !== "fulfilled") throw Error();
    const state = await service.contactState(a, l.id),
      chosen = state.ledger!.accountId,
      loser = chosen === c.id ? other : c;
    const unknown = await finish(l, ok.value, "UNKNOWN");
    await expect(reserve(l, { id: chosen })).rejects.toThrow("未知");
    await expect(reserve(l, loser)).rejects.toThrow("固定原");
    expect(
      (await db.accountDay.findFirst({ where: { accountId: chosen } }))!
        .occupied,
    ).toBe(1);
    await finish(l, unknown, "FAILED");
    expect(
      (await db.accountDay.findFirst({ where: { accountId: chosen } }))!
        .occupied,
    ).toBe(0);
    await expect(reserve(l, loser)).rejects.toThrow("固定原");
    expect((await reserve(l, { id: chosen })).outcome).toBe("ATTEMPTED");
  });
  it("replays same key once, rejects key reuse and does not bypass ownership", async () => {
    const c = await account(),
      l = await lead(),
      key = randomUUID();
    const results = await Promise.all([reserve(l, c, key), reserve(l, c, key)]);
    expect(results[0].id).toBe(results[1].id);
    expect(
      (await db.accountDay.findFirst({ where: { accountId: c.id } }))!.occupied,
    ).toBe(1);
    await expect(reserve(await lead(), c, key)).rejects.toThrow("幂等键");
    await expect(reserve(l, c, key, b)).rejects.toThrow();
    await expect(
      reserve(await lead({ ownerId: b.id }), c, randomUUID(), b),
    ).rejects.toThrow();
  });
  it("distinguishes same nicknames and same platform IDs across platforms; missing ID is blocked", async () => {
    const c = await account(),
      other = await account({ platform: "DOUYIN" }),
      id = randomUUID();
    await reserve(await lead({ userId: id }), c);
    await reserve(await lead(), c);
    await reserve(await lead({ userId: id, platform: "DOUYIN" }), other);
    await expect(reserve(await lead({ userId: " " }), c)).rejects.toThrow(
      "ID 缺失",
    );
    await expect(
      reserve(await lead({ platform: "DOUYIN" }), c),
    ).rejects.toThrow("平台不匹配");
  });
  it("blocks unreviewed, real identities, and do-not-contact; changes are versioned/audited", async () => {
    const c = await account();
    await expect(reserve(await lead({ reviewed: false }), c)).rejects.toThrow(
      "人工审核",
    );
    await expect(reserve(await lead({ isDemo: false }), c)).rejects.toThrow(
      "仅接受模拟",
    );
    const l = await lead();
    const blocked = await service.block(a, l.id, true, "模拟勿联系依据", 0);
    await expect(reserve(l, c)).rejects.toThrow("勿联系");
    await expect(
      service.block(a, l.id, false, "模拟解除说明", 0),
    ).rejects.toThrow();
    await service.block(a, l.id, false, "模拟解除说明", blocked.version);
    await reserve(l, c);
    expect(
      await db.auditLog.count({
        where: { entityId: l.id, action: "DO_NOT_CONTACT_CHANGED" },
      }),
    ).toBe(2);
  });
  it("bounds quota under concurrent different recipients and stops new allocation at exhaustion", async () => {
    const c = await account({ dailyLimit: 1 }),
      l1 = await lead(),
      l2 = await lead();
    const results = await Promise.allSettled([reserve(l1, c), reserve(l2, c)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const entry = (await service.list(a)).accounts.find(
      (row) => row.id === c.id,
    )!;
    expect(entry.occupied).toBe(1);
    expect(entry.available).toBe(false);
    const zero = await account({ dailyLimit: 0 });
    await expect(reserve(await lead(), zero)).rejects.toThrow("额度耗尽");
  });
  it("retains successful first contact globally and fixes subsequent conversations to original account", async () => {
    const c = await account(),
      other = await account(),
      l = await lead();
    const attempt = await reserve(l, c);
    await finish(l, attempt, "SIMULATED_SUCCESS");
    await expect(reserve(l, c)).rejects.toThrow("重复首次");
    await expect(
      reserve(l, other, randomUUID(), a, "FOLLOWUP"),
    ).rejects.toThrow("固定原");
    expect((await reserve(l, c, randomUUID(), a, "FOLLOWUP")).kind).toBe(
      "FOLLOWUP",
    );
    expect((await service.contactState(a, l.id)).platformConfirmed).toBe(false);
  });
  it("preserves first-contact eligibility beyond the displayed history window", async () => {
    const c = await account(),
      l = await lead(),
      first = await reserve(l, c);
    await finish(l, first, "SIMULATED_SUCCESS");
    const ledger = await db.contactLedger.findUniqueOrThrow({
      where: { identityId: l.identityId },
    });
    await db.contactAttempt.createMany({
      data: Array.from({ length: 31 }, () => ({
        ledgerId: ledger.id,
        requestKey: randomUUID(),
        kind: "FOLLOWUP",
        outcome: "FAILED" as const,
        day: first.day,
        actorId: a.id,
      })),
    });
    const state = await service.contactState(a, l.id);
    expect(state.ledger!.attempts).toHaveLength(30);
    expect(state.ledger!.attempts.some((x) => x.kind === "FIRST")).toBe(false);
    expect(state.firstContactSimulated).toBe(true);
  });
  it("manual records are not platform confirmations and cannot bypass dedup by reverting stage", async () => {
    const l = await lead(),
      c = await account();
    await db.lead.update({
      where: { id: l.id },
      data: { contactedAt: new Date(), contactStage: "MATCHED" },
    });
    await expect(reserve(l, c)).rejects.toThrow("人工联系记录");
    const state = await service.contactState(a, l.id);
    expect(state.manuallyRecorded).toBe(true);
    expect(state.platformConfirmed).toBe(false);
  });
  it.each(["RATE_LIMITED", "VERIFICATION", "BANNED"] as const)(
    "pauses on %s and cannot retry on another account",
    async (reason) => {
      const l = await lead(),
        c = await account(),
        other = await account();
      const attempt = await reserve(l, c);
      await finish(l, attempt, "UNKNOWN", reason);
      expect(
        (await db.platformAccount.findUniqueOrThrow({ where: { id: c.id } }))
          .status,
      ).toBe("RESTRICTED");
      await expect(reserve(await lead(), c)).rejects.toThrow("受限");
      await expect(reserve(l, other)).rejects.toThrow("固定原");
    },
  );
  it("resolves concurrency once and releases original day, preserving a new UTC day", async () => {
    const now = vi.spyOn(
      service as unknown as { now(tx: unknown): Promise<Date> },
      "now",
    );
    now.mockResolvedValue(new Date("2026-10-20T23:59:59.999Z"));
    const c = await account({ dailyLimit: 1 }),
      l = await lead(),
      old = await reserve(l, c);
    expect(old.day).toBe("2026-10-20");
    now.mockResolvedValue(new Date("2026-10-21T00:00:00.000Z"));
    await reserve(await lead(), c);
    const results = await Promise.allSettled([
      finish(l, old, "FAILED"),
      finish(l, old, "FAILED"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (
        await db.accountDay.findUniqueOrThrow({
          where: { accountId_day: { accountId: c.id, day: "2026-10-20" } },
        })
      ).occupied,
    ).toBe(0);
    expect(
      (
        await db.accountDay.findUniqueOrThrow({
          where: { accountId_day: { accountId: c.id, day: "2026-10-21" } },
        })
      ).occupied,
    ).toBe(1);
    expect(utcDay(new Date("2026-10-21T00:30:00+08:00"))).toBe("2026-10-20");
    now.mockRestore();
  });
  it("keeps unknown occupancy through owner transfer/archive and allows authorized reconciliation", async () => {
    const c = await account(),
      l = await lead(),
      attempt = await reserve(l, c);
    const unknown = await finish(l, attempt, "UNKNOWN");
    await service.update(admin, c.id, 0, { ...input(b.id) });
    await expect(finish(l, unknown, "FAILED")).rejects.toThrow();
    await service.update(admin, c.id, 1, { archivedAt: new Date() });
    const done = await service.resolve(
      admin,
      l.id,
      unknown.id,
      "FAILED",
      "管理员核查模拟结果",
      unknown.version,
      undefined,
    );
    expect(done.outcome).toBe("FAILED");
    expect(
      await db.auditLog.count({
        where: { entityId: l.id, action: "SIMULATED_CONTACT_RECONCILED" },
      }),
    ).toBe(2);
  });
});
