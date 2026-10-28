// Executes the actual embedded read-only DOM function against synthetic DOM only.
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const source=read('exact_preflight_driver.go');const js=source.match(/const exactPreflightDOM = `([\s\S]*?)`/)[1];
function inspect({targetCount=1,author='recipient',nested=false,input='',inputCount=1,buttons=1,authorNodes=1}={}){
 let mutations=0;const mutation=()=>{mutations++;throw Error('write')};
 const target={id:'comment-target',querySelectorAll:s=>s==='[data-user-id]'?Array.from({length:authorNodes},(_,i)=>({closest:()=>nested?{}:target,getAttribute:()=>author,matches:s=>s==='a.name'&&i===authorNodes-1})):Array.from({length:buttons},()=>({closest:()=>target,click:mutation}))};
 const document={querySelectorAll:s=>s==='#comment-target'?Array.from({length:targetCount},()=>target):Array.from({length:inputCount},()=>({textContent:input,click:mutation,focus:mutation,dispatchEvent:mutation}))};
 const result=JSON.parse(vm.runInNewContext('('+js+")('target','recipient')",{document},{timeout:500}));assert.equal(mutations,0);return result;
}
test('DOM inspection matches only exact target/author/button and never edits even occupied composer',()=>{assert.deepEqual(inspect(),{target:'UNIQUE',author:'MATCH',replyButton:'EXACT',composer:'EMPTY'});assert.equal(inspect({input:'private draft'}).composer,'NONEMPTY')});
test('missing, duplicate, nested author and duplicate button never pass',()=>{assert.equal(inspect({targetCount:0}).target,'MISSING');assert.equal(inspect({targetCount:2}).target,'AMBIGUOUS');assert.equal(inspect({author:'wrong'}).author,'MISMATCH');assert.equal(inspect({nested:true}).author,'MISSING');assert.equal(inspect({buttons:2}).replyButton,'AMBIGUOUS')});
test('registered preflight has no call path to send engine; narrow driver has only read calls',()=>{
 const tools=read('exact_reply_tools.go'),block=tools.slice(tools.indexOf('Name: "workbench_reply_preflight"'),tools.indexOf('func registerExactReplyTools('));
 assert.match(block,/exactreply\.Preflight\(/);assert.match(block,/NewExactPreflightDriver/);assert.doesNotMatch(block,/\.Execute\(|NewExactReplyDriver|\.Select\(|\.Submit\(/);
 assert.doesNotMatch(source,/\.Select\(|\.Submit\(|humanize\.|\.Input\(|\.Click\(|\.Type\(/);
 const methods=[...source.matchAll(/func \(d \*ExactPreflightDriver\)\s+(\w+)/g)].map(x=>x[1]);assert.deepEqual(methods,['Inspect','Close']);
 assert.doesNotMatch(js,/\.click\(|\.focus\(|\.dispatchEvent\(|\bfetch\(|XMLHttpRequest|\.scroll|textContent\s*=/);
 const inspection=read('exact_reply_driver.go').split('func (d *ExactReplyDriver) Select')[0];assert.doesNotMatch(inspection,/humanize\.|\.Click\(|\.Input\(|\.Select\(|\.Submit\(/);
});
const pageSource=read('exact_preflight_page.go'),pageJS=pageSource.match(/const exactPreflightPage = `([\s\S]*?)`/)[1];
function pageProbe({href='https://www.xiaohongshu.com/explore/post?xsec_token=synthetic%2B%2F%3D&xsec_source=pc_feed',state={note:{noteDetailMap:{post:{note:{noteId:'post'}}}}},readyState='complete'}={}){return JSON.parse(vm.runInNewContext('('+pageJS+")('post','synthetic+/=','pc_feed')",{window:{location:{href},__INITIAL_STATE__:state},document:{readyState},URL},{timeout:500}));}
test('page diagnostics distinguish exact URL, redirect, missing/duplicate token without outputting it',()=>{const p=pageProbe();assert.equal(p.navigation,'EXACT_POST');assert.equal(p.token,'MATCH');assert.equal(p.entry,'PLAIN');assert.equal(pageProbe({href:'https://www.xiaohongshu.com/explore/post?xsec_source=pc_feed'}).token,'MISSING');assert.equal(pageProbe({href:'https://www.xiaohongshu.com/explore/post?xsec_token=x&xsec_token=y'}).token,'AMBIGUOUS');assert.equal(pageProbe({href:'https://www.xiaohongshu.com/explore'}).navigation,'OTHER_ROUTE');assert.equal(pageProbe({href:'https://xhslink.com/a/test'}).navigation,'EXTERNAL_ORIGIN');assert.doesNotMatch(JSON.stringify(p),/synthetic|https|noteId/);});
test('page diagnostics preserve unsupported ref evidence without adopting an alternative',()=>{assert.equal(pageProbe({state:{note:{value:{noteDetailMap:{post:{}}}}}}).note,'VALUE_REF');assert.equal(pageProbe({state:{note:{value:{noteDetailMap:{post:{}}}}}}).map,'MISSING');assert.equal(pageProbe({state:{note:{noteDetailMap:{_value:{post:{}}}}}}).map,'UNSUPPORTED_REF');assert.equal(pageProbe({state:{note:{noteDetailMap:{_value:{post:{}}}}}}).entry,'MISSING');assert.equal(pageProbe({state:{note:{noteDetailMap:{value:{post:{}}}}}}).entry,'PLAIN');assert.equal(pageProbe({state:{note:{noteDetailMap:{}}}}).entry,'MISSING');});
test('readiness probe and loop do not navigate or mutate the page or enumerate private state',()=>{assert.doesNotMatch(pageJS,/\.click\(|\.focus\(|\.dispatchEvent\(|\bfetch\(|XMLHttpRequest|\.scroll|Object\.keys|Object\.entries|\.href\s*=/);const loop=read('exactreply/preflight_page.go');assert.doesNotMatch(loop,/\.Select\(|\.Submit\(|\.Navigate\(|\.Reload\(/);assert.match(loop,/n <= 12|n<=12/);});

test('preflight accepts reviewed avatar plus image plus one name for same author',()=>assert.equal(inspect({authorNodes:3}).author,'MATCH'));
