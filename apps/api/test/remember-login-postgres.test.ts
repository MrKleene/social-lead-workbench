import "reflect-metadata";
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { AuthModule, cookieOptions } from "../src/auth/auth";
import { Db, DatabaseModule } from "../src/common/db";
import { configure } from "../src/bootstrap";
import { hashPassword, token, digest } from "../src/auth/security";
import { REMEMBER_MS, SESSION_MS, ROTATION_RACE_MS } from "../src/auth/remember-login";
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/crm_test") throw new Error("Requires isolated crm_test database");
const db = new Db({ datasources: { db: { url } } });
const origin = "http://127.0.0.1:5173", password = token();
let app: INestApplication, userId: string;
const email = `remember-${randomUUID()}@example.invalid`;
type Auth = { session: string; refresh: string; csrf: string };
const api = () => request(app.getHttpServer());
const cookies = (r: request.Response): Auth => {
  const values = r.headers['set-cookie'] as unknown as string[];
  return { session: values.find(v => v.startsWith('crm_session='))!.split(';')[0], refresh: values.find(v => v.startsWith('crm_refresh='))!.split(';')[0], csrf: r.body.csrfToken };
};
const rawRefresh = (a: Auth) => a.refresh.split('=')[1];
const refresh = (a: Auth) => api().post('/api/auth/refresh').set('Origin', origin).set('x-crm-auth', '1').set('Cookie', a.refresh).send({});
const me = (a: Auth) => api().get('/api/auth/me').set('Cookie', a.session);
async function login(remember = true) {
  const r = await api().post('/api/auth/login').set('Origin', origin).send({ email, password, remember });
  expect(r.status).toBe(201); return { response: r, auth: cookies(r) };
}
beforeAll(async () => {
  const user = await db.user.create({ data: { email, name: 'Synthetic remember-login test', passwordHash: await hashPassword(password), role: 'ADMIN' } });
  userId = user.id;
  const mod = await Test.createTestingModule({ imports: [DatabaseModule, AuthModule] }).overrideProvider(Db).useValue(db).compile();
  app = mod.createNestApplication({ bodyParser: false }); configure(app); await app.init();
});
beforeEach(async () => { vi.restoreAllMocks(); await db.loginBucket.deleteMany(); });
afterAll(async () => { vi.restoreAllMocks(); await db.auditLog.deleteMany({ where: { actorId: userId } }); await db.user.delete({ where: { id: userId } }); await app.close(); });
describe('remember login with real PostgreSQL', () => {
  it('opts in explicitly, stores only token hashes and scopes HttpOnly cookies', async () => {
    const short = await login(false);
    expect(short.auth.refresh).toBe('crm_refresh=');
    expect((await db.session.findUniqueOrThrow({ where: { id: digest(short.auth.session.split('=')[1]) } })).refreshGrantId).toBeNull();
    expect((await refresh(short.auth)).status).toBe(401);
    const { auth, response } = await login();
    const row = await db.refreshToken.findUniqueOrThrow({ where: { id: digest(rawRefresh(auth)) }, include: { grant: true } });
    expect(row.id).not.toBe(rawRefresh(auth));
    expect(row.grant.expiresAt.getTime() - Date.now()).toBeGreaterThan(REMEMBER_MS - 5000);
    expect(String(response.headers['set-cookie'])).toContain('HttpOnly');
    expect(String(response.headers['set-cookie'])).toContain('Path=/api/auth');
    expect(String(response.headers['set-cookie'])).toContain('SameSite=Strict');
    expect(response.body).not.toHaveProperty('refreshRaw');
    expect(response.headers['cache-control']).toBe('no-store');
    vi.stubEnv('APP_ORIGIN', 'https://example.invalid'); expect(cookieOptions().secure).toBe(true); vi.unstubAllEnvs();
  });
  it('renews after 8h, rotates once, and keeps the absolute deadline', async () => {
    const { auth } = await login();
    const before = await db.refreshToken.findUniqueOrThrow({ where: { id: digest(rawRefresh(auth)) }, include: { grant: true } });
    const clock = Date.now() + SESSION_MS + 1;
    await db.session.updateMany({ where: { refreshGrantId: before.grantId }, data: { expiresAt: new Date(0) } });
    expect((await me(auth)).status).toBe(401);
    vi.spyOn(Date, 'now').mockReturnValue(clock);
    const result = await refresh(auth); expect(result.status).toBe(201);
    const next = cookies(result); expect(next.refresh).not.toBe(auth.refresh); expect((await me(next)).status).toBe(200);
    const after = await db.refreshToken.findUniqueOrThrow({ where: { id: digest(rawRefresh(next)) }, include: { grant: true } });
    expect(after.grant.expiresAt).toEqual(before.grant.expiresAt);
    expect((await db.session.findUniqueOrThrow({ where: { id: digest(next.session.split('=')[1]) } })).expiresAt.getTime()).toBe(clock + SESSION_MS);
  });
  it('serializes simultaneous refresh: one winner, one 409, no duplicate credentials', async () => {
    const { auth } = await login();
    const results = await Promise.all([refresh(auth), refresh(auth), refresh(auth)]);
    expect(results.map(r => r.status).sort()).toEqual([201, 409, 409]);
    for (const r of results.filter(r => r.status === 409)) expect(r.headers['set-cookie']).toBeUndefined();
    expect((await me(cookies(results.find(r => r.status === 201)!))).status).toBe(200);
  });
  it('revokes the family on later old-token replay, committing revocation before 401', async () => {
    const { auth } = await login(); const next = cookies(await refresh(auth));
    await db.refreshToken.update({ where: { id: digest(rawRefresh(auth)) }, data: { usedAt: new Date(Date.now() - ROTATION_RACE_MS - 1) } });
    expect((await refresh(auth)).status).toBe(401);
    expect((await me(next)).status).toBe(401);
    expect((await refresh(next)).status).toBe(401);
  });
  it('caps the last short session and rejects the 30-day absolute boundary', async () => {
    const { auth } = await login();
    const row = await db.refreshToken.findUniqueOrThrow({ where: { id: digest(rawRefresh(auth)) }, include: { grant: true } });
    vi.spyOn(Date, 'now').mockReturnValue(row.grant.expiresAt.getTime() - 1000);
    const next = cookies(await refresh(auth));
    const session = await db.session.findUniqueOrThrow({ where: { id: digest(next.session.split('=')[1]) } });
    expect(session.expiresAt).toEqual(row.grant.expiresAt);
    vi.spyOn(Date, 'now').mockReturnValue(row.grant.expiresAt.getTime());
    expect((await refresh(next)).status).toBe(401);
  });
  it('logout revokes an expired short session and its refresh family without refreshing', async () => {
    const { auth } = await login();
    await db.session.updateMany({ where: { userId }, data: { expiresAt: new Date(0) } });
    const r = await api().post('/api/auth/logout').set('Origin', origin).set('x-crm-auth', '1').set('Cookie', [auth.session, auth.refresh]).send({});
    expect(r.status).toBe(201); expect((await refresh(auth)).status).toBe(401);
    expect(String(r.headers['set-cookie'])).toContain('Expires=Thu, 01 Jan 1970');
  });
  it('rejects cross-site, missing-origin and missing-header refresh/logout without rotation', async () => {
    const { auth } = await login();
    for (const path of ['refresh', 'logout']) {
      for (const badOrigin of ['https://evil.invalid', undefined]) {
        const req = api().post(`/api/auth/${path}`).set('x-crm-auth', '1').set('Cookie', auth.refresh);
        if (badOrigin) req.set('Origin', badOrigin);
        expect((await req.send({})).status).toBe(403);
      }
      expect((await api().post(`/api/auth/${path}`).set('Origin', origin).set('Cookie', auth.refresh).send({})).status).toBe(403);
    }
    expect((await refresh(auth)).status).toBe(201);
  });
  it('password changes revoke both short and remembered login, including legacy sessions', async () => {
    const { auth } = await login(); const legacy = token();
    await db.session.create({ data: { id: digest(legacy), userId, csrfToken: token(), expiresAt: new Date(Date.now() + SESSION_MS) } });
    const original = (await db.user.findUniqueOrThrow({ where: { id: userId } })).passwordHash;
    await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(token()) } });
    expect((await refresh(auth)).status).toBe(401); expect((await me(auth)).status).toBe(401);
    expect((await api().get('/api/auth/me').set('Cookie', `crm_session=${legacy}`)).status).toBe(401);
    await db.user.update({ where: { id: userId }, data: { passwordHash: original } });
  });
  it('disabled accounts stay revoked after reactivation', async () => {
    const { auth } = await login();
    await db.user.update({ where: { id: userId }, data: { active: false } });
    expect((await me(auth)).status).toBe(401); expect((await refresh(auth)).status).toBe(401);
    await db.user.update({ where: { id: userId }, data: { active: true } });
    expect((await refresh(auth)).status).toBe(401);
  });
  it('admin revocation invalidates all sessions and remembers', async () => {
    const { auth } = await login();
    const r = await api().post(`/api/auth/users/${userId}/revoke`).set('Origin', origin).set('Cookie', auth.session).set('x-csrf-token', auth.csrf).send({});
    expect(r.status).toBe(201); expect((await refresh(auth)).status).toBe(401); expect((await me(auth)).status).toBe(401);
  });
  it('logout racing refresh always leaves the family revoked', async () => {
    const { auth } = await login();
    const [rotated, logout] = await Promise.all([
      refresh(auth),
      api().post('/api/auth/logout').set('Origin', origin).set('x-crm-auth', '1').set('Cookie', [auth.session, auth.refresh]).send({}),
    ]);
    expect(logout.status).toBe(201);
    expect([201, 401]).toContain(rotated.status);
    expect((await refresh(auth)).status).toBe(401);
    if (rotated.status === 201) {
      const next = cookies(rotated);
      expect((await refresh(next)).status).toBe(401);
      expect((await me(next)).status).toBe(401);
    }
  });
  it('admin revoke rejects missing CSRF and non-admin roles', async () => {
    const { auth } = await login();
    expect((await api().post(`/api/auth/users/${userId}/revoke`).set('Origin', origin).set('Cookie', auth.session).send({})).status).toBe(403);
    await db.user.update({ where: { id: userId }, data: { role: 'SALES' } });
    expect((await api().post(`/api/auth/users/${userId}/revoke`).set('Origin', origin).set('Cookie', auth.session).set('x-csrf-token', auth.csrf).send({})).status).toBe(403);
    await db.user.update({ where: { id: userId }, data: { role: 'ADMIN' } });
    expect((await refresh(auth)).status).toBe(201);
  });
  it('legacy sessions remain usable but are never silently upgraded', async () => {
    const legacy = token();
    await db.session.create({ data: { id: digest(legacy), userId, csrfToken: token(), expiresAt: new Date(Date.now() + SESSION_MS) } });
    const r = await api().get('/api/auth/me').set('Cookie', `crm_session=${legacy}`);
    expect(r.status).toBe(200); expect(r.headers['set-cookie']).toBeUndefined();
    expect((await api().post('/api/auth/refresh').set('Origin', origin).set('x-crm-auth', '1').set('Cookie', `crm_session=${legacy}`).send({})).status).toBe(401);
  });
  it('throttles refresh without rotating or extending lifetime', async () => {
    const { auth } = await login();
    const key = digest(`refresh-token:${digest(rawRefresh(auth))}:${Math.floor(Date.now() / 60000)}`);
    await db.loginBucket.create({ data: { key, count: 20, expiresAt: new Date(Date.now() + 60000) } });
    expect((await refresh(auth)).status).toBe(429);
    expect((await db.refreshToken.findUniqueOrThrow({ where: { id: digest(rawRefresh(auth)) } })).usedAt).toBeNull();
  });
});
