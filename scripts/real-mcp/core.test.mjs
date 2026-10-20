import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, chmod, readdir, symlink, realpath, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { cleanEnvironment, localDependencies, options, preflight, createSession, inspectSession, lockSession, sessionCandidate, portAvailable } from './core.mjs';
async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'crm-real-preflight-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const server = createServer(); await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const port = server.address().port; await new Promise(ok => server.close(ok));
  const input = { root, home: root, session: 'offline-test', port, env: {}, checkTools: false };
  return { input, plan: await preflight(input) };
}
test('strict CLI separates real phases and rejects old service ports/traversal', () => {
  assert.deepEqual(options([]), {session:'test-1',port:18162});
  for (const args of [['--port','18060'],['--port','18061'],['--port','55976'],['--port','65536'],['--port','1e4'],['--session','../old'],['--yes','yes'],['--endpoint','http://127.0.0.1:18162/mcp']]) assert.throws(() => options(args));
});
test('environment contamination refused by key only; unrelated secrets never inherited', () => {
  for (const key of ['XHS_MCP_ENABLED','COOKIES_PATH','AUTH_TOKEN','DATABASE_URL','REDIS_URL','NODE_OPTIONS','DOTENV_CONFIG_PATH','HTTPS_PROXY','CRM_PREVIEW_HOST']) {
    assert.throws(() => cleanEnvironment({[key]:'fictional-sensitive-value'}), e => e.message.includes(key) && !e.message.includes('fictional-sensitive-value'));
  }
  assert.deepEqual(cleanEnvironment({HOME:'/tmp/fake',PATH:'/bin',UNRELATED_SECRET:'fictional-value'}), {HOME:'/tmp/fake',PATH:'/bin'});
});
test('prepare is read-only: no session directory or login program execution', async t => {
  const { input } = await fixture(t); await preflight(input);
  assert.deepEqual(await readdir(input.root), []);
  await assert.rejects(preflight({...input,checkTools:true}), /Missing or unsafe|macOS/);
  assert.deepEqual(await readdir(input.root), []);
});
test('occupied port refused, listener stays alive', async t => {
  const server = createServer(); await new Promise(ok => server.listen(0,'127.0.0.1',ok));
  t.after(() => new Promise(ok => server.close(ok)));
  await assert.rejects(portAvailable(server.address().port), /unavailable/); assert(server.listening);
});
test('owned session is private, cannot be adopted on another port or overwritten', async t => {
  const { plan } = await fixture(t); await createSession(plan);
  assert.equal((await lstat(plan.directory)).mode & 0o077,0);
  assert.equal((await inspectSession(plan)).loginVerified,false);
  await assert.rejects(createSession(plan), /EEXIST/);
  await assert.rejects(inspectSession({...plan,port:18163}), /mismatch/);
  await assert.rejects(sessionCandidate(plan), /Missing/);
});
test('unknown and symlink directories are rejected without mutation', async t => {
  const { plan } = await fixture(t); await mkdir(plan.directory,{recursive:true,mode:0o700});
  await assert.rejects(inspectSession(plan), /Missing or unsafe/);
  await rm(join(plan.root,'.local'),{recursive:true});
  const external = join(plan.root,'external'); await mkdir(external);
  await symlink(external,join(plan.root,'.local'));
  await assert.rejects(inspectSession(plan), /unsafe/); assert.deepEqual(await readdir(external),[]);
});
test('exclusive session lock prevents login/serve concurrency and is removed only by owner', async t => {
  const { plan } = await fixture(t); await createSession(plan); const release = await lockSession(plan);
  await assert.rejects(lockSession(plan), /EEXIST/); await assert.rejects(inspectSession(plan), /locked/);
  await release(); assert(await inspectSession(plan));
});
test('session candidate is metadata-only and never considered authenticated', async t => {
  const { plan } = await fixture(t); await createSession(plan);
  await writeFile(plan.cookies,'fictional-non-json-seed-only',{mode:0o600});
  await sessionCandidate(plan); assert.equal((await inspectSession(plan)).loginVerified,false);
  await chmod(plan.cookies,0o644); await assert.rejects(sessionCandidate(plan), /permissions/);
});

test('missing local dependencies stop without automatic install or global fallback', async t => {
  const { input } = await fixture(t);
  await assert.rejects(localDependencies(input.root), /Missing or external project dependency/);
  assert.deepEqual(await readdir(input.root), []);
});
