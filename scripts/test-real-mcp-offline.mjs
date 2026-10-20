// Entirely offline: real-mode workbench against our fictional loopback MCP.
// Never imports or launches the installed platform login/MCP binaries.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startXhsFixture } from '../apps/api/test/fixtures/xhs-mcp-server.ts';
import { cleanEnvironment } from './real-mcp/core.mjs';
const root = fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'');
const token = randomBytes(32).toString('hex');
const fixture = await startXhsFixture({ authToken: token });
const env = cleanEnvironment(process.env);
const child = spawn(process.execPath,['scripts/dev-mock-isolated.mjs','--real-login-check'],{cwd:root,env,stdio:['ignore','pipe','pipe','ipc']});
let output = '', stopped = false, browser, page;
child.stdout.on('data',chunk=>{output+=String(chunk);});
child.stderr.on('data',()=>{});
const done = new Promise(resolve=>child.once('exit',code=>{stopped=true;resolve(code);}));
child.send({kind:'REAL_LOGIN_CHECK',endpoint:fixture.url.href,token});
const checks = { environment: 'OFFLINE fixture only; NOT user stack or actual XHS', platformCalls: false, tests: [] };
const mark = value => { checks.tests.push(value); console.log(`PASS ${value}`); };
async function until(fn,ms=60000) { const start=Date.now();while(Date.now()-start<ms){if(await fn())return; if(stopped)throw Error('Owned preview exited early');await new Promise(ok=>setTimeout(ok,150));}throw Error('Offline preview deadline'); }
const out = await mkdtemp(join(tmpdir(), 'crm-real-mcp-offline-'));
console.log(`Evidence directory: ${out}`);
try {
  await until(()=>output.includes('One-run password'));
  const base = output.match(/REAL LOGIN-STATUS-ONLY \(unverified\) preview: (http:\/\/[^\s]+)/)[1];
  checks.preview = base;
  const password = output.match(/One-run password \(never save in browser\): ([^\s]+)/)[1];
  await until(async()=>{try{return(await fetch(`${base}/api/health/ready`)).ok;}catch{return false;}});
  assert.equal(fixture.state.calls.length,0);mark('Startup performs no platform tool call');
  const login = await fetch(`${base}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json',Origin:base},body:JSON.stringify({email:'admin@fixture.invalid',password})});
  assert.equal(login.status,201); const cookie=login.headers.get('set-cookie').split(';')[0];
  const me = await(await fetch(`${base}/api/auth/me`,{headers:{Cookie:cookie}})).json();
  const headers={Cookie:cookie,Origin:base,'x-csrf-token':me.csrfToken,'content-type':'application/json'};
  const state=await(await fetch(`${base}/api/collection/mcp/readiness`,{headers})).json();
  assert.equal(state.loginOnly,true);assert.deepEqual(state.tools,['check_login_status']);assert.equal(state.reason,'UNVERIFIED');mark('Readiness explicitly unverified and login-only');
  const checked=await fetch(`${base}/api/collection/mcp/check`,{method:'POST',headers,body:'{}'});assert.equal(checked.status,201);
  const checkedState=await checked.json();assert.equal(checkedState.lastCheck.metadata.reason,'READY');assert.deepEqual(fixture.state.calls.map(x=>x.name),['check_login_status']);mark('One manual probe calls only login status with required auth');
  const denied=await fetch(`${base}/api/collection/configs`,{method:'POST',headers,body:JSON.stringify({name:'offline-blocked',platform:'XHS',mode:'XHS_MCP',keywords:['fictional'],excludeWords:[],batchLimit:1,enabled:true})});
  assert.equal(denied.status,403);mark('HTTP collection creation rejected server-side');
  const logs = await(await fetch(`${base}/api/audit`,{headers})).text();assert(!logs.includes(token));assert(!logs.includes('fictional-reference'));mark('Readiness audit omits transport secrets');
  if(process.env.PLAYWRIGHT_MODULE){
    const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
    browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
    const context=await browser.newContext({viewport:{width:1440,height:1000}});page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base);await page.getByLabel('登录邮箱').fill('admin@fixture.invalid');await page.getByLabel('密码',{exact:true}).fill(password);await page.getByRole('button',{name:'登录工作台'}).click();await page.waitForURL('**/work');
    await page.goto(`${base}/collection`);await page.getByText('真实登录验证环境 · 未启用采集',{exact:true}).waitFor();
    await page.getByRole('button',{name:'手动检查登录状态',exact:true}).focus();assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'手动检查登录状态');
    assert(await page.getByRole('button',{name:'新增关键词配置',exact:true}).isDisabled());
    await mkdir(out,{recursive:true});await page.screenshot({path:`${out}/desktop-offline.png`});
    await page.setViewportSize({width:390,height:844});assert(await page.getByRole('button',{name:'手动检查登录状态',exact:true}).isVisible());await page.screenshot({path:`${out}/narrow-offline.png`});
    assert.equal(await page.locator('vite-error-overlay').count(),0); assert.equal(new URL(page.url()).pathname,'/work'); assert.equal(new URL(page.url()).searchParams.get('module'),'settings'); assert(await page.title()); assert.deepEqual(errors,[]);mark('Offline browser: honest mode label, keyboard focus, desktop/narrow viewport, no page errors');
  }
  assert(!output.includes(token));
} catch (error) {
  if (page) { await page.screenshot({path:`${out}/failure-offline.png`}).catch(()=>{}); console.error('Browser at:',page.url()); }
  console.error('Offline verification failed:',error.message.replaceAll(token,'[REDACTED]'));
  throw error;
} finally {
  await browser?.close();child.kill('SIGTERM');
  let timer;try { await Promise.race([done,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Preview cleanup deadline; inspect its own output, do not kill unrelated resources')),30000);})]); }finally{clearTimeout(timer);await fixture.stop();}
  assert(output.includes('Temporary containers removed: 2/2'));mark('Only both owned tmpfs containers removed on shutdown');
  await mkdir(out,{recursive:true});await writeFile(`${out}/checks.json`,JSON.stringify(checks,null,2)+'\n');
}
