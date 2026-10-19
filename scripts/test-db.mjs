import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";
const base = new URL(process.env.DATABASE_URL);
if (!["127.0.0.1", "localhost"].includes(base.hostname))
  throw new Error("测试准备只允许本机数据库");
const db = new PrismaClient();
try {
  await db.$executeRawUnsafe("CREATE DATABASE crm_test");
} catch (e) {
  if (!String(e.meta?.message).includes("already exists")) throw e;
} finally {
  await db.$disconnect();
}
base.pathname = "/crm_test";
const url = base.toString();
const env = { ...process.env, DATABASE_URL: url, TEST_DATABASE_URL: url };
for (const args of [
  ["exec", "prisma", "migrate", "deploy"],
  ["run", "test:integration", "-w", "@crm/api"],
]) {
  const r = spawnSync("npm", args, { env, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status || 1);
}
