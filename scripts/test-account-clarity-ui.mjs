// Isolated browser with fictional APIs only. No real profile, database, keys or platform.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../apps/web/dist/',import.meta.url));
const out=await mkdtemp(join(tmpdir(),'crm-account-clarity-'));
const server=createServer(async(req,res)=>{try{const p=new URL(req.url,'http://localhost').pathname;const f=p.startsWith('/assets/')||p.startsWith('/space/')?p:'/index.html';res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png'})[extname(f)]||'application/octet-stream');res.end(await readFile(join(root,f)));}catch{res.writeHead(404).end();}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base=`http://127.0.0.1:${server.address().port}`;
const report={mode:'fictional mock HTTP only; no real login/storage verification',checks:[],errors:[],unexpected:[]};let browser,page;
const fixture={id:'fixture-account-long-id',platform:'XHS',label:'小红书 · 待扫码',loginNickname:'清晰示例账号',ownerId:null,owner:null,dailyLimit:10,occupied:1,day:'2026-11-01',status:'PAUSED',available:false,version:1,loginProvider:'real',loginStatus:'PREVIOUSLY_VERIFIED',loginVerifiedAt:'2026-10-31T10:00:00Z',sessionReference:{deviceId:'fixture-device',provider:'real',state:'VERIFIED',verifiedAt:'2026-10-31T10:00:00Z'}};
const rows=[{...fixture,id:'restricted',loginNickname:'受限示例账号',systemBlockReason:'历史平台限制报告，待复核'},fixture,{...fixture,id:'long',loginNickname:'这是用于测试长昵称自动换行的账号名称ABCDEFGHIJKLMN',occupied:10},{...fixture,id:'expired',loginNickname:'过期示例账号',loginStatus:'EXPIRED'}];
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});let failAccounts=false,failReply=false,hold=null;const writes=[];
  await context.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(u.origin!==base){report.unexpected.push(u.origin);return route.abort();}if(!u.pathname.startsWith('/api/'))return route.continue();if(req.method()!=='GET'){writes.push(u.pathname);return route.abort();}const p=u.pathname.slice(4);let data=[];const ok=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
   if(p==='/auth/me')data={user:{id:'admin',name:'测试',role:'ADMIN'},csrfToken:'fictional'};
   else if(p==='/events')return route.fulfill({contentType:'text/event-stream',body:': fixture\n\n'});
   else if(p==='/accounts'){if(hold)await hold;if(failAccounts)return ok({message:'账号读取暂时失败'},503);data={accounts:rows,summary:{available:0,attention:0}};}
   else if(p==='/accounts/login-capabilities')data={enabled:true,mode:'real',persistent:true,sessionReplacement:true,deviceRequired:true,device:{online:true}};
   else if(p==='/collection/mcp/readiness')data={enabled:true,device:{online:true},accounts:rows.map(a=>({id:a.id,eligible:!a.systemBlockReason&&a.loginStatus!=='EXPIRED',reason:a.systemBlockReason?'RESTRICTED':a.loginStatus}))};
   else if(p==='/auto-contact'){if(failReply)return ok({message:'资格读取暂时失败'},503);data={rules:[],policies:[],capability:{available:true},capabilities:[{platform:'XHS',channel:'COMMENT',available:true}],accounts:rows.map(a=>({id:a.id,canCheck:a.loginStatus!=='EXPIRED',unknown:a.id===fixture.id?1:0,sendEligibility:{state:'UNKNOWN',canSend:false,stale:true,checkedAt:'2026-10-31T09:00:00Z'}}))};}
   return ok(data);
  });
  page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>report.errors.push(e.message));await page.goto(base+'/work?module=accounts');const list=page.getByLabel('账号列表',{exact:true}),detail=page.getByRole('region',{name:'账号详情',exact:true});await list.getByRole('button').first().waitFor();
  assert.equal(await list.getByRole('button').count(),4);assert(!(await list.innerText()).includes('待扫码'));assert(!(await list.innerText()).includes('fixture-account'));assert(!(await list.innerText()).includes('…'));
  await detail.getByText('历史平台限制报告，待复核',{exact:true}).waitFor();assert.equal(await detail.getByRole('button',{name:'重新扫码',exact:true}).count(),0);assert.equal(await detail.getByText('不可采集',{exact:true}).count(),1);assert.equal(await detail.getByText('不可回复',{exact:true}).count(),1);
  await page.screenshot({path:join(out,`restricted-${width}.png`),fullPage:true});
  await list.getByRole('button').nth(1).click();await detail.getByText('检查已过期，发送前核验',{exact:true}).waitFor();await detail.getByText(/今日 1 条回复结果待核查/).waitFor();assert((await list.getByRole('button').nth(1).innerText()).includes('已用 1 / 10 条'));
  await detail.getByRole('button',{name:'查看详情',exact:true}).click();const dialog=page.getByRole('dialog',{name:'账号详情',exact:true});await dialog.waitFor();await dialog.getByText(fixture.id,{exact:true}).waitFor();assert((await dialog.innerText()).includes('真实回复按北京时间每日计算'));const box=await dialog.boundingBox();assert(Math.abs(box.x+box.width/2-width/2)<2,'details is a centered modal');await page.screenshot({path:join(out,`details-${width}.png`)});await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});await detail.getByRole('button',{name:'查看详情',exact:true}).click();await dialog.waitFor();await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  await page.getByRole('heading',{name:'账号中心',exact:true}).click();await page.screenshot({path:join(out,`ready-${width}.png`),fullPage:true});await list.getByRole('button').nth(2).click();await detail.getByText('今日额度已用完',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:join(out,`long-name-${width}.png`),fullPage:true});
  await list.getByRole('button').nth(3).click();await detail.getByText('本机会话已失效',{exact:true}).first().waitFor();assert(await detail.getByRole('button',{name:'重新扫码',exact:true}).isVisible());
  failReply=true;await page.reload();await list.getByRole('button').nth(1).click();await detail.getByText('资格读取失败',{exact:true}).waitFor();failReply=false;await detail.getByRole('button',{name:'重试读取资格',exact:true}).click();await detail.getByText('检查已过期，发送前核验',{exact:true}).waitFor();
  failAccounts=true;await page.reload();await page.getByText('账号读取暂时失败',{exact:true}).waitFor();assert.equal(await page.getByText('添加你的第一个账号',{exact:true}).count(),0);failAccounts=false;let release;hold=new Promise(ok=>release=ok);await page.getByRole('button',{name:'重新读取账号',exact:true}).click();release();hold=null;await list.getByRole('button').first().waitFor();
  hold=new Promise(ok=>release=ok);await page.reload();const loading=page.getByRole('status',{name:'正在读取账号',exact:true});await loading.waitFor();const spinner=await loading.locator('svg').boundingBox(),area=await loading.boundingBox();assert(Math.abs(spinner.x+spinner.width/2-area.x-area.width/2)<2);await page.screenshot({path:join(out,`loading-${width}.png`)});release();hold=null;await list.getByRole('button').first().waitFor();assert.deepEqual(writes,[]);report.checks.push(`${width}: accurate risk/login/collection/reply/quota; placeholders hidden; technical modal; long names; expired; UNKNOWN; read failures/recovery; centered loading; zero mutations`);await context.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.unexpected,[]);
}catch(error){if(page){await page.screenshot({path:join(out,'failure.png'),fullPage:true});await writeFile(join(out,'failure.txt'),await page.locator('body').innerText());}throw error;}finally{await browser?.close();server.close();await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));console.log(out);}
