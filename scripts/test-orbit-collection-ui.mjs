// Isolated virtual HTTP state only. Never contacts production or any platform/model.
import {createServer} from 'node:http';
import {readFile,mkdtemp,writeFile} from 'node:fs/promises';
import {join,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../apps/web/dist/',import.meta.url)),out=await mkdtemp(join(tmpdir(),'crm-orbit-collection-'));
const server=createServer(async(req,res)=>{try{const p=new URL(req.url,'http://localhost').pathname,f=p.startsWith('/assets/')?p:'/index.html';res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.html':'text/html'})[extname(f)]||'text/plain');res.end(await readFile(join(root,f)));}catch{res.writeHead(404).end();}});
await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok);});const base=`http://127.0.0.1:${server.address().port}`;
const report={checks:[],errors:[],unexpected:[],mutations:[]};let browser,currentPage;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
 for(const narrow of [false,true]){
  let configs=[],real=false;
  const r={id:'fictional-run',status:'PARTIAL',reason:'MCP_WINDOW_ONLY',createdAt:new Date().toISOString(),finishedAt:null,scenario:'BASELINE',capturedPosts:1,capturedCommentsCount:2,requests:2,observed:2,matched:0,added:0,notices:0};
  const snapshot={postId:'fictional-post',commentId:'fictional-comment',userId:'fictional-user',title:'虚构设备咨询',body:'虚构帖子正文',comment:'虚构：设备怎么选择？',parentId:'parent',parent:null,coverage:'PARTIAL',isDemo:true};
  const captures={control:{enabled:false,version:0},model:'unconfigured',hasRules:false,total:1,postTotal:1,legacyWithoutSnapshot:0,hasMore:false,posts:[{id:'post-row',runId:r.id,lastRunId:r.id,platformPostId:snapshot.postId,lastSeenAt:r.createdAt,snapshot:{title:snapshot.title,body:snapshot.body},coverage:'PARTIAL',stopReason:'MCP_WINDOW_ONLY'}],items:[{id:'capture-row',postId:'post-row',runId:r.id,lastRunId:r.id,platformCommentId:snapshot.commentId,lastSeenAt:r.createdAt,snapshot,contextVersion:'fixture-v1',post:{coverage:'PARTIAL',stopReason:'MCP_WINDOW_ONLY'},reviews:[]}]};
  const context=await browser.newContext({viewport:narrow?{width:390,height:844}:{width:1440,height:1000}});
  await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url()),p=url.pathname.replace(/^\/api/,'');if(url.origin!==base){report.unexpected.push(req.url());return route.abort();}if(!url.pathname.startsWith('/api/'))return route.continue();
   if(req.method()!=='GET'){
    report.mutations.push(req.method()+' '+p);const body=req.postDataJSON();
    if(p==='/collection/configs'&&req.method()==='POST'){assert.deepEqual(body.keywords,['虚构用户自定义']);configs=[{...body,id:'fictional-config',revision:1,activeRunId:null,nextAllowedAt:null,pauseReason:null,runs:[]}];return route.fulfill({json:configs[0]});}
    if(p==='/collection/configs/fictional-config/runs'){assert.equal(body.mode,'MOCK');assert.equal(body.readPlan.rounds,1);assert.equal(body.readPlan.postsPerRound,1);configs=[{...configs[0],activeRunId:r.id,runs:[{...r,status:'RUNNING'}]}];return route.fulfill({json:{id:r.id}});}
    if(p===`/collection/runs/${r.id}/pause`){configs=[{...configs[0],activeRunId:null,runs:[{...r,status:'PAUSED'}]}];return route.fulfill({json:{id:r.id}});}
    report.unexpected.push(req.method()+' '+p);return route.abort();
   }
   if(p==='/events')return route.fulfill({contentType:'text/event-stream',body:':fixture\n\n'});
   const data=p==='/auth/me'?{user:{id:'fixture',name:'虚构验收',role:'ADMIN'},csrfToken:'fake-test-csrf'}:p==='/health'?{contactWorkflow:true}:p==='/collection/configs'?configs:p==='/collection/configs/fictional-config'?{...configs[0],monitors:[],matches:[]}:p.endsWith('/captures')?captures:p==='/accounts'?{accounts:[],summary:{available:0,attention:0}}:p==='/collection/mcp/readiness'?{enabled:true,mode:'XHS_MCP',captureArchiveVersion:1,accountBound:true,accounts:[],device:{name:'虚构设备',online:true},automaticPolling:false}:p==='/accounts/login-capabilities'?{supported:false,mode:'offline'}:[];
   return route.fulfill({json:data});
  });
  const page=await context.newPage();currentPage=page;page.on('pageerror',e=>report.errors.push(e.message));await page.goto(base+'/work');
  if(narrow){await page.locator('.orbit-main>small').waitFor();const note=await page.locator('.orbit-main>small').boundingBox(),result=await page.locator('.orbit-archive-satellite').boundingBox();assert(result.y>=note.y+note.height,'mobile results entry must not overlap scope note');}
  await page.getByRole('button',{name:'自动化采集',exact:true}).click();await page.getByRole('heading',{name:'新增关键词配置',exact:true}).waitFor();
  if(narrow){const nav=await page.locator('.orbit-secondary').boundingBox(),back=await page.locator('.space-back').boundingBox();assert(back.y>=nav.y+nav.height,'mobile return action must not overlap navigation');}
  assert.equal(await page.getByLabel('搜索关键词',{exact:true}).inputValue(),'');
  await page.getByLabel('配置名称',{exact:true}).fill('虚构组');await page.getByLabel('搜索关键词',{exact:true}).fill('虚构用户自定义');await page.getByRole('button',{name:'保存配置',exact:true}).click();
  await page.getByRole('button',{name:'确认并开始（内置模拟）',exact:true}).waitFor();assert(await page.getByRole('button',{name:'确认并开始（内置模拟）',exact:true}).isEnabled());
  await page.getByRole('button',{name:'确认并开始（内置模拟）',exact:true}).click();await page.getByRole('button',{name:'暂停本轮并保留已采数据',exact:true}).click();
  await page.getByRole('button',{name:'打开独立采集结果',exact:true}).click();await page.getByRole('heading',{name:'采集结果',exact:true}).waitFor();await page.getByText('虚构：设备怎么选择？',{exact:true}).waitFor();
  assert(await page.getByText('未分析 · 无评分',{exact:false}).count());await page.getByText('查看上下文与原文证据',{exact:true}).click();await page.getByText('父评论：原文未采到，需待确认',{exact:true}).waitFor();
  await page.getByLabel('搜索采集原文',{exact:true}).fill('设备');await page.getByRole('button',{name:'返回工作舱',exact:true}).click();await page.getByRole('button',{name:'采集结果',exact:true}).click();assert.equal(await page.getByLabel('搜索采集原文',{exact:true}).inputValue(),'设备');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:join(out,`results-${narrow}.png`)});report.checks.push('custom keyword save → LLM-off mock run → pause → independent original/parent evidence and retained filter '+narrow);
  configs=[{...configs[0],mode:'XHS_MCP',activeRunId:null}];await page.goto(base+'/work?module=runs');await page.getByRole('heading',{name:'仅需补充可用账号',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:/确认并开始/}).count(),0);report.checks.push('real mode missing eligible account blocks execution without requiring LLM '+narrow);
  await context.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.unexpected,[]);console.log('PASS '+report.checks.length+' isolated collection flows; only virtual mutations');
}finally{if(currentPage&&!currentPage.isClosed()){report.lastURL=currentPage.url();report.lastText=await currentPage.locator('body').innerText();await currentPage.screenshot({path:join(out,'last-state.png')});}await browser?.close();await new Promise(ok=>server.close(ok));await writeFile(join(out,'checks.json'),JSON.stringify(report,null,2));console.log('Evidence: '+out);}
