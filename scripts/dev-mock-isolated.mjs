// Disposable mock browser preview. Never loads .env or reuses a database.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const root = fileURLToPath(new URL('../', import.meta.url));
const mcpFixture = process.argv.includes('--mcp-fixture');
const id = randomBytes(8).toString('hex');
const output = join(root, '.qa/browser-validation', id);
mkdirSync(output, { recursive: true });
const password = randomBytes(24).toString('hex');
const containers = [];
const results = [];
let current;
const safe = text => String(text).replaceAll(password, '[REDACTED]');
const docker = args => {
    const result = spawnSync('docker', args, { encoding: 'utf8', env: { ...process.env, POSTGRES_PASSWORD: password }, timeout: 20000 });
    if (result.status !== 0) throw new Error(`Docker ${args[0]} failed: ${safe(result.stderr || result.error || '')}`);
    return result.stdout.trim();
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function ready(container, command) {
    for (let attempt = 0; attempt < 40; attempt++) {
        const probe = spawnSync('docker', ['exec', container, ...command], { stdio: 'ignore', timeout: 2000 });
        if (probe.status === 0) return;
        await wait(500);
    }
    throw new Error('Temporary service readiness deadline exceeded');
}
function launch(kind, image, innerPort, args) {
    const container = docker(['run', '--detach', '--rm', '--pull=never', '--name', `crm-browser-${kind}-${id}`,
        '--label', `crm.acceptance=${id}`, '--tmpfs', `${kind === 'postgres' ? '/var/lib/postgresql/data' : '/data'}:rw,size=536870912`,
        '-p', `127.0.0.1::${innerPort}`, ...args, image, ...(kind === 'redis' ? ['redis-server', '--save', '', '--appendonly', 'no'] : [])]);
    containers.push(container);
    const info = JSON.parse(docker(['inspect', container]))[0];
    assert(!info.Mounts.some(m => ['bind', 'volume'].includes(m.Type)), 'Persistent storage is forbidden');
    const mapping = info.NetworkSettings.Ports[`${innerPort}/tcp`];
    assert.equal(mapping.length, 1); assert.equal(mapping[0].HostIp, '127.0.0.1');
    const port = Number(mapping[0].HostPort);
    assert(![5432, 55432, 6379, 56379, 18060].includes(port), 'Refuse any existing service port');
    return { container, port };
}
async function command(label, args, env = process.env) {
    console.log(`Running: ${args.join(' ')}`);
    const started = Date.now();
    let log = '';
    const child = spawn(args[0], args.slice(1), { cwd: root, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    current = child;
    const consume = data => { const text = safe(data); log += text; process.stdout.write(text); };
    child.stdout.on('data', consume); child.stderr.on('data', consume);
    let timer;
    try {
        const code = await new Promise((resolve, reject) => {
            child.once('error', reject); child.once('exit', resolve);
            timer = setTimeout(() => { stopGroup(child); reject(new Error(`${label} exceeded 120 seconds`)); }, 120000);
        });
        results.push({ command: args.join(' '), exit_code: code, seconds: (Date.now() - started) / 1000, log: `${label}.log` });
        assert.equal(code, 0, `${label} failed`);
    } finally {
        clearTimeout(timer); stopGroup(child); current = undefined;
        writeFileSync(join(output, `${label}.log`), log);
    }
}
function stopGroup(child) {
    if (!child?.pid) return;
    try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
}

const children = [];
let finish;
const stopped = new Promise(resolve => { finish = resolve; });
let interrupted = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { interrupted = true; stopGroup(current); finish(); });
async function freePort() {
    const server = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    await new Promise(resolve => server.close(resolve));
    return port;
}
function service(label, args, env) {
    const child = spawn(args[0], args.slice(1), { cwd: root, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child);
    child.stdout.on('data', () => {});
    child.stderr.on('data', data => writeFileSync(join(output, `${label}.log`), safe(data), { flag: 'a' }));
    child.once('error', () => { process.exitCode = 1; finish(); });
    child.once('exit', () => { if (!interrupted) process.exitCode = 1; finish(); });
    return child;
}
const report = { mode: mcpFixture ? 'XHS_FIXTURE' : 'MOCK', isolated: true, credentials_persisted: false, cleanup: [] };
try {
    const pg = launch('postgres', 'postgres:17', 5432, ['-e', 'POSTGRES_DB=crm_test', '-e', 'POSTGRES_USER=crmtest', '-e', 'POSTGRES_PASSWORD']);
    const redis = launch('redis', 'redis:7-alpine', 6379, []);
    await ready(pg.container, ['pg_isready', '-U', 'crmtest', '-d', 'crm_test']);
    await ready(redis.container, ['redis-cli', 'ping']);
    const apiPort = await freePort(), webPort = await freePort();
    const previewHost = process.env.CRM_PREVIEW_HOST === 'localhost' ? 'localhost' : '127.0.0.1';
    const url = `postgresql://crmtest:${password}@127.0.0.1:${pg.port}/crm_test?schema=public`;
    const env = { ...process.env, DATABASE_URL: url, REDIS_URL: `redis://127.0.0.1:${redis.port}`, DOTENV_CONFIG_PATH: '/dev/null', XHS_MCP_ENABLED: '0',
        COLLECTION_QUEUE_NAME: `crm-browser-${id}`, PORT: String(apiPort), API_HOST: '127.0.0.1', APP_ORIGIN: `http://${previewHost}:${webPort}`,
        API_PROXY_TARGET: `http://127.0.0.1:${apiPort}`, COOKIE_SECURE: 'false' };
    if (mcpFixture) {
        const fixture = spawn(process.execPath, ['--import','tsx','scripts/mcp-fixture.ts'], { cwd: root, env: { ...env, CRM_DISPOSABLE_MCP_FIXTURE: '1' }, detached: true, stdio: ['ignore','ignore','pipe','ipc'] });
        children.push(fixture);
        const endpoint = await new Promise((resolve,reject) => {
            const timer = setTimeout(() => reject(new Error('Offline fixture startup deadline')),5000);
            fixture.once('message',message => {clearTimeout(timer);resolve(message.url);});
            fixture.once('error',error => {clearTimeout(timer);reject(error);});
            fixture.once('exit',() => {clearTimeout(timer);reject(new Error('Offline fixture exited'));});
        });
        assert(/^http:\/\/127\.0\.0\.1:[1-9][0-9]{3,4}\/mcp$/.test(endpoint) && new URL(endpoint).port !== '18060');
        Object.assign(env,{XHS_MCP_ENABLED:'1',XHS_MCP_PROFILE:'fixture',XHS_MCP_ENDPOINT:endpoint});
        process.stdin.setEncoding('utf8');
        process.stdin.on('data',value => { const scenario = value.trim(); if (['BASELINE','NEW','LOGIN_EXPIRED','RESTRICTED','RATE_LIMITED','TIMEOUT','MALFORMED','SESSION_EXPIRED'].includes(scenario)) { fixture.send({scenario}); console.log(`Offline fixture scenario: ${scenario}`); } });
        fixture.once('exit',() => {if(!interrupted)process.exitCode=1;finish();});
    }
    await command('migrate' , ['npm', 'exec', 'prisma', 'migrate', 'deploy'], env);
    for (const workspace of ['@crm/contracts', '@crm/api']) await command(`build-${workspace.split('/')[1]}`, ['npm', 'run', 'build', '-w', workspace], env);
    assert(!interrupted, 'Interrupted before fixture creation');
    const fixturePassword = randomBytes(18).toString('base64url');
    const db = new PrismaClient({ datasources: { db: { url } } });
    try {
        const passwordHash = await argon2.hash(fixturePassword);
        await db.user.createMany({ data: [
            { email: 'admin@fixture.invalid', name: '模拟管理员', role: 'ADMIN', passwordHash },
            { email: 'sales-a@fixture.invalid', name: '模拟销售甲', role: 'SALES', passwordHash },
            { email: 'sales-b@fixture.invalid', name: '模拟销售乙', role: 'SALES', passwordHash },
        ] });
    } finally { await db.$disconnect(); }
    service('api', ['node', 'apps/api/dist/main.js'], env);
    service('collector', ['node', 'apps/api/dist/collection/worker.js'], env);
    service('web', ['npm', 'run', 'dev', '-w', '@crm/web', '--', '--port', String(webPort), '--host', previewHost], env);
    report.preview = env.APP_ORIGIN;
    report.api = env.API_PROXY_TARGET;
    report.containers = [...containers];
    report.pids = children.map(c => c.pid);
    writeFileSync(join(output, 'running.json'), JSON.stringify(report, null, 2));
    console.log(`Disposable mock preview: ${env.APP_ORIGIN}`);
    console.log('Fictional logins: admin@fixture.invalid / sales-a@fixture.invalid / sales-b@fixture.invalid');
    console.log(`One-run password (never save in browser): ${fixturePassword}`);
    if (mcpFixture) console.log('Offline MCP fixture: enter BASELINE / NEW / LOGIN_EXPIRED / RATE_LIMITED / TIMEOUT to change fictional responses.');
    console.log('Stop with Ctrl+C; temporary accounts, database and queues are removed. No real platform integration.');
    await stopped;
} catch (error) { console.error(safe(error.message)); process.exitCode = 1; }
finally {
    process.stdin.pause();
    stopGroup(current);
    for (const child of children) stopGroup(child);
    await wait(500);
    for (const container of containers.reverse()) {
        try { docker(['rm', '--force', container]); report.cleanup.push({ container, removed: docker(['ps', '-aq', '--filter', `id=${container}`]) === '' }); }
        catch (error) { report.cleanup.push({ container, removed: false }); process.exitCode = 1; }
    }
    writeFileSync(join(output, 'cleanup.json'), JSON.stringify(report, null, 2));
    console.log(`Temporary containers removed: ${report.cleanup.filter(c => c.removed).length}/${containers.length}`);
}
