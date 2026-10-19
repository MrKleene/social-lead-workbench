import "reflect-metadata";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { randomBytes } from "node:crypto";
import { AppModule } from "../src/app";
import { Db } from "../src/common/db";
import { configure } from "../src/bootstrap";
import { hashPassword } from "../src/auth/security";
import { SourcesService } from "../src/sources/sources";
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/crm_test")
  throw new Error(
    "需要独立 TEST_DATABASE_URL，数据库名必须为 crm_test；禁止对开发库执行测试清理",
  );
const db = new Db({ datasources: { db: { url } } });
const sources = new SourcesService(db);
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
const input = {
  platform: "XHS" as const,
  userId: "demo-a",
  nickname: "同名虚构用户",
  postId: "demo-post",
  postTitle: "虚构讨论",
  commentId: "demo-comment",
  originalText: "【虚构】需要了解团队协作，请提供说明。",
  summary: "虚构需求",
};
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
  const lead = await sources.ingestDemo(input);
  leadId = lead.id;
  await db.lead.update({ where: { id: leadId }, data: { ownerId: aId } });
  await sources.ingestDemo({
    ...input,
    userId: "demo-other",
    commentId: "demo-other-comment",
  });
  taskId = (await db.task.create({ data: { leadId, title: "虚构人工核验" } }))
    .id;
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
  it("会话 cookie HttpOnly / SameSite Strict，未返回密码摘要", async () => {
    const r = await api()
      .post("/api/auth/login")
      .set("Origin", origin)
      .send({ email: "admin@example.invalid", password });
    expect(r.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(r.headers["set-cookie"][0]).toContain("SameSite=Strict");
    expect(JSON.stringify(r.body)).not.toContain("passwordHash");
  });
  it("管理员看全部，销售仅看自己，另一销售看不到", async () => {
    expect((await read("/api/leads", admin)).body.length).toBe(2);
    expect(
      (await read("/api/leads", a)).body.map((v: { id: string }) => v.id),
    ).toEqual([leadId]);
    expect((await read("/api/leads", b)).body).toEqual([]);
  });
  it("销售不能借 URL 越权详情、跟进、负责人", async () => {
    expect((await read(`/api/leads/${leadId}`, b)).status).toBe(404);
    expect(
      (
        await write("post", `/api/leads/${leadId}/followups`, b, {
          content: "越权",
          nextFollowUpAt: null,
          status: "FOLLOWING",
          version: 0,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await write("patch", `/api/leads/${leadId}/owner`, a, {
          ownerId: bId,
          version: 0,
        })
      ).status,
    ).toBe(403);
  });
  it("销售不能查询用户目录或审计", async () => {
    expect((await read("/api/users", a)).status).toBe(403);
    expect((await read("/api/audit", a)).status).toBe(403);
    expect((await read("/api/users", admin)).body).not.toHaveProperty(
      "passwordHash",
    );
  });
  it("CSRF 缺失与跨站写入被拒绝", async () => {
    expect(
      (
        await api()
          .patch(`/api/leads/${leadId}/owner`)
          .set("Cookie", admin.cookie)
          .set("Origin", origin)
          .send({ ownerId: bId, version: 0 })
      ).status,
    ).toBe(403);
    expect(
      (
        await api()
          .post("/api/auth/logout")
          .set("Cookie", a.cookie)
          .set("Origin", "https://evil.invalid")
          .set("x-csrf-token", a.csrf)
      ).status,
    ).toBe(403);
  });
  it("严格验证拒绝角色注入、错误日期", async () => {
    expect(
      (
        await write("post", `/api/leads/${leadId}/followups`, a, {
          content: "记录",
          nextFollowUpAt: "bad",
          status: "FOLLOWING",
          version: 0,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await write("patch", `/api/leads/${leadId}/owner`, admin, {
          ownerId: bId,
          version: 0,
          role: "ADMIN",
        })
      ).status,
    ).toBe(400);
  });
  it("跟进与下次时间、阶段、审计原子更新", async () => {
    expect(
      (
        await write("post", `/api/leads/${leadId}/followups`, a, {
          content: "【虚构】待核对需求",
          nextFollowUpAt: "2030-01-01T08:00:00Z",
          status: "FOLLOWING",
          version: 0,
        })
      ).status,
    ).toBe(201);
    const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead.version).toBe(1);
    expect(lead.nextFollowUpAt?.toISOString()).toBe("2030-01-01T08:00:00.000Z");
    expect(
      await db.auditLog.count({ where: { action: "FOLLOWUP_CREATED" } }),
    ).toBe(1);
  });
  it("陈旧版本拒绝，事务不残留多余跟进", async () => {
    expect(
      (
        await write("post", `/api/leads/${leadId}/followups`, a, {
          content: "旧版本",
          nextFollowUpAt: null,
          status: "CLOSED",
          version: 0,
        })
      ).status,
    ).toBe(409);
    expect(await db.followUp.count({ where: { leadId } })).toBe(1);
  });
  it("人工核验保留说明且不标记为同意联系", async () => {
    expect(
      (
        await write("patch", `/api/leads/${leadId}/review`, a, {
          note: "【虚构】确认是明确求助，未取得联系同意",
          version: 1,
        })
      ).status,
    ).toBe(200);
    expect(
      (await db.lead.findUniqueOrThrow({ where: { id: leadId } })).reviewNote,
    ).toContain("未取得联系同意");
  });
  it("负责人必须为有效销售", async () => {
    expect(
      (
        await write("patch", `/api/leads/${leadId}/owner`, admin, {
          ownerId: adminId,
          version: 2,
        })
      ).status,
    ).toBe(400);
  });
  it("转交后旧销售立即失去详情、跟进及任务权限", async () => {
    expect(
      (
        await write("patch", `/api/leads/${leadId}/owner`, admin, {
          ownerId: bId,
          version: 2,
        })
      ).status,
    ).toBe(200);
    expect((await read(`/api/leads/${leadId}`, a)).status).toBe(404);
    expect((await read("/api/tasks", a)).body).toEqual([]);
    expect(
      (await write("patch", `/api/tasks/${taskId}`, a, { status: "DONE" }))
        .status,
    ).toBe(404);
    expect(
      (
        await write("post", `/api/leads/${leadId}/followups`, a, {
          content: "转交后写入",
          nextFollowUpAt: null,
          status: "FOLLOWING",
          version: 3,
        })
      ).status,
    ).toBe(403);
    expect((await read(`/api/leads/${leadId}`, b)).status).toBe(200);
  });
  it("新负责人能完成自己的任务，不能创建他人任务", async () => {
    expect(
      (await write("patch", `/api/tasks/${taskId}`, b, { status: "DONE" }))
        .status,
    ).toBe(200);
    expect(
      (
        await write("post", "/api/tasks", a, {
          leadId,
          title: "越权",
          dueAt: null,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await write("post", "/api/tasks", b, {
          leadId,
          title: "虚构复核任务",
          dueAt: null,
        })
      ).status,
    ).toBe(201);
  });
  it("并发转交只有一个版本获胜", async () => {
    const results = await Promise.all(
      [aId, bId].map((ownerId) =>
        write("patch", `/api/leads/${leadId}/owner`, admin, {
          ownerId,
          version: 3,
        }),
      ),
    );
    expect(results.map((v) => v.status).sort()).toEqual([200, 409]);
  });
  it("相同平台用户和评论重复导入保持幂等", async () => {
    await sources.ingestDemo(input);
    await sources.ingestDemo(input);
    expect(
      await db.platformIdentity.count({
        where: { platform: "XHS", platformUserId: input.userId },
      }),
    ).toBe(1);
    expect(
      await db.sourceComment.count({
        where: { platform: "XHS", platformCommentId: input.commentId },
      }),
    ).toBe(1);
  });
  it("并发重复导入保持唯一", async () => {
    const item = {
      ...input,
      userId: "demo-concurrent",
      commentId: "demo-concurrent",
    };
    const result = await Promise.all([
      sources.ingestDemo(item),
      sources.ingestDemo(item),
    ]);
    expect(result[0].id).toBe(result[1].id);
  });
  it("同名跨平台绝不合并，即使平台 ID 字符串相同", async () => {
    const result = await sources.ingestDemo({ ...input, platform: "DOUYIN" });
    expect(result.id).not.toBe(leadId);
    expect(
      await db.platformIdentity.count({
        where: { platformUserId: input.userId },
      }),
    ).toBe(2);
    expect(
      await db.sourceComment.count({
        where: { platformCommentId: input.commentId },
      }),
    ).toBe(2);
  });
  it("重复评论 ID 内容冲突拒绝并保留原文", async () => {
    await expect(
      sources.ingestDemo({ ...input, originalText: "篡改原文" }),
    ).rejects.toThrow();
    expect(
      (
        await db.sourceComment.findUniqueOrThrow({
          where: {
            platform_platformCommentId: {
              platform: "XHS",
              platformCommentId: input.commentId,
            },
          },
        })
      ).originalText,
    ).toBe(input.originalText);
  });
  it("数据库唯一约束在直接写入时仍有效", async () => {
    await expect(
      db.platformIdentity.create({
        data: {
          platform: "XHS",
          platformUserId: input.userId,
          nickname: "重复",
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    await expect(
      db.sourceComment.create({
        data: {
          ...(await db.sourceComment.findUniqueOrThrow({
            where: {
              platform_platformCommentId: {
                platform: "XHS",
                platformCommentId: input.commentId,
              },
            },
          })),
          id: "different-id",
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
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
    expect((await read("/api/leads", temp)).status).toBe(401);
  });
  it("过期会话与禁用用户不能访问", async () => {
    const temp = await login("sales-b@example.invalid");
    await db.user.update({ where: { id: bId }, data: { active: false } });
    expect((await read("/api/leads", temp)).status).toBe(401);
    await db.user.update({ where: { id: bId }, data: { active: true } });
    await db.session.updateMany({
      where: { userId: bId },
      data: { expiresAt: new Date(0) },
    });
    expect((await read("/api/leads", temp)).status).toBe(401);
  });
  it("登录按账号限速且错误不泄露账号存在", async () => {
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
  });
});
