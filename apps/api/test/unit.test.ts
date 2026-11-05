import { describe, it, expect } from "vitest";
import {
  requireAdmin,
  scope,
  hashPassword,
  verifyPassword,
  digest,
  token,
  assertOrigin,
  Actor,
} from "../src/auth/security";
const sales: Actor = {
  id: "sales-a",
  name: "虚构销售",
  email: "a@example.invalid",
  role: "SALES",
};
const admin: Actor = { ...sales, id: "admin", role: "ADMIN" };
describe("服务端权限与安全原语", () => {
  it("非管理员仅拥有自己的账号查询条件", () =>
    expect(scope(sales)).toEqual({ ownerId: sales.id }));
  it("管理员全量范围", () => expect(scope(admin)).toEqual({}));
  it("管理操作仅管理员", () => {
    expect(() => requireAdmin(sales)).toThrow();
    expect(() => requireAdmin(admin)).not.toThrow();
  });
  it("Argon2id 随机盐与密码验证", async () => {
    const a = await hashPassword("fictional-test-password-123"),
      b = await hashPassword("fictional-test-password-123");
    expect(a).not.toEqual(b);
    expect(a).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(a, "fictional-test-password-123")).toBe(true);
    expect(await verifyPassword(a, "wrong")).toBe(false);
  });
  it("会话只持久化摘要且 token 随机", () => {
    const a = token(),
      b = token();
    expect(a).not.toBe(b);
    expect(digest(a)).not.toBe(a);
    expect(a.length).toBe(64);
  });
  it("拒绝跨站和缺失 Origin", () => {
    expect(() => assertOrigin("https://evil.invalid")).toThrow();
    expect(() => assertOrigin(undefined)).toThrow();
    expect(() => assertOrigin("http://127.0.0.1:5173")).not.toThrow();
  });
});

import {accountSystemBlock,accountReadBlock,accountModeBlocked} from '../src/accounts/account-execution-policy';
describe('system account eligibility without manual participation state',()=>{
 it.each(['UNCONNECTED','PAUSED'])('accepts neutral/initial-login metadata %s without granting send authority',status=>{
  const a={status,pauseReason:'登录已验证；只读采集须逐次确认，发送禁用'};
  expect(accountSystemBlock(a)).toBeNull();expect(accountModeBlocked(a,'REAL')).toBe(false);
 });
 it.each([{status:'RESTRICTED',pauseReason:'RATE_LIMITED'},{status:'PAUSED',pauseReason:null},{status:'PAUSED',pauseReason:'管理员风控暂停'}])('retains conservative legacy holds %#',a=>{expect(accountSystemBlock(a)).toBeTruthy();expect(accountModeBlocked(a,'REAL')).toBe(true);});
 it('retains the historical reported restriction independently of neutral status or a fresh login',()=>{for(const status of ['UNCONNECTED','PAUSED'])expect(accountSystemBlock({platform:'XHS',loginPlatformUserId:'6334380e000000001802cc73',status,pauseReason:null})).toBe('历史回复限制，禁止回复');});
 it.each(['UNCONNECTED','PAUSED'])('scopes only the confirmed historical reply hold away from reads: %s',status=>{const a={platform:'XHS',loginPlatformUserId:'6334380e000000001802cc73',status,pauseReason:'登录已验证；只读采集须逐次确认，发送禁用'};expect(accountReadBlock(a)).toBeNull();expect(accountSystemBlock(a)).toBe('历史回复限制，禁止回复');expect(accountModeBlocked(a,'REAL')).toBe(true);});
 it.each([{status:'RESTRICTED',pauseReason:'RATE_LIMITED'},{status:'RESTRICTED',pauseReason:'RESTRICTED'},{status:'PAUSED',pauseReason:null},{status:'PAUSED',pauseReason:'未知风险'}])('historical reply scope never clears additional account-wide metadata %#',state=>{expect(accountReadBlock({platform:'XHS',loginPlatformUserId:'6334380e000000001802cc73',...state})).toBeTruthy();});
 it('does not grant simulation tasks to paused legacy simulation accounts',()=>expect(accountModeBlocked({status:'PAUSED',pauseReason:'登录已验证；只读采集须逐次确认，发送禁用'},'SIMULATION')).toBe(true));
});
