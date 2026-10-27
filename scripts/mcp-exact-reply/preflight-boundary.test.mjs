// Executes the actual embedded read-only DOM function against synthetic DOM only.
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const source=read('exact_preflight_driver.go');const js=source.match(/const exactPreflightDOM = `([\s\S]*?)`/)[1];
function inspect({targetCount=1,author='recipient',nested=false,input='',inputCount=1,buttons=1}={}){
 let mutations=0;const mutation=()=>{mutations++;throw Error('write')};
 const target={id:'comment-target',querySelectorAll:s=>s==='[data-user-id]'?[{closest:()=>nested?{}:target,getAttribute:()=>author}]:Array.from({length:buttons},()=>({closest:()=>target,click:mutation}))};
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
