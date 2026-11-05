import {quotaBucket,shanghaiDay} from '../src/auto-contact/contact-policy';
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
  await db.contactAttempt.deleteMany({where:{ledger:{identityId:{in:identities}}}});
  await db.contactLedger.deleteMany({where:{identityId:{in:identities}}});
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
  it("QR create and replacement preserve HTTP Origin, CSRF and administrator boundaries",async()=>{
    const api=request(app.getHttpServer()),c=await account();
    const auth=await api.post('/api/auth/login').set('Origin','http://127.0.0.1:5173').send({email:admin.email,password});
    const cookie=auth.headers['set-cookie'][0].split(';')[0];
    const salesAuth=await api.post('/api/auth/login').set('Origin','http://127.0.0.1:5173').send({email:b.email,password});
    const salesCookie=salesAuth.headers['set-cookie'][0].split(';')[0];
    for(const consent of ['local-session-v1','local-session-replace-v1']){
      const payload={requestKey:randomUUID(),consent};
      expect((await api.post(`/api/accounts/${c.id}/login`).set('Cookie',cookie).set('Origin','http://127.0.0.1:5173').send(payload)).status).toBe(403);
      expect((await api.post(`/api/accounts/${c.id}/login`).set('Cookie',cookie).set('Origin','https://foreign.invalid').set('x-csrf-token',auth.body.csrfToken).send(payload)).status).toBe(403);
      expect((await api.post(`/api/accounts/${c.id}/login`).set('Cookie',salesCookie).set('Origin','http://127.0.0.1:5173').set('x-csrf-token',salesAuth.body.csrfToken).send(payload)).status).toBe(403);
      expect((await api.post(`/api/accounts/${c.id}/login`).set('Cookie',cookie).set('Origin','http://127.0.0.1:5173').set('x-csrf-token',auth.body.csrfToken).send({...payload,cookie:'SYNTHETIC_FORBIDDEN_INPUT'})).status).toBe(400);
    }
    expect(await db.accountLogin.count({where:{accountId:c.id}})).toBe(0);
  });
});
it('metadata-only edit preserves real system restrictions and rejects legacy state clearing',async()=>{
 const row=await account({status:'RESTRICTED',pauseReason:'RATE_LIMITED'});await db.platformAccount.update({where:{id:row.id},data:{isDemo:false}});
 const changed=await service.update(admin,row.id,row.version,{label:'只改备注',ownerId:a.id,dailyLimit:8});
 expect(changed).toMatchObject({status:'RESTRICTED',pauseReason:'RATE_LIMITED',dailyLimit:8});
 await expect(service.update(admin,row.id,changed.version,{label:'试图清除',ownerId:a.id,dailyLimit:8,status:'UNCONNECTED',pauseReason:null})).rejects.toThrow('账号资格由系统检查维护');
 expect((await db.platformAccount.findUniqueOrThrow({where:{id:row.id}})).status).toBe('RESTRICTED');
});

it('real account quota display uses the shared Shanghai bucket, preserving legacy simulation usage',async()=>{
 const row=await account();await db.platformAccount.update({where:{id:row.id},data:{isDemo:false}});
 const now=new Date();await db.accountDay.createMany({data:[{accountId:row.id,day:quotaBucket('REAL',now),occupied:2},{accountId:row.id,day:utcDay(now),occupied:7}]});
 const displayed=(await service.list(admin)).accounts.find(a=>a.id===row.id);expect(displayed).toMatchObject({occupied:2,day:shanghaiDay(now)});
});
