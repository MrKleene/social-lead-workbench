// Read-only worker readiness: confirms a BullMQ worker is registered in Redis.
const { Queue } = require('bullmq');
const url = new URL(process.env.REDIS_URL || 'redis://127.0.0.1:56379');
const queue = new Queue(process.env.QUEUE_NAME || 'crm-internal', {
  connection: { host: url.hostname, port: Number(url.port || 6379), password: url.password || undefined, connectTimeout: 2000, maxRetriesPerRequest: 1 },
});
queue.on('error', () => {});
const deadline = setTimeout(() => process.exit(1), 6000);
(async () => {
  try {
    await queue.waitUntilReady();
    if ((await queue.getWorkers()).length === 0) process.exitCode = 1;
  } catch { process.exitCode = 1; }
  finally { await queue.close(); clearTimeout(deadline); }
})();
