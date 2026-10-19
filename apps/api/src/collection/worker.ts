import "reflect-metadata";
import "dotenv/config";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Worker } from "bullmq";
import { z } from "zod";
import { DatabaseModule } from "../common/db";
import { CollectionModule } from "./module";
import { CollectionService } from "./service";
import { collectionQueueName, redisConnection } from "./queue";
@Module({ imports: [DatabaseModule, CollectionModule] })
class WorkerModule {
}
async function main() {
    const app = await NestFactory.createApplicationContext(WorkerModule, { logger: ["error"] });
    const schema = z.object({ type: z.literal("MOCK_READ"), runId: z.string().min(1) }).strict();
    const worker = new Worker(collectionQueueName(), async (job) => { const data = schema.parse(job.data); return app.get(CollectionService).execute(data.runId); }, { connection: { ...redisConnection(), maxRetriesPerRequest: null }, concurrency: 1, maxStalledCount: 1 });
    worker.on("error", () => console.error("模拟采集队列暂不可用"));
    worker.on("failed", () => console.error("模拟任务拒绝或失败；无真实平台调用"));
    console.log("模拟采集 worker 就绪；仅接受手动有限任务，真实平台关闭");
    for (const signal of ["SIGINT", "SIGTERM"])
        process.on(signal, async () => { await worker.close(); await app.close(); process.exit(0); });
}
void main();
