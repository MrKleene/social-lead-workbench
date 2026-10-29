import {controlValue,selectOption} from './ui-controls.mjs';
// Explicitly authorized isolated UI regression. Fresh contexts; synthetic GET APIs only.
import {createServer} from 'node:http';
import {readFile,mkdtemp,writeFile} from 'node:fs/promises';
import {join,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright'),root=fileURLToPath(new URL('../apps/web/dist/',import.meta.url)),out=await mkdtemp(join(tmpdir(),'crm-navigation-ui-'));
const server=createServer(async(req,res)=>{try{const p=new URL(req.url,'http://localhost').pathname,f=/^\/(assets|space)\//.test(p)?p:'/index.html';res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml'})[extname(f)]||'text/plain');res.end(await readFile(join(root,f)));}catch{res.writeHead(404).end();}});await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base=`http://127.0.0.1:${server.address().port}`,report={checks:[],errors:[],unexpected:[],screenshots:[]};let browser,page;
const labels=['工作台','采集信息','回复记录'];
const config={id:'fixture-config',name:'合成导航配置',platform:'XHS',mode:'XHS_MCP',keywords:['合成搜索词'],excludeWords:[],batchLimit:1,enabled:true,revision:1,activeRunId:null,runs:['new','old'].map((id,i)=>({id,status:i?'PARTIAL':'COMPLETE',reason:i?'COMMENTS_PARTIAL':null,scenario:'READ_WINDOW',requests:1,observed:1,matched:0,added:0,notices:0,capturedPosts:1,capturedCommentsCount:4,createdAt:`2026-10-${27-i}T00:00:00Z`,finishedAt:`2026-10-${27-i}T00:01:00Z`}))};
const capture={control:{enabled:false,version:0},model:'unconfigured',hasRules:false,total:0,postTotal:0,legacyWithoutSnapshot:0,hasMore:false,posts:[],items:[]};
const overview={autoJobs:[],policies:[{id:'policy',target:'合成目标',version:1,revision:2,autoEnabled:false}],connection:{state:'READY',authorized:false,model:'qwen3.8-flash',priceVersion:'synthetic',priceDescription:'合成模型，无真实连接',dailyLimit:null},usage:{requests:0,canCall:false},modelVersion:1,capturedComments:0};
const settled=async()=>page.evaluate(()=>new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok))));
async function screenshot(name){await page.waitForFunction(()=>document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).every(a=>a.playState==='finished')); await page.screenshot({path:join(out,name),fullPage:false});report.screenshots.push(name);}
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
 for(const reducedMotion of ['no-preference','reduce'])for(const width of [1440,390]){
 const context=await browser.newContext({viewport:{width,height:900},reducedMotion});let role='ADMIN',reviewError=false,readError=false;const scoped=[];context.setDefaultTimeout(12000);
 await context.route('**/*',async route=>{const req=route.request(),u=new URL(req.url()),p=u.pathname.slice(4);if(u.origin!==base||req.method()!=='GET'){report.unexpected.push(req.method()+' '+u.pathname);return route.abort();}if(!u.pathname.startsWith('/api/'))return route.continue();
 if(readError&&['/leads','/tasks','/notices','/collection/configs'].includes(p))return route.fulfill({status:503,json:{message:'合成读取失败'}});
 if(p==='/events')return route.fulfill({contentType:'text/event-stream',body:': synthetic\n\n'});
 if(p==='/comment-review'&&reviewError)return route.fulfill({status:403,json:{message:'无权读取合成审核'}});
 if(p.includes('/results')||p==='/auto-contact/jobs')scoped.push({path:p,run:u.searchParams.get('runId')});
 const data=p==='/auth/me'?{user:{id:'fixture',name:'合成导航用户',role},csrfToken:'fixture-only'}:p==='/comment-review'?overview:p.includes('/results')||p==='/comment-review/history'?{items:[],total:0,hasMore:false}:p==='/comment-review/posts'?{items:[],hasMore:false}:p==='/collection/configs'?[config]:p==='/collection/configs/fixture-config'?{...config,monitors:[],matches:[]}:p==='/collection/mcp/readiness'?{enabled:true,mode:'XHS_MCP',captureArchiveVersion:1,accountBound:true,automaticPolling:false,device:{name:'合成设备',online:true},accounts:[{id:'fixture-account',label:'合成账号',eligible:false}]}:p.endsWith('/captures')||p.endsWith('/posts')?capture:p==='/auto-contact'?{rules:[],accounts:[],recentAttempts:[],policies:[],capability:{available:false,reason:'合成隔离环境'},timezone:'Asia/Shanghai',day:'2026-10-27'}:p==='/auto-contact/journey'?{reviews:{EVALUATED:124},reviewJobs:{COMPLETED:1},contacts:{CONFIRMED:2,UNKNOWN:1,FAILED:5},matches:8}:p==='/auto-contact/jobs'?{items:[],total:0}:p==='/auto-contact/attempts'?{items:[],total:0,allTotal:0,confirmedTotal:0,offset:0,limit:20,mode:'REAL'}:p==='/accounts'?{accounts:[],summary:{available:0,attention:0}}:p==='/accounts/login-capabilities'?{supported:false,mode:'offline'}:p==='/platforms'?{capabilities:[],accounts:[]}:p==='/health'?{contactWorkflow:true}:[];return route.fulfill({json:data});});
 page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 const nav=page.getByRole('navigation',{name:width<760?'业务快捷入口':'常用导航'});
 const check=async()=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+width+' '+page.url());
 await page.goto(base+'/work');await page.getByRole('button',{name:'自动化采集',exact:true}).waitFor();assert.deepEqual(await nav.getByRole('link').allTextContents(),labels);await check();await screenshot('home-'+width+'-'+reducedMotion+'.png');
 const settings=nav.getByRole('button',{name:width<760?'快捷设置':'设置',exact:true}),modal=page.getByRole('dialog',{name:'设置',exact:true});await settings.focus();await page.keyboard.press('Enter');await modal.waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('[data-slot="sheet-content"]')].every(e=>e.getAnimations().every(a=>a.playState==='finished')));const box=await modal.boundingBox();assert(Math.abs(box.x+box.width/2-width/2)<2);assert(Math.abs(box.y+box.height/2-450)<3);assert(await page.evaluate(()=>document.body.hasAttribute('data-scroll-locked')));assert(await modal.evaluate(e=>e.contains(document.activeElement)));await page.keyboard.press('Tab');assert(await modal.evaluate(e=>e.contains(document.activeElement)));await screenshot('settings-'+width+'.png');await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});await page.waitForFunction(e=>e===document.activeElement,await settings.elementHandle());

 // Sample every animation frame: an ending dialog must never flash opaque again.
 const noFlash=async(action,name)=>{
  const sampling=page.evaluate(()=>new Promise(resolve=>{const frames=[],start=performance.now();const tick=()=>{frames.push({t:performance.now()-start,nodes:[...document.querySelectorAll('[data-slot="sheet-overlay"],[data-slot="sheet-content"]')].map(e=>({slot:e.dataset.slot,state:e.dataset.state,opacity:Number(getComputedStyle(e).opacity)}))});if(performance.now()-start<360)requestAnimationFrame(tick);else resolve(frames)};tick()}));
  await action();const frames=await sampling;const previous=new Map();
  for(const f of frames)for(const n of f.nodes){if(n.state!=='closed')continue;const last=previous.get(n.slot);assert(last===undefined||n.opacity<=last+.015,`${name}: closing opacity rebounded ${last} -> ${n.opacity}`);previous.set(n.slot,n.opacity);}
  assert.equal(await page.locator('[data-slot="sheet-content"]').count(),0,name+' remained open');
  assert.equal(await page.evaluate(()=>document.body.hasAttribute('data-scroll-locked')),false);
  report.checks.push(`${width}/${reducedMotion}: ${name}, no closing opacity rebound`);
 };
 for(const menu of ['设置','业务']){
  const trigger=nav.getByRole('button',{name:width<760?'快捷'+menu:menu,exact:true});
  const box=await trigger.boundingBox();
  const points=[[8,8],[width-8,8],[8,892],[width-8,892],[box.x+box.width/2,box.y+box.height/2]];
  for(const [x,y] of points){
   await trigger.click();await page.getByRole('dialog',{name:menu,exact:true}).waitFor();
   await page.waitForFunction(()=>[...document.querySelectorAll('[data-slot="sheet-content"]')].every(e=>e.getAnimations().every(a=>a.playState==='finished')));
   const yBefore=await page.evaluate(()=>scrollY);await page.mouse.wheel(0,400);await settled();assert.equal(await page.evaluate(()=>scrollY),yBefore);
   await noFlash(()=>page.mouse.click(x,y),menu+' backdrop '+x+','+y);
   assert(await trigger.evaluate(e=>e===document.activeElement));
  }
  await trigger.click();await page.getByRole('dialog',{name:menu,exact:true}).waitFor();
  await noFlash(()=>page.mouse.dblclick(8,8,{delay:45}),menu+' outside double click');
  await trigger.click();await page.getByRole('dialog',{name:menu,exact:true}).waitFor();
  await noFlash(()=>page.keyboard.press('Escape'),menu+' Escape');
 }
 assert.equal(await page.locator('.simple-hero .spotlight-card__border').count(),0,'hero must match the borderless reference');
 await page.getByRole('button',{name:'自动化采集',exact:true}).click();await page.getByLabel('查看任务',{exact:true}).waitFor();assert.equal(await controlValue(page.getByLabel('查看任务',{exact:true})),'new');await selectOption(page.getByLabel('查看任务',{exact:true}), 'old');await page.reload();await page.waitForFunction(()=>document.querySelector('[aria-label="查看任务"]')?.dataset.value==='old');assert.equal(await controlValue(page.getByLabel('查看任务',{exact:true})),'old');assert(page.url().includes('run=old'));await check();await screenshot('task-'+width+'.png');
 const steps=page.getByRole('navigation',{name:'任务步骤'});await steps.getByRole('button',{name:/评论匹配/}).click();await page.getByRole('button',{name:'识别设置',exact:true}).waitFor();assert(scoped.some(x=>x.path.includes('/results')&&x.run==='old'));await Promise.all([page.waitForResponse(r=>r.url().includes('/results?')&&r.url().includes('policyRevision=2')),selectOption(page.getByLabel('审核目标版本',{exact:true}), '2')]);await screenshot('review-'+width+'.png');await page.reload();await page.getByRole('button',{name:'识别设置',exact:true}).waitFor();assert.equal(await controlValue(page.getByLabel('查看任务',{exact:true})),'old');
 assert.equal(await controlValue(page.getByLabel('审核目标版本',{exact:true})),'2');await steps.getByRole('button',{name:/自动回复/}).click();await page.getByText('暂无规则任务',{exact:true}).waitFor();assert(scoped.some(x=>x.path==='/auto-contact/jobs'&&x.run==='old'));assert(await page.getByRole('button',{name:'开启自动联系',exact:true}).isDisabled());await check();await screenshot('contact-'+width+'.png');
 await page.goBack();await page.getByRole('button',{name:'识别设置',exact:true}).waitFor();assert(page.url().includes('stage=review'));await page.goForward();await page.getByText('暂无规则任务',{exact:true}).waitFor();
 await page.goto(base+'/work?module=runs&config=fixture-config&run=old&stage=handoff&reviewVersion=2');await page.getByText('暂无规则任务',{exact:true}).waitFor();assert(page.url().includes('stage=contact'));assert(page.url().includes('run=old'));assert.equal(await steps.getByRole('button').count(),3);await screenshot('three-step-'+width+'.png');
 await steps.getByRole('button',{name:/评论匹配/}).click();await page.getByRole('button',{name:'识别设置',exact:true}).click();await page.getByRole('dialog',{name:'自动化设置',exact:true}).waitFor();await page.getByLabel('审核需求').fill('未保存任务目标');await page.keyboard.press('Escape');await page.getByRole('alertdialog').getByRole('button',{name:'继续编辑'}).click();await page.getByRole('alertdialog').waitFor({state:'hidden'});assert.equal(await controlValue(page.getByLabel('审核需求')),'未保存任务目标');assert(page.url().includes('run=old'));await page.keyboard.press('Escape');await page.getByRole('alertdialog').getByRole('button',{name:'放弃修改'}).click();await page.getByRole('dialog',{name:'自动化设置',exact:true}).waitFor({state:'hidden'});
 for(const [path,heading] of [['/templates','回复话术'],['/leads','线索管理'],['/tasks','任务中心'],['/platforms','平台能力'],['/work?module=accounts','账号中心'],['/collection','搜索设置'],['/comment-review','评论审核'],['/auto-contact','自动联系'],['/reply-history','回复记录'],['/work?module=archive','采集信息'],['/work?module=matches&view=new','线索池'],['/work?module=follow&view=follow','销售跟进']]){await page.goto(base+path);await page.getByRole('heading',{name:heading,exact:true}).first().waitFor();await check();if(path==='/templates'){assert(Number.parseFloat(await page.locator('.config-form').evaluate(e=>getComputedStyle(e).paddingTop))>=20);await screenshot('templates-'+width+'-'+reducedMotion+'.png');}}
 reviewError=true;await page.goto(base+'/work?module=runs&config=fixture-config&run=old&stage=review');await page.getByLabel('本轮工作',{exact:true}).getByText('无权读取合成审核',{exact:true}).waitFor();assert((await steps.innerText()).includes('状态读取失败'));await screenshot('permission-error-'+width+'.png');reviewError=false;
 await page.goto(base+'/work?module=runs&config=fixture-config&run=missing&stage=contact');await page.getByText('任务记录尚未找到，请重新选择任务；不会用其他任务的数据代替。',{exact:true}).waitFor();assert.equal(await page.getByText('暂无规则任务',{exact:true}).count(),0);

 readError=true;
 await page.goto(base+'/work?module=notices');await page.getByRole('button',{name:'重试读取提醒',exact:true}).waitFor();
 assert.equal(await page.getByText('暂无未读提醒。首次完整读取建立基线，后续新增才提醒。',{exact:true}).count(),0);
 await page.getByRole('heading',{name:'异常任务 · 读取失败',exact:true}).waitFor();
 await page.goto(base+'/work?module=matches&view=new');await page.getByRole('button',{name:'重试读取线索',exact:true}).waitFor();
 assert.equal(await page.getByRole('heading',{name:'当前没有符合筛选的线索',exact:true}).count(),0);
 readError=false;
 role='SALES';await page.goto(base+'/work');await page.getByRole('heading',{name:'工作台',exact:true}).waitFor();assert.equal(await nav.getByRole('link',{name:'回复记录',exact:true}).count(),0);await settings.click();await modal.waitFor();assert.equal(await modal.getByRole('link',{name:'搜索与模型',exact:true}).count(),0);await page.keyboard.press('Escape');await check();assert.equal(await page.locator('html').getAttribute('data-crm-reduced'),reducedMotion==='reduce'?'true':'false');
 report.checks.push(width+': modal centering/focus/Escape/scroll lock; run scope; reload/Back/Forward; draft protection; routes; permissions; missing task; reduced motion; GET-only');await context.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.unexpected,[]);console.log('PASS simple workspace desktop/390px; isolated GET-only APIs');
}finally{if(page&&!page.isClosed()){await page.screenshot({path:join(out,'last-state.png'),fullPage:false});report.lastState={url:page.url(),text:(await page.locator('body').innerText()).slice(0,2500)};}await browser?.close();server.closeAllConnections();await new Promise(ok=>server.close(ok));await writeFile(join(out,'checks.json'),JSON.stringify(report,null,2));console.log('Evidence: '+out);}
