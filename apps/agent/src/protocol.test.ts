import { describe, it, expect } from "vitest";
import { handleTask, validateMcpUrl } from "./protocol";
describe("隔离 agent 协议", () => {
  it("仅健康检查且不触达平台", () =>
    expect(
      handleTask({
        version: 1,
        id: "demo",
        type: "HEALTHCHECK",
        accountStatus: "UNCONNECTED",
      }).status,
    ).toBe("SKIPPED"));
  it("受限与暂停账号不会执行或换号", () => {
    for (const accountStatus of ["RESTRICTED", "PAUSED"])
      expect(
        handleTask({
          version: 1,
          id: "demo",
          type: "HEALTHCHECK",
          accountStatus,
        }).reason,
      ).toBe("PLATFORM_CALLS_DISABLED");
  });
  it("拒绝发送类型和版本漂移", () => {
    expect(() =>
      handleTask({
        version: 1,
        id: "demo",
        type: "COMMENT",
        accountStatus: "RESTRICTED",
      }),
    ).toThrow();
    expect(() =>
      handleTask({
        version: 2,
        id: "demo",
        type: "HEALTHCHECK",
        accountStatus: "PAUSED",
      }),
    ).toThrow();
  });
  it("拒绝远端 MCP 地址与带凭据 URL", () => {
    for (const value of [
      "https://example.com",
      "http://127.0.0.1.evil.invalid",
      "http://user:secret@localhost",
    ])
      expect(() => validateMcpUrl(value)).toThrow();
    expect(validateMcpUrl("http://127.0.0.1:18060").hostname).toBe("127.0.0.1");
  });
});
