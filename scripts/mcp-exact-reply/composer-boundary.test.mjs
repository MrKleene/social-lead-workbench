// Runs the exact embedded DOM reader on synthetic nodes only; no browser/account.
import test from 'node:test'; import assert from 'node:assert/strict'; import vm from 'node:vm'; import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('exact_reply_driver.go',import.meta.url),'utf8');
const js=src.match(/const exactReplySelectionGuard = `([\s\S]*?)`/)[1];
function fixture(o={}) {
 const writes=()=>{throw Error('unexpected DOM mutation')};
 const node=(x={})=>({id:'',className:'',textContent:'',tagName:'DIV',attributes:[],children:[],shown:true,getClientRects(){return this.shown?[{}]:[]},getAttribute(k){return this.attributes.find(a=>a.name===k)?.value??null},contains(){return false},matches(){return false},querySelectorAll(){return []},click:writes,focus:writes,dispatchEvent:writes,...x});
 const target=node({id:'comment-target'}),box=node(),edit=node({className:'content-edit',matches:s=>s==='.content-edit'});
 const marker=node({textContent:o.placeholder??'说点什么...',shown:!o.markerHidden}); const container=node(),bar=node(),header=node();
 const input=node({tagName:'P',id:o.wrongShape?'unknown':'content-textarea',textContent:o.text??'',shown:!o.hidden,attributes:[{name:'contenteditable',value:'true'}],parentElement:edit,closest:selector=>selector==='.engage-bar-container'?container:box,children:o.child?[node(o.child)]:[]});
 if(o.bound) box.attributes.push({name:'data-reply-to',value:'private-other-id'});
 if(o.boundClass) edit.className+=' reply-active';
 edit.children=[input,marker,...(o.extraChild?[node()]:[])]; edit.querySelectorAll=s=>s==='*'?[input,marker]:s==='.not-active.inner-when-not-active'?(o.noMarker?[]:[marker]):[];
 let authors=Array.from({length:o.authorCount??3},(_,i)=>node({tagName:i===1?'IMG':'A',attributes:[{name:'data-user-id',value:o.wrongAuthor&&i===1?'other':'author'}],closest:()=>target,matches:s=>s==='a.name'&&i===2}));
 if(o.nestedAuthor)authors.push(node({attributes:[{name:'data-user-id',value:'nested-other'}],closest:()=>({})}));
 if(o.secondName)authors.push(node({attributes:[{name:'data-user-id',value:'author'}],closest:()=>target,matches:s=>s==='a.name'}));
 const button=node({closest:()=>target,shown:!o.hiddenButton});
 target.shown=!o.hiddenTarget;
 target.querySelectorAll=s=>s==='[data-user-id]'?authors:s==='.right .interactions .reply'?Array.from({length:o.buttons??1},()=>button):[];
 container.querySelectorAll=selector=>selector==='p.content-input'?[input]:selector==='.engage-bar.active'?(o.noActiveBar?[]:[bar]):selector==='.reply-content'?(o.noHeader?[]:[header]):[];
 const document={activeElement:o.focused?input:null,querySelectorAll:s=>s==='#comment-target'?Array.from({length:o.targets??1},()=>target):s==='div.input-box p.content-input'?Array.from({length:o.editors??1},()=>input):s==='[contenteditable="true"]'?Array.from({length:o.allEditors??o.editors??1},()=>input):[]};
 return vm.runInNewContext('('+js+")('target','author',phase,content)",{phase:o.phase??'DEFAULT',content:o.content??'',document,getComputedStyle:e=>({visibility:e.shown?'visible':'hidden',display:e.shown?'block':'none'})},{timeout:500});
}
test('observed idle editor and three identical author elements are legitimate default structure',()=>{assert.equal(fixture(),'DEFAULT_EMPTY');assert.equal(fixture({child:{tagName:'BR'}}),'DEFAULT_EMPTY');assert.equal(fixture({nestedAuthor:true}),'DEFAULT_EMPTY')});
test('every nonzero draft is preserved including whitespace and invisible unicode',()=>{for(const text of ['draft',' ','\n','\u00a0','\u200b','\u200d','\ufeff','说点什么...']) assert.equal(fixture({text}),'COMPOSER_DRAFT_PRESENT');for(const child of [{tagName:'IMG'},{tagName:'SPAN'},{tagName:'BR',attributes:[{name:'x',value:'y'}]}])assert.equal(fixture({child}),'COMPOSER_DRAFT_PRESENT')});
test('hidden template, multiple editors, focus, bound target, non-default marker stop',()=>{for(const [o,code] of [[{hidden:true},'COMPOSER_HIDDEN'],[{editors:0},'COMPOSER_AMBIGUOUS'],[{editors:2},'COMPOSER_AMBIGUOUS'],[{allEditors:2},'COMPOSER_AMBIGUOUS'],[{focused:true},'COMPOSER_ACTIVE'],[{bound:true},'COMPOSER_TARGET_BOUND'],[{boundClass:true},'COMPOSER_TARGET_BOUND'],[{noMarker:true},'COMPOSER_NOT_DEFAULT'],[{markerHidden:true},'COMPOSER_NOT_DEFAULT'],[{placeholder:'回复 private nickname'},'COMPOSER_NOT_DEFAULT'],[{extraChild:true},'COMPOSER_UNRECOGNIZED'],[{wrongShape:true},'COMPOSER_UNRECOGNIZED']]) assert.equal(fixture(o),code)});
test('missing/hidden/duplicate target, conflicting author and ambiguous reply button stop',()=>{for(const [o,code] of [[{targets:0},'EXACT_TARGET_MISSING'],[{targets:2},'EXACT_TARGET_MISSING'],[{hiddenTarget:true},'EXACT_TARGET_NOT_VISIBLE'],[{wrongAuthor:true},'AUTHOR_MISMATCH'],[{authorCount:0},'AUTHOR_MISMATCH'],[{authorCount:2},'AUTHOR_AMBIGUOUS'],[{secondName:true},'AUTHOR_AMBIGUOUS'],[{buttons:2},'REPLY_BUTTON_AMBIGUOUS'],[{hiddenButton:true},'REPLY_BUTTON_AMBIGUOUS']]) assert.equal(fixture(o),code)});
test('selected empty editor requires active reply UI; filled editor must preserve exact content',()=>{
 const active={phase:'SELECTED',focused:true,noMarker:true};
 assert.equal(fixture(active),'ACTIVE_MATCH');
 for(const [overrides,code] of [[{focused:false},'COMPOSER_EDITOR_UNFOCUSED'],[{noHeader:true},'COMPOSER_HEADER_MISSING'],[{noActiveBar:true},'COMPOSER_BAR_INACTIVE'],[{noMarker:false},'COMPOSER_PLACEHOLDER_ACTIVE']])assert.equal(fixture({...active,...overrides}),code);
 assert.equal(fixture({...active,text:'draft'}),'COMPOSER_DRAFT_PRESENT');
 assert.equal(fixture({...active,phase:'FILLED',text:'exact',content:'exact'}),'ACTIVE_MATCH');
 assert.equal(fixture({...active,phase:'FILLED',text:'changed',content:'exact'}),'CONTENT_CHANGED');
});
test('readers never mutate; driver checks stable binding before typing and again before submit',()=>{
 assert.doesNotMatch(js,/\.click\(|\.focus\(|\.dispatchEvent\(|\bfetch\(|XMLHttpRequest|textContent\s*=/);
 const select=src.split('func (d *ExactReplyDriver) Select')[1].split('func (d *ExactReplyDriver) binding')[0];
 assert.match(select,/d\.Inspect\(ctx, c\)/);assert.match(select,/ctx\.Err\(\)/);
 assert.equal((select.match(/d.clickExactReply/g)||[]).length,1);
 assert.match(select,/emptyBinding:[\s\S]*d\.binding\(ctx, c, "EMPTY"\)/);
 assert.match(select,/matchedBinding:[\s\S]*d\.binding\(ctx, c, "MATCH"\)/);
 assert.match(select,/activeEmpty:[\s\S]*waitSelectedComposer[\s\S]*d\.composer\(ctx, c, "SELECTED"\)/);
 assert.match(select,/filled:[\s\S]*d\.composer\(ctx, c, "FILLED"\)/);
 const submit=src.split('func (d *ExactReplyDriver) Submit')[1].split('func exactObservation')[0];
 assert.ok(submit.indexOf('d.binding(ctx, c, "MATCH")')<submit.indexOf('humanize.Click'));
 assert.ok(submit.indexOf('d.composer(ctx, c, "FILLED")')<submit.indexOf('humanize.Click'));
 assert.equal((submit.match(/humanize.Click/g)||[]).length,1);
});
const bindingJS=src.match(/const exactReplyBindingGuard = `([\s\S]*?)`/)[1];
function binding(o={}){
 const target=o.empty?{}:{id:'target',userInfo:{userId:'author'},...(o.bound??{})};
 const note={noteDetailMap:{post:{note:{noteId:'post'}}},commentTarget:o.ref==='value'?{value:target}:o.ref==='raw'?{_rawValue:target}:target};
 if(o.missing)delete note.commentTarget;if(o.invalid)note.commentTarget=o.invalid;if(o.badPost)note.noteDetailMap.post.note.noteId='other';
 const window={location:{origin:o.origin??'https://www.xiaohongshu.com',pathname:o.path??'/explore/post'},__INITIAL_STATE__:o.noState?undefined:{note,user:{userInfo:{value:{userId:o.sender??'sender',guest:o.guest}}}}};
 const document={querySelector:()=>o.risk?{}:null};
 return vm.runInNewContext('('+bindingJS+")('post','target','author','sender')",{window,document},{timeout:500});
}
test('reviewed commentTarget binding requires exact stable ID/author plus current post and account',()=>{
 assert.equal(binding(),'MATCH');assert.equal(binding({empty:true}),'EMPTY');for(const ref of ['value','raw'])assert.equal(binding({ref}),'MATCH');assert.equal(binding({bound:{noteId:'post'}}),'MATCH');
 for(const [o,code] of [[{bound:{id:'other'}},'BINDING_TARGET_MISMATCH'],[{bound:{userInfo:{userId:'other'}}},'BINDING_AUTHOR_MISMATCH'],[{bound:{noteId:'other'}},'BINDING_POST_MISMATCH'],[{badPost:true},'BINDING_POST_MISMATCH'],[{path:'/explore/other'},'BINDING_POST_MISMATCH'],[{origin:'https://other.invalid'},'BINDING_POST_MISMATCH'],[{sender:'other'},'BINDING_ACCOUNT_MISMATCH'],[{guest:true},'BINDING_USER_MISSING'],[{missing:true},'BINDING_STATE_MISSING'],[{noState:true},'BINDING_STATE_MISSING'],[{invalid:[]},'BINDING_INVALID'],[{invalid:{nickname:'same author'}},'BINDING_INVALID'],[{risk:true},'BINDING_PLATFORM_BLOCKED']])assert.equal(binding(o),code);
});
test('binding never borrows targetComment or uses visible nickname; no raw fields or mutations returned',()=>{
 assert.equal(binding({bound:{id:'other',targetComment:{id:'target',userInfo:{userId:'author'}}}}),'BINDING_TARGET_MISMATCH');
 assert.doesNotMatch(bindingJS,/\.click\(|\.focus\(|\.dispatchEvent\(|\bfetch\(|XMLHttpRequest|\.commentTarget\s*=/);
 assert.doesNotMatch(bindingJS,/nickname|targetComment/);
});
test('initial pending phase only observes a pristine exact-target editor through rendering transitions',()=>{
 for(const o of [{},{focused:true},{focused:true,noHeader:true},{noActiveBar:true,markerHidden:true},{child:{tagName:'BR'}}])assert.equal(fixture({...o,phase:'BINDING_PENDING'}),'PENDING_EMPTY');
 for(const [o,code] of [[{text:' '},'COMPOSER_DRAFT_PRESENT'],[{text:'\u200b'},'COMPOSER_DRAFT_PRESENT'],[{child:{tagName:'IMG'}},'COMPOSER_DRAFT_PRESENT'],[{wrongAuthor:true},'AUTHOR_MISMATCH'],[{targets:2},'EXACT_TARGET_MISSING'],[{hidden:true},'COMPOSER_HIDDEN'],[{editors:2},'COMPOSER_AMBIGUOUS']])assert.equal(fixture({...o,phase:'BINDING_PENDING'}),code);
 const pipeline=src.split('func runReplySelect')[1].split('// At most')[0];assert.match(pipeline,/s\.click, s\.initialBinding, s\.activeEmpty, s\.input, s\.matchedBinding/);
 const select=src.split('func (d *ExactReplyDriver) Select')[1].split('func (d *ExactReplyDriver) binding')[0];assert.match(select,/initialBinding:[\s\S]*waitInitialReplyBinding[\s\S]*d\.binding\(ctx, c, "MATCH"\)/);
 assert.equal((select.match(/d.clickExactReply/g)||[]).length,1);assert.equal((select.match(/humanize.Type/g)||[]).length,1);
});

test('physical reply click verifies actual final hit, rejects frames and cannot jitter or repeat',()=>{
 const click=src.split('func (d *ExactReplyDriver) clickExactReply')[1].split('const exactReplyPointGuard')[0];
 assert.equal((click.match(/Mouse.Click/g)||[]).length,1);assert.doesNotMatch(click,/humanize|\.Select\(/);
 assert.ok(click.indexOf('p.Mouse.MoveTo')<click.lastIndexOf('check()'));assert.ok(click.indexOf('SELECT_POINT_VERIFIED')<click.lastIndexOf('check()'));assert.ok(click.indexOf('SELECT_POINT_VERIFIED')<click.indexOf('Mouse.Click'));
 const guard=src.match(/const exactReplyPointGuard = `([\s\S]*?)`/)[1];assert.match(guard,/elementFromPoint/);assert.match(guard,/window!==window.top/);assert.match(guard,/isConnected/);
 const observation=src.match(/const exactReplySelectionObservation = `([\s\S]*?)`/)[1];assert.doesNotMatch(observation,/\.click\(|\.focus\(|\.dispatchEvent\(|addEventListener|\bfetch\(|XMLHttpRequest|\.scroll|textContent\s*=/);
});
