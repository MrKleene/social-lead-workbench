import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
export function redisConnection() { const u = new URL(process.env.REDIS_URL || "redis://127.0.0.1:56379"); return { host: u.hostname, port: Number(u.port || 6379), password: u.password || undefined, maxRetriesPerRequest: 1, connectTimeout: 2000 }; }
export const collectionQueueName = () => process.env.COLLECTION_QUEUE_NAME || "crm-collection-mock";
@Injectable()
export class CollectionQueue implements OnModuleDestroy {
    private queue?: Queue;
    async enqueue(runId: string, type: "MOCK_READ" | "XHS_READ" = "MOCK_READ") {
        if (!this.queue) {
            this.queue = new Queue(collectionQueueName(), { connection: redisConnection(), defaultJobOptions: { attempts: 1, removeOnComplete: 100, removeOnFail: 100 } });
            this.queue.on("error", () => { });
        }
        await this.queue.add(type, { type, runId }, { jobId: runId });
    }
    async onModuleDestroy() { await this.queue?.close(); }
}
