// Isolated browser with fictional APIs only. No real profile, database, keys or platform.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../apps/web/dist/',import.meta.url));
const out=await mkdtemp(join(tmpdir(),'crm-account-simple-'));
const server=createServer(async(req,res)=>{try{const p=new URL(req.url,'http://localhost').pathname;const f=p.startsWith('/assets/')||p.startsWith('/space/')?p:'/index.html';res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png'})[extname(f)]||'application/octet-stream');res.end(await readFile(join(root,f)));}catch{res.writeHead(404).end();}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base=`http://127.0.0.1:${server.address().port}`;
const report={mode:'fictional mock HTTP only; no real login/storage verification',checks:[],errors:[],unexpected:[]};let browser,page;
const fixture={id:'fixtureaccount',platform:'XHS',label:'演示账号',ownerId:null,owner:null,dailyLimit:10,occupied:0,day:'2026-10-22',status:'PAUSED',pauseReason:'登录已验证；只读采集须逐次确认，发送禁用',available:false,version:1,loginProvider:'real',loginStatus:'UNVERIFIED',loginVerifiedAt:'2026-10-20T00:00:00Z',sessionReference:{deviceId:'fictional-device',provider:'real',state:'UNVERIFIED',verifiedAt:'2026-10-20T00:00:00Z'}};
const fakeDevice={id:'fictional-device',name:'演示执行电脑',os:'macOS',enabled:true,online:true,credentialRoot:'/fixture/private',keyFingerprint:'fictional',keyProtection:'macos-login-keychain',version:0,accountCount:1};
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG5EAAAAASUVORK5CYII=';
const close=async()=>{await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});};
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
 for(const narrow of [false,true])for(const scenario of ['empty','saved','save-failure','expired','mismatch','device-offline','unapproved','sales','login-expired','login-failed','login-success','cancel','loading','cap-error','offline','restricted','unsupported','legacy-backend','windows-candidate','bind-failure','login-starting','session-old-backend','replacement-success','replacement-mismatch','replacement-save-failure','replacement-cancel','replacement-expired','login-save-proof']){
  if(process.env.ACCOUNT_UI_SCENARIO&&scenario!==process.env.ACCOUNT_UI_SCENARIO)continue;
  const context=await browser.newContext({viewport:narrow?{width:390,height:844}:{width:1440,height:1000}});const posts=[];let rows=['empty','login-expired','login-failed','login-success','cancel','loading','cap-error','unapproved','login-save-proof'].includes(scenario)?[]:[structuredClone(fixture)];let bindAttempts=0;let bound=!['unapproved','unsupported','legacy-backend','windows-candidate','bind-failure'].includes(scenario),capError=scenario==='cap-error',attempt=null,checks=0;
  if(scenario==='offline'){rows[0].loginProvider='offline';rows[0].loginStatus='OFFLINE_VERIFIED';rows[0].sessionReference.provider='offline';}
  if(scenario==='restricted')rows[0].status='RESTRICTED';
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());if(u.origin!==base){report.unexpected.push(u.origin);return route.abort();}if(!u.pathname.startsWith('/api/'))return route.continue();
   const path=u.pathname.slice(4),body=req.method()==='GET'?null:req.postDataJSON();let data=[];const fulfill=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
   if(req.method()!=='GET'){
    posts.push(path);
    if(path==='/accounts'){assert.equal(body.platform,'XHS');const a={...fixture,id:'newfixture',label:'小红书 · 待扫码',loginProvider:null,loginStatus:'NOT_CONNECTED',loginVerifiedAt:null,sessionReference:null};rows.push(a);return fulfill(a);}
    if(path==='/devices/bind'){assert.equal(body.consent,'bind-local-device-v1');bindAttempts++;if(scenario==='bind-failure'&&bindAttempts===1)return fulfill({message:'演示：设备安全存储暂不可用'},503);bound=true;return fulfill({});}
    if(path.endsWith('/session/verify')){assert.equal(body.consent,'read-local-session-v1');if(scenario==='save-failure')return fulfill({message:'演示：本机会话保存不可用'},503);const state=scenario==='expired'?'EXPIRED':scenario==='mismatch'?'NEEDS_REVIEW':'VERIFIED';rows[0].loginStatus=state;rows[0].sessionReference.state=state;return fulfill({state,provider:'real'});}
    if(path.endsWith('/login')){if(scenario==='login-starting')await new Promise(ok=>setTimeout(ok,700));assert.equal(body.consent,scenario.startsWith('replacement-')?'local-session-replace-v1':'local-session-v1');attempt={id:'fictional-attempt',requestKey:body.requestKey,state:'WAITING',mode:'real',image:png,expiresAt:new Date(Date.now()+1500).toISOString()};return fulfill(attempt);}
    if(path.endsWith('/login/cancel')){attempt={...attempt,state:'CANCELLED',image:undefined};return fulfill(attempt);}
    if(path.endsWith('/login/check')){checks++;
     const proof=scenario.startsWith('replacement-')||scenario==='login-save-proof';
     let state=scenario==='login-expired'||scenario==='replacement-expired'?'EXPIRED':scenario==='login-failed'||scenario==='replacement-mismatch'?'FAILED':proof?(checks===1?'SAVING':scenario==='replacement-save-failure'?'FAILED':'VERIFIED'):scenario==='login-success'?'VERIFIED':'WAITING';
     if(state==='VERIFIED'){rows[0]={...fixture,id:proof&&scenario!=='login-save-proof'?'fixtureaccount':'newfixture',loginNickname:'演示平台确认账号',loginStatus:'VERIFIED',sessionReference:{...fixture.sessionReference,state:'VERIFIED'}};}
     attempt={...attempt,state,localSaved:proof&&state==='VERIFIED',expiresAt:new Date(Date.now()+30000).toISOString(),...(state!=='WAITING'?{image:undefined}:{}),reason:state==='FAILED'?(scenario==='replacement-mismatch'?'SESSION_IDENTITY_MISMATCH':scenario==='replacement-save-failure'?'SESSION_SAVE_UNCONFIRMED':'ACCOUNT_ALREADY_BOUND'):null};return fulfill(attempt);
    }
    report.unexpected.push(req.method()+path);return route.abort();
   }
   if(path==='/events')return route.fulfill({contentType:'text/event-stream',body:': fixture\n\n'});
   if(path==='/auth/me')data={user:{id:'fixture-admin',name:'测试',role:scenario==='sales'?'SALES':'ADMIN'},csrfToken:'fictional'};
   else if(path==='/accounts')data={accounts:rows,summary:{available:99,attention:0}};
   else if(path==='/accounts/login-capabilities'){
    if(scenario==='loading')await new Promise(ok=>setTimeout(ok,600));if(capError)return fulfill({message:'演示：服务暂不可用'},503);
    data={enabled:bound&&scenario!=='device-offline',mode:scenario==='offline'?'offline':'real',storageRoot:'/fixture/private',persistent:true,saveConfirmationVersion:scenario==='session-old-backend'?undefined:1,sessionReplacement:scenario==='session-old-backend'?undefined:true,deviceRequired:true,device:bound?{...fakeDevice,online:scenario!=='device-offline'}:null};
   }else if(path==='/collection/mcp/readiness')data={enabled:true,accounts:rows.map(a=>({id:a.id,eligible:a.loginStatus==='VERIFIED'}))};
   else if(path==='/devices')data={enabled:true,binding:scenario==='legacy-backend'?undefined:{version:1,executionHost:'fixture',keyProtection:scenario==='windows-candidate'?'windows-dpapi-current-user':'macos-login-keychain'},provider:'real',candidateId:'fictional-device',suggestedRoot:'/fixture/private',allowedBase:'/fixture',capability:{supported:scenario!=='unsupported',os:['unsupported','windows-candidate'].includes(scenario)?'Windows':'macOS'},device:bound?{...fakeDevice,online:scenario!=='device-offline'}:null};
   return fulfill(data);
  });
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(['error','warning'].includes(m.type())&&!m.text().includes('503 (Service Unavailable)'))report.errors.push(m.text());});
  await page.goto(base+'/work?module=accounts');await page.getByRole('heading',{name:'账号中心',exact:true}).waitFor();
  assert.equal(posts.length,0);assert.equal(await page.getByText('添加模拟账号',{exact:true}).count(),0);assert.equal(await page.getByText('专用电脑设置 · 仅管理员',{exact:true}).count(),0);
  if(scenario==='loading')await page.getByText('正在检查登录服务…',{exact:true}).waitFor();
  if(['device-offline','unapproved','cap-error','unsupported','legacy-backend','windows-candidate','bind-failure'].includes(scenario)){
   await page.getByText(scenario==='device-offline'?'执行电脑离线或尚未认证':!bound?'首次使用，请先绑定执行电脑':'暂时无法读取登录服务',{exact:true}).waitFor();
   if(scenario==='cap-error'){capError=false;await page.getByRole('button',{name:'重试',exact:true}).click();await page.locator('.account-issue').waitFor({state:'hidden'});}
   else{await page.getByRole('button',{name:'查看设置',exact:true}).click();await page.getByText('专用电脑设置 · 仅管理员',{exact:true}).click();if(!bound){const bind=page.getByRole('button',{name:'一键绑定这台电脑',exact:true});if(['unsupported','legacy-backend'].includes(scenario)){assert(await bind.isDisabled());assert.equal(posts.length,0);}else{await bind.click();if(scenario==='bind-failure'){await page.getByText('演示：设备安全存储暂不可用',{exact:true}).waitFor();assert.equal(bindAttempts,1);await bind.click();}await page.getByText('在线 · 签名已验证',{exact:true}).waitFor();}}else assert.equal(posts.length,0);await close();}
  }else if(scenario.startsWith('replacement-')||scenario==='session-old-backend'){
   if(scenario==='session-old-backend')assert.equal(await page.getByRole('button',{name:'重新扫码',exact:true}).count(),0);
   else{
    const trigger=page.getByRole('button',{name:'重新扫码',exact:true});await trigger.click();
    const confirm=page.getByRole('button',{name:'确认并生成二维码',exact:true});assert(await confirm.isDisabled());assert.equal(posts.length,0);
    await page.getByRole('checkbox',{name:'我同意扫码更新此账号的本机会话，仅同一账号核验成功后替换',exact:true}).check();await confirm.click();await page.getByAltText('本次小红书登录二维码').waitFor();
    if(scenario==='replacement-cancel'){await close();await page.waitForTimeout(400);assert(posts.some(p=>p.endsWith('/login/cancel')));}
    else{
     if(['replacement-success','replacement-save-failure'].includes(scenario)){await page.getByText('登录已确认，正在保存到本机…',{exact:true}).waitFor();assert.equal(await page.getByAltText('本次小红书登录二维码').count(),0);}
     const text={'replacement-success':'已保存到本机，下次可恢复登录。','replacement-mismatch':'扫码账号与原账号不一致，原会话未替换。','replacement-save-failure':'未能确认会话完整保存，请重新扫码；原会话保持不变。','replacement-expired':'二维码已过期'}[scenario];await page.getByText(text,{exact:scenario==='replacement-success'||scenario==='replacement-expired'}).waitFor();
     assert.equal(posts.filter(p=>p.endsWith('/login')).length,1);await page.screenshot({path:join(out,`${scenario}-${narrow}.png`)});await close();
    }
    assert(await trigger.evaluate(e=>e===document.activeElement));
   }
  }else if(scenario==='sales'){
   await page.getByText('登录与恢复由管理员处理。',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'添加账号',exact:true}).count(),0);assert.equal(await page.locator('.account-center').getByRole('button',{name:'账号设置',exact:true}).count(),0);
  }else if(['saved','save-failure','expired','mismatch'].includes(scenario)){
   const trigger=page.getByRole('button',{name:'检查登录状态',exact:true});await trigger.click();if(scenario==='saved'){const info=page.getByRole('button',{name:'为什么要检查？',exact:true});await info.click();const modal=page.getByRole('dialog',{name:'为什么要检查？',exact:true});await modal.waitFor();await page.waitForFunction(e=>{const r=e.getBoundingClientRect();return r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));},await modal.elementHandle(),{timeout:3000});await page.screenshot({path:join(out,`session-info-${narrow}.png`)});await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});await page.waitForFunction(()=>document.activeElement.textContent==='为什么要检查？');assert.equal(posts.length,0);}const confirm=page.getByRole('button',{name:'确认检查',exact:true});assert(await confirm.isDisabled());assert.equal(posts.length,0);await page.getByRole('checkbox',{name:'同意检查此账号的登录状态和账号身份',exact:true}).check();await confirm.click();
   const expected={saved:'本机会话已核验，可用于单次只读采集','save-failure':'演示：本机会话保存不可用',expired:'登录已失效；原会话保留，当前不能采集',mismatch:'身份或保存状态不一致，未恢复登录'}[scenario];await page.getByText(expected,{exact:true}).waitFor();assert.equal(posts.length,1);await close();assert(await trigger.evaluate(e=>e===document.activeElement));
   if(scenario==='saved'){await page.getByText('1 个账号 · 1 个可用于只读采集',{exact:true}).waitFor();await page.screenshot({path:join(out,`saved-${narrow}.png`)});await page.getByRole('button',{name:'账号设置',exact:true}).click();assert(await page.getByLabel('别名',{exact:true}).isVisible());await page.getByLabel('别名',{exact:true}).fill('演示未保存修改');page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'归档账号',exact:true}).click();assert(await page.getByRole('dialog').isVisible());assert.equal(posts.length,1);page.once('dialog',d=>d.dismiss());await page.keyboard.press('Escape');assert(await page.getByRole('dialog').isVisible());page.once('dialog',d=>d.accept());await close();}
   if(scenario==='expired'){await page.getByText('登录已失效，请重新扫码。',{exact:true}).waitFor();assert(await page.getByRole('button',{name:'重新扫码',exact:true}).isVisible());}
  }else if(scenario==='offline'||scenario==='restricted'){
   await page.getByText('1 个账号 · 0 个可用于只读采集',{exact:true}).waitFor();if(scenario==='restricted')assert.equal(await page.getByRole('button',{name:'检查登录状态',exact:true}).count(),0);
  }else{
   const add=page.getByRole('button',{name:'添加账号',exact:true});await add.click();await page.getByRole('dialog').waitFor();const confirm=page.getByRole('button',{name:'确认并生成二维码',exact:true});await confirm.waitFor();assert(await confirm.isDisabled());assert.deepEqual(posts,['/accounts']);
   if(scenario==='empty'||scenario==='loading'){if(scenario==='empty'){const info=page.getByRole('button',{name:'本机保存与使用范围',exact:true});await info.click();const modal=page.getByRole('dialog',{name:'本机保存与使用范围',exact:true});await modal.waitFor();await page.waitForFunction(e=>{const r=e.getBoundingClientRect();return r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));},await modal.elementHandle(),{timeout:3000});await page.screenshot({path:join(out,`login-info-${narrow}.png`)});await page.mouse.click(4,4);await modal.waitFor({state:'hidden'});await page.waitForFunction(()=>document.activeElement.textContent==='本机保存与使用范围');assert.deepEqual(posts,['/accounts']);}await close();assert(await add.evaluate(e=>e===document.activeElement));await page.getByRole('button',{name:'扫码登录',exact:true}).click();assert.deepEqual(posts,['/accounts']);await close();}
   else{await page.getByRole('checkbox',{name:'我同意在此执行电脑保存本账号登录会话，用于扫码和身份核验',exact:true}).check();await confirm.click();if(scenario==='login-starting')await page.getByText('正在申请二维码…',{exact:true}).waitFor();await page.getByAltText('本次小红书登录二维码',{exact:true}).waitFor();
    if(scenario==='cancel'||scenario==='login-starting'){await close();await page.waitForTimeout(400);assert(posts.some(p=>p.endsWith('/login/cancel')));assert.equal(await page.getByAltText('本次小红书登录二维码').count(),0);}
    else{if(scenario==='login-save-proof')await page.getByText('登录已确认，正在保存到本机…',{exact:true}).waitFor();const expected={'login-save-proof':'平台登录已确认','login-expired':'二维码已过期','login-failed':'登录尝试失败，未绑定：此平台账号已绑定，不能重复绑定。','login-success':'平台登录已确认'}[scenario];await page.getByText(expected,{exact:true}).waitFor();assert.equal(await page.getByAltText('本次小红书登录二维码').count(),0);if(['login-success','login-save-proof'].includes(scenario)){await page.getByText(scenario==='login-save-proof'?'已保存到本机，下次可恢复登录。':'本机会话已登记，保存状态待检查。').waitFor();await page.screenshot({path:join(out,`login-${narrow}.png`)});}else assert(await page.getByRole('button',{name:'重新确认并获取新二维码',exact:true}).isDisabled());if(['login-success','login-save-proof'].includes(scenario)){await page.getByRole('button',{name:'返回账号',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});}else await close();}
   }
  }
  assert(!(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}))).includes('base64'));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert(!posts.some(p=>p.includes('/runs')||p.includes('semantic')||p.includes('contact')));report.checks.push(`${scenario} ${narrow?'390px':'desktop'}: protected manual flow, no implicit platform/collection calls`);console.log('PASS '+scenario+' '+narrow);await context.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.unexpected,[]);console.log('PASS '+report.checks.length+' account UI groups');
}finally{if(page&&!page.isClosed()){report.lastText=await page.locator('body').innerText();await page.screenshot({path:join(out,'failure.png')});}await browser?.close();await new Promise(ok=>server.close(ok));await writeFile(join(out,'checks.json'),JSON.stringify(report,null,2));console.log('Evidence: '+out);}
