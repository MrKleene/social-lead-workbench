import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Queue, QueueEvents, Worker, Job } from 'bullmq';
import { spawn, ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Db } from '../src/common/db';
import { CollectionService } from '../src/collection/service';
import { CollectionQueue, redisConnection } from '../src/collection/queue';
import { MockAdapter } from '../src/collection/adapters/mock';
import type { Actor } from '../src/auth/security';
import { startXhsFixture } from './fixtures/xhs-mcp-server';
import type { Scenario } from '../src/collection/contract';

// This suite must only be invoked by the disposable-container launcher.
const database = new URL(process.env.TEST_DATABASE_URL || 'http://invalid');
const redis = new URL(process.env.REDIS_URL || 'http://invalid');
const name = process.env.COLLECTION_QUEUE_NAME || '';
if (process.env.CRM_DISPOSABLE_QUEUE_TEST !== '1' || database.hostname !== '127.0.0.1' ||
    database.pathname !== '/crm_test' || redis.hostname !== '127.0.0.1' ||
    !database.port || !redis.port || !/^crm-queue-acceptance-[a-f0-9]+$/.test(name) ||
    ['55432', '5432'].includes(database.port) || ['56379', '6379'].includes(redis.port)) {
    throw new Error('Use npm run test:queue; dedicated disposable PostgreSQL and Redis are required');
}
const db = new Db({ datasources: { db: { url: database.toString() } } });
const producer = new CollectionQueue();
const service = new CollectionService(db, producer);
const connection = redisConnection();
const queue = new Queue(name, { connection });
const events = new QueueEvents(name, { connection: { ...connection, maxRetriesPerRequest: null } });
let actor: Actor;
let child: ChildProcess | undefined;
let fixture: Awaited<ReturnType<typeof startXhsFixture>>;

async function bounded<T>(promise: Promise<T>, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([promise, new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), 10000);
        })]);
    } finally { clearTimeout(timer); }
}
async function stopChild() {
    if (!child || child.exitCode !== null || child.signalCode) return;
    const exit = new Promise<void>(resolve => child!.once('exit', () => resolve()));
    child.kill('SIGTERM');
    try { await bounded(exit, 'worker shutdown'); }
    catch { child.kill('SIGKILL'); await bounded(exit, 'forced worker shutdown'); }
}
const config = (word: string, extra = {}) => service.create(actor, {
    name: `【队列测试】${word}`, platform: 'XHS', mode: 'MOCK', keywords: [word],
    excludeWords: ['广告'], batchLimit: 1, enabled: true, ...extra,
});
async function finish(id: string) {
    const job = await queue.getJob(id);
    expect(job).toBeDefined();
    await job!.waitUntilFinished(events, 10000);
    return { job: (await queue.getJob(id))!, run: await db.collectionRun.findUniqueOrThrow({ where: { id } }) };
}
async function run(id: string, scenario: Scenario = 'BASELINE') {
    const requested = await service.start(actor, id, scenario, randomUUID());
    return finish(requested.id);
}

beforeAll(async () => {
    // Refuse even a populated database provided accidentally by a caller.
    expect(await db.user.count()).toBe(0);
    expect(await db.collectionConfig.count()).toBe(0);
    await events.waitUntilReady();
    expect(await queue.getJobCountByTypes()).toBe(0);
    actor = await db.user.create({ data: {
        name: '虚构队列管理员', email: 'queue-admin@example.invalid', role: 'ADMIN',
        passwordHash: 'not-a-login-hash', active: false,
    } });
    fixture = await startXhsFixture({sse:true});
    vi.stubEnv('XHS_MCP_ENABLED','1'); vi.stubEnv('XHS_MCP_PROFILE','fixture'); vi.stubEnv('XHS_MCP_ENDPOINT',fixture.url.href);
    child = spawn(process.execPath, ['dist/collection/worker.js'], {
        cwd: process.cwd(), env: { ...process.env, DOTENV_CONFIG_PATH: '/dev/null' },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    await bounded(new Promise<void>((resolve, reject) => {
        child!.stdout!.on('data', data => { if (String(data).includes('模拟采集 worker 就绪')) resolve(); });
        child!.stderr!.on('data', () => { /* Do not emit connection strings or fixture details. */ });
        child!.once('error', reject);
        child!.once('exit', code => reject(new Error(`Worker exited before ready: ${code}`)));
    }), 'production collection worker ready');
}, 20000);

afterAll(async () => {
    await stopChild();
    await fixture?.stop(); vi.unstubAllEnvs();
    await producer.onModuleDestroy();
    await queue.obliterate({ force: true });
    expect(await queue.getJobCountByTypes()).toBe(0);
    await events.close();
    await queue.close();
    await db.$disconnect();
    // The launcher destroys the entire temporary database, including inactive fixtures.
}, 20000);

describe('真实 Redis/BullMQ + 独立采集 worker + 临时 PostgreSQL', () => {
    it('手动投递经独立进程完成基线，并保留来源与楼中楼', async () => {
        const c = await config('真实队列基线');
        const { job, run: r } = await run(c.id);
        expect(await job.getState()).toBe('completed');
        expect(job.opts.attempts).toBe(1);
        expect(job.attemptsMade).toBe(1);
        expect(r).toMatchObject({ status: 'COMPLETE', observed: 4, matched: 3, added: 2, notices: 0, requests: 6 });
        const sources = await db.sourceMatch.findMany({ where: { configId: c.id }, include: { comment: true } });
        expect(sources.some(s => s.comment.parentPlatformCommentId)).toBe(true);
        expect(sources.every(s => s.comment.isDemo && s.isBaseline)).toBe(true);
    });
    it('相同请求键并发重放只产生一条运行和一条完成审计', async () => {
        const c = await config('队列请求重放'), key = randomUUID();
        const [a, b] = await Promise.all([service.start(actor, c.id, 'BASELINE', key), service.start(actor, c.id, 'BASELINE', key)]);
        expect(a.id).toBe(b.id);
        await finish(a.id);
        expect(await db.collectionRun.count({ where: { configId: c.id } })).toBe(1);
        expect(await db.auditLog.count({ where: { entityId: a.id, action: 'COLLECTION_FINISHED_MOCK' } })).toBe(1);
    });
    it('已完成运行以另一队列任务重复投递不会重复写库', async () => {
        const c = await config('队列重复投递');
        const { run: first } = await run(c.id);
        const replay = await queue.add('MOCK_READ', { type: 'MOCK_READ', runId: first.id }, { jobId: `redelivery-${randomUUID()}`, attempts: 1 });
        await replay.waitUntilFinished(events, 10000);
        expect(await replay.getState()).toBe('completed');
        expect(await db.collectionRun.findUniqueOrThrow({ where: { id: first.id } })).toEqual(first);
        expect(await db.sourceMatch.count({ where: { configId: c.id } })).toBe(3);
        expect(await db.auditLog.count({ where: { entityId: first.id, action: 'COLLECTION_FINISHED_MOCK' } })).toBe(1);
    });
    it('新增评论经队列提醒一次，重复新场景零新增', async () => {
        const c = await config('队列新增');
        await run(c.id);
        expect((await run(c.id, 'NEW')).run).toMatchObject({ added: 1, notices: 1 });
        expect((await run(c.id, 'NEW')).run).toMatchObject({ added: 0, notices: 0 });
    });
    it('排队期间暂停运行后即使 worker 消费也不入库', async () => {
        await queue.pause();
        try {
            const c = await config('队列暂停');
            const r = await service.start(actor, c.id, 'BASELINE', randomUUID());
            expect((await queue.getJob(r.id)) && (await db.collectionRun.findUniqueOrThrow({ where: { id: r.id } })).status).toBe('QUEUED');
            await service.pauseRun(actor, r.id);
            await queue.resume();
            expect((await finish(r.id)).run.status).toBe('PAUSED');
            expect(await db.sourceMatch.count({ where: { configId: c.id } })).toBe(0);
            expect((await db.collectionConfig.findUniqueOrThrow({ where: { id: c.id } })).activeRunId).toBeNull();
        } finally { await queue.resume(); }
    });
    it('排队期间停用配置，旧任务不会产生来源', async () => {
        await queue.pause();
        try {
            const c = await config('队列停用');
            const r = await service.start(actor, c.id, 'BASELINE', randomUUID());
            await service.change(actor, c.id, { enabled: false }, c.revision, false);
            await queue.resume();
            expect((await finish(r.id)).run).toMatchObject({ status: 'PAUSED', reason: 'CONFIG_PAUSED' });
            expect(await db.sourceMatch.count({ where: { configId: c.id } })).toBe(0);
        } finally { await queue.resume(); }
    });
    it('业务超时记录 FAILED，队列单次消费，无自动重试；退避拒绝立即重跑', async () => {
        const c = await config('队列超时');
        const { job, run: r } = await run(c.id, 'TIMEOUT');
        // A handled domain failure is a completed delivery, NOT a successful collection.
        expect(await job.getState()).toBe('completed');
        expect(r).toMatchObject({ status: 'FAILED', reason: 'TIMEOUT' });
        expect(job.returnvalue).toMatchObject({ status: 'FAILED', reason: 'TIMEOUT' });
        expect(job.opts.attempts).toBe(1);
        expect(job.attemptsMade).toBe(1);
        const saved = await db.collectionConfig.findUniqueOrThrow({ where: { id: c.id } });
        expect(saved.activeRunId).toBeNull();
        expect(saved.nextAllowedAt!.getTime() - r.finishedAt!.getTime()).toBeGreaterThanOrEqual(29000);
        await expect(service.start(actor, c.id, 'BASELINE', randomUUID())).rejects.toThrow('退避');
        expect(await db.collectionRun.count({ where: { configId: c.id } })).toBe(1);
        expect(await queue.getJobSchedulers()).toEqual([]);
        expect(await queue.getJobCountByTypes('delayed')).toBe(0);
    });
    it('手动失败重跑按30/60/120/240/300秒退避；模拟时间推进后可恢复', async () => {
        const c = await config('队列退避上限');
        for (const seconds of [30, 60, 120, 240, 300, 300]) {
            const { run: r } = await run(c.id, 'TIMEOUT');
            const saved = await db.collectionConfig.findUniqueOrThrow({ where: { id: c.id } });
            const delay = saved.nextAllowedAt!.getTime() - r.finishedAt!.getTime();
            expect(delay).toBeGreaterThanOrEqual(seconds * 1000 - 1000);
            expect(delay).toBeLessThanOrEqual(seconds * 1000 + 1000);
            // Only advance the test fixture's backoff timestamp; no real wait or automatic polling.
            await db.collectionConfig.update({ where: { id: c.id }, data: { nextAllowedAt: new Date(0) } });
        }
        expect((await run(c.id)).run.status).toBe('COMPLETE');
        expect(await db.collectionConfig.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ failureCount: 0, nextAllowedAt: null });
    });
    it('非法平台任务进入 BullMQ failed，单次尝试且不创建业务运行', async () => {
        const before = await db.collectionRun.count();
        const job = await queue.add('COMMENT', { type: 'COMMENT', runId: 'not-a-real-run' }, { attempts: 1 });
        await expect(job.waitUntilFinished(events, 10000)).rejects.toThrow();
        const failed = (await queue.getJob(job.id!))!;
        expect(await failed.getState()).toBe('failed');
        expect(failed.attemptsMade).toBe(1);
        expect(await db.collectionRun.count()).toBe(before);
    });
    it('多帖大批次仍受32次读取预算限制，标记部分完成', async () => {
        const c = await config('队列预算', { batchLimit: 10, keywords: Array.from({ length: 8 }, (_, i) => `队列预算${i}`) });
        const { run: r } = await run(c.id);
        expect(r).toMatchObject({ status: 'PARTIAL', reason: 'BUDGET', requests: 32 });
        expect(r.observed).toBeLessThanOrEqual(100);
    });
    it('实际队列执行中暂停：延迟模拟读取返回后也不提交', async () => {
        const pauseName = `${name}-running-pause`;
        const q = new Queue(pauseName, { connection });
        const e = new QueueEvents(pauseName, { connection: { ...connection, maxRetriesPerRequest: null } });
        let release!: () => void, entered!: () => void;
        const reading = new Promise<void>(resolve => { entered = resolve; });
        const gate = new Promise<void>(resolve => { release = resolve; });
        class PausableProducer extends CollectionQueue {
            async enqueue(runId: string) { await q.add('MOCK_READ', { type: 'MOCK_READ', runId }, { jobId: runId, attempts: 1 }); }
        }
        const controlled = new CollectionService(db, new PausableProducer());
        const mock = new MockAdapter('XHS', 'BASELINE'), original = mock.comments.bind(mock);
        mock.comments = async (post, cursor) => { entered(); await gate; return original(post, cursor); };
        // Same production execute() and real Redis worker; only mock I/O latency is controlled.
        const w = new Worker(pauseName, job => controlled.execute(job.data.runId, mock), { connection: { ...connection, maxRetriesPerRequest: null }, concurrency: 1 });
        try {
            await e.waitUntilReady();
            const c = await config('队列运行中暂停');
            const r = await controlled.start(actor, c.id, 'BASELINE', randomUUID());
            await bounded(reading, 'mock comment read');
            expect((await db.collectionRun.findUniqueOrThrow({ where: { id: r.id } })).status).toBe('RUNNING');
            await controlled.pauseRun(actor, r.id);
            release();
            const job = (await q.getJob(r.id))!;
            await job.waitUntilFinished(e, 10000);
            expect((await db.collectionRun.findUniqueOrThrow({ where: { id: r.id } })).status).toBe('PAUSED');
            expect(await db.sourceMatch.count({ where: { configId: c.id } })).toBe(0);
        } finally { release(); await w.close(); await q.obliterate({ force: true }); await e.close(); await q.close(); }
    });
});

describe('离线MCP经实际BullMQ和独立worker',()=>{
    it('协议读取→窗口起点→新观察提醒→幂等，保留离线来源',async()=>{
        const c=await config('部署咨询',{mode:'XHS_FIXTURE'});
        const start=async()=>{const r=await service.start(actor,c.id,'READ_WINDOW',randomUUID(),'XHS_FIXTURE');return finish(r.id);};
        const first=await start(); expect(first.job.data.type).toBe('XHS_READ');
        expect(first.run).toMatchObject({status:'PARTIAL',observed:5,matched:3,added:3,notices:0,reason:'MCP_WINDOW_ONLY'});
        fixture.state.scenario='NEW'; expect((await start()).run).toMatchObject({added:1,notices:1});
        expect((await start()).run).toMatchObject({added:0,notices:0});
        expect(await db.sourceComment.count({where:{platformCommentId:{startsWith:'fixture-xhs-'},isDemo:true}})).toBe(4);
        expect(fixture.state.sessions.size).toBe(0);
        expect(await queue.getJobSchedulers()).toEqual([]); expect(fixture.state.forbidden).toBe(0);
        fixture.state.scenario='BASELINE';
    });
    it('HTTP限流经worker保存退避并只执行一次',async()=>{
        const c=await config('部署咨询',{mode:'XHS_FIXTURE'}); fixture.state.scenario='RATE_LIMITED';
        const requested=await service.start(actor,c.id,'READ_WINDOW',randomUUID(),'XHS_FIXTURE');
        const {run:r,job}=await finish(requested.id);
        expect(r).toMatchObject({status:'FAILED',reason:'RATE_LIMITED',observed:0});expect(job.attemptsMade).toBe(1);
        const saved=await db.collectionConfig.findUniqueOrThrow({where:{id:c.id}});
        expect(saved.nextAllowedAt!.getTime()-r.finishedAt!.getTime()).toBeGreaterThan(119000);
        fixture.state.scenario='BASELINE';
    });
    it('worker执行中暂停立即终止挂起协议读取，不写入结果',async()=>{
        const c=await config('部署咨询',{mode:'XHS_FIXTURE'}); fixture.state.scenario='TIMEOUT';const before=fixture.state.calls.length;
        const r=await service.start(actor,c.id,'READ_WINDOW',randomUUID(),'XHS_FIXTURE');
        for(let n=0;n<100 && fixture.state.calls.length===before;n++) await new Promise(resolve=>setTimeout(resolve,20));
        expect(fixture.state.calls.length).toBeGreaterThan(before);
        await service.pauseRun(actor,r.id); expect((await finish(r.id)).run.status).toBe('PAUSED');
        expect(await db.sourceMatch.count({where:{configId:c.id}})).toBe(0);
        expect(fixture.state.sessions.size).toBe(0); fixture.state.scenario='BASELINE';
    });
});
