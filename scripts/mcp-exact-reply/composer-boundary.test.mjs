// Runs the exact embedded DOM reader on synthetic nodes only; no browser/account.
import test from 'node:test'; import assert from 'node:assert/strict'; import vm from 'node:vm'; import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('exact_reply_driver.go',import.meta.url),'utf8');
const js=src.match(/const exactReplySelectionGuard = `([\s\S]*?)`/)[1];
function fixture(o={}) {
 const writes=()=>{throw Error('unexpected DOM mutation')};
 const node=(x={})=>({id:'',className:'',textContent:'',tagName:'DIV',attributes:[],children:[],shown:true,getClientRects(){return this.shown?[{}]:[]},getAttribute(k){return this.attributes.find(a=>a.name===k)?.value??null},contains(){return false},matches(){return false},querySelectorAll(){return []},click:writes,focus:writes,dispatchEvent:writes,...x});
 const target=node({id:'comment-target'}),box=node(),edit=node({className:'content-edit',matches:s=>s==='.content-edit'});
 const marker=node({textContent:o.placeholder??'说点什么...',shown:!o.markerHidden});
 const input=node({tagName:'P',id:o.wrongShape?'unknown':'content-textarea',textContent:o.text??'',shown:!o.hidden,attributes:[{name:'contenteditable',value:'true'}],parentElement:edit,closest:()=>box,children:o.child?[node(o.child)]:[]});
 if(o.bound) box.attributes.push({name:'data-reply-to',value:'private-other-id'});
 if(o.boundClass) edit.className+=' reply-active';
 edit.children=[input,marker,...(o.extraChild?[node()]:[])]; edit.querySelectorAll=s=>s==='*'?[input,marker]:s==='.not-active.inner-when-not-active'?(o.noMarker?[]:[marker]):[];
 let authors=Array.from({length:o.authorCount??3},(_,i)=>node({tagName:i===1?'IMG':'A',attributes:[{name:'data-user-id',value:o.wrongAuthor&&i===1?'other':'author'}],closest:()=>target,matches:s=>s==='a.name'&&i===2}));
 if(o.nestedAuthor)authors.push(node({attributes:[{name:'data-user-id',value:'nested-other'}],closest:()=>({})}));
 if(o.secondName)authors.push(node({attributes:[{name:'data-user-id',value:'author'}],closest:()=>target,matches:s=>s==='a.name'}));
 const button=node({closest:()=>target,shown:!o.hiddenButton});
 target.shown=!o.hiddenTarget;
 target.querySelectorAll=s=>s==='[data-user-id]'?authors:s==='.right .interactions .reply'?Array.from({length:o.buttons??1},()=>button):[];
 const document={activeElement:o.focused?input:null,querySelectorAll:s=>s==='#comment-target'?Array.from({length:o.targets??1},()=>target):s==='div.input-box p.content-input'?Array.from({length:o.editors??1},()=>input):s==='[contenteditable="true"]'?Array.from({length:o.allEditors??o.editors??1},()=>input):[]};
 return vm.runInNewContext('('+js+")('target','author')",{document,getComputedStyle:e=>({visibility:e.shown?'visible':'hidden',display:e.shown?'block':'none'})},{timeout:500});
}
test('observed idle editor and three identical author elements are legitimate default structure',()=>{assert.equal(fixture(),'DEFAULT_EMPTY');assert.equal(fixture({child:{tagName:'BR'}}),'DEFAULT_EMPTY');assert.equal(fixture({nestedAuthor:true}),'DEFAULT_EMPTY')});
test('every nonzero draft is preserved including whitespace and invisible unicode',()=>{for(const text of ['draft',' ','\n','\u00a0','\u200b','\u200d','\ufeff','说点什么...']) assert.equal(fixture({text}),'COMPOSER_DRAFT_PRESENT');for(const child of [{tagName:'IMG'},{tagName:'SPAN'},{tagName:'BR',attributes:[{name:'x',value:'y'}]}])assert.equal(fixture({child}),'COMPOSER_DRAFT_PRESENT')});
test('hidden template, multiple editors, focus, bound target, non-default marker stop',()=>{for(const [o,code] of [[{hidden:true},'COMPOSER_HIDDEN'],[{editors:0},'COMPOSER_AMBIGUOUS'],[{editors:2},'COMPOSER_AMBIGUOUS'],[{allEditors:2},'COMPOSER_AMBIGUOUS'],[{focused:true},'COMPOSER_ACTIVE'],[{bound:true},'COMPOSER_TARGET_BOUND'],[{boundClass:true},'COMPOSER_TARGET_BOUND'],[{noMarker:true},'COMPOSER_NOT_DEFAULT'],[{markerHidden:true},'COMPOSER_NOT_DEFAULT'],[{placeholder:'回复 private nickname'},'COMPOSER_NOT_DEFAULT'],[{extraChild:true},'COMPOSER_UNRECOGNIZED'],[{wrongShape:true},'COMPOSER_UNRECOGNIZED']]) assert.equal(fixture(o),code)});
test('missing/hidden/duplicate target, conflicting author and ambiguous reply button stop',()=>{for(const [o,code] of [[{targets:0},'EXACT_TARGET_MISSING'],[{targets:2},'EXACT_TARGET_MISSING'],[{hiddenTarget:true},'EXACT_TARGET_NOT_VISIBLE'],[{wrongAuthor:true},'AUTHOR_MISMATCH'],[{authorCount:0},'AUTHOR_MISMATCH'],[{authorCount:2},'AUTHOR_AMBIGUOUS'],[{secondName:true},'AUTHOR_AMBIGUOUS'],[{buttons:2},'REPLY_BUTTON_AMBIGUOUS'],[{hiddenButton:true},'REPLY_BUTTON_AMBIGUOUS']]) assert.equal(fixture(o),code)});
test('no raw DOM text or mutation escapes reader; missing binding stops Select before UI actions',()=>{
 assert.doesNotMatch(js,/\.click\(|\.focus\(|\.dispatchEvent\(|\bfetch\(|XMLHttpRequest|textContent\s*=/);
 const select=src.split('func (d *ExactReplyDriver) Select')[1].split('func (d *ExactReplyDriver) Submit')[0];
 assert.doesNotMatch(select,/humanize\.|\.Click\(|\.Type\(|\.Input\(|\.Submit\(/);
 assert.match(select,/d\.Inspect\(ctx, c\)/);assert.match(select,/ctx\.Err\(\)/);assert.match(select,/COMPOSER_BINDING_UNVERIFIED/);
 assert.equal(typeof fixture({text:'private text'}),'string');
});
