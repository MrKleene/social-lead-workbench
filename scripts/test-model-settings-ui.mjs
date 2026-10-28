import {selectOption,controlValue} from './ui-controls.mjs';
// Isolated built UI. All API responses and Keys are synthetic; reject external traffic.
import {createServer} from 'node:http';
import {readFile,mkdtemp,writeFile} from 'node:fs/promises';
import {join,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../apps/web/dist/',import.meta.url)),out=await mkdtemp(join(tmpdir(),'crm-model-settings-ui-'));
const contentType=f=>({'.js':'application/javascript','.css':'text/css','.html':'text/html','.png':'image/png'})[extname(f)]||'text/plain';
const asset=p=>/^\/(assets|space)\//.test(p)?p:'/index.html';
const server=createServer(async(req,res)=>{try{const f=asset(new URL(req.url,'http://localhost').pathname);res.setHeader('Content-Type',contentType(f));res.end(await readFile(join(root,f)));}catch{res.writeHead(404).end();}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const base=`http://127.0.0.1:${server.address().port}`,report={checks:[],errors:[],unexpected:[],writes:0},fake='FAKE-UI-ONLY-KEY-1234567890';
const initial=()=>({configured:false,note:'',updatedAt:null,version:0,model:'qwen3.8-flash',endpoint:'beijing-standard',dailyLimit:null,vault:{state:'READY',message:'合成密钥库就绪'},priceVersion:'beijing-2026-10-21',models:[{id:'qwen3.8-flash',priceDescription:'虚构展示价格',priceVersion:'beijing-2026-10-21'},{id:'qwen3.8-max',priceDescription:'合成价格一；合成价格二；合成价格三',priceVersion:'beijing-2026-10-26'},{id:'qwen3.8-max-0902',priceDescription:'虚构日期版价格',priceVersion:'beijing-2026-10-21'}],automaticTest:false});
const responses=(p,role)=>p==='/auth/me'?{user:{id:'fixture',name:'虚构测试管理员',role},csrfToken:'fake-csrf'}:p==='/collection/mcp/readiness'?{enabled:false,captureArchiveVersion:1,mode:'XHS_MCP',accounts:[],automaticPolling:false}:p==='/accounts'?{accounts:[],summary:{available:0,attention:0}}:[];
let browser,page;
async function capture(label,width,panel){
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'document overflow');
 assert.equal(await page.locator('vite-error-overlay').count(),0);
 if(await page.getByRole('alertdialog').count())await panel.scrollIntoViewIfNeeded();else await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:join(out,`${label}-${width}.png`),fullPage:true});
}
try{
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 for(const width of [1440,390,320]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  let state=initial(),role='ADMIN',gets=0,writes=0,fail=false,oldBackend=false,hold,release;
  await context.addInitScript(()=>{window.__secretWrites=[];const orig=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){window.__secretWrites.push(String(v));return orig.call(this,k,v);};});
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());if(u.origin!==base){report.unexpected.push(u.origin);return route.abort();}if(!u.pathname.startsWith('/api/'))return route.continue();const p=u.pathname.slice(4);
   if(p==='/model-settings'){
    if(req.method()==='GET'){gets++;return route.fulfill(oldBackend?{status:404,json:{message:'not deployed'}}:{json:state});}
    assert.equal(role,'ADMIN');writes++;report.writes++;
    if(req.method()==='PUT'){
     const b=req.postDataJSON();assert.equal(b.version,state.version);assert.equal(b.endpoint,'beijing-standard');assert.equal(b.model,'qwen3.8-max');assert.equal(b.priceVersion,'beijing-2026-10-26');assert.equal(b.dailyLimit,undefined);assert.equal(b.confirmPricing,undefined);assert.equal(b.consent,undefined);assert.equal(b.key,fake);
     if(hold)await hold;if(fail)return route.fulfill({status:409,json:{message:'保存失败；原配置保留'}});
     state={...state,configured:true,note:b.note,model:b.model,dailyLimit:state.dailyLimit,version:state.version+1,updatedAt:'2026-10-26T12:00:00Z'};return route.fulfill({json:state});
    }
    if(req.method()==='DELETE'){assert.deepEqual(req.postDataJSON(),{version:state.version,confirmation:'DELETE_MODEL_KEY'});state={...state,configured:false,note:'',version:state.version+1};return route.fulfill({json:state});}
   }
   if(req.method()!=='GET'){report.unexpected.push(req.method()+' '+p);return route.abort();}
   if(p==='/events')return route.fulfill({contentType:'text/event-stream',body:': fixture\n\n'});
   return route.fulfill({json:responses(p,role)});
  });
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(['error','warning'].includes(m.type())&&!/Failed to load resource.*(?:409|404)/.test(m.text()))report.errors.push(m.text());});
  await page.goto(base+'/work?module=settings');assert.equal(page.url(),base+'/work?module=settings');assert((await page.title()).length>0);
  const summary=page.getByRole('button',{name:'模型设置 · 仅管理员',exact:true});await summary.waitFor();assert.equal(gets,0);await summary.click();
  const panel=page.getByRole('region',{name:'管理员模型设置'}),key=panel.getByLabel('模型 API Key'),model=panel.getByLabel('匹配模型'),save=panel.getByRole('button',{name:'保存',exact:true}),description=panel.getByLabel('模型描述');

  await panel.waitFor();assert.equal(await panel.locator('input:not([aria-hidden=true]),[data-slot=select-trigger]').count(),3);assert.equal(await key.getAttribute('type'),'password');assert.equal(await panel.locator('.model-advanced').count(),0);assert.equal(writes,0);await capture('empty',width,panel);
  await model.focus();await page.keyboard.press('Tab');assert(await key.evaluate(e=>e===document.activeElement));
  assert.deepEqual(await key.evaluate(e=>{const s=getComputedStyle(e);return {outline:s.outlineStyle,width:s.outlineWidth,shadow:s.boxShadow};}),{outline:'solid',width:'2px',shadow:'none'});
  await key.fill('short');await save.click();assert(!(await key.evaluate(e=>e.validity.valid)));assert.equal(writes,0);
  await description.fill('虚构UI用途');await selectOption(model, 'qwen3.8-max');await key.fill(fake);assert.equal(await panel.getByRole('button',{name:/高级设置/}).count(),0);assert.equal(await panel.getByRole('checkbox').count(),0);assert.equal(writes,0);

  hold=new Promise(ok=>{release=ok;});await save.click();await panel.getByRole('button',{name:'保存中…'}).waitFor();assert(await key.isDisabled());assert(await model.isDisabled());assert(await description.isDisabled());assert.equal(await controlValue(key),'');assert.equal(writes,1);await page.keyboard.press('Escape');assert(await page.getByRole('dialog',{name:'模型设置 · 仅管理员',exact:true}).isVisible());release();hold=undefined;
  await panel.getByRole('status').filter({hasText:'Key 已配置'}).waitFor();await page.waitForFunction(()=>document.activeElement.textContent==='评论语义匹配模型');assert.equal(await key.count(),0);assert.equal(await panel.locator('input:not([aria-hidden=true]),[data-slot=select-trigger]').count(),0);assert.equal(await panel.getByRole('button').count(),2);assert.equal(state.note,'虚构UI用途');assert((await panel.innerText()).includes('虚构UI用途'));assert.equal(state.dailyLimit,null);assert(!(await panel.innerText()).includes(fake));
  assert(await page.evaluate(()=>!JSON.stringify([localStorage,sessionStorage,window.__secretWrites]).includes('FAKE-UI-ONLY')));await capture('configured',width,panel);report.checks.push(`two-field form, password, native validation, three-field direct save without budget or authorization, busy, safe summary, storage, single focus ${width}`);
  await page.reload();await summary.click();await panel.getByRole('status').filter({hasText:'Key 已配置'}).waitFor();assert.equal(await key.count(),0);
  const edit=panel.getByRole('button',{name:'更换',exact:true});await edit.click();assert.equal(await controlValue(key),'');assert(await model.evaluate(e=>e===document.activeElement));await selectOption(model, 'qwen3.8-flash');await key.fill(fake);await panel.getByRole('button',{name:'取消',exact:true}).click();await page.waitForFunction(()=>document.activeElement?.textContent==='更换');assert(await edit.evaluate(e=>e===document.activeElement));assert.equal(writes,1);await edit.click();assert.equal(await controlValue(model),'qwen3.8-max');assert.equal(await controlValue(key),'');
  fail=true;await key.fill(fake);await save.click();await panel.getByText('保存失败；原配置保留',{exact:true}).waitFor();assert.equal(await controlValue(key),'');assert.equal(state.configured,true);assert.equal(state.note,'虚构UI用途');assert.equal(writes,2);await capture('failed-replace',width,panel);fail=false;
  await key.fill(fake);await save.click();await panel.getByRole('status').filter({hasText:'Key 已配置'}).waitFor();assert.equal(writes,3);assert.equal(await key.count(),0);
  const del=panel.getByRole('button',{name:'删除',exact:true});await del.click();const dialog=page.getByRole('alertdialog',{name:'删除已存 Key？'}),confirm=dialog.getByRole('button',{name:'确认删除',exact:true});await dialog.waitFor();assert(await confirm.isDisabled());assert.equal(await page.evaluate(()=>document.activeElement.id),'cancel-model-key-delete');await page.keyboard.press('Shift+Tab');assert(await page.evaluate(()=>!!document.activeElement.closest('[role=alertdialog]')));await dialog.getByRole('button',{name:'取消删除'}).click();await page.waitForFunction(()=>document.activeElement.textContent==='删除');assert.equal(writes,3);
  await del.click();await dialog.waitFor();await page.keyboard.press('Escape');await page.waitForFunction(()=>document.activeElement.textContent==='删除');assert.equal(writes,3);
  await del.click();await dialog.waitFor();await page.mouse.click(4,4);await dialog.waitFor({state:'hidden'});await page.waitForFunction(()=>document.activeElement.textContent==='删除');assert.equal(writes,3);await del.click();await dialog.getByRole('checkbox').check();await capture('delete',width,dialog);await confirm.click();await key.waitFor();assert.equal(writes,4);assert.equal(await controlValue(key),'');await page.waitForFunction(()=>document.activeElement.textContent==='评论语义匹配模型');
  await key.fill(fake);await page.keyboard.press('Escape');await page.getByRole('dialog',{name:'模型设置 · 仅管理员',exact:true}).waitFor({state:'hidden'});await page.waitForFunction(()=>document.activeElement.textContent==='模型设置 · 仅管理员');await summary.click();assert.equal(await controlValue(key),'');assert.equal(writes,4);
  state={...state,vault:{state:'MASTER_MISSING',message:'合成主密钥缺失'}};await page.reload();await summary.click();await panel.getByRole('alert').waitFor();assert(await key.isDisabled());assert(await save.isDisabled());assert.equal(writes,4);
  oldBackend=true;await page.reload();await summary.click();await page.getByText('模型设置后台尚未部署；',{exact:false}).waitFor();assert.equal(await key.count(),0);
  role='SALES';const before=gets;await page.reload();await page.locator('.space-shell').waitFor();assert.equal(await summary.count(),0);assert.equal(gets,before);report.checks.push(`reload, edit/cancel reset, failed and successful replacement, delete cancel/Escape/confirm focus, close clears input, missing vault/backend and sales ${width}`);
  await context.close();
 }
 const remote=await browser.newContext({viewport:{width:1000,height:800}});let remoteWrites=0;
 await remote.route('**/*',async route=>{const req=route.request(),p=new URL(req.url()).pathname;if(req.method()!=='GET'){remoteWrites++;return route.abort();}if(p.startsWith('/api/'))return route.fulfill({json:p==='/api/model-settings'?initial():responses(p.slice(4),'ADMIN')});const f=asset(p);return route.fulfill({contentType:contentType(f),body:await readFile(join(root,f))});});
 const rp=await remote.newPage();rp.on('pageerror',e=>report.errors.push(e.message));await rp.goto('http://unsafe.example.invalid/work?module=settings');await rp.getByRole('button',{name:'模型设置 · 仅管理员',exact:true}).click();await rp.getByRole('alert').filter({hasText:'远程 HTTP'}).waitFor();assert(await rp.getByLabel('模型 API Key').isDisabled());assert(await rp.getByRole('button',{name:'保存',exact:true}).isDisabled());assert.equal(remoteWrites,0);await remote.close();report.checks.push('remote HTTP blocks credential input before any submission');
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.unexpected,[]);assert.equal(report.writes,12);console.log('PASS '+report.checks.length+' model-settings scenarios at 1440/390/320px; 12 intercepted fake writes; zero external/model/collection/send requests');
}finally{
 if(page&&!page.isClosed())await page.screenshot({path:join(out,'failure.png'),fullPage:true});await browser?.close();server.closeAllConnections();await new Promise(ok=>server.close(ok));await writeFile(join(out,'checks.json'),JSON.stringify(report,null,2));console.log('Evidence: '+out);
}
