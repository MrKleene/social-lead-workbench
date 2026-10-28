import {controlValue,selectOption} from './ui-controls.mjs';
// Explicitly authorized isolated UI regression. Fresh contexts; synthetic GET APIs only.
import {createServer} from 'node:http';
import {readFile,mkdtemp,writeFile} from 'node:fs/promises';
import {join,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright'),root=fileURLToPath(new URL('../apps/web/dist/',import.meta.url)),out=await mkdtemp(join(tmpdir(),'crm-shadcn-controls-'));
const server=createServer(async(req,res)=>{try{const p=new URL(req.url,'http://localhost').pathname,f=/^\/(assets|space)\//.test(p)?p:'/index.html';res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml'})[extname(f)]||'text/plain');res.end(await readFile(join(root,f)));}catch{res.writeHead(404).end();}});await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base=`http://127.0.0.1:${server.address().port}`,report={checks:[],errors:[],unexpected:[],screenshots:[]};let browser,page;
const labels=['工作台','采集信息','回复记录'];
const config={id:'fixture-config',name:'合成导航配置',platform:'XHS',mode:'XHS_MCP',keywords:['合成搜索词'],excludeWords:[],batchLimit:1,enabled:true,revision:1,activeRunId:null,runs:['new','old'].map((id,i)=>({id,status:i?'PARTIAL':'COMPLETE',reason:i?'COMMENTS_PARTIAL':null,scenario:'READ_WINDOW',requests:1,observed:1,matched:0,added:0,notices:0,capturedPosts:1,capturedCommentsCount:4,snapshot:{name:'合成长任务名称 · '+('超长选项保持原文可读且不会撑开页面 '.repeat(10))},createdAt:`2026-10-${27-i}T00:00:00Z`,finishedAt:`2026-10-${27-i}T00:01:00Z`}))};
const capture={control:{enabled:false,version:0},model:'unconfigured',hasRules:false,total:0,postTotal:0,legacyWithoutSnapshot:0,hasMore:false,posts:[],items:[]};
const overview={autoJobs:[],policies:[{id:'policy',target:'合成目标',version:1,revision:2,autoEnabled:false}],connection:{state:'READY',authorized:false,model:'qwen3.8-flash',priceVersion:'synthetic',priceDescription:'合成模型，无真实连接',dailyLimit:null},usage:{requests:0,canCall:false},modelVersion:1,capturedComments:0};
const settled=async()=>page.evaluate(()=>new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok))));
async function screenshot(name){await page.waitForFunction(()=>document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).every(a=>a.playState==='finished')); await page.screenshot({path:join(out,name),fullPage:false});report.screenshots.push(name);}
try{
 browser=await chromium.launch({headless:true,ignoreDefaultArgs:['--hide-scrollbars'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
 for(const reducedMotion of ['no-preference','reduce'])for(const width of [1440,390]){
 const context=await browser.newContext({viewport:{width,height:900},reducedMotion});let role='ADMIN',reviewError=false,readError=false;const scoped=[];context.setDefaultTimeout(12000);
 await context.route('**/*',async route=>{const req=route.request(),u=new URL(req.url()),p=u.pathname.slice(4);if(u.origin!==base||req.method()!=='GET'){report.unexpected.push(req.method()+' '+u.pathname);return route.abort();}if(!u.pathname.startsWith('/api/'))return route.continue();
 if(readError&&['/leads','/tasks','/notices','/collection/configs'].includes(p))return route.fulfill({status:503,json:{message:'合成读取失败'}});
 if(p==='/events')return route.fulfill({contentType:'text/event-stream',body:': synthetic\n\n'});
 if(p==='/comment-review'&&reviewError)return route.fulfill({status:403,json:{message:'无权读取合成审核'}});
 if(p.includes('/results')||p==='/auto-contact/jobs')scoped.push({path:p,run:u.searchParams.get('runId')});
 const data=p==='/auth/me'?{user:{id:'fixture',name:'合成导航用户',role},csrfToken:'fixture-only'}:p==='/comment-review'?overview:p.includes('/results')||p==='/comment-review/history'?{items:[],total:0,hasMore:false}:p==='/comment-review/posts'?{items:[],hasMore:false}:p==='/collection/configs'?[config]:p==='/collection/configs/fixture-config'?{...config,monitors:[],matches:[]}:p==='/collection/mcp/readiness'?{enabled:true,mode:'XHS_MCP',captureArchiveVersion:1,accountBound:true,automaticPolling:false,device:{name:'合成设备',online:true},accounts:[{id:'fixture-account',label:'合成账号',eligible:false}]}:p.endsWith('/captures')||p.endsWith('/posts')?capture:p==='/auto-contact'?{rules:[],accounts:[],recentAttempts:[],policies:[],capability:{available:false,reason:'合成隔离环境'},timezone:'Asia/Shanghai',day:'2026-10-27'}:p==='/auto-contact/jobs'?{items:[],total:0}:p==='/auto-contact/attempts'?{items:[],total:0,allTotal:0,confirmedTotal:0,offset:0,limit:20,mode:'REAL'}:p==='/accounts'?{accounts:[],summary:{available:0,attention:0}}:p==='/accounts/login-capabilities'?{supported:false,mode:'offline'}:p==='/platforms'?{capabilities:[],accounts:[]}:p==='/health'?{contactWorkflow:true}:[];return route.fulfill({json:data});});
 page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 const nav=page.getByRole('navigation',{name:width<760?'业务快捷入口':'常用导航'});
 const check=async()=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+width+' '+page.url());

 await page.goto(base+'/work');await page.getByRole('button',{name:'自动化采集',exact:true}).waitFor();
 const rects=()=>page.evaluate(()=>Object.fromEntries(['.simple-dock','#workspace-main','.app-topbar'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return[s,{x:r.x,width:r.width}]})));
 const stable=async(before,note)=>{const after=await rects();if(Object.keys(before).some(k=>Math.abs(before[k].x-after[k].x)>.6))console.log(note,before,after,await page.evaluate(()=>({cw:document.documentElement.clientWidth,iw:innerWidth,margin:getComputedStyle(document.body).marginRight,bodyWidth:document.body.clientWidth,gap:getComputedStyle(document.body).getPropertyValue('--removed-body-scroll-bar-size'),lock:document.body.getAttribute('data-scroll-locked'),rootOverflow:getComputedStyle(document.documentElement).overflow,bodyOverflow:getComputedStyle(document.body).overflow})));for(const k of Object.keys(before)){assert(Math.abs(before[k].x-after[k].x)<=.6,`${note} ${k} x: ${before[k].x} -> ${after[k].x}`);assert(Math.abs(before[k].width-after[k].width)<=.6,`${note} ${k} width`);}};
 for(const scrollWidth of [15,0])for(const long of [true,false]){
  const style=await page.addStyleTag({content:`html::-webkit-scrollbar{width:${scrollWidth}px} body{min-height:${long?'200vh':'0'}} ${long?'':'#workspace-main{max-height:100px;overflow:hidden}'}`});
  await page.waitForFunction(()=>!document.body.hasAttribute('data-scroll-locked'));const before=await rects();const bodyStyle=await page.locator('body').getAttribute('style');
  for(const menu of ['业务','设置','业务','设置']){await page.waitForFunction(()=>!document.body.hasAttribute('data-scroll-locked'));
   const trigger=nav.getByRole('button',{name:width<760?'快捷'+menu:menu,exact:true});
   await trigger.click();const dialog=page.getByRole('dialog',{name:menu,exact:true});await dialog.waitFor();await stable(before,`${width}/${scrollWidth}/${long} ${menu} open`);
   assert(await page.evaluate(()=>document.body.hasAttribute('data-scroll-locked')));
   await dialog.press('Escape');await dialog.waitFor({state:'hidden'});await stable(before,'closed');
   assert.equal((await page.locator('body').getAttribute('style'))||'',bodyStyle||'');
   await page.waitForFunction(e=>e===document.activeElement,await trigger.elementHandle());assert(await trigger.evaluate(e=>e===document.activeElement));
  }
  await style.evaluate(e=>e.remove());report.checks.push(`${width}/${reducedMotion}: scrollbar ${scrollWidth}, ${long?'long':'short'} stable Dock/body/header and lock cleanup`);
 }
 await page.getByRole('button',{name:'自动化采集',exact:true}).click();const pick=page.getByLabel('查看任务',{exact:true});await pick.waitFor();
 assert.equal(await pick.evaluate(e=>e.tagName),'BUTTON');await pick.focus();await page.keyboard.press('Space');await page.getByRole('listbox').waitFor();await screenshot(`long-select-${width}-${reducedMotion}.png`);await page.keyboard.press('End');await page.waitForFunction(()=>document.activeElement?.getAttribute('data-value')==='old');await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('[aria-label="查看任务"]')?.dataset.value==='old');assert.equal(await controlValue(pick),'old');
 await selectOption(pick,'');await page.waitForFunction(()=>document.querySelector('[aria-label="查看任务"]')?.dataset.value==='');assert.equal(await controlValue(pick),'');assert(page.url().includes('fresh=1')); // explicit fresh task
 await page.getByRole('button',{name:'采集设置',exact:true}).click();const settings=page.getByRole('dialog',{name:'采集设置',exact:true});await settings.waitFor();
 const count=page.getByLabel('本轮最多帖子数',{exact:true});const before=await rects();await count.click();const list=page.getByRole('listbox');await list.waitFor();
 assert(await list.evaluate(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.x>=0&&r.right<=innerWidth&&Number(getComputedStyle(e).zIndex)>Number(getComputedStyle(document.querySelector('[data-slot=sheet-content]')).zIndex)}));
 await stable(before,'nested Select');await page.keyboard.press('Escape');await list.waitFor({state:'hidden'});assert(await settings.isVisible());await page.waitForFunction(e=>e===document.activeElement,await count.elementHandle());assert(await count.evaluate(e=>e===document.activeElement));await stable(before,'Select Escape');
 await count.click();await page.getByRole('option').first().click();assert(await settings.isVisible());await page.keyboard.press('Escape');await settings.waitFor({state:'hidden'});await page.waitForFunction(()=>!document.body.hasAttribute('data-scroll-locked'));assert.equal(await page.evaluate(()=>document.body.hasAttribute('data-scroll-locked')),false);
 await page.goto(base+'/templates');await page.getByLabel('话术名称',{exact:true}).fill('合成未保存草稿');const channel=page.getByLabel('使用渠道',{exact:true});await channel.focus();await channel.press('Space');await page.getByRole('listbox').waitFor();await page.keyboard.press('End');await page.waitForFunction(()=>document.activeElement?.getAttribute('data-value')==='DM');await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('[aria-label="使用渠道"]')?.dataset.value==='DM');assert.equal(await controlValue(channel),'DM');
 const source=page.getByLabel('预览来源',{exact:true});await selectOption(source,'');assert.equal(await controlValue(source),'');
 await page.getByRole('button',{name:'新增话术',exact:true}).click();await page.getByRole('alertdialog').waitFor();await page.getByRole('button',{name:'继续编辑',exact:true}).click();assert.equal(await controlValue(page.getByLabel('话术名称',{exact:true})),'合成未保存草稿');
 await page.getByRole('button',{name:'新增话术',exact:true}).click();await page.getByRole('button',{name:'放弃修改',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="使用渠道"]')?.dataset.value==='COMMENT');assert.equal(await controlValue(page.getByLabel('话术名称',{exact:true})), '');
 assert.equal(await page.locator('select:not([aria-hidden=true]):visible,input[type=checkbox]:not([aria-hidden=true]):visible,textarea:not([data-slot]):visible').count(),0);await check();await screenshot(`controls-${width}-${reducedMotion}.png`);
 await page.goto(base+'/collection');await page.getByRole('button',{name:'新增关键词配置',exact:true}).click();await selectOption(page.getByLabel('采集模式',{exact:true}),'XHS_MCP');const platform=page.getByLabel('来源平台',{exact:true});await platform.click();const disabled=page.getByRole('option',{name:'抖音 · 待接入',exact:true});assert(await page.getByRole('option').filter({hasText:'抖音'}).getAttribute('data-disabled')!==null);await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('[data-slot=select-content]'));await check();
 report.checks.push(`${width}/${reducedMotion}: Select keyboard/clear/portal/nested Escape/focus; AlertDialog preserve/discard`);
 await context.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.unexpected,[]);console.log('PASS shadcn controls and scrollbar stability');
}finally{if(page&&!page.isClosed())await page.screenshot({path:join(out,'last-state.png')}).catch(()=>{});await writeFile(join(out,'checks.json'),JSON.stringify(report,null,2));console.log('Evidence:',out);await browser?.close();await new Promise(ok=>server.close(ok));}
