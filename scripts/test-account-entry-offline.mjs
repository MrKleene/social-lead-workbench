// Fictional browser regression only: no database, existing browser profile or platform.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, extname } from 'node:path';
import assert from 'node:assert/strict';
const out=await mkdtemp(join(tmpdir(),'crm-qr-entry-evidence-'));
const root=fileURLToPath(new URL('../apps/web/dist/',import.meta.url));
console.log('Evidence: '+out);
const server=createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;const file=(pathname.startsWith('/assets/')||pathname.startsWith('/space/'))?pathname:'/index.html';res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.html':'text/html','.png':'image/png'})[extname(file)]||'text/plain');res.end(await readFile(join(root,file)));}catch{res.writeHead(404).end();}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const base=`http://127.0.0.1:${server.address().port}`;
let browser;
const report={mode:'independent static build with fictional API responses; no database or platform',checks:[],unexpected:[],writes:[],errors:[]};
const caps={enabled:false,mode:'real',storageRoot:'/fixture',persistent:true,deviceRequired:true,device:null};
const device={enabled:true,provider:'real',suggestedRoot:'/fixture/private',allowedBase:'/fixture',candidateId:'fixture-only',capability:{os:'macOS',supported:true,adapter:'fixture',remote:false},device:null};
try {
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 for(const scenario of ['unapproved','offline-device','disabled','ready','offline','loading','error','sales']) {
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  let failed=scenario==='error',release;const gate=new Promise(ok=>release=ok);
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin!==base){report.unexpected.push(url.origin);return route.abort();}
   if(!url.pathname.startsWith('/api/'))return route.continue();
   if(req.method()!=='GET'){report.writes.push(url.pathname);return route.abort();}
   const path=url.pathname.slice(4);let data=[];
   if(path==='/events')return route.fulfill({contentType:'text/event-stream',body:': offline fixture\n\n'});
   if(path==='/auth/me')data={user:{id:'fixture-admin',name:'离线测试',role:scenario==='sales'?'SALES':'ADMIN'},csrfToken:'fictional-no-session'};
   else if(path==='/accounts')data={accounts:[],summary:{available:0,attention:0}};
   else if(path==='/accounts/login-capabilities'){
    if(scenario==='loading')await gate;
    if(failed)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'fictional service unavailable'})});
    data={...caps,...(scenario==='disabled'?{mode:'disabled'}:{}),...(scenario==='offline-device'?{device:{name:'虚构设备',os:'macOS',online:false}}:{}),...(['ready','offline'].includes(scenario)?{enabled:true,mode:scenario==='offline'?'offline':'real',device:{name:'虚构设备',os:'macOS',online:true}}:{})};
   }
   else if(path==='/devices')data=device;
   else if(path==='/collection/mcp/readiness')data={enabled:false,accounts:[]};
   return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(`${scenario}: ${e.message}`));
  page.on('console',m=>{if(['error','warning'].includes(m.type())&&!m.text().includes('503 (Service Unavailable)'))report.errors.push(`${scenario}: ${m.text()}`);});
  await page.goto(base+'/work?module=accounts&view=new');
  await page.getByRole('heading',{name:'账号中心',exact:true}).waitFor();
  assert.equal(await page.locator('vite-error-overlay').count(),0);
  await page.waitForFunction(()=>[...document.images].every(img=>img.complete&&img.naturalWidth>0));
  assert((await page.title()).length>0);
  const boundary=page.locator('.account-boundary');
  const expected={unapproved:'请先在专用电脑设置中批准执行设备','offline-device':'专用电脑已撤销、离线或尚未认证',disabled:'此启动环境未配置扫码登录',ready:'扫码仅在本人确认后启用',offline:'当前为离线演示',loading:'正在读取扫码登录能力',error:'无法读取扫码登录能力',sales:'扫码登录与设备设置由管理员处理'}[scenario];
  await boundary.filter({hasText:expected}).waitFor();
  if(!['ready','offline'].includes(scenario))assert.equal(await page.getByRole('button',{name:'添加账号并扫码',exact:true}).count(),0);
  if(scenario==='ready')assert(await page.getByRole('button',{name:'添加账号并扫码',exact:true}).isEnabled());
  if(scenario==='offline')assert(await page.getByRole('button',{name:'添加账号并演示扫码',exact:true}).isEnabled());
  if(scenario==='unapproved'){
   const link=page.getByRole('link',{name:'查看专用电脑设置'});
   for(let i=0;i<60&&!await link.evaluate(el=>el===document.activeElement);i++)await page.keyboard.press('Tab');
   assert(await link.evaluate(el=>el===document.activeElement),'link keyboard reachable');
   await page.keyboard.press('Enter');
   assert(await page.locator('#execution-device-settings').evaluate(el=>el.open));
   assert(await page.locator('#execution-device-settings summary').evaluate(el=>el===document.activeElement));
   assert(await page.getByRole('button',{name:'批准注册专用电脑',exact:true}).isDisabled());
   await page.screenshot({path:join(out,'unapproved-desktop.png'),fullPage:false});
   await page.setViewportSize({width:390,height:844});
   await page.locator('.account-boundary').scrollIntoViewIfNeeded();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:join(out,'unapproved-narrow.png'),fullPage:false});
  }
  if(scenario==='error'){
   await page.screenshot({path:join(out,'capability-error.png')});
   failed=false;await page.getByRole('button',{name:'重试读取扫码能力'}).click();
   await boundary.filter({hasText:'请先在专用电脑设置中批准执行设备'}).waitFor();
  }
  release();
  report.checks.push(`${scenario}: rendered expected state; no implicit login/approval`);
  await context.close();
 }
 assert.deepEqual(report.unexpected,[]);assert.deepEqual(report.writes,[]);assert.deepEqual(report.errors,[]);
 await writeFile(join(out,'ui-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
} finally {await browser?.close();await new Promise(ok=>server.close(ok));}
