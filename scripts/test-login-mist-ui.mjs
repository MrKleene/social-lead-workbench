// Synthetic session and credentials only; every API request is intercepted.
import {createServer} from 'node:http';
import {readFile,mkdtemp,writeFile} from 'node:fs/promises';
import {join,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../apps/web/dist/',import.meta.url)),out=await mkdtemp(join(tmpdir(),'crm-login-mist-'));
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname,f=path.startsWith('/assets/')?path:'/index.html';res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.html':'text/html'})[extname(f)]||'text/plain');res.end(await readFile(join(root,f)));}catch{res.writeHead(404).end();}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base=`http://127.0.0.1:${server.address().port}`,report={checks:[],errors:[],unexpected:[]};let browser,page;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
 for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:1440,height:600},{width:390,height:600}]){
  let calls=0,finish,success=false;const context=await browser.newContext({viewport});context.setDefaultTimeout(10000);
  await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url()),p=url.pathname;
   if(url.origin!==base){report.unexpected.push(p);return route.abort();}if(!p.startsWith('/api/'))return route.continue();
   if(p==='/api/auth/me')return route.fulfill({status:401,json:{message:'synthetic unauthenticated'}});
   if(p==='/api/auth/login'){
    calls++;assert.equal(req.method(),'POST');assert.deepEqual(req.postDataJSON(),{email:'fixture@example.invalid',password:'synthetic-test-only'});await new Promise(r=>finish=r);
    return route.fulfill(success?{json:{user:{id:'fixture',name:'合成测试用户',role:'ADMIN'},csrfToken:'synthetic-csrf'}}:{status:401,json:{message:'合成登录失败：账号或密码不正确'}});
   }
   if(req.method()!=='GET'){report.unexpected.push(req.method()+' '+p);return route.abort();}
   if(p==='/api/events')return route.fulfill({contentType:'text/event-stream',body:': fixture\n\n'});
   return route.fulfill({json:p==='/api/accounts'?{accounts:[],summary:{available:0,attention:0}}:p==='/api/collection/mcp/readiness'?{enabled:false,accounts:[],device:null}:p==='/api/health'?{contactWorkflow:true}:[]});
  });
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(base+'/work');await page.getByRole('heading',{name:'欢迎回来',exact:true}).waitFor();
  assert.equal(await page.locator('.login-story').evaluate(e=>getComputedStyle(e).backgroundImage),'none');assert.equal(await page.locator('.login-form').evaluate(e=>getComputedStyle(e).borderRadius),'12px');assert.equal(await page.getByRole('button',{name:'登录工作台',exact:true}).evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(18, 133, 111)');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const contrast=await page.evaluate(()=>{const l=rgb=>rgb.map(v=>{const n=v/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);return [...document.querySelectorAll('.login-form .muted,.login-disclaimer,[data-slot=field-description],.login-story>div>p,.brand small')].map(e=>(l([246,248,251])+.05)/(l(getComputedStyle(e).color.match(/[\d.]+/g).slice(0,3).map(Number))+.05));});assert(contrast.every(n=>n>=4.5));
  await page.screenshot({path:join(out,`login-${viewport.width}-${viewport.height}.png`),fullPage:true});
  const email=page.getByLabel('登录邮箱',{exact:true}),password=page.getByLabel('密码',{exact:true});assert.equal(await email.getAttribute('autocomplete'),'username');assert.equal(await password.getAttribute('autocomplete'),'current-password');assert.equal(await password.getAttribute('type'),'password');
  await page.getByRole('button',{name:'登录工作台',exact:true}).click();assert.equal(calls,0);await email.fill('fixture@example.invalid');await email.click();await page.waitForFunction(()=>{const s=getComputedStyle(document.getElementById('email'));return s.boxShadow==='none'&&s.outlineWidth==='2px'&&s.outlineOffset==='-1px'});await page.screenshot({path:join(out,`focus-${viewport.width}-${viewport.height}.png`)});await email.focus();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'password');assert.equal(await password.evaluate(e=>getComputedStyle(e).boxShadow),'none');await password.fill('synthetic-test-only');await page.keyboard.press('Enter');await page.getByRole('button',{name:'正在验证…',exact:false}).waitFor();assert.equal(calls,1);assert(await page.getByRole('button',{name:'正在验证…',exact:false}).isDisabled());finish();await page.getByRole('alert').getByText('合成登录失败：账号或密码不正确',{exact:true}).waitFor();assert.equal(await password.inputValue(),'');assert.equal(await email.inputValue(),'fixture@example.invalid');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.login-form').evaluate(e=>getComputedStyle(e).animationName),'none');await password.fill('synthetic-test-only');success=true;await page.getByRole('button',{name:'登录工作台',exact:true}).click();await page.getByRole('button',{name:'正在验证…',exact:false}).waitFor();finish();await page.getByRole('heading',{name:'开始一次自动化采集',exact:true}).waitFor();assert.equal(calls,2);assert.equal(await page.locator('.login-screen').count(),0);report.checks.push(`Mist layout, contrast, keyboard, required fields, pending/error/password clearing/success, reduced motion ${viewport.width}×${viewport.height}`);await context.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.unexpected,[]);console.log('PASS '+report.checks.length+' login viewport/behavior groups; synthetic authentication only');
}finally{if(page&&!page.isClosed())await page.screenshot({path:join(out,'failure.png'),fullPage:true});await browser?.close();server.closeAllConnections();await new Promise(ok=>server.close(ok));await writeFile(join(out,'checks.json'),JSON.stringify(report,null,2));console.log('Evidence: '+out);}
