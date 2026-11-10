import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';

// Run every test group even when an earlier one fails. A single red test must
// not hide the groups behind it in the `&&` chain.
const root = path.resolve(import.meta.dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const integration = readdirSync(path.join(root, 'tests/integration'))
  .filter(name => name.endsWith('.test.cjs'))
  .sort()
  .map(name => path.join('tests/integration', name));

const steps = [
  ['workspace tests', npm, ['run', 'test', '-w', '@crm/domain', '-w', '@crm/local-runtime', '-w', '@crm/desktop', '-w', '@crm/legacy-migration']],
  ['real mcp preflight', npm, ['run', 'test:real:preflight']],
  ['real mcp offline', npm, ['run', 'test:real:offline']],
  ['integration', process.execPath, ['--test', ...integration]],
];

const failed = [];
for (const [label, command, args] of steps) {
  process.stdout.write(`\n=== ${label} ===\n`);
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env: process.env });
  if (result.error) {
    failed.push(`${label} (${result.error.message})`);
  } else if (result.status !== 0) {
    failed.push(label);
  }
}

if (failed.length) {
  process.stderr.write(`\nFailed test groups: ${failed.join(', ')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('\nAll test groups passed.\n');
}
