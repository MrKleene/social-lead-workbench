import "reflect-metadata";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app";
import { Db } from "../src/common/db";
import { configure } from "../src/bootstrap";
let app: INestApplication;
const databaseProbe=vi.fn().mockResolvedValue([{ready:1}]);
beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Db)
    .useValue({ $queryRaw:databaseProbe, session: { findUnique: async () => null } })
    .compile();
  app = mod.createNestApplication({ bodyParser: false });
  configure(app);
  await app.init();
});
afterAll(async () => app.close());
describe("未认证 HTTP 边界", () => {
  it("health 声明平台能力禁用", async () => {
    const r = await request(app.getHttpServer()).get("/api/health");
    expect(r.status).toBe(200);
    expect(r.body.platformCallsEnabled).toBe(false);
  });
  it("ready 在数据库响应后成功", async()=>{const r=await request(app.getHttpServer()).get("/api/health/ready");expect(r.status).toBe(200);expect(r.body.database).toBe("ready")});
  it("ready 在数据库不可用时失败且不泄露细节", async()=>{databaseProbe.mockRejectedValueOnce(new Error("internal connection detail"));const r=await request(app.getHttpServer()).get("/api/health/ready");expect(r.status).toBe(503);expect(JSON.stringify(r.body)).not.toContain("internal connection detail")});
  for (const route of [
    "leads",
    "tasks",
    "users",
    "audit",
    "platforms",
    "events",
    "auth/me",
    "collection/configs",
    "notices",
  ])
    it(`匿名无法读取 ${route}`, async () => {
      expect(
        (await request(app.getHttpServer()).get(`/api/${route}`)).status,
      ).toBe(401);
    });
  it("伪造会话不被信任", async () => {
    expect(
      (
        await request(app.getHttpServer())
          .get("/api/leads")
          .set("Cookie", `crm_session=${"a".repeat(64)}`)
      ).status,
    ).toBe(401);
  });
  it("登录拒绝缺失 Origin", async () => {
    expect(
      (
        await request(app.getHttpServer())
          .post("/api/auth/login")
          .send({ email: "x@example.invalid", password: "fictional" })
      ).status,
    ).toBe(403);
  });
  it("Agent 未授权时不分发任务", async () => {
    expect(
      (await request(app.getHttpServer()).post("/api/agent/claim")).status,
    ).toBe(503);
  });
});
