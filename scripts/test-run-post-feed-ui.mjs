// GET-only local fixtures. Every remote image/API request intercepted; no real session or task.
import {createServer} from 'node:http';
import {readFile,mkdtemp,writeFile} from 'node:fs/promises';
import {join,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../apps/web/dist/',import.meta.url)),out=await mkdtemp(join(tmpdir(),'crm-run-post-ui-'));
const server=createServer(async(req,res)=>{try{const p=new URL(req.url,'http://localhost').pathname,f=p.startsWith('/assets/')?p:'/index.html';res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.html':'text/html'})[extname(f)]||'text/plain');res.end(await readFile(join(root,f)));}catch{res.writeHead(404).end();}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base=`http://127.0.0.1:${server.address().port}`;
const report={checks:[],errors:[],unexpected:[]};let browser,page;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
 for(const narrow of [false,true]){
  let total=0,count=2,failure=0,mismatch=false,reads=0,status='RUNNING';
  const run=()=>({id:'run',status,createdAt:new Date().toISOString(),reason:status==='FAILED'?'INVALID_DATA':null,capturedPosts:total,capturedCommentsCount:total*count,observed:0,requests:1,matched:0,added:0,notices:0});
  const old={...run(),id:'old',status:'COMPLETE',createdAt:'2026-10-20T00:00:00Z'};
  const config=()=>({id:'cfg',name:'虚构配置',platform:'XHS',mode:'XHS_MCP',keywords:['虚构'],excludeWords:[],batchLimit:10,enabled:true,revision:1,activeRunId:status==='RUNNING'?'run':null,runs:[run(),old]});
  const item=i=>({id:'row'+i,platformPostId:'post'+i,title:i===2?'':i===3?'未提供标题':'虚构帖子 '+i+' · 中文与 👩🏽‍🎓',body:i===0?'已存正文。'.repeat(100):i===2?'':i===3?undefined:'已保存正文 '+i,coverUrl:i===0?'https://sns-webpic-qc.xhscdn.com/broken':undefined,publishedAt:i===0?'2026-10-22T00:00:00.000Z':undefined,savedAt:'2026-10-22T16:44:22.000Z',savedCount:count,rootCount:1,replyCount:count-1,newCount:1,reusedCount:count-1,coverage:'PARTIAL',stopReason:status==='FAILED'?'INVALID_DATA':'WINDOW_IN_PROGRESS'});
  const context=await browser.newContext({viewport:narrow?{width:390,height:844}:{width:1440,height:1000}});
  await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url()),p=url.pathname.replace(/^\/api/,'');
   if(url.hostname==='sns-webpic-qc.xhscdn.com'){assert(!req.headers().cookie&&!req.headers().referer);return route.fulfill({contentType:'text/plain',body:'broken',headers:{'access-control-allow-origin':'*'}});}
   if(url.origin!==base||req.method()!=='GET'){report.unexpected.push(req.method()+' '+url.origin+p);return route.abort();}if(!url.pathname.startsWith('/api/'))return route.continue();
   if(p.endsWith('/posts')){reads++;if(failure)return route.fulfill({status:failure,json:{message:'Fixture unavailable'}});const historical=p.includes('/old/');return route.fulfill({json:{version:1,configId:'cfg',runId:mismatch?'foreign':historical?'old':'run',availability:historical?'SUPERSEDED':'AVAILABLE',status,limited:false,items:historical?[]:Array.from({length:total},(_,i)=>item(i))}});}
   if(p.endsWith('/captures'))return route.fulfill({json:{control:{enabled:false,version:0},model:'unconfigured',hasRules:false,total:0,postTotal:0,legacyWithoutSnapshot:0,hasMore:false,items:[],posts:[]}});
   if(p==='/events')return route.fulfill({contentType:'text/event-stream',body:':fixture\n\n'});
   const data=p==='/auth/me'?{user:{id:'fake',name:'演示',role:'ADMIN'},csrfToken:'fixture'}:p==='/health'?{}:p==='/collection/configs'?[config()]:p==='/collection/configs/cfg'?{...config(),monitors:[],matches:[]}:p==='/collection/mcp/readiness'?{enabled:true,mode:'XHS_MCP',device:{name:'虚构设备',online:true},accounts:[{id:'fake',label:'虚构账号',eligible:true}]}:p==='/accounts'?{accounts:[],summary:{available:0,attention:0}}:[];
   return route.fulfill({json:data});
  });
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/404|500|WebGL/.test(m.text()))report.errors.push(m.text());});
  await page.goto(base+'/work?module=runs');await page.getByText('等待首篇帖子返回；不会预猜正在读取的内容。',{exact:true}).waitFor();
  total=1;await page.locator('[data-run-post=post0]').waitFor();assert.equal(await page.locator('[data-run-post]').count(),1);await page.locator('[data-run-post=post0]').getByText('发布 2026/10/22 08:00',{exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('.run-post-cover'));
  await page.getByRole('button',{name:'展开正文',exact:true}).click();assert((await page.locator('.run-post-content .info-saved-text').innerText()).length>400);
  count=5;await page.locator('[data-run-post=post0]').getByText('4 条回复',{exact:false}).waitFor();assert.equal(await page.locator('[data-run-post]').count(),1);assert(await page.getByRole('button',{name:'收起正文',exact:true}).isVisible());
  await page.locator('.run-post-title').click();await page.getByRole('dialog').waitFor();assert((await page.locator('.run-post-full').innerText()).length>400);await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});assert(await page.evaluate(()=>document.activeElement.classList.contains('run-post-title')));await page.getByRole('button',{name:'收起正文',exact:true}).click();
  total=8;await page.locator('[data-run-post=post7]').waitFor();const list=page.getByRole('region',{name:'逐篇帖子列表',exact:true});await list.evaluate(el=>{el.scrollTop=0;el.dispatchEvent(new Event('scroll',{bubbles:true}));});await page.waitForTimeout(250);total=9;await page.getByRole('button',{name:'有新帖子 · 查看',exact:true}).waitFor();assert((await list.evaluate(el=>el.scrollTop))<3);await page.getByRole('button',{name:'有新帖子 · 查看',exact:true}).click();assert((await list.evaluate(el=>el.scrollTop))>0);
  await list.evaluate(el=>{el.scrollTop=0;el.dispatchEvent(new Event('scroll',{bubbles:true}));});await page.screenshot({path:join(out,`feed-${narrow}.png`)});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const order=await page.locator('[data-run-post]').evaluateAll(nodes=>nodes.map(n=>n.dataset.runPost));await page.reload();await page.locator('[data-run-post=post8]').waitFor();assert.deepEqual(await page.locator('[data-run-post]').evaluateAll(nodes=>nodes.map(n=>n.dataset.runPost)),order);
  await page.locator('[data-run-post=post2]').getByRole('button',{name:'无标题',exact:true}).click();await page.getByRole('dialog',{name:'无标题',exact:true}).waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});await page.locator('[data-run-post=post3]').getByRole('button',{name:'无标题',exact:true}).waitFor();
  report.checks.push('incremental arrival/update, body/detail/focus, broken cover, published/collected distinction, scroll opt-in, refresh order '+narrow);
  await page.getByRole('button',{name:'运行历史',exact:true}).click();await page.locator('[data-history-run=old]').click();await page.getByRole('dialog').getByText('旧任务未保留完整的逐篇快照，请从采集信息查看现存原文。',{exact:true}).waitFor();assert.equal(await page.getByRole('dialog').locator('[data-run-post]').count(),0);await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await page.locator('.task-current-result [data-run-post]').count(),9);
  failure=500;await page.getByRole('button',{name:'刷新帖子',exact:true}).click();await page.getByRole('alert').getByText('帖子明细读取失败',{exact:false}).waitFor();assert.equal(await page.locator('[data-run-post]').count(),9);failure=0;mismatch=true;await page.getByRole('button',{name:'重试',exact:true}).click();await page.waitForTimeout(300);assert.equal(await page.locator('[data-run-post=foreign]').count(),0);mismatch=false;await page.getByRole('button',{name:'刷新帖子',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.run-post-feed [role=alert]'));
  status='FAILED';await page.locator('.task-current-result').getByText('尚未完成',{exact:false}).waitFor();assert.equal(await page.locator('[data-run-post]').count(),9);
  await page.reload();await page.getByRole('heading',{name:'尚未开始',exact:true}).waitFor();await page.getByRole('button',{name:'运行历史',exact:true}).click();await page.locator('[data-history-run=run]').click();await page.getByRole('dialog').locator('[data-run-post=post8]').waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  failure=404;status='RUNNING';await page.reload();await page.getByText('逐篇明细需后台升级；本轮总进度仍可查看。',{exact:true}).waitFor();const before=reads;await page.waitForTimeout(2300);assert.equal(reads,before);assert.equal(await page.locator('[data-run-post]').count(),0);
  failure=0;await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await page.locator('[data-run-post=post0]').waitFor();assert.equal(await page.locator('[data-run-post=post0]').evaluate(el=>getComputedStyle(el).animationName),'none');report.checks.push('history isolation, failure keeps saved posts, stale/error notice, wrong-task guard, old backend fallback, reduced motion '+narrow);
  await context.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.unexpected,[]);console.log('PASS '+report.checks.length+' run-post UI groups; all requests GET-only fixtures');
}finally{if(page&&!page.isClosed()){report.lastText=await page.locator('body').innerText();await page.screenshot({path:join(out,'last.png')});}await browser?.close();await new Promise(ok=>server.close(ok));await writeFile(join(out,'checks.json'),JSON.stringify(report,null,2));console.log('Evidence: '+out);}
