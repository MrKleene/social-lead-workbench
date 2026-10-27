import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const read=f=>readFileSync(new URL(f,import.meta.url),'utf8'),src=read('restriction_inspection_driver.go'),js=src.match(/const restrictionInspectionDOM = `([\s\S]*?)`/)[1];
function inspect(o={}){
 const rect={x:10,y:10,width:300,height:100,bottom:110,right:310,top:10,left:10};
 const node=(text)=>({innerText:text,textContent:text,tagName:'DIV',contains:()=>false,value:'',getBoundingClientRect:()=>rect,getAttribute:()=>'/user/profile/'+(o.self??'a'.repeat(24)),click(){throw Error('write')},focus(){throw Error('write')}});
 const warning=node(o.warning||'');if(o.hidden)warning.getBoundingClientRect=()=>({...rect,width:0});
 const document={title:o.title??'小红书',readyState:'complete',body:{},elementFromPoint:()=>o.occluded?node('overlay'):warning,querySelectorAll:s=>s==='.login-container'?(o.login?[node('请重新登录')]:[]):s==='.user-page .ban .content'?(o.profileWarning?[warning]:[]):s==='.qrcode-img,.login-qrcode,[data-qr-code]'?(o.qr?[{...node(''),getBoundingClientRect:()=>o.qrHidden?{...rect,width:0}:rect}]:[]):s==='img,canvas,video,iframe'?(o.media?[node('')]:[]):s==='a[href*="/user/profile/"]'?(o.noSelf?[]:[node('我')]):s==='input,textarea,[contenteditable="true"]'?(o.draft?[{...node('private draft'),value:'private draft',getBoundingClientRect:()=>o.draftOutside?{...rect,x:600,left:600,right:700,width:100}:rect}]:[]):o.warning&&!o.profileWarning?[warning]:[],querySelector:()=>o.qr?{}:null,createTreeWalker:()=>{let n=0;return {nextNode:()=>++n<=(o.scanLimit?1501:o.regionSecret?1:0),currentNode:{parentElement:node(''),textContent:o.regionSecret?'synthetic-only':'ordinary'}}}};
 const state=o.noState?undefined:{user:{userInfo:{value:{userId:o.sender??'a'.repeat(24),guest:!!o.guest}}}};
 return JSON.parse(vm.runInNewContext('('+js+")(post,sender,'synthetic-only')",{post:'b'.repeat(24),sender:'a'.repeat(24),document,window:{__INITIAL_STATE__:state},location:{origin:o.origin??'https://www.xiaohongshu.com',pathname:o.path??'/explore/'+'b'.repeat(24)},innerWidth:800,innerHeight:600,getComputedStyle:()=>({visibility:'visible',display:'block'}),URL,NodeFilter:{SHOW_TEXT:4}},{timeout:500}));
}
test('same saved-session identity is checked by stable IDs, conflicts never pass',()=>{assert.equal(inspect().identity,'MATCH');assert.equal(inspect({sender:'c'.repeat(24)}).identity,'MISMATCH');assert.equal(inspect({self:'c'.repeat(24)}).identity,'MISMATCH');assert.equal(inspect({noSelf:true,noState:true}).identity,'UNKNOWN');});
test('visible UI restriction is returned, hidden notices are ignored and unrelated comment text is not scanned',()=>{assert.equal(inspect({warning:'账号已被封禁'}).warnings[0].code,'BANNED');assert.equal(inspect({warning:'账号已被封禁',hidden:true}).warnings.length,0);assert.equal(inspect({title:'评论里有人说封禁'}).warnings.length,0);for(const [warning,code] of [['已被禁言','MUTED'],['请完成安全验证','VERIFICATION'],['操作频繁','RATE_LIMITED'],['评论已关闭','COMMENT_RESTRICTED'],['内容审核中','REVIEW_PENDING'],['仅自己可见','VISIBILITY_RESTRICTED']])assert.equal(inspect({warning}).warnings[0].code,code);});
test('capture is bounded, query omitted, draft/QR/secret notice detected without copying private content',()=>{assert.equal(inspect().pathname,'/explore/[POST]');assert.equal(inspect({origin:'https://external.invalid'}).pathname,'/[EXTERNAL_ORIGIN]');assert.equal(inspect({draft:true}).sensitiveUI,true);assert.equal(inspect({qr:true}).sensitiveUI,true);assert.equal(inspect({warning:'封禁 synthetic-only'}).sensitiveUI,true);assert.doesNotMatch(JSON.stringify(inspect({draft:true})),/private draft/);assert.ok(inspect().clip.width<=1280);assert.deepEqual(inspect().screenshotReasons,['NO_SAFE_REGION']);assert.deepEqual(inspect({warning:'账号被封禁 synthetic-only'}).screenshotReasons,['NOTICE_SENSITIVE_TEXT']);});
test('inspection call graph has no sending, input, cookie or page mutation primitive',()=>{assert.doesNotMatch(src,/\.Select\(|\.Submit\(|humanize\.|\.Input\(|\.Click\(|\.Type\(|\.Reload\(|SaveCookies|SetCookies/);assert.doesNotMatch(js,/\.click\(|\.focus\(|\.dispatchEvent\(|\bfetch\(|XMLHttpRequest|\.scroll|textContent\s*=/);assert.match(src,/Screenshot\(false,/);assert.equal((src.match(/\.Navigate\(/g)||[]).length,1);const methods=[...src.matchAll(/func \(d \*RestrictionInspectionDriver\) (\w+)/g)].map(x=>x[1]);assert.deepEqual(methods,['Inspect','Close']);const tools=read('exact_reply_tools.go').split('func registerRestrictionInspectionTool')[1].split('func registerExactPreflightTool')[0];assert.doesNotMatch(tools,/\.Execute\(|NewExactReplyDriver|registerExactReplyTools/);const build=read('build.mjs');assert.match(build,/CRM_ACCOUNT_INSPECTION_ONLY.*registerRestrictionInspectionTool\(server\); return/);assert.match(build,/CRM_ACCOUNT_INSPECTION_ONLY.*return router/);});
test('console/network observation keeps only counts, never arguments, URLs, headers or bodies',()=>{assert.doesNotMatch(src,/e\.Args|e\.ErrorText|e\.RequestID|RequestWillBeSent|ResponseReceived|GetResponseBody/);assert.match(src,/consoleErrors\.Add\(1\) >= 32/);assert.match(src,/networkFailures\.Add\(1\) >= 32/);});

test('safe warning crop excludes outside draft and ignores hidden QR without weakening visible protection',()=>{const safe=inspect({warning:'账号封禁',draft:true,draftOutside:true,qr:true,qrHidden:true});assert.deepEqual(safe.screenshotReasons,[]);assert.equal(safe.scope,'VISIBLE_WARNING');assert.equal(safe.clip.width,300);assert.deepEqual(inspect({warning:'账号封禁',qr:true}).screenshotReasons,['VISIBLE_QR']);});
test('media, region secret and scan-limit protections have specific auditable subcodes',()=>{for(const [options,reason] of [[{media:true},'UNVERIFIED_MEDIA'],[{regionSecret:true},'REGION_SENSITIVE_TEXT'],[{scanLimit:true},'TEXT_SCAN_LIMIT']])assert.ok(inspect({warning:'账号封禁',...options}).screenshotReasons.includes(reason));});

test('observed account profile ban is recognized only on exact sender profile and remains distinct from login limits',()=>{
 const warning='接相关投诉该账户违反 《社区规范》 其内容无法查看';
 const result=inspect({warning,profileWarning:true,path:'/user/profile/'+'a'.repeat(24)});
 assert.equal(result.pathname,'/user/profile/[SENDER]');assert.equal(result.warnings[0].code,'ACCOUNT_CONTENT_RESTRICTED');assert.equal(result.warnings[0].text,warning);
 assert.equal(inspect({warning,profileWarning:true,path:'/user/profile/'+'c'.repeat(24)}).warnings.length,0);
 assert.equal(inspect({warning:'电脑设备登录超限，请重新登录'}).warnings[0].code,'SESSION_LIMIT');
 assert.ok(inspect({warning,profileWarning:true,path:'/user/profile/'+'a'.repeat(24),login:true}).screenshotReasons.includes('LOGIN_CHALLENGE'));
 assert.ok(inspect({warning,occluded:true}).screenshotReasons.includes('OCCLUDED_NOTICE'));
});
test('profile navigation requires a same-origin exact self link and never visits notification or submit paths',()=>{
 assert.equal(inspect().selfProfile,true);assert.equal(inspect({noSelf:true}).selfProfile,false);
 assert.match(src,/profileNavigationAllowed\(dom\)/);assert.match(src,/step\s*<\s*2/);
 assert.doesNotMatch(src,/Navigate\([^)]*(?:notification|chat|publish)/);
});

test('send driver checks identity-bound profile before post navigation and persists safe text before any editor work',()=>{
 const driver=read('exact_reply_driver.go');const state=driver.split('func (d *ExactReplyDriver) state')[1].split('func exactComments')[0];
 assert.ok(state.indexOf('d.profileRestrictions(ctx, c)')<state.indexOf('p.Navigate(exactURL(c))'));
 assert.match(driver,/NewRestrictionInspectionDriver\(d.page, func\(\) \{\}\)/);
 assert.match(driver,/inspector.textOnly = true/);
 const block=src.split('if d.textOnly {')[1].split('// No recovery')[0];assert.match(block,/RecordRestriction/);assert.doesNotMatch(block,/Screenshot\(/);
 assert.match(src,/RecordStage\(ctx, "NAVIGATION_INTENT"/);
});
