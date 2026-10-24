// Synthetic GET/POST fixtures only. Every external request is blocked.
import{createServer}from'node:http';import{readFile,mkdtemp,writeFile}from'node:fs/promises';import{join,extname}from'node:path';import{tmpdir}from'node:os';import{fileURLToPath}from'node:url';import assert from'node:assert/strict';
const{chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright'),root=fileURLToPath(new URL('../apps/web/dist/',import.meta.url)),out=await mkdtemp(join(tmpdir(),'crm-saved-read-ui-'));
const server=createServer(async(req,res)=>{try{const p=new URL(req.url,'http://local').pathname,f=p.startsWith('/assets/')?p:'/index.html';res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.html':'text/html'})[extname(f)]||'text/plain');res.end(await readFile(join(root,f)));}catch{res.writeHead(404).end();}});await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base=`http://127.0.0.1:${server.address().port}`;
const report={checks:[],errors:[],unexpected:[],submitted:0};let browser,page;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
 for(const narrow of[false,true]){
  let active=false,eligible=true,source=true,failed=false,hold,release;
  const postId='0123456789abcdef01234567';
  const config=()=>({id:'cfg',name:'合成配置',platform:'XHS',mode:'XHS_MCP',keywords:['合成'],excludeWords:[],batchLimit:3,enabled:true,revision:1,activeRunId:active?'accepted':null,runs:active?[{id:'accepted',status:'RUNNING',reason:null,createdAt:'2026-10-25T00:00:00Z',readPlan:{rounds:1,postsPerRound:1,commentPages:1,savedPostId:'saved-row'}}]:[]});
  const context=await browser.newContext({viewport:narrow?{width:390,height:844}:{width:1440,height:900}});context.setDefaultTimeout(12000);
  await context.route('**/*',async route=>{const req=route.request(),u=new URL(req.url()),p=u.pathname.replace(/^\/api/,'');if(u.origin!==base){report.unexpected.push(u.origin+p);return route.abort();}if(!u.pathname.startsWith('/api/'))return route.continue();
   if(req.method()!=='GET'){
    if(p!=='/collection/configs/cfg/runs'){report.unexpected.push(req.method()+' '+p);return route.abort();}
    report.submitted++;const body=req.postDataJSON();assert.deepEqual(body.readPlan,{rounds:1,postsPerRound:1,commentPages:1,savedPostId:'saved-row'});assert.equal(body.mode,'XHS_MCP');assert.equal(body.accountId,'fixture-account');assert.equal(body.consent,'account-read-window-v1');assert(!JSON.stringify(body).includes('http'));if(hold)await hold;
    if(failed)return route.fulfill({status:503,json:{message:'合成响应失败'}});active=true;return route.fulfill({json:{id:'accepted'}});
   }
   if(p==='/events')return route.fulfill({contentType:'text/event-stream',body:':fixture\n\n'});
   if(p.endsWith('/captures'))return route.fulfill({json:{control:{enabled:false,version:0},model:'unconfigured',hasRules:false,total:0,postTotal:1,legacyWithoutSnapshot:0,hasMore:false,items:[],posts:[{id:'saved-row',platformPostId:postId,runId:'old',lastRunId:'old',lastSeenAt:'2026-10-24T00:00:00Z',sourceAvailable:source,savedComments:0,snapshot:{title:'合成指定帖子',body:'离线测试。只读取这一篇，旧记录保留。'},coverage:'PARTIAL',stopReason:'MCP_WINDOW_ONLY'}]}});
   const data=p==='/auth/me'?{user:{id:'fake',name:'合成',role:'ADMIN'},csrfToken:'fixture'}:p==='/health'?{}:p==='/accounts'?{accounts:[],summary:{available:0,attention:0}}:p==='/collection/configs'?[config()]:p==='/collection/configs/cfg'?{...config(),monitors:[],matches:[]}:p==='/collection/mcp/readiness'?{enabled:true,mode:'XHS_MCP',device:{name:'合成设备',online:true},accounts:[{id:'fixture-account',label:'合成账号',eligible,reason:eligible?'VERIFIED':'UNVERIFIED'}]}:[];return route.fulfill({json:data});
  });
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  const open=async()=>{await page.getByRole('button',{name:'重新读取此帖',exact:true}).click();await page.getByRole('dialog',{name:'仅重新读取这一帖',exact:true}).waitFor();};
  const url=base+'/work?module=archive&post='+postId;
  await page.goto(url);await open();await page.getByRole('checkbox',{name:'授权重新读取此帖',exact:true}).check();
  assert((await page.getByRole('dialog').innerText()).includes('不执行搜索'));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:join(out,`confirm-${narrow}.png`)});
  hold=new Promise(ok=>release=ok);const before=report.submitted;await page.getByRole('button',{name:'确认读取此帖',exact:true}).click();await page.getByRole('button',{name:'正在提交…',exact:true}).waitFor();await page.keyboard.press('Escape');assert(await page.getByRole('dialog').isVisible());assert(await page.getByRole('button',{name:'正在提交…',exact:true}).isDisabled());release();hold=undefined;await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(report.submitted,before+1);await page.getByText('本帖读取已提交',{exact:false}).waitFor();assert.equal(await page.getByRole('link',{name:'查看采集进度',exact:true}).getAttribute('href'),'/work?module=runs');
  await open();await page.getByRole('dialog').getByText('已有任务正在运行',{exact:false}).waitFor();assert(await page.getByRole('button',{name:'确认读取此帖',exact:true}).isDisabled());await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  active=false;eligible=false;await page.reload();await open();await page.getByText('账号尚未核验',{exact:false}).waitFor();assert(await page.getByRole('button',{name:'确认读取此帖',exact:true}).isDisabled());await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  eligible=true;failed=true;await page.reload();await open();await page.getByRole('checkbox',{name:'授权重新读取此帖',exact:true}).check();await page.getByRole('button',{name:'确认读取此帖',exact:true}).click();await page.getByText('未确认是否已创建任务',{exact:false}).waitFor();assert(await page.getByRole('button',{name:'确认读取此帖',exact:true}).isDisabled());await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});await open();assert(await page.getByRole('button',{name:'确认读取此帖',exact:true}).isDisabled());await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  source=false;await page.reload();assert(await page.getByRole('button',{name:'重新读取此帖',exact:true}).isDisabled());report.checks.push('single scoped request, explicit consent, pending lock, active task / unverified account / missing source block, uncertain response retained, layout '+narrow);
  await context.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.unexpected,[]);console.log('PASS '+report.checks.length+' saved-post UI groups; all business requests synthetic');
}finally{if(page&&!page.isClosed())await page.screenshot({path:join(out,'last.png')});await browser?.close();await new Promise(ok=>server.close(ok));await writeFile(join(out,'checks.json'),JSON.stringify(report,null,2));console.log('Evidence: '+out);}
