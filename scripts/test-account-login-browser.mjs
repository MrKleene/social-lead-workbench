import {spawn} from 'node:child_process';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,''),out=await mkdtemp(join(tmpdir(),'crm-qr-offline-'));
const child=spawn(process.execPath,['scripts/xhs-login-workbench.mjs','--offline'],{cwd:root,env:process.env,stdio:['ignore','pipe','pipe']});
let output='',browser,page,ended=false;child.stdout.on('data',x=>{output+=x;});child.stderr.on('data',()=>{});const done=new Promise(ok=>child.once('exit',()=>{ended=true;ok();}));
const checks={environment:'OFFLINE QR flow, fictional images/status only; NOT real XHS',platformCalls:false,checks:[]};
const mark=s=>{checks.checks.push(s);console.log('PASS '+s);};
async function until(fn,ms=60000){const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;if(ended)throw Error('Preview exited');await new Promise(ok=>setTimeout(ok,100));}throw Error('Deadline');}
console.log('Evidence: '+out);
try{
 await until(()=>output.includes('One-run password'));
 const base=output.match(/ACCOUNT LOGIN OFFLINE .* preview: (http:\/\/[^\s]+)/)[1],password=output.match(/One-run password \(never save in browser\): ([^\s]+)/)[1];checks.preview=base;
 await until(async()=>{try{return(await fetch(base+'/api/health/ready')).ok;}catch{return false;}});
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.getByLabel('登录邮箱').fill('admin@fixture.invalid');await page.getByLabel('密码',{exact:true}).fill(password);await page.getByRole('button',{name:'登录工作台'}).click();await page.waitForURL('**/work');
 const session=await(await context.request.get(base+'/api/auth/me')).json();
 const api=async(path,body)=>context.request.fetch(base+'/api'+path,{method:body?'POST':'GET',headers:{Origin:base,'x-csrf-token':session.csrfToken},...(body?{data:body}:{})});
 assert.equal((await(await api('/accounts/login-capabilities')).json()).mode,'offline');mark('One launcher starts offline workbench; no terminal platform login required');
 await page.goto(base+'/work?module=accounts');await page.getByRole('button',{name:'添加账号',exact:true}).click();
 const confirm=page.getByRole('button',{name:'确认并生成二维码',exact:true});await confirm.waitFor();assert(await confirm.isDisabled());
 let accounts=(await(await api('/accounts')).json()).accounts,account=accounts[0];
 assert.equal((await api(`/accounts/${account.id}/login`,{requestKey:crypto.randomUUID()})).status(),400);mark('Explicit UI consent required; server rejects missing consent');
 await page.getByRole('checkbox',{name:/我同意在此执行电脑/}).check();
 const started=page.waitForResponse(r=>r.url().endsWith(`/accounts/${account.id}/login`)&&r.request().method()==='POST');await confirm.click();const response=await started;let attempt=await response.json();assert((response.headers()['cache-control']||'').includes('no-store'));await page.getByRole('img',{name:'离线演示图案，不可扫码'}).waitFor();mark('Consent produces memory-only, no-store response and clearly labeled offline placeholder');
 const dup=await api(`/accounts/${account.id}/login`,{requestKey:attempt.requestKey,consent:'local-session-v1'});assert.equal((await dup.json()).id,attempt.id);
 assert.equal((await api(`/accounts/${account.id}/login`,{requestKey:crypto.randomUUID(),consent:'local-session-v1'})).status(),409);mark('Duplicate click idempotent; concurrent new attempt rejected');
 await page.getByRole('button',{name:'取消等待',exact:true}).click();await page.getByText('【离线模拟】等待已取消',{exact:true}).waitFor();assert.equal(await page.getByRole('img',{name:'离线演示图案，不可扫码'}).count(),0);mark('Cancel removes image and ends waiting');
 const retry=page.getByRole('button',{name:'重新确认并获取新二维码',exact:true});await page.getByRole('checkbox',{name:/我同意在此执行电脑/}).check();await retry.click();await page.getByRole('button',{name:'模拟过期（离线）',exact:true}).click();await page.getByText('【离线模拟】二维码已过期',{exact:true}).waitFor();assert.equal(await page.getByRole('img',{name:'离线演示图案，不可扫码'}).count(),0);mark('Expiry clears image; refresh requires manual action');
 const refreshed=page.waitForResponse(r=>r.url().endsWith(`/accounts/${account.id}/login`)&&r.request().method()==='POST');await page.getByRole('checkbox',{name:/我同意在此执行电脑/}).check();await retry.click();attempt=await(await refreshed).json();await page.getByRole('img',{name:'离线演示图案，不可扫码'}).waitFor();
 await page.screenshot({path:join(out,'desktop-offline.png')});await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'取消等待',exact:true}).focus();assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'取消等待');await page.screenshot({path:join(out,'narrow-offline.png')});mark('Desktop/narrow rendering and keyboard cancel focus');
 // Closing the drawer cancels its owned attempt; re-opening does not auto-start.
 await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});await until(async()=>{const r=await api(`/accounts/${account.id}/login/check`,{requestKey:attempt.requestKey});return(await r.json()).state==='CANCELLED';},5000);mark('Closing drawer cancels backend attempt');
 await page.getByRole('button',{name:'扫码登录',exact:true}).click();await page.getByRole('checkbox',{name:/我同意在此执行电脑/}).check();await page.getByRole('button',{name:'确认并生成二维码',exact:true}).click();await page.getByRole('button',{name:'模拟扫码成功（离线）',exact:true}).click();await page.getByText('【离线模拟】平台登录已确认',{exact:true}).waitFor();
 account=(await(await api('/accounts')).json()).accounts.find(a=>a.id===account.id);assert.equal(account.loginProvider,'offline');assert.equal(account.status,'PAUSED');assert.equal(account.available,false);mark('Verified stable identity binds account with offline label and business still paused');
 const salesContext=await browser.newContext();await salesContext.request.post(base+'/api/auth/login',{headers:{Origin:base},data:{email:'sales-a@fixture.invalid',password}});assert.equal((await salesContext.request.get(base+'/api/accounts/login-capabilities')).status(),403);assert.equal((await salesContext.request.post(`${base}/api/accounts/${account.id}/login`,{headers:{Origin:base},data:{requestKey:crypto.randomUUID(),consent:'local-session-v1'}})).status(),403); assert.equal((await fetch(base+'/api/accounts/login-capabilities')).status,401); assert.equal((await context.request.post(`${base}/api/accounts/${account.id}/login`,{headers:{Origin:base},data:{requestKey:crypto.randomUUID(),consent:'local-session-v1'}})).status(),403); mark('Anonymous/sales denied; login writes require CSRF');await salesContext.close();
 const audit=await(await api('/audit')).text();assert(!audit.includes('base64'));assert(!audit.includes('cookies.json'));assert(!audit.includes('AUTH_TOKEN'));assert.deepEqual(errors,[]);assert.equal(await page.locator('vite-error-overlay').count(),0);mark('Audit excludes QR/session content; no frontend runtime errors');
}catch(e){if(page)await page.screenshot({path:join(out,'failure-offline.png')}).catch(()=>{});console.error(e.message);throw e;}
finally{await browser?.close();child.kill('SIGTERM');let timer;try{await Promise.race([done,new Promise((_,no)=>{timer=setTimeout(()=>no(Error('Own preview cleanup timeout')),30000);})]);}finally{clearTimeout(timer);}assert(output.includes('Temporary containers removed: 2/2'));mark('Both owned temporary containers removed');await writeFile(join(out,'checks.json'),JSON.stringify(checks,null,2)+'\n');}
