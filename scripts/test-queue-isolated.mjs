// Disposable real Redis/PostgreSQL queue acceptance. Never loads .env or reuses a database.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, '.qa/step3-validation');
mkdirSync(output, { recursive: true });
const id = randomBytes(8).toString('hex');
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
    const container = docker(['run', '--detach', '--rm', '--pull=never', '--name', `crm-queue-${kind}-${id}`,
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
let interrupted = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { interrupted = true; stopGroup(current); });
const report = { isolated: true, persistent_volumes: false, credentials_persisted: false, results, cleanup: [] };
try {
    // Reuse installed official images only. No daemon settings, persistent credentials, or external platforms.
    docker(['image', 'inspect', 'postgres:17']); docker(['image', 'inspect', 'redis:7-alpine']);
    const pg = launch('postgres', 'postgres:17', 5432, ['-e', 'POSTGRES_DB=crm_test', '-e', 'POSTGRES_USER=crmtest', '-e', 'POSTGRES_PASSWORD']);
    const redis = launch('redis', 'redis:7-alpine', 6379, []);
    report.ports = { postgres: pg.port, redis: redis.port };
    await ready(pg.container, ['pg_isready', '-U', 'crmtest', '-d', 'crm_test']);
    await ready(redis.container, ['redis-cli', 'ping']);
    assert(!interrupted, 'Interrupted before running tests');
    const url = `postgresql://crmtest:${password}@127.0.0.1:${pg.port}/crm_test?schema=public`;
    const env = { ...process.env, DATABASE_URL: url, TEST_DATABASE_URL: url, REDIS_URL: `redis://127.0.0.1:${redis.port}`,
        DOTENV_CONFIG_PATH: '/dev/null', COLLECTION_QUEUE_NAME: `crm-queue-acceptance-${id}`, CRM_DISPOSABLE_QUEUE_TEST: '1' };
    await command('migrate', ['npm', 'exec', 'prisma', 'migrate', 'deploy'], env);
    for (const workspace of ['@crm/contracts', '@crm/api', '@crm/worker'])
        await command(`build-${workspace.split('/')[1]}`, ['npm', 'run', 'build', '-w', workspace], env);
    await command('queue-tests', ['npm', 'run', 'test:queue', '-w', '@crm/api', '--', '--reporter=verbose'], env);
    await command('health-queue', ['node', 'scripts/test-worker.mjs'], env);
    const keys = docker(['exec', redis.container, 'redis-cli', '--scan', '--pattern', `bull:crm-queue-acceptance-${id}*`]);
    // obliterate may recreate only metadata during the final empty-count check; container removal clears all keys.
    report.remaining_acceptance_key_count_before_container_removal = keys ? keys.split('\n').length : 0;
    report.exit_code = 0;
} catch (error) {
    report.exit_code = 1; report.error = safe(error.message); console.error(safe(error.message));
} finally {
    stopGroup(current);
    for (const container of containers.reverse()) {
        try {
            docker(['rm', '--force', container]);
            const removed = docker(['ps', '-aq', '--filter', `id=${container}`]) === '';
            report.cleanup.push({ container, removed });
            if (!removed) report.exit_code = 1;
        } catch (error) { report.cleanup.push({ container, removed: false, error: safe(error.message) }); report.exit_code = 1; }
    }
    writeFileSync(join(output, 'results.json'), JSON.stringify(report, null, 2));
    console.log(`Temporary containers removed: ${report.cleanup.filter(c => c.removed).length}/${containers.length}`);
}
process.exitCode = report.exit_code;
