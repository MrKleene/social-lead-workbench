import {selectOption,controlValue} from './ui-controls.mjs';
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const root = fileURLToPath(new URL("../", import.meta.url)).replace(/\/$/, ""),
  out = `${root}/docs/evidence/accounts-2026-10-20`;
mkdirSync(out, { recursive: true });
const stack = spawn(process.execPath, ["scripts/dev-mock-isolated.mjs"], {
  cwd: root,
  env: {
    ...process.env,
    DOTENV_CONFIG_PATH: "/dev/null",
    XHS_MCP_ENABLED: "0",
  },
  stdio: ["pipe", "pipe", "pipe"],
});
let output = "",
  browser,
  context,
  preview;
const errors = [],
  checks = {
    environment: "independent disposable mock preview; NOT user 63445",
    realPlatformCalls: false,
  };
stack.stdout.on("data", (d) => (output += d));
stack.stderr.on("data", () => {});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 30000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await fn()) return;
    await wait(150);
  }
  throw Error("Wait timeout");
}
try {
  await until(() => output.includes("One-run password"), 60000);
  const base = output.match(/MOCK \(fictional\) preview: (http:\/\/[^\s]+)/)[1],
    password = output.match(
      /One-run password \(never save in browser\): ([^\s]+)/,
    )[1];
  assert(!base.includes(":63445"));
  checks.preview = base;
  preview = base;
  await until(async () => {
    try {
      return (await fetch(`${base}/api/health`)).ok;
    } catch {
      return false;
    }
  });
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {}),
  });
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.getByLabel("登录邮箱").fill("admin@fixture.invalid");
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录工作台" }).click();
  await page.waitForURL("**/work");
  const session = await (
    await context.request.get(`${base}/api/auth/me`)
  ).json();
  async function api(path, method = "GET", body) {
    const res = await context.request.fetch(`${base}/api${path}`, {
      method,
      headers: { Origin: base, "x-csrf-token": session.csrfToken },
      ...(body ? { data: body } : {}),
    });
    assert(res.ok(), `${method} ${path} ${res.status()} ${await res.text()}`);
    return res.json();
  }
  const users = await api("/users"),
    sales = users.find((u) => u.name === "模拟销售甲");
  await page.locator(".node-accounts").focus();
  await page.keyboard.press("Enter");
  await page
    .locator('.space-panel[data-panel="accounts"][data-active="true"]')
    .waitFor();
  await wait(700);
  await page.getByRole("button", { name: "添加模拟账号", exact: true }).click();
  await page.getByLabel("别名", { exact: true }).fill("小红书 · 模拟顾问一号");
  await selectOption(page.getByLabel("负责人", { exact: true }), sales.id);
  await page.getByRole("button", { name: "保存元数据", exact: true }).click();
  await until(async () => (await page.locator(".account-card").count()) === 1);
  await api("/accounts", "POST", {
    platform: "XHS",
    label: "小红书 · 模拟顾问二号",
    ownerId: sales.id,
    dailyLimit: 10,
    status: "PAUSED",
    pauseReason: "人工暂停，等待核查",
  });
  await api("/accounts", "POST", {
    platform: "DOUYIN",
    label: "抖音 · 能力待接入",
    ownerId: null,
    dailyLimit: 0,
    status: "UNCONNECTED",
    pauseReason: null,
  });
  await page.reload();
  await page.locator(".account-card").nth(2).waitFor();
  await wait(600);
  checks.createThroughUI = true;
  // An unsaved draft survives mounted-module switches and query refresh; local selection can cancel.
  await page.getByLabel("别名", { exact: true }).fill("尚未保存的模拟草稿");
  await page.locator(".node-templates").click();
  await page.locator(".node-accounts").click();
  assert.equal(
    await controlValue(page.getByLabel("别名", { exact: true })),
    "尚未保存的模拟草稿",
  );
  page.once("dialog", (d) => d.dismiss());
  await page.locator(".account-card").nth(1).click();
  assert.equal(
    await controlValue(page.getByLabel("别名", { exact: true })),
    "尚未保存的模拟草稿",
  );
  await page.getByLabel("别名", { exact: true }).fill("小红书 · 模拟顾问一号");
  checks.draftProtected = true;
  await page.screenshot({
    path: `${out}/02-account-center-desktop.jpg`,
    quality: 88,
  });
  await page.getByRole("button", { name: "收拢并返回环绕总览" }).click();
  await wait(900);
  assert.equal(await page.locator("button.space-node").count(), 6);
  const label = page.locator(".node-accounts .node-label"),
    before = await label.boundingBox();
  const transform = await page
    .locator(".node-accounts .node-material img")
    .evaluate((el) => getComputedStyle(el).transform);
  await wait(400);
  const after = await label.boundingBox();
  assert(
    Math.abs(before.x - after.x) < 0.1 && Math.abs(before.y - after.y) < 0.1,
  );
  assert.notEqual(
    transform,
    await page
      .locator(".node-accounts .node-material img")
      .evaluate((el) => getComputedStyle(el).transform),
  );
  checks.orbRotatesAndTargetsStable = true;
  await page.screenshot({
    path: `${out}/01-six-orbs-desktop.jpg`,
    quality: 88,
  });
  await page.locator(".node-accounts").focus();
  await page.keyboard.press("Enter");
  await wait(700);
  checks.keyboardActivation = true;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await wait(200);
  checks.reducedMotion = await page
    .locator(".node-accounts .node-material img")
    .evaluate((el) => getComputedStyle(el).animationName);
  assert.equal(checks.reducedMotion, "none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const config = await api("/collection/configs", "POST", {
    name: "账号中心模拟验收",
    platform: "XHS",
    mode: "MOCK",
    keywords: ["团队协作"],
    excludeWords: ["广告"],
    batchLimit: 1,
    enabled: true,
  });
  await api(`/collection/configs/${config.id}/runs`, "POST", {
    scenario: "BASELINE",
    requestKey: randomUUID(),
    mode: "MOCK",
  });
  let leads = [];
  await until(async () => {
    leads = await api("/leads");
    return leads.length > 0;
  });
  let lead = leads[0];
  await api(`/leads/${lead.id}/review`, "PATCH", {
    note: "模拟人工审核，非收件人同意",
    version: lead.version,
  });
  await page.goto(`${base}/work/${lead.id}?module=matches&view=new`);
  await page.getByRole("heading", { name: "联系账号与去重（模拟）" }).waitFor();
  const accounts = (await api("/accounts")).accounts,
    first = accounts.find((a) => a.label === "小红书 · 模拟顾问一号");
  await selectOption(page.getByLabel("手动选择账号"), first.id);
  await page
    .getByRole("button", { name: "预留模拟首次联系", exact: true })
    .click();
  await page.getByRole("button", { name: "标记未知", exact: true }).waitFor();
  await page.getByLabel("核查或勿联系依据").fill("模拟核查：尚未取得确定结果");
  await page.getByRole("button", { name: "标记未知", exact: true }).click();
  await until(
    async () =>
      (await api(`/leads/${lead.id}/account-contact`)).ledger.attempts[0]
        .outcome === "UNKNOWN",
  );
  assert(
    await page
      .getByRole("button", { name: "预留模拟首次联系", exact: true })
      .isDisabled(),
  );
  await page.locator(".account-contact").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `${out}/03-unknown-blocked-desktop.jpg`,
    quality: 88,
  });
  checks.simulatedUnknownBlocks = true;
  await page.getByLabel("核查或勿联系依据").fill("");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/work`);
  await wait(800);
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: `${out}/04-six-orbs-mobile.jpg`,
    quality: 88,
    fullPage: true,
  });
  await page.locator(".node-accounts").focus();
  await page.keyboard.press("Enter");
  await wait(800);
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: `${out}/05-account-center-mobile.jpg`,
    quality: 88,
    fullPage: true,
  });
  checks.mobileNoHorizontalOverflow = true;
  // Every keyboard focus target must stay outside inactive panels.
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Tab");
    assert(
      await page.evaluate(() => !document.activeElement.closest("[inert]")),
    );
  }
  checks.inactivePanelsInert = true;
  await page.goto(`${base}/work/${lead.id}?module=matches&view=new`);
  await page.locator(".account-contact").waitFor();
  await page.locator(".account-contact").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `${out}/06-contact-mobile.jpg`,
    quality: 88,
    fullPage: true,
  });
  await context.close();
  context = null;
  // Sales can see only their accounts; no metadata editor.
  const salesContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    salesPage = await salesContext.newPage();
  await salesPage.goto(base);
  await salesPage.getByLabel("登录邮箱").fill("sales-a@fixture.invalid");
  await salesPage.getByLabel("密码", { exact: true }).fill(password);
  await salesPage.getByRole("button", { name: "登录工作台" }).click();
  await salesPage.waitForURL("**/work");
  await salesPage.locator(".node-accounts").click();
  await salesPage.locator(".account-card").nth(1).waitFor();
  assert.equal(await salesPage.locator(".account-card").count(), 2);
  assert.equal(
    await salesPage
      .getByRole("button", { name: "添加模拟账号", exact: true })
      .count(),
    0,
  );
  checks.salesScoped = true;
  await salesContext.close();
  assert.equal(errors.length, 0);
  checks.pageErrors = errors;
  checks.pass = true;
  console.log(
    "PASS independent browser: CRUD UI, draft, six orbs, animation, keyboard, mobile, unknown, sales scope",
  );
} catch (error) {
  checks.pass = false;
  checks.error = String(error);
  console.error(String(error));
  process.exitCode = 1;
} finally {
  await context?.close();
  await browser?.close();
  output = "";
  stack.kill("SIGTERM");
  await new Promise((resolve) => {
    stack.once("exit", resolve);
    setTimeout(resolve, 10000);
  });
  if (preview) {
    for (const id of readdirSync(`${root}/.qa/browser-validation`)) {
      try {
        const cleanup = JSON.parse(
          readFileSync(
            `${root}/.qa/browser-validation/${id}/cleanup.json`,
            "utf8",
          ),
        );
        if (cleanup.preview === preview) {
          checks.temporaryContainersRemoved = cleanup.cleanup.every(
            (c) => c.removed,
          );
          writeFileSync(
            `${out}/preview-cleanup.json`,
            JSON.stringify(cleanup, null, 2),
          );
        }
      } catch {}
    }
  }
  writeFileSync(`${out}/browser-checks.json`, JSON.stringify(checks, null, 2));
}
