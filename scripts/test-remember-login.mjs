// Fresh disposable PostgreSQL, never the user's database; no platform/worker processes.
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
const name = 'crm-auth-test-' + randomUUID();
const password = randomBytes(32).toString('hex');
const run = (cmd, args, options = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...options });
  if (r.status !== 0) throw new Error(`${cmd} failed (${r.status}): ${r.stderr?.replaceAll(password, '[redacted]') || ''}`);
  return r.stdout?.trim();
};
let created = false;
try {
  run('docker', ['run', '--rm', '--detach', '--pull=never', '--name', name, '-p', '127.0.0.1::5432', '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_USER=crm', '-e', 'POSTGRES_DB=crm_test', 'postgres:17'], { env: { ...process.env, POSTGRES_PASSWORD: password } });
  created = true;
  const port = run('docker', ['port', name, '5432/tcp']).split(':').at(-1);
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (spawnSync('docker', ['exec', name, 'pg_isready', '-U', 'crm', '-d', 'crm_test'], { stdio: 'ignore' }).status === 0) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error('Isolated PostgreSQL not ready');
  const url = `postgresql://crm:${password}@127.0.0.1:${port}/crm_test`;
  const env = { ...process.env, DATABASE_URL: url, TEST_DATABASE_URL: url, APP_ORIGIN: 'http://127.0.0.1:5173', XHS_MCP_ENABLED: '0', CRM_ACCOUNT_READ_ENABLED: '0' };
  run('npm', ['exec', '--no', '--', 'prisma', 'migrate', 'deploy'], { env, stdio: 'pipe' });
  const args = process.argv.includes('--all') ? ['run', 'test:integration', '-w', '@crm/api'] : ['exec', '--no', '--', 'vitest', 'run', '--no-file-parallelism', 'apps/api/test/remember-login-postgres.test.ts'];
  const result = spawnSync('npm', args, { env, stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally {
  if (created) run('docker', ['stop', name]);
}
