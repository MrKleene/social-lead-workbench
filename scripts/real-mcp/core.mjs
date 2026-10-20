import platform from '../../runtime/platform.cjs';
import { access, lstat, readFile, realpath, mkdir, writeFile, unlink, chmod } from 'node:fs/promises';
import { constants, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';

// These installed builds were inspected locally. An update requires a new review,
// not a permissive fallback to an arbitrary binary or an automatic download.
export const reviewed = {
  login: '0cd6ae3ae395521ee417652dd82366b42deb96611f462b1fbba6129f4a9bd92e',
  mcp: '17d57acd1a4f4cad3f2525bd13de40e112cb34594231a10b54b05ced9485cf80',
};
export const browserVersion = '148.0.7778.215';
export const forbiddenPorts = new Set([18060, 18061, 3100, 5173, 5432, 55432, 6379, 56379, 55976, 63444, 63445]);
export function options(args) {
  const result = { session: 'test-1', port: 18162 };
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (!['--session', '--port'].includes(key) || !args[i + 1]) throw new Error('Only --session NAME and --port NUMBER are accepted');
    if (key === '--session') result.session = args[i + 1];
    else { if (!/^[1-9][0-9]{3,4}$/.test(args[i + 1])) throw new Error('Invalid port'); result.port = Number(args[i + 1]); }
  }
  if (!/^[a-z][a-z0-9-]{0,39}$/.test(result.session)) throw new Error('Session must be a lowercase name (1–40 letters, numbers or hyphens)');
  if (result.port > 65535 || result.port < 1024 || forbiddenPorts.has(result.port)) throw new Error('Refusing reserved or existing-stack port');
  return result;
}
export function cleanEnvironment(env) {
  const unsafe = Object.keys(env).filter(key => /^(XHS_|COOKIES_|AUTH_TOKEN$|DATABASE_URL$|REDIS_URL$|DOTENV_|CRM_|NODE_OPTIONS$|NODE_USE_ENV_PROXY$|NODE_EXTRA_CA_CERTS$|SSL_CERT_FILE$|HTTP_PROXY$|HTTPS_PROXY$|ALL_PROXY$|http_proxy$|https_proxy$|all_proxy$)/i.test(key) && env[key]);
  if (unsafe.length) throw new Error(`Refusing mixed environment; unset these keys in this terminal: ${unsafe.join(', ')}`);
  // No inherited application, proxy, browser, fingerprint or credential settings.
  return platform.minimalEnvironment(env);
}
async function stat(path) { try { return await lstat(path); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }
async function plain(path, directory = false, privateMode = false) {
  const s = await stat(path);
  if (!s || s.isSymbolicLink() || (directory ? !s.isDirectory() : !s.isFile()) || (!directory && s.nlink !== 1)) throw new Error(`Missing or unsafe ${directory ? 'directory' : 'file'}: ${path}`);
  if(process.platform==='win32'){if(directory)await platform.privateDirectory(path);else if(privateMode)await platform.privateFile(path);else await platform.executableFile(path);return s;}
  if (s.uid !== process.getuid() || (privateMode && (s.mode & 0o077))) throw new Error(`Ownership/permissions need manual review: ${path}`);
  return s;
}
async function hash(path) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}
export async function portAvailable(port) {
  const server = createServer();
  try { await new Promise((ok, fail) => { server.once('error', fail); server.listen({ host: '127.0.0.1', port, exclusive: true }, ok); }); }
  catch { throw new Error(`Port ${port} unavailable; no process was reused or stopped`); }
  finally { if (server.listening) await new Promise(ok => server.close(ok)); }
}
export async function inspectSession(plan, required = false) {
  for (const path of [join(plan.root, '.local'), plan.base]) if (await stat(path)) await plain(path, true, path === plan.base);
  if (!await stat(plan.directory)) { if (required) throw new Error('No session created by this launcher; run the explicit login step first'); return null; }
  await plain(plan.directory, true, true);
  const markerPath = join(plan.directory, 'session.json');
  await plain(markerPath, false, true);
  const marker = JSON.parse(await readFile(markerPath, 'utf8')); // Public ownership marker only. Never read cookies.
  if (marker.kind !== 'crm-real-login-v1' || marker.root !== plan.root || marker.session !== plan.session || marker.port !== plan.port) throw new Error('Session ownership or port mismatch; refusing to adopt existing data');
  if (await stat(join(plan.directory, 'operation.lock'))) throw new Error('Session locked; do not delete the lock or kill an unknown process. Inspect its original terminal.');
  return marker;
}
export async function localDependencies(root) {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22+ is required; no installation performed');
  for (const name of ['prisma', 'tsx', 'tsc', 'vite']) {
    const executable = process.platform==='win32'?join(root,'node_modules',({prisma:'prisma/build/index.js',tsx:'tsx/dist/cli.mjs',tsc:'typescript/bin/tsc',vite:'vite/bin/vite.js'})[name]):join(root, 'node_modules', '.bin', name);
    try {
      await access(executable, constants.X_OK);
      if (!platform.isWithin(join(root,'node_modules'),await realpath(executable))) throw new Error('External executable');
    } catch { throw new Error(`Missing or external project dependency: ${name}; no installation performed`); }
  }
}
export async function preflight({ root, home, session, port, env, checkTools = true }) {
  cleanEnvironment(env);
  if (resolve(root) !== await realpath(root)) throw new Error('Project must use its canonical directory');
  const base = join(root, '.local', 'xhs-real');
  const directory = join(base, session);
  const plan = { root, base, directory, session, port, cookies: join(directory, 'cookies.json'),
    login: join(home, '.local/bin/xiaohongshu-login'), mcp: join(home, '.local/bin/xiaohongshu-mcp'),
    browser: join(home, 'Library/Caches/xiaohongshu-mcp/browser', browserVersion, 'Chromium.app/Contents/MacOS/Chromium') };
  if(process.platform==='win32'){
    const tools=platform.toolPlan(home,'win32',platform.windowsDataRoot());Object.assign(plan,tools);
    if(checkTools){if(!platform.platformCapability().supported)throw Error('Windows 11 x64 native Node required');await platform.inspectTools(home);await localDependencies(root);}
    await portAvailable(port);return plan;
  }
  await inspectSession(plan);
  if (checkTools) {
    if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('This reviewed launcher currently supports macOS arm64 only');
    for (const key of ['login', 'mcp']) {
      await plain(plan[key]); await access(plan[key], constants.X_OK);
      if (await hash(plan[key]) !== reviewed[key]) throw new Error(`Installed ${key} binary differs from reviewed build; review required, nothing launched`);
    }
    await plain(plan.browser); await access(plan.browser, constants.X_OK);
    await localDependencies(root);
  }
  await portAvailable(port);
  return plan;
}
export async function createSession(plan) {
  await inspectSession(plan);
  await mkdir(join(plan.root, '.local'), { recursive: true, mode: 0o700 });
  await mkdir(plan.base, { recursive: true, mode: 0o700 });
  await plain(plan.base, true, true);
  await mkdir(plan.directory, { mode: 0o700 }); // Exclusive: never replace/reuse an old login.
  await writeFile(join(plan.directory, 'session.json'), JSON.stringify({ kind: 'crm-real-login-v1', root: plan.root, session: plan.session, port: plan.port, createdAt: new Date().toISOString(), loginVerified: false }), { flag: 'wx', mode: 0o600 });
}
export async function lockSession(plan) {
  const path = join(plan.directory, 'operation.lock');
  await writeFile(path, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }), { flag: 'wx', mode: 0o600 });
  return () => unlink(path);
}
export async function sessionCandidate(plan) {
  // Stat only. A seed-only or expired file is NOT proof of a logged-in account.
  const s = await plain(plan.cookies, false, true);
  if (!s.size || s.size > 1024 * 1024) throw new Error('Session candidate missing/oversized; no login claim is possible');
}
export async function protectCandidate(plan) {
  if (await stat(plan.cookies)) { await plain(plan.cookies); await chmod(plan.cookies, 0o600); }
}
