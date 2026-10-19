import "dotenv/config";
import { Queue, QueueEvents } from "bullmq";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const url = new URL(process.env.REDIS_URL);
if (!["127.0.0.1", "localhost"].includes(url.hostname))
  throw new Error("仅允许本机 Redis 验收");
const name = `crm-test-${randomUUID()}`;
const connection = { host: url.hostname, port: Number(url.port) };
const queue = new Queue(name, { connection }),
  events = new QueueEvents(name, { connection });
const worker = spawn(process.execPath, ["apps/worker/dist/main.js"], {
  env: { ...process.env, QUEUE_NAME: name },
  stdio: ["ignore", "ignore", "ignore"],
});
try {
  await events.waitUntilReady();
  const job = await queue.add("health", { version: 1, type: "HEALTHCHECK" });
  const result = await job.waitUntilFinished(events, 10000);
  assert.equal(result.platformCallsEnabled, false);
  const rejected = await queue.add("unsupported", {
    version: 1,
    type: "COMMENT",
  });
  await assert.rejects(
    rejected.waitUntilFinished(events, 10000),
    (error) => error instanceof Error && error.message.includes("HEALTHCHECK"),
    "Unsupported platform job must fail validation, not merely time out",
  );
  assert.equal(await rejected.getState(), "failed");
  console.log(
    "PASS: 2 Redis/BullMQ integration checks — health job completed; platform job rejected.",
  );
} finally {
  worker.kill("SIGTERM");
  await new Promise((resolve) => worker.once("exit", resolve));
  await queue.obliterate({ force: true });
  await events.close();
  await queue.close();
}
