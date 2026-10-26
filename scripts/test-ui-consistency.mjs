// Isolated rendering only. Reject all external requests and all mutations.
import {createServer} from 'node:http';
import {readFile,mkdtemp,writeFile} from 'node:fs/promises';
import {join,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../apps/web/dist/',import.meta.url));
const out=await mkdtemp(join(tmpdir(),'crm-ui-consistency-'));
const report={pages:[],focus:[],states:[],errors:[],unexpected:[]};
const server=createServer(async(req,res)=>{try{const p=new URL(req.url,'http://localhost').pathname,f=p.startsWith('/assets/')?p:'/index.html';res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.html':'text/html'})[extname(f)]||'text/plain');res.end(await readFile(join(root,f)));}catch{res.writeHead(404).end();}});
await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok)});
const base=`http://127.0.0.1:${server.address().port}`;
const config={id:'cfg',name:'合成测试配置',platform:'XHS',mode:'MOCK',keywords:['合成需求'],excludeWords:[],batchLimit:3,enabled:true,revision:1,activeRunId:null,nextAllowedAt:null,pauseReason:null,runs:[],monitors:[],matches:[]};
const lead={id:'lead',summary:'合成需求，验证全站样式',evidence:'合成原文。'.repeat(20),identity:{nickname:'合成测试用户',platform:'XHS',platformUserId:'mock-user',comments:[]},owner:{id:'sales',name:'合成销售'},status:'FOLLOWING',contactStage:'CONTACTED',reviewedAt:null,reviewNote:null,nextFollowUpAt:null,isDemo:true,version:1,followups:[]};
const account={id:'account',platform:'XHS',label:'合成账号',ownerId:null,owner:null,dailyLimit:10,occupied:0,day:'2026-10-26',status:'PAUSED',pauseReason:null,available:false,version:1,loginProvider:'offline',loginStatus:'UNVERIFIED'};
const task={id:'task',title:'合成人工任务 '+ 'very-long-content-'.repeat(8),kind:'FOLLOWUP',status:'PENDING',dueAt:null,lead};
const model={configured:true,note:'合成设置',updatedAt:null,version:1,model:'fixture-model',dailyLimit:1,vault:{state:'READY',message:'合成状态，不访问凭据'},priceVersion:'fixture',models:[{id:'fixture-model',priceDescription:'仅合成展示'}]};
let browser,page;
const ratio=(a,b)=>{const l=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);return (Math.max(l(a),l(b))+.05)/(Math.min(l(a),l(b))+.05);};
async function focusSweep(label){
 const scope=await page.locator('[role=dialog]:visible,[role=alertdialog]:visible').count()?page.locator('[role=dialog]:visible,[role=alertdialog]:visible').last():page;
 const fields=scope.locator('input:visible:not(:disabled),textarea:visible:not(:disabled),select:visible:not(:disabled)');
 for(let i=0;i<await fields.count();i++){
  const field=fields.nth(i);await field.focus();
  const data=await field.evaluate(e=>{const owner=e.closest('.space-search-small,.info-comment-search')||e,s=getComputedStyle(owner),child=getComputedStyle(e);return {tag:e.tagName,type:e.type,label:e.getAttribute('aria-label')||e.id||e.closest('label')?.textContent?.slice(0,35),owner:owner.className,outline:s.outlineStyle,width:s.outlineWidth,offset:s.outlineOffset,color:s.outlineColor,shadow:s.boxShadow,childOutline:child.outlineStyle,border:child.borderColor};});
  assert.equal(data.outline,'solid',label+JSON.stringify(data));assert.equal(data.width,'2px');assert.equal(data.offset,'-1px');assert.equal(data.shadow,'none');assert.equal(data.color,'rgb(13, 115, 95)');
  if(/space-search-small|info-comment-search/.test(data.owner))assert.equal(data.childOutline,'none');
  report.focus.push({page:label,...data});
 }
 const action=scope.locator('button:visible:not(:disabled),a:visible').first();await page.keyboard.press('Tab');await action.focus();
 const active=await page.evaluate(()=>{const e=document.activeElement,s=getComputedStyle(e);return {visible:e.matches(':focus-visible'),outline:s.outlineStyle,width:s.outlineWidth}});assert(active.visible&&active.outline==='solid'&&active.width==='2px',JSON.stringify(active));
}
async function capture(label,width){
 assert.equal(await page.locator('details,summary').count(),0);assert.equal(await page.locator('vite-error-overlay').count(),0);
 await page.waitForFunction(()=>!document.querySelector('.loading-stack'));
 await page.evaluate(()=>document.fonts.ready);
 const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,items:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.right>innerWidth+1&&!e.closest('table,.mist-navigation,[data-slot=table-container]')}).slice(0,5).map(e=>e.className)}));
 assert(overflow.scroll<=overflow.width,`${label} ${width} overflow ${JSON.stringify(overflow)}`);
 await focusSweep(label);await page.evaluate(()=>document.activeElement?.blur());const focused=page.locator('[role=dialog]:visible input:not(:disabled),[role=alertdialog]:visible input:not(:disabled),input:visible:not(:disabled)').first();if(await focused.count()&&!(await page.locator('[role=dialog]:visible,[role=alertdialog]:visible').count()))await focused.focus();await page.screenshot({path:join(out,`${label}-${width}.png`),fullPage:!(await page.locator('[role=dialog]:visible,[role=alertdialog]:visible').count())});report.pages.push({label,width,overflow:false});
}
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
 for(const width of [1440,768,390,320]){
  let mode='data',role='ADMIN';
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});context.setDefaultTimeout(10000);
  await context.route('**/*',async route=>{const r=route.request(),u=new URL(r.url()),p=u.pathname.replace(/^\/api/,'');
   if(u.origin!==base||r.method()!=='GET'){report.unexpected.push(r.method()+' '+u.pathname);return route.abort();}
   if(!u.pathname.startsWith('/api/'))return route.continue();
   if(p==='/auth/me')return route.fulfill(mode==='login'?{status:401,json:{message:'合成未登录'}}:{json:{user:{id:'sales',name:'合成用户',role},csrfToken:'fixture'}});
   if(p==='/events')return route.fulfill({contentType:'text/event-stream',body:': fixture\n\n'});
   if(mode==='error')return route.fulfill({status:500,json:{message:'合成读取失败'}});
   if(mode==='loading')await new Promise(r=>setTimeout(r,1200));
   const empty=mode==='empty';
   const data=p==='/health'?{contactWorkflow:true}:p==='/leads'?empty?[]:[lead]:p==='/leads/lead'?lead:p==='/tasks'?empty?[]:[task]:p==='/users'?[{id:'sales',name:'合成销售',role:'SALES'}]:p==='/collection/configs'?empty?[]:[config]:p==='/collection/configs/cfg'?config:p==='/accounts'?{accounts:empty?[]:[account],summary:{available:0,attention:1}}:p==='/accounts/login-capabilities'?{supported:false,mode:'offline'}:p==='/collection/mcp/readiness'?{enabled:false,accounts:[],captureArchiveVersion:1,automaticPolling:false}:p==='/model-settings'?model:p==='/platforms'?{capabilities:[{platform:'XHS',name:'小红书',status:'合成未连接',read:'合成读取状态',reason:'验证禁用状态与布局'}],accounts:[]}:(p.endsWith('/captures')||/^\/collection\/configs\/[^/]+\/posts$/.test(p))?{control:{enabled:false,version:0},model:'unconfigured',hasRules:false,total:0,postTotal:0,legacyWithoutSnapshot:0,hasMore:false,posts:[],items:[]}:[];
   return route.fulfill({json:data});
  });
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  mode='login';await page.goto(base+'/work');await page.getByLabel('登录邮箱',{exact:true}).waitFor();await capture('login',width);
  const email=page.getByLabel('登录邮箱',{exact:true});await email.evaluate(e=>e.setAttribute('aria-invalid','true'));await email.focus();assert.equal(await email.evaluate(e=>getComputedStyle(e).outlineColor),'rgb(180, 67, 67)');await email.evaluate(e=>e.removeAttribute('aria-invalid'));report.states.push('invalid focus '+width);
  mode='data';
  for(const [label,path,selector] of [
   ['home','/work','.mist-overview'],['runs','/work?module=runs','.task-room'],['archive','/work?module=archive','.collection-info'],['matches','/work?module=matches','.space-results'],['follow','/work?module=follow','.space-results'],['templates','/work?module=templates','.config-form'],['settings','/work?module=settings','.collection-layout'],['accounts','/work?module=accounts','.account-center'],['notices','/work?module=notices','.space-notices'],['leads','/leads','.table-panel'],['tasks','/tasks','.task-panel'],['platforms','/platforms','.platform-grid']]){
   await page.goto(base+path);await page.locator(selector).first().waitFor();await capture(label,width);
   if(label==='settings'){await page.getByRole('button',{name:'模型设置 · 仅管理员',exact:true}).click();await page.getByRole('status').filter({hasText:'Key 已配置'}).waitFor();await capture('model',width);await page.getByRole('button',{name:'删除',exact:true}).click();await page.getByRole('alertdialog').waitFor();assert.equal(await page.evaluate(()=>document.activeElement.id),'cancel-model-key-delete');await page.keyboard.press('Tab');assert(await page.evaluate(()=>!!document.activeElement.closest('[role=alertdialog]')));await capture('model-confirm',width);await page.keyboard.press('Escape');await page.getByRole('alertdialog').waitFor({state:'hidden'});await page.waitForFunction(()=>document.activeElement.textContent==='删除');await page.keyboard.press('Escape');await page.getByRole('dialog',{name:'模型设置 · 仅管理员',exact:true}).waitFor({state:'hidden'});await page.getByRole('button',{name:'编辑',exact:true}).click();await page.locator('.config-form').filter({visible:true}).waitFor();await capture('config-editor',width);}
   if(label==='runs'){await page.getByRole('button',{name:'采集设置',exact:true}).click();await page.getByRole('dialog').waitFor();await capture('config-sheet',width);await page.keyboard.press('Escape');}
   if(label==='accounts'){await page.getByRole('button',{name:'账号设置',exact:true}).click();await page.getByRole('dialog').waitFor();await capture('account-sheet',width);await page.keyboard.press('Escape');}
   if(label==='leads'){await page.getByRole('button',{name:'合成测试用户',exact:true}).click();await page.getByRole('dialog').waitFor();await page.getByText('沟通记录、跟进时间线和人工任务',{exact:true}).click();await capture('lead-sheet',width);await page.keyboard.press('Escape');}
  }
  for(const state of ['empty','error','loading']){
   mode=state;
   for(const [label,path] of [['tasks','/tasks'],['leads','/leads'],['accounts','/work?module=accounts']]){
    await page.goto(base+path);await page.locator('.space-shell').waitFor();
    if(state==='loading'){await page.locator('.loading-stack,[role=status]').filter({visible:true}).first().waitFor();await page.screenshot({path:join(out,`${label}-loading-${width}.png`),fullPage:true});}
    else {await page.getByText(state==='error'?'合成读取失败':label==='tasks'?'当前分类暂无任务':label==='accounts'?'添加你的第一个账号':'暂无匹配线索',{exact:false}).filter({visible:true}).first().waitFor();await capture(`${label}-${state}`,width);}
    report.states.push(`${label} ${state} ${width}`);
   }
  }
  mode='data';await page.goto(base+'/work/lead?module=follow');await page.locator('.space-detail').waitFor();await page.getByRole('button',{name:'记录有意向依据',exact:true}).click();await page.getByText('沟通记录、跟进时间线和人工任务',{exact:true}).click();await capture('contact-followup',width);role='SALES';await page.goto(base+'/work?module=follow');await page.locator('.space-results').waitFor();await capture('sales-follow',width);assert.equal(await page.getByRole('button',{name:'搜索与模型设置',exact:true}).count(),0);
  await context.close();
 }
 report.contrast={focusOnWhite:ratio([13,115,95],[255,255,255]),inputOnWhite:ratio([130,146,142],[255,255,255]),mutedOnMist:ratio([93,109,132],[246,248,251]),primaryWhite:ratio([255,255,255],[18,133,111])};
 assert(report.contrast.focusOnWhite>=3&&report.contrast.inputOnWhite>=3&&report.contrast.mutedOnMist>=4.5&&report.contrast.primaryWhite>=4.5);
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.unexpected,[]);console.log(`PASS ${report.pages.length} page renders; ${report.focus.length} input focus checks; ${report.states.length} state checks`);
}finally{if(page&&!page.isClosed())await page.screenshot({path:join(out,'failure.png'),fullPage:true});await browser?.close();server.closeAllConnections();await new Promise(ok=>server.close(ok));await writeFile(join(out,'checks.json'),JSON.stringify(report,null,2));console.log('Evidence: '+out);}
