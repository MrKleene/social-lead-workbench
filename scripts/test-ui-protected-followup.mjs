// Only static assets and synthetic API responses; reject every mutation and external URL.
import {createServer} from 'node:http';
import {readFile,mkdtemp,writeFile} from 'node:fs/promises';
import {join,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../apps/web/dist/',import.meta.url)),out=await mkdtemp(join(tmpdir(),'crm-ui-protected-followup-'));
const report={checks:[],choices:[],fields:[],errors:[],unexpected:[]};
const server=createServer(async(req,res)=>{try{const p=new URL(req.url,'http://localhost').pathname,f=p.startsWith('/assets/')?p:'/index.html';res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.html':'text/html'})[extname(f)]||'text/plain');res.end(await readFile(join(root,f)));}catch{res.writeHead(404).end();}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base=`http://127.0.0.1:${server.address().port}`;
const config={id:'cfg',name:'合成只读配置',platform:'XHS',mode:'XHS_MCP',keywords:['合成关键词'],excludeWords:[],batchLimit:3,enabled:true,revision:1,activeRunId:null,nextAllowedAt:null,pauseReason:null,runs:[],monitors:[],matches:[]};
const readiness={enabled:true,captureArchiveVersion:1,mode:'XHS_MCP',accounts:[{id:'account',label:'合成待核验账号',reason:'UNVERIFIED',eligible:false}],device:{name:'合成离线设备',online:false},coverage:'WINDOW_ONLY',automaticPolling:false};
const model={configured:false,note:'',updatedAt:null,version:1,model:'synthetic-model',dailyLimit:1,vault:{state:'READY',message:'合成状态，不访问凭据'},priceVersion:'synthetic',models:[{id:'synthetic-model',priceDescription:'输入≤32000 token：合成价格一；输入≤256000 token：合成价格二；输入≤1000000 token：合成价格三'}]};
let browser,page;
async function capture(label,width){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${label}: document overflow`);assert.equal(await page.locator('vite-error-overlay').count(),0);if(!await page.getByRole('dialog').count())await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});await page.screenshot({path:join(out,`${label}-${width}.png`),fullPage:!await page.getByRole('dialog').count()});}
async function choice(locator,label,width){
 const value=await locator.evaluate(e=>{const b=e.getBoundingClientRect(),p=e.closest('label'),r=p.getBoundingClientRect(),s=getComputedStyle(e),labelStyle=getComputedStyle(p);return {width:b.width,height:b.height,left:b.left-r.left,display:labelStyle.display,accent:s.accentColor,forcedColorAdjust:s.forcedColorAdjust};});
 assert.equal(value.width,16,label+JSON.stringify(value));assert.equal(value.height,16);assert(value.left<=2,label+' not next to text');assert.equal(value.display,'flex');assert.equal(value.accent,'rgb(18, 133, 111)');
 await locator.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
 assert(await locator.evaluate(e=>e===document.activeElement&&e.matches(':focus-visible')));
 const focus=await locator.evaluate(e=>{const s=getComputedStyle(e);return {outline:s.outlineStyle,width:s.outlineWidth,shadow:s.boxShadow};});assert.deepEqual(focus,{outline:'solid',width:'2px',shadow:'none'});
 report.choices.push({label,viewport:width,...value,...focus});
}
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
 for(const width of [1440,390,320]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  await context.route('**/*',async route=>{const req=route.request(),u=new URL(req.url()),p=u.pathname.replace(/^\/api/,'');if(u.origin!==base||req.method()!=='GET'){report.unexpected.push(req.method()+' '+u.pathname);return route.abort();}if(!u.pathname.startsWith('/api/'))return route.continue();if(p==='/events')return route.fulfill({contentType:'text/event-stream',body:': synthetic\n\n'});
   const data=p==='/auth/me'?{user:{id:'synthetic',name:'合成管理员',role:'ADMIN'},csrfToken:'synthetic'}:p==='/health'?{contactWorkflow:true}:p==='/collection/configs'?[config]:p==='/collection/configs/cfg'?config:p==='/collection/mcp/readiness'?readiness:p==='/accounts'?{accounts:[],summary:{available:0,attention:0}}:p==='/model-settings'?model:(p.endsWith('/captures')||/^\/collection\/configs\/[^/]+\/posts$/.test(p))?{control:{enabled:false,version:0},model:'unconfigured',hasRules:false,total:0,postTotal:0,legacyWithoutSnapshot:0,hasMore:false,posts:[],items:[]}:p==='/platforms'?{capabilities:[{platform:'XHS',name:'小红书',status:'未接入',read:'本项目未连接',reason:'历史测试账号受限'},{platform:'DOUYIN',name:'抖音',status:'规划中',read:'独立适配器尚未实现',reason:'能力未验证'}],accounts:[{id:'real',label:'合成非模拟账号',isDemo:false,status:'PAUSED',pauseReason:null},{id:'demo',label:'合成模拟账号',isDemo:true,status:'PAUSED',pauseReason:null},{id:'unknown',label:'合成旧版记录',status:'PAUSED',pauseReason:null}]}:[];
   return route.fulfill({json:data});
  });
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.goto(base+'/work?module=archive');await page.getByRole('button',{name:'单帖检查',exact:true}).click();await page.getByRole('dialog').waitFor();
  const expand=page.getByRole('checkbox',{name:'验证评论翻页与回复'}),consent=page.getByRole('checkbox',{name:'确认本次只读检查'});
  await choice(expand,'single-post-expand',width);await choice(consent,'single-post-consent',width);
  await consent.check();assert(await consent.isChecked());await expand.check();assert(!await consent.isChecked());await page.getByText('最多滚动主评论 3 次、尝试展开回复 12 次',{exact:false}).waitFor();await consent.check();assert(await page.getByRole('button',{name:'只读检查这一篇',exact:true}).isDisabled());
  await capture('single-post',width);await page.keyboard.press('Escape');await page.waitForFunction(()=>document.activeElement.textContent==='单帖检查');report.checks.push(`diagnostic label layout, consent reset, disabled submit, Esc restoration ${width}`);
  await page.goto(base+'/work?module=settings');await page.getByRole('button',{name:'编辑',exact:true}).click();const enabled=page.getByRole('checkbox',{name:'保存后启用',exact:false});await choice(enabled,'config-enabled',width);assert(await enabled.isChecked());await enabled.uncheck();assert(!await enabled.isChecked());await enabled.check();assert(await enabled.isChecked());await page.getByText('真实读取受当次限额约束',{exact:false}).waitFor();assert.equal(await page.getByText('当前MCP不支持游标续读',{exact:false}).count(),0);await capture('config',width);await page.getByRole('button',{name:'取消',exact:true}).click();
  await page.getByRole('button',{name:'模型设置 · 仅管理员',exact:true}).click();const panel=page.getByRole('region',{name:'管理员模型设置'});await panel.waitFor();

  for(const label of ['匹配模型','模型 API Key','模型描述']){const f=panel.getByLabel(label,{exact:true}),value=await f.evaluate(e=>{const r=e.getBoundingClientRect(),p=e.closest('label'),b=p.getBoundingClientRect();return {display:getComputedStyle(p).display,fieldWidth:r.width,labelWidth:b.width,below:r.top>b.top+10};});assert.equal(value.display,'grid');assert(Math.abs(value.fieldWidth-value.labelWidth)<=1);assert(value.below);report.fields.push({label,width,...value});}
  assert.equal(await panel.locator('input,select').count(),3);assert.equal(await panel.getByRole('checkbox').count(),0);await capture('model',width);report.checks.push(`three aligned settings fields, no authorization or submissions ${width}`);
  await page.goto(base+'/platforms');await page.locator('.platform-grid').waitFor();const xhs=page.locator('.capability-card').filter({has:page.getByRole('heading',{name:'小红书',exact:true})});assert((await xhs.innerText()).includes('只读功能已实现'));assert(!(await xhs.innerText()).includes('本项目未连接'));assert.equal(await xhs.getByRole('button',{disabled:true}).count(),3);await page.getByText('非模拟账号记录；会话是否有效需另行核验。',{exact:true}).waitFor();await page.getByText('模拟账号；不代表真实平台连接。',{exact:true}).waitFor();await page.getByText('账号来源未标明；请到账号中心核对。',{exact:true}).waitFor();await capture('platforms',width);
  await page.goto(base+'/tasks');await page.getByText('小红书只读采集请前往采集任务',{exact:false}).waitFor();assert.equal(await page.getByText('平台采集、自动评论和私信尚未启用',{exact:false}).count(),0);await capture('tasks',width);report.checks.push(`read-only capability vs account availability; real/demo/unknown records; outbound disabled ${width}`);
  await context.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.unexpected,[]);console.log(`PASS ${report.checks.length} flows, ${report.choices.length} checkbox layouts/focus, ${report.fields.length} field layouts; no external requests or mutations`);
}finally{if(page&&!page.isClosed())await page.screenshot({path:join(out,'failure.png'),fullPage:true});await browser?.close();server.closeAllConnections();await new Promise(ok=>server.close(ok));await writeFile(join(out,'checks.json'),JSON.stringify(report,null,2));console.log('Evidence: '+out);}
