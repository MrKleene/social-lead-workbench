// Standalone built UI + fictional API only. Never attaches a user browser/session.
import {createServer} from 'node:http';
import {readFile,mkdtemp,writeFile} from 'node:fs/promises';
import {join,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../apps/web/dist/',import.meta.url)),out=await mkdtemp(join(tmpdir(),'crm-semantic-review-ui-'));
const server=createServer(async(req,res)=>{try{const p=new URL(req.url,'http://localhost').pathname,f=/^\/(assets|space)\//.test(p)?p:'/index.html';res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.html':'text/html','.png':'image/png'})[extname(f)]||'text/plain');res.end(await readFile(join(root,f)));}catch{res.writeHead(404).end();}});await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const base=`http://127.0.0.1:${server.address().port}`,report={checks:[],errors:[],unexpected:[],writes:[]};let browser;
const config={id:'fixture-config',name:'虚构教培',platform:'XHS',mode:'XHS_MCP',keywords:['无偿选题'],excludeWords:['广告'],batchLimit:3,enabled:true,revision:1,commentRules:null,runs:[],activeRunId:null,pauseReason:null,nextAllowedAt:null};
try{
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 for(const narrow of [false,true]){
  const context=await browser.newContext({viewport:narrow?{width:390,height:844}:{width:1440,height:1000},reducedMotion:narrow?'reduce':'no-preference'});
  let saved={...config,semanticRules:null};
  const target='寻找毕业论文选题中留下专业并求助的学生，排除服务广告，缺少父评论时待审核。';
  const rules={version:1,target,reviewThreshold:75};
  const sample=(id,score,contextState)=>({id,revision:2,version:0,state:score===null?'UNCONFIGURED':'EVALUATED',reviewStatus:'PENDING',score,reason:score===null?'模型未配置；没有可信评分':'虚构模型固定输出，不代表真实 LLM',context:contextState,result:score===null?null:{id,score,reason:'虚构模型样本',context:contextState,evidence:[{source:'COMMENT',quote:'护理 <script>不执行</script>'}]},snapshot:{postId:'fixture-post',commentId:id,userId:'fixture-user-'+id,title:'虚构论文选题',body:'虚构正文：讨论开题',comment:'护理 <script>不执行</script>',parentId:contextState==='INSUFFICIENT'?'missing':null,parent:null,coverage:'PARTIAL',isDemo:true},rules,provider:score===null?'NONE':'LOCAL_TEST',modelVersion:'fixture-v1',isDemo:true,createdAt:'2026-10-21T08:00:00Z',reviewNote:null,eligibility:{canSend:false,blockers:['真实发送未实现且始终关闭','没有本次发送授权','本地测试样本，不能发送','平台会话/账号状态或发送能力未就绪']}});
  let items=[sample('fixture-missing',98,'INSUFFICIENT'),sample('fixture-ready',90,'SUFFICIENT'),sample('fixture-unconfigured',null,'INSUFFICIENT')];
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());if(u.origin!==base){report.unexpected.push(u.origin);return route.abort();}if(!u.pathname.startsWith('/api/'))return route.continue();const p=u.pathname.slice(4);
   if(req.method()!=='GET'){
    if(req.method()==='PATCH'&&p==='/collection/configs/fixture-config'){
     const body=req.postDataJSON();assert.equal(body.revision,1);assert.deepEqual(body.config.semanticRules,rules);assert.equal(body.config.commentRules,null);assert.deepEqual(body.config.keywords,['无偿选题']);saved={...saved,...body.config,revision:2};report.writes.push('fictional semantic configuration');return route.fulfill({json:saved});
    }
    if(req.method()==='PATCH'&&p==='/collection/semantic-reviews/fixture-ready'){
     const body=req.postDataJSON();assert.deepEqual(body,{version:0,decision:'APPROVED',note:'人工确认虚构样本，仅审核不发送'});items=items.map(i=>i.id==='fixture-ready'?{...i,version:1,reviewStatus:'APPROVED',reviewNote:body.note}:i);report.writes.push('fictional review only');return route.fulfill({json:{canSend:false}});
    }
    report.unexpected.push(req.method()+' '+p);return route.abort();
   }
   if(p==='/events')return route.fulfill({contentType:'text/event-stream',body:': fixture\n\n'});
   const data=p==='/auth/me'?{user:{id:'fixture-admin',name:'虚构管理员',role:'ADMIN'},csrfToken:'fictional'}:p==='/collection/mcp/readiness'?{enabled:true,mode:'XHS_MCP',accountBound:true,accounts:[],coverage:'WINDOW_ONLY',automaticPolling:false}:p==='/collection/configs'?[saved]:p==='/collection/configs/fixture-config'?{...saved,monitors:[],matches:[]}:p==='/collection/configs/fixture-config/semantic-reviews'?{configured:false,provider:'NONE',total:items.length,offset:0,hasMore:false,items}:p==='/accounts'?{accounts:[],summary:{available:0,attention:0}}:[];
   return route.fulfill({json:data});
  });
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(base+'/work?module=settings&config=fixture-config');await page.getByRole('button',{name:'编辑',exact:true}).click();
  const opt=page.getByRole('checkbox',{name:'启用自然语言审核（保存后生效）'});await opt.waitFor();assert.equal(await opt.isChecked(),false);assert.equal(await page.getByRole('checkbox',{name:'启用独立评论规则（保存后生效）'}).isChecked(),false);
  await opt.focus();await page.keyboard.press('Space');await page.getByLabel('目标需求（自然语言）').fill(target);await page.getByLabel('审核优先分数').fill('75');await page.getByLabel('目标需求（自然语言）').scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:join(out,`editor-${narrow?'narrow':'desktop'}.png`)});
  await page.getByRole('button',{name:'保存配置',exact:true}).click();await page.getByText('配置已保存：虚构教培',{exact:true}).waitFor();report.checks.push('explicit opt-in, natural target, independent search, legacy untouched '+narrow);
  await page.goto(base+'/work?module=runs&config=fixture-config');const toggle=page.locator('summary').filter({hasText:/^自然语言审核 · 模型未配置$/});await toggle.focus();await toggle.press('Enter');const panel=toggle.locator('..').locator('section[aria-label="自然语言审核队列"]');await panel.getByText('暂无可信评分',{exact:true}).waitFor();assert(await panel.getByRole('button',{name:'评估下一批（模型未配置）'}).isDisabled());
  const ready=panel.locator('article').filter({hasText:'90 / 100'}),missing=panel.locator('article').filter({hasText:'98 / 100'});
  await missing.getByLabel('审核备注 fixture-missing').fill('仍缺父评论');assert(await missing.getByRole('button',{name:'人工确认相关（不发送）'}).isDisabled());
  const evidence=ready.locator('summary').filter({hasText:'原文、目标与评估证据'});await evidence.click();await ready.getByText('评论：护理 <script>不执行</script>',{exact:true}).waitFor();assert.equal(await panel.locator('script').count(),0);await ready.locator('summary').filter({hasText:'发送条件预览 · 不可发送'}).click();await ready.getByText('没有本次发送授权',{exact:true}).waitFor();
  await ready.getByLabel('审核备注 fixture-ready').fill('人工确认虚构样本，仅审核不发送');const approve=ready.getByRole('button',{name:'人工确认相关（不发送）'});await approve.focus();await approve.press('Enter');await panel.getByText('已人工确认',{exact:true}).waitFor();
  const approved=panel.locator('article').filter({hasText:'90 / 100'});await approved.locator('summary').filter({hasText:'发送条件预览 · 不可发送'}).click();await approved.getByText('真实发送未实现且始终关闭',{exact:true}).waitFor();await approved.scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:join(out,`review-${narrow?'narrow':'desktop'}.png`)});report.checks.push('unconfigured + missing parent + evidence + review + send blocked '+narrow);await context.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.unexpected,[]);assert.equal(report.writes.length,4);console.log('PASS '+report.checks.length+' semantic UI flows; only fictional config/review writes, zero external/collection/send requests');
}finally{await browser?.close();await new Promise(ok=>server.close(ok));await writeFile(join(out,'checks.json'),JSON.stringify(report,null,2));console.log('Evidence: '+out);}
