import {AutoContactService} from '../auto-contact/auto-contact.service';
import "reflect-metadata";
import {ManualReviewService} from '../comment-review/manual-review.service';
import {AutoReviewService} from "../comment-review/auto-review.service";
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
    let pending:Promise<unknown>|undefined,stopping=false;
    const timer=setInterval(()=>{if(!pending&&!stopping)pending=(async()=>{await app.get(ManualReviewService).tick();if(!stopping)await app.get(AutoReviewService).tick();if(!stopping)await app.get(AutoContactService).tick();})().catch(()=>console.error('审核或自动联系调度失败；未自动重试在途调用')).finally(()=>{pending=undefined;});},1000);
    const close = closeCollectionWorker(worker, async () => {stopping=true;clearInterval(timer);await pending;await app.close();});
    worker.on("error", () => console.error("采集队列暂不可用"));
    worker.on("failed", () => console.error("采集任务拒绝或失败；请查看运行原因"));
    console.log("采集 worker 就绪；按服务端模式与账号批准执行，仅接受手动有限任务");
    for (const signal of ["SIGINT", "SIGTERM"])
        process.on(signal, async () => { stopping=true;clearInterval(timer);await close(); process.exit(0); });
}
void main();
