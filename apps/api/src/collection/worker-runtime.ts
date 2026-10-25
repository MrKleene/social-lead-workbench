import { Worker } from 'bullmq';
import { z } from 'zod';
import { collectionQueueName, redisConnection } from './queue';
/** Shared production queue consumer. Test fixtures replace platform I/O, not the processor. */
export function createCollectionWorker(execute: (id: string) => Promise<unknown>) {
 const schema = z.object({type:z.enum(['MOCK_READ','XHS_READ']),runId:z.string().min(1)}).strict();
 return new Worker(collectionQueueName(), job => execute(schema.parse(job.data).runId), {
  connection:{...redisConnection(),maxRetriesPerRequest:null},concurrency:1,maxStalledCount:1,
 });
}
export function closeCollectionWorker(worker: Worker, closeApp: () => Promise<void>) {
 let closing: Promise<void> | undefined;
 return () => closing ||= (async()=>{await worker.close();await closeApp();})();
}
