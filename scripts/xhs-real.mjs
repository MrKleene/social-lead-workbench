import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { cleanEnvironment, createSession, inspectSession, lockSession, options, preflight, protectCandidate, sessionCandidate } from './real-mcp/core.mjs';

const root = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const [action = 'prepare', ...args] = process.argv.slice(2);
let release;
const children = new Set();
let stopping = false;
let stoppingPromise;
function stop() {
  if (stoppingPromise) return stoppingPromise;
  stopping = true;
  stoppingPromise = (async () => {
    for (const child of children) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
    await Promise.all([...children].map(async child => {
      let timer;
      try { await Promise.race([child.done, new Promise(ok => { timer = setTimeout(ok, 55000); })]); }
      finally { clearTimeout(timer); }
    }));
    for (const child of children) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
  })();
  return stoppingPromise;
}
function launch(command, argv, env, ipc = false) {
  if (stopping) throw new Error('Interrupted');
  const child = spawn(command, argv, { cwd: ipc ? root : plan.directory, env, detached: true, stdio: ipc ? ['ignore', 'inherit', 'inherit', 'ipc'] : ['ignore', 'ignore', 'ignore'] });
  children.add(child);
  child.done = new Promise(resolve => { child.once('error', () => { children.delete(child); resolve(-1); }); child.once('exit', code => { children.delete(child); resolve(code ?? -1); }); });
  return child;
}
async function confirm(text, phrase) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Human confirmation in an interactive terminal required; no unattended/--yes mode');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { if (await rl.question(`${text}\nType ${phrase} to continue: `) !== phrase) throw new Error('Cancelled; no real process launched'); }
  finally { rl.close(); }
}
let plan;
try {
  if (!['prepare', 'login', 'serve'].includes(action)) throw new Error('Use prepare, login or serve');
  const opts = options(args);
  plan = await preflight({ root, home: process.env.HOME, ...opts, env: process.env });
  console.log(`REAL LOGIN PREPARATION · not logged in / not connected\nSession: ${plan.directory}\nSession file (only after explicit login): ${plan.cookies}\nMCP: http://127.0.0.1:${plan.port}/mcp\nInstalled binaries + cached browser verified. No download, platform request or credential read performed.`);
  if (action === 'prepare') {
    console.log(`Next human steps (separate approvals):\n  npm run xhs:real:login -- --session ${opts.session} --port ${opts.port}\n  npm run dev:xhs:real -- --session ${opts.session} --port ${opts.port}\nLogin opens the independent browser; no QR code is supplied by this workbench. The second command creates a temporary LOGIN-STATUS-ONLY workbench. Neither step runs during prepare.`);
  } else {
    const env = cleanEnvironment(process.env);
    Object.assign(env, { COOKIES_PATH: plan.cookies });
    if (action === 'login') {
      if (await inspectSession(plan)) throw new Error('Session already exists; use a new --session name. No overwrite or credential import is supported.');
      await confirm(`This opens the installed XHS login browser. Scanning authorizes the platform and saves a reusable session ONLY at ${plan.cookies}. The session stays after Ctrl+C. No collection/sending is enabled.`, `LOGIN ${opts.session}`);
      process.umask(0o077);
      await createSession(plan);
    } else {
      await inspectSession(plan, true); await sessionCandidate(plan);
      // Prerequisites checked before any real MCP process is started.
      const { spawnSync } = await import('node:child_process');
      for (const image of ['postgres:17', 'redis:7-alpine']) {
        if (spawnSync('docker', ['image', 'inspect', image], { env, stdio: 'ignore', timeout: 10000 }).status !== 0) throw new Error(`Required existing Docker image unavailable: ${image}; no install or pull performed`);
      }
      await confirm(`This starts an independent loopback MCP using the previously approved session at ${plan.cookies}, plus a disposable workbench. Only an explicit manual login-status check can contact XHS. No collector or sender runs. Platform session remains; temporary CRM data disappears on stop.`, `CHECK ${opts.session}`);
    }
    release = await lockSession(plan);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { process.exitCode = 130; void stop(); });
    if (action === 'login') {
      console.log('Complete login in the independent browser. Child logs are not recorded. Ctrl+C stops this login process only.');
      const child = launch(plan.login, [], env);
      const code = await child.done;
      await protectCandidate(plan);
      if (code !== 0) throw new Error('Login process stopped or failed. Its session directory is retained; no login success is claimed.');
      await sessionCandidate(plan);
      console.log('A local session candidate exists. Login is still UNVERIFIED by the workbench; use the separate CHECK step and manual status button.');
    } else {
      const token = randomBytes(32).toString('hex'); // Only process memory/child environment; never files or command-line arguments.
      const mcp = launch(plan.mcp, ['-headless=true', '-port', `127.0.0.1:${opts.port}`], { ...env, AUTH_TOKEN: token });
      let ready = false;
      for (let attempt = 0; attempt < 40 && children.has(mcp) && !stopping; attempt++) {
        try { const result = await fetch(`http://127.0.0.1:${opts.port}/health`, { signal: AbortSignal.timeout(300), redirect: 'error' }); ready = result.ok; } catch {}
        if (ready) break;
        await new Promise(ok => setTimeout(ok, 250));
      }
      if (!ready || !children.has(mcp)) throw new Error('Owned MCP startup failed; no other server will be adopted');
      const preview = launch(process.execPath, [join(root, 'scripts/dev-mock-isolated.mjs'), '--real-login-check'], { ...cleanEnvironment(process.env) }, true);
      preview.send({ kind: 'REAL_LOGIN_CHECK', endpoint: `http://127.0.0.1:${opts.port}/mcp`, token });
      console.log('MCP health only is ready; real login has NOT been checked. Open the temporary workbench URL below and manually check status. Ctrl+C stops only these owned processes/containers; platform session stays.');
      const code = await Promise.race([mcp.done, preview.done]);
      if (!stopping) throw new Error(`Owned service exited (${code}); stopping this test stack only`);
    }
  }
} catch (error) { console.error(error.message); process.exitCode ||= 1; }
finally { await stop(); if (release) await release().catch(() => { console.error('Session lock cleanup failed; manual review required.'); process.exitCode = 1; }); }
