import "reflect-metadata";
import "dotenv/config";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { createCollectionWorker, closeCollectionWorker } from "./worker-runtime";
import { DatabaseModule } from "../common/db";
import { CollectionModule } from "./module";
import { CollectionService } from "./service";
@Module({ imports: [DatabaseModule, CollectionModule] })
class WorkerModule {
}
async function main() {
    const app = await NestFactory.createApplicationContext(WorkerModule, { logger: ["error"] });
    const worker = createCollectionWorker(id => app.get(CollectionService).execute(id));
    const close = closeCollectionWorker(worker, () => app.close());
    worker.on("error", () => console.error("采集队列暂不可用"));
    worker.on("failed", () => console.error("采集任务拒绝或失败；请查看运行原因"));
    console.log("采集 worker 就绪；按服务端模式与账号批准执行，仅接受手动有限任务");
    for (const signal of ["SIGINT", "SIGTERM"])
        process.on(signal, async () => { await close(); process.exit(0); });
}
void main();
