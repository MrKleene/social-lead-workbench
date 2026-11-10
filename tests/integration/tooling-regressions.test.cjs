const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const ts = require('typescript');
const asar = require('@electron/asar');
const { verifyArchive } = require('../../scripts/desktop/verify-package.cjs');
const root = path.resolve(__dirname, '../..');

function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench 检查 '));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('UI checker scans source in a checkout path containing spaces and Chinese', t => {
  const directory = temporary(t);
  fs.mkdirSync(path.join(directory, 'scripts'));
  fs.mkdirSync(path.join(directory, 'apps/web/src'), { recursive: true });
  fs.copyFileSync(path.join(root, 'scripts/check-ui-conventions.mjs'), path.join(directory, 'scripts/check-ui-conventions.mjs'));
  const file = path.join(directory, 'apps/web/src/example.tsx');
  const run = () => spawnSync(process.execPath, [path.join(directory, 'scripts/check-ui-conventions.mjs'), '--strict'], { encoding: 'utf8' });
  fs.writeFileSync(file, 'export const Example = () => <p className="text-body">内容</p>');
  assert.equal(run().status, 0);
  fs.writeFileSync(file, 'export const Example = () => <p className="text-[#123456]">内容</p>');
  const invalid = run();
  assert.equal(invalid.status, 1);
  assert.match(invalid.stdout + invalid.stderr, /example.tsx/);
});

for (const [platform, paths, checkout] of [['POSIX', path.posix, '/repo'], ['Windows', path.win32, 'C:\\repo']]) {
  test(`architecture checker rejects source boundary violations on ${platform}`, () => {
    const directory = paths.join(checkout, 'packages/domain');
    const entries = new Map([
      [paths.join(checkout, 'apps'), []],
      [paths.join(checkout, 'packages'), ['domain']],
      [directory, ['src', 'package.json']],
      [paths.join(directory, 'src'), ['bad.ts']],
    ]);
    const content = new Map([
      [paths.join(directory, 'package.json'), JSON.stringify({ name: '@crm/domain', exports: {} })],
      [paths.join(directory, 'src/bad.ts'), "import fs from 'node:fs'; import other from '../../other/src/value';"],
    ]);
    const fakeFs = {
      readdirSync: (file, options) => {
        assert.ok(entries.has(file), file);
        return options?.withFileTypes ? entries.get(file).map(name => ({ name, isDirectory: () => entries.has(paths.join(file, name)) })) : entries.get(file);
      },
      statSync: file => ({ isDirectory: () => entries.has(file) }),
      existsSync: file => content.has(file),
      readFileSync: file => { assert.ok(content.has(file), file); return content.get(file); },
    };
    const source = fs.readFileSync(path.join(root, 'scripts/check-structure.mjs'), 'utf8').replaceAll('import.meta.dirname', JSON.stringify(paths.join(checkout, 'scripts')));
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const errors = [], processState = {};
    vm.runInNewContext(compiled, {
      exports: {}, process: processState,
      console: { error: message => errors.push(message), log() {} },
      require: id => id === 'node:fs' ? fakeFs : id === 'node:path' ? paths : require(id),
    });
    assert.equal(processState.exitCode, 1);
    assert.match(errors.join('\n'), /infrastructure dependency in domain: node:fs/);
    assert.match(errors.join('\n'), /cross-module relative import/);
  });
}

test('ASAR glob and unpack APIs preserve files; verifier accepts Windows separators and rejects stale bytes', async t => {
  const directory = temporary(t), source = path.join(directory, 'source');
  fs.mkdirSync(path.join(source, 'nested'), { recursive: true });
  const bytes = Buffer.from('module.exports = 42;');
  fs.writeFileSync(path.join(source, 'nested/sample.cjs'), bytes);
  const archive = path.join(directory, 'app.asar');
  await asar.createPackage(source, archive);
  const expected = new Map([['nested/sample.cjs', bytes]]);
  assert.equal(verifyArchive(archive, expected), 1);

  const verifier = path.join(root, 'scripts/desktop/verify-package.cjs');
  const module = { exports: {} }, requireFromVerifier = createRequire(verifier);
  vm.runInNewContext(fs.readFileSync(verifier, 'utf8'), {
    module, __dirname: path.dirname(verifier),
    require: id => id === '@electron/asar' ? { ...asar, listPackage: file => asar.listPackage(file).map(entry => entry.replaceAll('/', '\\')) } : requireFromVerifier(id),
  });
  assert.equal(module.exports.verifyArchive(archive, expected), 1);
  assert.throws(() => module.exports.verifyArchive(archive, new Map([['nested/sample.cjs', Buffer.from('stale')]])), /Package is stale/);

  const unpacked = path.join(directory, 'unpacked.asar');
  await asar.createPackageWithOptions(source, unpacked, { unpack: '*.cjs' });
  assert.equal(asar.statFile(unpacked, 'nested/sample.cjs').unpacked, true);
  assert.deepEqual(asar.extractFile(unpacked, 'nested/sample.cjs'), bytes);
});
