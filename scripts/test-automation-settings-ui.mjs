import {controlValue,selectOption} from './ui-controls.mjs';
// Explicitly authorized isolated UI regression. Fresh contexts; synthetic GET APIs only.
import {createServer} from 'node:http';
import {readFile,mkdtemp,writeFile} from 'node:fs/promises';
import {join,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright'),root=fileURLToPath(new URL('../apps/web/dist/',import.meta.url)),out=await mkdtemp(join(tmpdir(),'crm-automation-settings-'));
const server=createServer(async(req,res)=>{try{const p=new URL(req.url,'http://localhost').pathname,f=/^\/(assets|space)\//.test(p)?p:'/index.html';res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml'})[extname(f)]||'text/plain');res.end(await readFile(join(root,f)));}catch{res.writeHead(404).end();}});await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base=`http://127.0.0.1:${server.address().port}`,report={checks:[],errors:[],unexpected:[],screenshots:[]};let browser,page;
const labels=['工作台','采集信息','回复记录'];
const config={id:'fixture-config',name:'合成导航配置',platform:'XHS',mode:'XHS_MCP',keywords:['合成搜索词'],excludeWords:[],batchLimit:1,enabled:true,revision:1,activeRunId:null,runs:['new','old'].map((id,i)=>({id,status:i?'PARTIAL':'COMPLETE',reason:i?'COMMENTS_PARTIAL':null,scenario:'READ_WINDOW',requests:1,observed:1,matched:0,added:0,notices:0,capturedPosts:1,capturedCommentsCount:4,snapshot:{name:'合成长任务名称 · '+('超长选项保持原文可读且不会撑开页面 '.repeat(10))},createdAt:`2026-10-${27-i}T00:00:00Z`,finishedAt:`2026-10-${27-i}T00:01:00Z`}))};
const capture={control:{enabled:false,version:0},model:'unconfigured',hasRules:false,total:0,postTotal:0,legacyWithoutSnapshot:0,hasMore:false,posts:[],items:[]};
const overview={autoJobs:[],policies:[{id:'policy',target:'合成目标',version:1,revision:2,autoEnabled:false}],connection:{state:'READY',authorized:false,model:'qwen3.8-flash',priceVersion:'synthetic',priceDescription:'合成模型，无真实连接',dailyLimit:null},usage:{requests:0,canCall:false},modelVersion:1,capturedComments:0};
const settled=async()=>page.evaluate(()=>new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok))));
async function screenshot(name){await page.waitForFunction(()=>document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).every(a=>a.playState==='finished')); await page.screenshot({path:join(out,name),fullPage:false});report.screenshots.push(name);}
try{
 browser=await chromium.launch({headless:true,ignoreDefaultArgs:['--hide-scrollbars'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
 for(const width of [1440,390]){
 const context=await browser.newContext({viewport:{width,height:900},reducedMotion:width===390?'reduce':'no-preference'});context.setDefaultTimeout(12000);
 let cfg={...structuredClone(config),mode:'MOCK'},rv=structuredClone(overview),failReply=true,failReviewRead=false;
 rv.policies[0].target='需要企业产品部署的合成需求';
 let ct={rules:[{id:'r',platform:'XHS',policyId:'policy',policyRevision:2,threshold:80,channel:'COMMENT',content:'已有合成回复',accountIds:[],accountLimits:[],enabled:false,version:1,mode:'REAL',hash:'fixture',pauseReason:null}],accounts:[],policies:[{id:'policy',target:rv.policies[0].target,revision:2}],capability:{available:false,reason:'合成发送隔离'},day:'2026-10-29',timezone:'Asia/Shanghai'};
 const writes=[];
 await context.route('**/*',async route=>{const req=route.request(),u=new URL(req.url()),p=u.pathname.slice(4);if(u.origin!==base){report.unexpected.push(req.url());return route.abort();}if(!u.pathname.startsWith('/api/'))return route.continue();
 if(req.method()!=='GET'){
  writes.push({method:req.method(),path:p,body:req.postDataJSON()});
  if(p==='/comment-review/policies/policy'&&req.method()==='PUT'){rv.policies[0]={...rv.policies[0],target:req.postDataJSON().target,version:2,revision:3,autoEnabled:false};ct.policies[0]={...ct.policies[0],target:req.postDataJSON().target,revision:3};return route.fulfill({json:rv.policies[0]});}
  if(p==='/auto-contact/rules/r'&&req.method()==='PUT'){if(failReply)return route.fulfill({status:409,json:{message:'合成回复保存失败，其他页签已保存内容保留'}});ct.rules[0]={...ct.rules[0],...req.postDataJSON(),version:2,enabled:false};return route.fulfill({json:ct.rules[0]});}
  if(p==='/collection/configs/fixture-config'&&req.method()==='PATCH'){cfg={...cfg,...req.postDataJSON().config,revision:2};return route.fulfill({json:cfg});}
  if(p==='/collection/configs/fixture-config/runs'&&req.method()==='POST')return route.fulfill({json:{id:'synthetic-start'}});
  report.unexpected.push(req.method()+' '+p);return route.abort();
 }
 if(p==='/events')return route.fulfill({contentType:'text/event-stream',body:': isolated\n\n'});
 if(p==='/comment-review'&&failReviewRead)return route.fulfill({status:403,json:{message:'合成权限失败'}});
 const data=p==='/auth/me'?{user:{id:'fixture',name:'合成用户',role:'ADMIN'},csrfToken:'fixture'}:p==='/comment-review'?rv:p==='/auto-contact'?ct:p==='/auto-contact/journey'?{reviews:{EVALUATED:124},reviewJobs:{COMPLETED:1},contacts:{CONFIRMED:2,UNKNOWN:1,FAILED:5},matches:8}:p==='/auto-contact/jobs'?{items:[],total:0}:p==='/collection/configs'?[cfg]:p==='/collection/configs/fixture-config'?{...cfg,monitors:[],matches:[]}:p==='/collection/mcp/readiness'?{enabled:true,mode:'XHS_MCP',captureArchiveVersion:1,accountBound:true,automaticPolling:false,device:{name:'合成设备',online:true},accounts:[]}:p.includes('/results')||p==='/comment-review/history'?{items:[],total:0,hasMore:false}:p==='/comment-review/posts'?{items:[],hasMore:false}:p.endsWith('/captures')||p.endsWith('/posts')?capture:p==='/accounts'?{accounts:[],summary:{available:0,attention:0}}:p==='/accounts/login-capabilities'?{supported:false}:p==='/platforms'?{capabilities:[],accounts:[]}:p==='/health'?{contactWorkflow:true}:[];return route.fulfill({json:data});});
 page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(base+'/work?module=runs&config=fixture-config&run=old&stage=contact&panel=automation-settings&settingsTab=contact');
 const dialog=page.getByRole('dialog',{name:'自动化设置',exact:true});await dialog.waitFor();await dialog.getByLabel('发送内容',{exact:true}).waitFor();assert.equal(await dialog.getByRole('tab',{selected:true}).innerText(),'自动回复\n已关闭');
 const tabs=dialog.getByRole('tablist');assert.equal(await tabs.getByRole('tab').count(),3);
 const reply=dialog.getByLabel('发送内容',{exact:true});await reply.fill('尚未保存的合成回复');
 await tabs.getByRole('tab',{name:/评论匹配/}).click();await dialog.getByRole('button',{name:'开启自动识别',exact:true}).click();await dialog.getByRole('heading',{name:'确认开启自动匹配',exact:true}).waitFor();assert.equal(writes.length,0);assert(await dialog.getByRole('heading',{name:'确认开启自动匹配',exact:true}).evaluate(e=>e===document.activeElement));await dialog.getByRole('button',{name:'返回设置',exact:true}).click();const target=dialog.getByLabel('审核需求');await target.fill('跨页签保留的合成需求文字');failReviewRead=true;await page.evaluate(()=>{window.dispatchEvent(new Event('offline'));window.dispatchEvent(new Event('online'));});await dialog.getByText('合成权限失败',{exact:true}).waitFor();assert.equal(await target.inputValue(),'跨页签保留的合成需求文字');failReviewRead=false;await page.evaluate(()=>{window.dispatchEvent(new Event('offline'));window.dispatchEvent(new Event('online'));});await dialog.getByText('合成权限失败',{exact:true}).waitFor({state:'hidden'});await tabs.getByRole('tab',{name:/采集/}).click();await dialog.getByRole('button',{name:'编辑采集配置',exact:true}).click();await dialog.getByLabel('搜索关键词',{exact:true}).fill('跨页签关键词');
 await tabs.getByRole('tab',{name:/自动回复/}).click();assert.equal(await reply.inputValue(),'尚未保存的合成回复');
 await page.keyboard.press('Escape');const guard=page.getByRole('alertdialog');await guard.waitFor();await guard.getByRole('button',{name:'继续编辑'}).click();await dialog.waitFor();assert.equal(await reply.inputValue(),'尚未保存的合成回复');
 await tabs.getByRole('tab',{name:/评论匹配/}).click();assert.equal(await target.inputValue(),'跨页签保留的合成需求文字');await dialog.getByRole('button',{name:'保存审核需求',exact:true}).click();await dialog.getByText('审核需求已保存。',{exact:true}).waitFor();assert.equal(writes.length,1);assert.equal(writes[0].path,'/comment-review/policies/policy');
 await tabs.getByRole('tab',{name:/自动回复/}).click();await dialog.getByRole('button',{name:'使用当前审核目标版本',exact:true}).click();await dialog.getByRole('button',{name:'保存设置（保持关闭）',exact:true}).click();await dialog.getByText('合成回复保存失败，其他页签已保存内容保留',{exact:true}).waitFor();assert.equal(await reply.inputValue(),'尚未保存的合成回复');assert.equal(await dialog.getByText(/仅自动回复设置已保存/).count(),0);
 await screenshot('partial-save-'+width+'.png');
 await tabs.getByRole('tab',{name:/采集/}).click();assert.equal(await dialog.getByLabel('搜索关键词',{exact:true}).inputValue(),'跨页签关键词');await dialog.getByRole('button',{name:'保存配置',exact:true}).click();await dialog.getByRole('button',{name:'编辑采集配置',exact:true}).waitFor();assert.equal(cfg.keywords[0],'跨页签关键词');
 await tabs.getByRole('tab',{name:/自动回复/}).click();failReply=false;await dialog.getByRole('button',{name:'保存设置（保持关闭）',exact:true}).click();await dialog.getByText(/仅自动回复设置已保存/).waitFor();assert(!ct.rules[0].enabled);await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 await page.reload();await page.getByRole('button',{name:'设置自动回复',exact:true}).click();await dialog.waitFor();assert.equal(await reply.inputValue(),'尚未保存的合成回复');await tabs.getByRole('tab',{name:/评论匹配/}).click();assert.equal(await target.inputValue(),'跨页签保留的合成需求文字');
 // Arrow-key tabs keep focus and do not save or authorize.
 const count=writes.length;await tabs.getByRole('tab',{name:/评论匹配/}).focus();await page.keyboard.press('ArrowRight');await reply.waitFor();assert.equal(writes.length,count);
 // Select nested in centered dialog: only Select closes on first Escape.
 await dialog.getByRole('combobox').filter({hasText:'小红书'}).click();await page.getByRole('option',{name:'抖音',exact:true}).waitFor();await page.keyboard.press('Escape');await dialog.waitFor();assert.equal(await page.getByRole('listbox').count(),0);
 await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});await page.waitForFunction(()=>!document.body.hasAttribute('data-scroll-locked'));
 const dock=page.locator('.simple-dock');
 const before=await dock.boundingBox();
 for(let i=0;i<3;i++){await page.getByRole('button',{name:'设置自动回复',exact:true}).click();await dialog.waitFor();const opened=await dock.boundingBox();assert(Math.abs(opened.x-before.x)<1);await page.mouse.click(5,5);await dialog.waitFor({state:'hidden'});await page.waitForFunction(()=>!document.body.hasAttribute('data-scroll-locked'));}
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert(Math.abs((await dock.boundingBox()).x-before.x)<1);
 // Dirty cancellation really discards unsaved changes, while prior saves survive.
 await page.getByRole('button',{name:'设置自动回复',exact:true}).click();await dialog.waitFor();await reply.fill('取消的修改');await page.keyboard.press('Escape');await guard.getByRole('button',{name:'放弃修改'}).click();await dialog.waitFor({state:'hidden'});await page.getByRole('button',{name:'设置自动回复',exact:true}).click();await dialog.waitFor();assert.equal(await reply.inputValue(),'尚未保存的合成回复');await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 // Disabled stages need no account, model or template to collect in isolated MOCK mode.
 rv.connection.state='UNCONFIGURED';rv.policies[0].autoEnabled=false;ct.rules[0].enabled=false;ct.rules[0].content='';
 await page.goto(base+'/work?module=runs&config=fixture-config&stage=collect&fresh=1');await page.getByRole('button',{name:'开始采集',exact:true}).click();await page.waitForFunction(()=>location.search.includes('run=synthetic-start'));assert(writes.some(w=>w.path.endsWith('/runs')));
 // Turned-on matching with unavailable model blocks start and locates its tab.
 rv.policies[0].autoEnabled=true;const n=writes.length;await page.goto(base+'/work?module=runs&config=fixture-config&stage=collect&fresh=1');await page.getByRole('button',{name:'开始采集',exact:true}).click();await dialog.waitFor();assert((await tabs.getByRole('tab',{selected:true}).innerText()).includes('评论匹配'));await dialog.getByText(/全局模型尚未就绪/).waitFor();assert.equal(writes.length,n);
 await screenshot('missing-model-'+width+'.png');await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 failReviewRead=true;await page.goto(base+'/work?module=runs&config=fixture-config&stage=collect&fresh=1');await page.getByRole('button',{name:'开始采集',exact:true}).click();await dialog.waitFor();await dialog.getByText('合成权限失败',{exact:true}).waitFor();assert.equal(writes.length,n);
 assert(writes.every(w=>!w.path.includes('automatic')&&!w.path.includes('enabled')));report.checks.push(width+': 3 real editable tabs; retained drafts; partial save; disabled-stage validation; missing model/read error; close/discard; reload; nested Select; repeat overlay close; no automatic enable');await context.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.unexpected,[]);console.log('PASS unified automation settings isolated writes and desktop/390px');
}finally{if(page&&!page.isClosed()){await page.screenshot({path:join(out,'last-state.png'),fullPage:false});report.lastState={url:page.url(),text:(await page.locator('body').innerText()).slice(0,5000)};}await browser?.close();server.closeAllConnections();await new Promise(ok=>server.close(ok));await writeFile(join(out,'checks.json'),JSON.stringify(report,null,2));console.log('Evidence: '+out);}
