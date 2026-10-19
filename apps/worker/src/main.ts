import "dotenv/config";
import { Worker } from "bullmq";
import {internalJob as schema} from "@crm/contracts";
const redis = new URL(process.env.REDIS_URL || "redis://127.0.0.1:56379");
const worker = new Worker(
  process.env.QUEUE_NAME || "crm-internal",
  async (job) => {
    schema.parse(job.data);
    return { ok: true, platformCallsEnabled: false };
  },
  {
    connection: {
      host: redis.hostname,
      port: Number(redis.port || 6379),
      password: redis.password || undefined,
    },
    concurrency: 1,
  },
);
worker.on("failed", () => console.error("任务拒绝或失败：仅支持内部健康检查"));
worker.on("error", () => console.error("Redis 连接不可用"));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await worker.close();
    process.exit(0);
  });
