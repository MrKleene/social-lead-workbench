// All data and writes are fictional route fixtures. No production/API/model connections.
import {createServer} from 'node:http';
import {readFile,mkdtemp,writeFile} from 'node:fs/promises';
import {join,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../apps/web/dist/',import.meta.url)),out=await mkdtemp(join(tmpdir(),'crm-task-ui-'));
const server=createServer(async(req,res)=>{try{const p=new URL(req.url,'http://localhost').pathname,f=p.startsWith('/assets/')?p:'/index.html';res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.html':'text/html'})[extname(f)]||'text/plain');res.end(await readFile(join(root,f)));}catch{res.writeHead(404).end();}});
await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok)});const base=`http://127.0.0.1:${server.address().port}`;
const settled=page=>page.waitForFunction(()=>[...document.querySelectorAll('.space-expanded-workspace,.space-panel,[data-slot=sheet-content],.task-message')].every(el=>el.getAnimations().every(a=>a.playState!=='running')));
const report={checks:[],errors:[],unexpected:[],mutations:[]};let browser,page;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
 for(const narrow of [false,true]){
  let run=null,postCount=0,captureReads=0;
  const cfg={id:'fixture-config',name:'虚构研究任务',platform:'XHS',mode:'XHS_MCP',keywords:['虚构关键词'],excludeWords:[],batchLimit:3,enabled:true,revision:1,nextAllowedAt:null,pauseReason:null};
  const configuration=()=>({...cfg,activeRunId:run&&['QUEUED','RUNNING'].includes(run.status)?run.id:null,runs:run?[run]:[]});
  const makeRun=status=>({id:'fixture-run',status,reason:null,scenario:'READ_WINDOW',requests:0,observed:0,matched:0,added:0,notices:0,createdAt:new Date().toISOString(),finishedAt:null,capturedPosts:0,capturedCommentsCount:0});
  const captures=()=>({control:{enabled:false,version:0},model:'unconfigured',hasRules:false,total:0,postTotal:postCount,legacyWithoutSnapshot:0,hasMore:false,items:[],posts:Array.from({length:postCount},(_,i)=>({id:`fixture-post-${i}`,platformPostId:`p-${i}`,runId:'fixture-run',lastRunId:'fixture-run',lastSeenAt:new Date().toISOString(),snapshot:{title:`虚构已归档帖子 ${i+1}`},coverage:'PARTIAL',stopReason:'MCP_WINDOW_ONLY'}))});
  const context=await browser.newContext({viewport:narrow?{width:390,height:844}:{width:1440,height:1000}});
  await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url()),p=url.pathname.replace(/^\/api/,'');if(url.origin!==base){report.unexpected.push(req.url());return route.abort();}if(!url.pathname.startsWith('/api/'))return route.continue();
   if(req.method()!=='GET'){
    report.mutations.push(p);
    if(p==='/collection/configs/fixture-config/runs'){const body=req.postDataJSON();assert.equal(body.accountId,'fixture-account');assert.equal(body.consent,'account-read-window-v1');assert.equal(body.readPlan.postsPerRound,2);run=makeRun('QUEUED');return route.fulfill({json:{id:run.id}});}
    if(p==='/collection/runs/fixture-run/pause'){run={...run,status:'PAUSED',reason:'MANUAL_PAUSE'};return route.fulfill({json:{id:run.id}});}
    report.unexpected.push(req.method()+' '+p);return route.abort();
   }
   if(p==='/events')return route.fulfill({contentType:'text/event-stream',body:': fixture\n\n'});
   if(p.endsWith('/captures')){captureReads++;return route.fulfill({json:captures()});}
   const data=p==='/auth/me'?{user:{id:'fake',name:'虚构测试',role:'ADMIN'},csrfToken:'fixture-csrf'}:p==='/health'?{contactWorkflow:true}:p==='/collection/configs'?[configuration()]:p==='/collection/configs/fixture-config'?{...configuration(),monitors:[],matches:[]}:p==='/accounts'?{accounts:[],summary:{available:0,attention:0}}:p==='/accounts/login-capabilities'?{supported:false,mode:'offline'}:p==='/collection/mcp/readiness'?{enabled:true,mode:'XHS_MCP',captureArchiveVersion:1,accountBound:true,automaticPolling:false,device:{name:'虚构设备',online:true},accounts:[{id:'fixture-account',label:'虚构账号',platformUserId:'fictional',eligible:true}]}:[];
   return route.fulfill({json:data});
  });
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(base+'/work?module=runs');await page.getByRole('button',{name:'开始采集',exact:true}).waitFor();
  assert.equal(await page.locator('.task-room select').count(),0);assert.equal(await page.getByText('本次执行账号',{exact:true}).count(),0);await settled(page);await page.screenshot({path:join(out,`idle-${narrow}.png`)});
  await page.getByRole('button',{name:'采集设置',exact:true}).click();await page.getByRole('dialog',{name:'采集设置',exact:true}).waitFor();await page.getByLabel('本轮最多帖子数',{exact:true}).selectOption('2');
  await page.keyboard.press('Escape');await page.getByRole('dialog',{name:'采集设置',exact:true}).waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>document.activeElement.textContent),'采集设置');
  await page.getByRole('button',{name:'采集设置',exact:true}).click();assert.equal(await page.getByLabel('本轮最多帖子数',{exact:true}).inputValue(),'2');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await settled(page);await page.screenshot({path:join(out,`settings-${narrow}.png`)});await page.getByRole('button',{name:'完成设置',exact:true}).click();
  const before=report.mutations.length;await page.getByRole('button',{name:'开始采集',exact:true}).click();assert.equal(report.mutations.length,before);await page.getByRole('dialog',{name:'确认本次采集',exact:true}).waitFor();assert(await page.getByRole('button',{name:'确认并开始',exact:true}).isDisabled());await page.keyboard.press('Escape');await page.getByRole('dialog',{name:'确认本次采集',exact:true}).waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>document.activeElement.textContent),'开始采集');
  await page.getByRole('button',{name:'开始采集',exact:true}).press('Enter');await page.getByRole('checkbox',{name:'仅授权使用所选账号的本机会话执行这一轮只读采集',exact:true}).check();await page.getByRole('button',{name:'确认并开始',exact:true}).click();await page.getByText('任务已排队',{exact:true}).waitFor();report.checks.push('minimal idle, persisted drawer choice, keyboard/focus, one real-mode confirmation; fake HTTP only '+narrow);
  run={...run,status:'RUNNING',capturedPosts:18,capturedCommentsCount:26};postCount=18;await page.getByRole('log').getByText('虚构已归档帖子 18',{exact:true}).waitFor();const previousReads=captureReads;await page.waitForResponse(r=>r.url().includes('/captures')&&captureReads>previousReads);const ids=await page.locator('[data-event-id]').evaluateAll(els=>els.map(e=>e.dataset.eventId));assert.equal(ids.length,new Set(ids).size);assert.equal(ids.length,20);
  const stream=page.getByRole('log',{name:'采集进度消息'});await stream.evaluate(el=>{el.scrollTop=0;el.dispatchEvent(new Event('scroll'));});postCount=19;run={...run,capturedPosts:19,capturedCommentsCount:30};await page.getByRole('log').getByText('虚构已归档帖子 19',{exact:true}).waitFor();assert.equal(await stream.evaluate(el=>el.scrollTop),0);await page.getByRole('button',{name:'回到最新进度',exact:true}).click();await page.waitForFunction(()=>{const e=document.querySelector('.task-message-stream');return e.scrollHeight-e.scrollTop-e.clientHeight<65});
  await page.getByRole('button',{name:'停止采集',exact:true}).click();await page.getByText('已手动暂停',{exact:true}).first().waitFor();await page.getByRole('button',{name:'查看采集信息',exact:true}).waitFor();report.checks.push('poll dedup, in-place counts, no forced scroll, follow latest, explicit stop '+narrow);
  for(const status of ['PARTIAL','FAILED','COMPLETE']){run={...run,status,reason:status==='PARTIAL'?'MCP_WINDOW_ONLY':status==='FAILED'?'TIMEOUT':null};await page.reload();await page.getByRole('button',{name:'查看采集信息',exact:true}).waitFor();const message=page.locator('[data-event-id="fixture-run:status"]');assert.equal(await message.getAttribute('data-warning'),String(status!=='COMPLETE'));if(status==='COMPLETE')assert((await message.innerText()).includes('不代表全部评论'));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(status==='PARTIAL'){await settled(page);await page.screenshot({path:join(out,`partial-${narrow}.png`)});assert(await page.locator('.task-outcome').isVisible());}}
  await page.getByRole('button',{name:'查看采集信息',exact:true}).click();await page.getByRole('heading',{name:'采集信息',exact:true}).waitFor();await page.getByRole('button',{name:'采集任务',exact:true}).click();await page.getByRole('button',{name:'采集设置',exact:true}).click();await page.keyboard.press('Tab');assert(await page.evaluate(()=>!!document.activeElement.closest('[role=dialog]')));await page.keyboard.press('Escape');
  await page.emulateMedia({reducedMotion:'reduce'});await page.reload();assert.equal(await page.locator('.task-message').first().evaluate(el=>getComputedStyle(el).animationName),'none');report.checks.push('partial/failure/finite completion, results return, drawer focus trap, reduced motion '+narrow);
  await context.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.unexpected,[]);console.log('PASS '+report.checks.length+' task UI groups; all business requests virtual');
}finally{if(page&&!page.isClosed()){await settled(page);await page.screenshot({path:join(out,'failure.png')});report.lastText=await page.locator('body').innerText();}await browser?.close();await new Promise(ok=>server.close(ok));await writeFile(join(out,'checks.json'),JSON.stringify(report,null,2));console.log('Evidence: '+out)}
