import "reflect-metadata";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { randomBytes } from "node:crypto";
import { AppModule } from "../src/app";
import { Db } from "../src/common/db";
import { configure } from "../src/bootstrap";
import { hashPassword } from "../src/auth/security";

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/crm_test")
  throw new Error(
    "需要独立 TEST_DATABASE_URL，数据库名必须为 crm_test；禁止对开发库执行测试清理",
  );
const db = new Db({ datasources: { db: { url } } });

const origin = "http://127.0.0.1:5173";
const password = randomBytes(24).toString("hex");
let app: INestApplication,
  adminId: string,
  aId: string,
  bId: string,
  leadId: string,
  taskId: string;
type Login = { cookie: string; csrf: string };
let admin: Login, a: Login, b: Login;
const api = () => request(app.getHttpServer());
const write = (
  method: "post" | "patch",
  path: string,
  auth: Login,
  body: object,
) =>
  api()
    [method](path)
    .set("Cookie", auth.cookie)
    .set("Origin", origin)
    .set("x-csrf-token", auth.csrf)
    .send(body);
const read = (path: string, auth: Login) =>
  api().get(path).set("Cookie", auth.cookie);
async function clean() {
  await db.noticeRead.deleteMany();
  await db.collectionNotice.deleteMany();
  await db.sourceMatch.deleteMany();
  await db.commentObservation.deleteMany();
  await db.monitorPost.deleteMany();
  await db.collectionRun.deleteMany();
  await db.collectionConfig.deleteMany();
  await db.replyTemplate.deleteMany();
  await db.auditLog.deleteMany();
  await db.task.deleteMany();
  await db.followUp.deleteMany();
  await db.lead.deleteMany();
  await db.sourceComment.deleteMany();
  await db.sourcePost.deleteMany();
  await db.platformIdentity.deleteMany();
  await db.platformAccount.deleteMany();
  await db.session.deleteMany();
  await db.loginBucket.deleteMany();
  await db.user.deleteMany();
}
async function login(email: string) {
  const r = await api()
    .post("/api/auth/login")
    .set("Origin", origin)
    .send({ email, password });
  expect(r.status).toBe(201);
  return {
    cookie: r.headers["set-cookie"][0].split(";")[0],
    csrf: r.body.csrfToken,
  };
}
beforeAll(async () => {
  await clean();
  const hash = await hashPassword(password);
  const users = await Promise.all(
    ["admin", "sales-a", "sales-b"].map((name, i) =>
      db.user.create({
        data: {
          email: `${name}@example.invalid`,
          name: `测试${name}`,
          role: i === 0 ? "ADMIN" : "SALES",
          passwordHash: hash,
        },
      }),
    ),
  );
  [adminId, aId, bId] = users.map((v) => v.id);
  const mod = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Db)
    .useValue(db)
    .compile();
  app = mod.createNestApplication({ bodyParser: false });
  configure(app);
  await app.init();
  admin = await login("admin@example.invalid");
  a = await login("sales-a@example.invalid");
  b = await login("sales-b@example.invalid");
}, 30000);
afterAll(async () => {
  if (app) await app.close();
  await clean();
  await db.$disconnect();
});
describe("真实 PostgreSQL + Nest HTTP 集成", () => {
  it("retired CRM routes have no read/write handlers, even for administrators", async () => {
    for (const path of ['/api/leads','/api/tasks','/api/notices','/api/leads/fixture','/api/leads/fixture/account-contact','/api/reply-templates/for-lead/fixture']) expect((await read(path,admin)).status).toBe(404);
    for (const path of ['/api/leads/fixture/followups','/api/leads/fixture/tasks','/api/leads/fixture/account-contact/reserve','/api/sources/demo']) expect((await write('post',path,admin,{})).status).toBe(404);
    expect(await db.lead.count()).toBe(0); expect(await db.task.count()).toBe(0); expect(await db.followUp.count()).toBe(0);
  });
  it("template writes retain CSRF and strict validation", async()=>{
    expect((await api().post('/api/reply-templates').set('Cookie',admin.cookie).set('Origin',origin).send({name:'fictional',channel:'COMMENT',body:'hello'})).status).toBe(403);
    expect((await write('post','/api/reply-templates',admin,{name:'fictional',channel:'COMMENT',body:'hello',role:'ADMIN'})).status).toBe(400);
  });

  it("会话 cookie HttpOnly / SameSite Strict，未返回密码摘要", async () => {
    const r = await api()
      .post("/api/auth/login")
      .set("Origin", origin)
      .send({ email: "admin@example.invalid", password });
    expect(r.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(r.headers["set-cookie"][0]).toContain("SameSite=Strict");
    expect(JSON.stringify(r.body)).not.toContain("passwordHash");
  });
  it("销售不能查询用户目录或审计", async () => {
    expect((await read("/api/users", a)).status).toBe(403);
    expect((await read("/api/audit", a)).status).toBe(403);
    expect((await read("/api/users", admin)).body).not.toHaveProperty(
      "passwordHash",
    );
  });
  it("平台发送能力全部禁用，受限账号仅可暂停", async () => {
    const account = await db.platformAccount.create({
      data: { platform: "XHS", label: "虚构受限账号", status: "RESTRICTED" },
    });
    expect(
      (await write("post", `/api/platforms/${account.id}/pause`, a, {})).status,
    ).toBe(403);
    expect(
      (await write("post", `/api/platforms/${account.id}/pause`, admin, {}))
        .body.status,
    ).toBe("PAUSED");
    const r = await read("/api/platforms", admin);
    expect(
      r.body.capabilities.every(
        (x: { comment: boolean; directMessage: boolean }) =>
          !x.comment && !x.directMessage,
      ),
    ).toBe(true);
  });
  it("注销撤销服务器会话", async () => {
    const temp = await login("sales-b@example.invalid");
    expect((await write("post", "/api/auth/logout", temp, {})).status).toBe(
      201,
    );
    expect((await read("/api/auth/me", temp)).status).toBe(401);
  });
  it("过期会话与禁用用户不能访问", async () => {
    const temp = await login("sales-b@example.invalid");
    await db.user.update({ where: { id: bId }, data: { active: false } });
    expect((await read("/api/auth/me", temp)).status).toBe(401);
    await db.user.update({ where: { id: bId }, data: { active: true } });
    await db.session.updateMany({
      where: { userId: bId },
      data: { expiresAt: new Date(0) },
    });
    expect((await read("/api/auth/me", temp)).status).toBe(401);
  });
  it("登录按账号限速且错误不泄露账号存在", async () => {
    // Keep this limit assertion in one 15-minute bucket, even across wall-clock rollover.
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now());
    try {
    let status = 0;
    for (let i = 0; i < 11; i++) {
      const r = await api()
        .post("/api/auth/login")
        .set("Origin", origin)
        .send({ email: "nonexistent@example.invalid", password: "wrong" });
      status = r.status;
      if (i === 0) {
        expect(status).toBe(401);
        expect(r.body.message).toBe("邮箱或密码错误");
      }
    }
    expect(status).toBe(429);
    } finally { clock.mockRestore(); }
  });
});
