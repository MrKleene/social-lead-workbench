import {describe,it,expect,vi} from 'vitest';
import {z} from 'zod';
import {safeCollectionDiagnostic,safeAvatarSourceDiagnostic,safeImageDiagnostics} from '@crm/contracts';
import {XhsMcpAdapter} from '../src/collection/adapters/xhs-mcp';
import {collect} from '../src/collection/collector';
import {diagnose,logCollectionDiagnostic} from '../src/collection/diagnostics';
import {ReadFailure,limits} from '../src/collection/contract';
const secret='FAKE_SECRET_SENTINEL https://invalid.test/?token=FAKE_COOKIE_SENTINEL';
const envelope=(x:unknown)=>({content:[{type:'text',text:JSON.stringify(x)}]});
const comment={id:'c1',content:'合成评论',userInfo:{userId:'u1',nickname:'合成用户'}};
const detail=(list:unknown[])=>({data:{note:{noteId:'p1',title:'合成帖子'},comments:{list}}});
const config={name:'隔离测试',platform:'XHS' as const,mode:'XHS_MCP' as const,keywords:['合成搜索'],excludeWords:[],batchLimit:1,enabled:true};
function reader(response:unknown,second?:unknown){let details=0;const call=vi.fn(async(name:string)=>{if(name==='check_login_status')return {content:[{type:'text',text:'✅ 已登录\n合成用户'}]};if(name==='search_feeds')return envelope({feeds:[{id:'p1',xsecToken:secret},{id:'p2',xsecToken:secret}]});return ++details===1?response:second??response;});return {adapter:new XhsMcpAdapter({call},true),call};}
async function run(response:unknown){return collect(reader(response).adapter,config,async()=>false,{...limits,callMs:1000});}
describe('safe collection failure diagnostics',()=>{
 it('valid returned window remains partial',async()=>{const r=await run(envelope(detail([comment])));expect(r.status).toBe('PARTIAL');expect(r.reason).toBe('MCP_WINDOW_ONLY');expect(r.diagnostic).toBeUndefined();});
 it('exact duplicate roots and nested replies are deduplicated',async()=>{const child={...comment,id:'reply'},root={...comment,subComments:[child,child]};const r=await run(envelope(detail([root,root])));expect(r.status).toBe('PARTIAL');expect(r.posts[0].comments).toHaveLength(2);});
 it.each(['content','identity','parent','children'])('conflicting %s is never swallowed',async field=>{let list:unknown[];if(field==='content')list=[comment,{...comment,content:'变更'}];else if(field==='identity')list=[comment,{...comment,userInfo:{...comment.userInfo,userId:'other'}}];else if(field==='parent')list=[comment,{...comment,id:'parent',subComments:[comment]}];else list=[{...comment,subComments:[{...comment,id:'reply'}]},{...comment,subComments:[]}];const r=await run(envelope(detail(list)));expect(r).toMatchObject({status:'FAILED',reason:'INVALID_DATA',diagnostic:{stage:'post',kind:'DUPLICATE_CONFLICT',field:'id',postOrdinal:1}});expect(r.posts).toEqual([]);});
 it('missing user fields expose only controlled field name',async()=>{const r=await run(envelope(detail([{...comment,userInfo:{nickname:secret}}])));expect(r.diagnostic).toMatchObject({stage:'post',kind:'SCHEMA_VALIDATION',field:'userInfo.userId'});expect(JSON.stringify(r)).not.toContain('FAKE_SECRET');});
 it.each(['',' \t\n','护理 👩🏽‍🎓 e\u0301 العربية 日本語','😀'.repeat(5000)])('preserves valid text verbatim (%#), including empty parents and replies',async content=>{
  const child={...comment,id:'reply',content},root={...comment,content,subComments:[child,child]};
  const r=await run(envelope(detail([root,root,{...comment,id:'other'}])));
  expect(r).toMatchObject({status:'PARTIAL',reason:'MCP_WINDOW_ONLY'});expect(r.posts[0].comments).toHaveLength(3);
  expect(r.posts[0].comments.find(c=>c.id==='c1')).toMatchObject({text:content,hasReplies:true});
  expect(r.posts[0].comments.find(c=>c.id==='reply')).toMatchObject({text:content,parentId:'c1'});
 });
 it.each([undefined,null,1,{},[],true])('missing or invalid comment text stays fatal (%#)',async content=>{
  const r=await run(envelope(detail([comment,{...comment,id:'bad',content}])));
  expect(r).toMatchObject({status:'FAILED',reason:'INVALID_DATA',posts:[],diagnostic:{stage:'post',kind:'SCHEMA_VALIDATION',field:'content',validationReason:content===undefined?'MISSING':'WRONG_TYPE'}});
 });
 it('overlong text is never truncated; only safe type/length crosses the logging boundary',async()=>{
  const content=secret.repeat(200),r=await run(envelope(detail([{...comment,content}])));
  expect(r).toMatchObject({status:'FAILED',posts:[],diagnostic:{field:'text',validationReason:'TOO_LONG',actualType:'string',textLength:content.length,postOrdinal:1}});
  const log=vi.spyOn(console,'warn').mockImplementation(()=>{});try{logCollectionDiagnostic('cmvje155o000fi44p0cvv60tp',r.diagnostic);expect(JSON.stringify(log.mock.calls)).not.toContain(secret);expect(JSON.stringify(log.mock.calls)).toContain('TOO_LONG');}finally{log.mockRestore();}
 });
 it.each(['', ' \n', undefined, null])('media-only/optional post body is accepted without invented text (%#)',async desc=>{
  const data=detail([comment]);const r=await run(envelope({...data,data:{...data.data,note:{noteId:'p1',title:'',desc,imageList:[{urlDefault:'https://sns-webpic-qc.xhscdn.com/fictional-cover'}]}}}));
  expect(r.status).toBe('PARTIAL');expect(r.posts[0].post.body).toBe(desc??undefined);
 });
 it.each([42,{},[],true,'帖'.repeat(20001)])('invalid or oversized post body is rejected (%#)',async desc=>{
  const data=detail([comment]);const r=await run(envelope({...data,data:{...data.data,note:{...data.data.note,desc}}}));
  expect(r).toMatchObject({status:'FAILED',posts:[],diagnostic:{field:'data.note.desc',validationReason:typeof desc==='string'?'TOO_LONG':'WRONG_TYPE'}});
 });
 it('empty content does not make a restriction payload or missing identity valid',async()=>{
  for(const response of [{error:'LOGIN_REQUIRED',content:''},{data:{note:{},comments:{list:[{content:''}]}}}])expect((await run(envelope(response))).status).toBe('FAILED');
  expect((await run(envelope(detail([{...comment,content:'',subComments:[{...comment,content:'different'}]}])))).diagnostic?.kind).toBe('DUPLICATE_CONFLICT');
 });
 it('second post text fault preserves earlier checkpoints and its precise safe reason',async()=>{
  const bad=detail([{...comment,content:'x'.repeat(10001)}]);bad.data.note.noteId='p2';
  const {adapter}=reader(envelope(detail([{...comment,content:''}])),envelope(bad));const saved=new Map();
  const r=await collect(adapter,{...config,batchLimit:2},async()=>false,{...limits,callMs:1000},async progress=>{for(const p of progress.posts)saved.set(p.post.id,structuredClone(p));});
  expect(saved.size).toBe(1);expect(saved.get('p1').comments[0].text).toBe('');
  expect(r).toMatchObject({status:'FAILED',discarded:true,posts:[],diagnostic:{field:'text',validationReason:'TOO_LONG',textLength:10001,postOrdinal:2}});
 });
 it('wrong post ownership stays fatal',async()=>{expect((await run(envelope(detail([{...comment,noteId:'other'}])))).diagnostic).toMatchObject({kind:'IDENTITY_CONFLICT',field:'noteId'});});
 it('invalid JSON reports parsing without the payload',async()=>{const r=await run({content:[{type:'text',text:secret}]});expect(r.diagnostic).toMatchObject({kind:'JSON_PARSE',stage:'post'});expect(JSON.stringify(r)).not.toContain(secret);});
 it('unrecognized upstream error and empty response remain distinct',async()=>{expect((await run({isError:true,content:[{type:'text',text:secret}]})).diagnostic?.kind).toBe('UPSTREAM_ERROR');expect((await run({content:[]})).diagnostic?.kind).toBe('EMPTY_RESPONSE');});
 it('second post failure preserves completed checkpoints but fails final matching',async()=>{const {adapter}=reader(envelope(detail([comment])),envelope({data:{note:{title:secret},comments:{list:[{content:secret}]}}}));const saved=new Map();const r=await collect(adapter,{...config,batchLimit:2},async()=>false,{...limits,callMs:1000},async progress=>{for(const p of progress.posts)saved.set(p.post.id,structuredClone(p));});expect(saved.size).toBe(1);expect(saved.get('p1').comments).toHaveLength(1);expect(r).toMatchObject({status:'FAILED',discarded:true,posts:[],diagnostic:{stage:'post',postOrdinal:2,kind:'SCHEMA_VALIDATION',field:'id'}});});
 it('authorization check exceptions are separated from upstream data',async()=>{const {adapter}=reader(envelope(detail([comment])));const r=await collect(adapter,config,async()=>{throw new Error(secret);});expect(r.diagnostic).toMatchObject({stage:'authorization',kind:'UNEXPECTED_FAILURE'});expect(JSON.stringify(r)).not.toContain(secret);});
 it('archive callback failure is distinct and does not log database exception',async()=>{const {adapter}=reader(envelope(detail([comment])));const r=await collect(adapter,config,async()=>false,limits,async()=>{throw new Error(secret);});expect(r.diagnostic).toMatchObject({stage:'checkpoint',kind:'CHECKPOINT_FAILURE'});expect(JSON.stringify(r)).not.toContain(secret);});
 it.each([['未登录','LOGIN_EXPIRED'],['频繁','RATE_LIMITED'],['验证码','RESTRICTED'],['超时','TIMEOUT']])('platform %s is not converted to data corruption',async(text,reason)=>{const r=await run({isError:true,content:[{type:'text',text}]});expect(r.reason).toBe(reason);expect(r.diagnostic?.kind).toBe('READ_FAILURE');});
 it('budget stays partial and does not retry',async()=>{const {adapter,call}=reader(envelope(detail([comment])));const r=await collect(adapter,config,async()=>false,{...limits,requests:2});expect(r).toMatchObject({status:'PARTIAL',reason:'BUDGET'});expect(call).toHaveBeenCalledTimes(2);});
 it('hostile error messages and schema paths never enter diagnostic logs',()=>{const err=new z.ZodError([{code:'custom',path:[secret],message:secret}]);const d=diagnose(err,'post',2,8);expect(d.field).toBe('unknown');const log=vi.spyOn(console,'warn').mockImplementation(()=>{});try{logCollectionDiagnostic(secret,d);logCollectionDiagnostic('cmvje155o000fi44p0cvv60tp',{...d,raw:secret});expect(log).toHaveBeenCalledTimes(1);expect(JSON.stringify(log.mock.calls)).not.toContain(secret);expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({task:'unknown',diagnostic:d});}finally{log.mockRestore();}});
 it('rejects forged diagnostic enum and extra keys',()=>{expect(safeCollectionDiagnostic({version:1,stage:secret,kind:'JSON_PARSE'})).toBeUndefined();expect(safeCollectionDiagnostic({version:1,stage:'post',kind:'JSON_PARSE',token:secret})).toBeUndefined();expect(safeCollectionDiagnostic({version:1,stage:'post',kind:'SCHEMA_VALIDATION',validationReason:secret})).toBeUndefined();expect(safeCollectionDiagnostic({version:1,stage:'post',kind:'SCHEMA_VALIDATION',textLength:Infinity})).toBeUndefined();const error=new ReadFailure('INVALID_DATA',undefined,{version:1,stage:'post',kind:secret} as never);expect(diagnose(error,'comments').kind).toBe('READ_FAILURE');});
});


describe('pre-serialization MCP avatar diagnostic receiver (mock only)',()=>{
 const aggregate={version:1,status:'OK',truncated:false,roots:1,replies:0,fields:[{group:'FIXED_AVATAR',shape:'EMPTY_STRING',count:1}],conversion:[{state:'EMPTY_AFTER_DECODE',count:1}]};
 it('retains safe counts in existing post metadata without changing content or identity',async()=>{
  const original=detail([comment]),withDiagnostic={data:{...original.data,avatarSourceDiagnostic:aggregate}};
  const old=await run(envelope(original)),next=await run(envelope(withDiagnostic));
  expect(next.status).toBe(old.status);expect(next.posts[0].post.imageDiagnostics?.avatarSource).toEqual(aggregate);
  const {imageDiagnostics:a,...textA}=old.posts[0].post,{imageDiagnostics:b,...textB}=next.posts[0].post;
  expect(textB).toEqual(textA);expect(next.posts[0].comments).toEqual(old.posts[0].comments);
  expect(safeImageDiagnostics(next.posts[0].post.imageDiagnostics)?.avatarSource).toEqual(aggregate);
 });
 it.each([undefined,null,{...aggregate,url:secret},{...aggregate,fields:[{group:secret,shape:'EMPTY_STRING',count:1}]},{...aggregate,fields:[{group:'FIXED_AVATAR',shape:'EMPTY_STRING',count:1,url:secret}]},{...aggregate,roots:1001},{...aggregate,conversion:[...aggregate.conversion,...aggregate.conversion]}])('drops absent/malformed diagnostics without rejecting valid comments (%#)',async diagnostic=>{
  expect(safeAvatarSourceDiagnostic(diagnostic)).toBeUndefined();const original=detail([comment]);
  const result=await run(envelope({data:{...original.data,avatarSourceDiagnostic:diagnostic}}));
  expect(result.status).toBe('PARTIAL');expect(result.posts[0].post.imageDiagnostics?.avatarSource).toBeUndefined();expect(JSON.stringify(result)).not.toContain(secret);
 });
});

import {avatarDiagnosticV2} from './fixtures/avatar-diagnostic-v2';
describe('v2 avatar structural evidence (synthetic only)',()=>{
 it('round trips safe candidate names, roles and classes without mapping them or changing content',async()=>{
  const original=detail([comment]),old=await run(envelope(original)),next=await run(envelope({data:{...original.data,avatarSourceDiagnostic:avatarDiagnosticV2}}));
  expect(safeAvatarSourceDiagnostic(avatarDiagnosticV2)).toEqual(avatarDiagnosticV2);
  expect(next.posts[0].post.imageDiagnostics?.avatarSource).toEqual(avatarDiagnosticV2);expect(next.posts[0].comments).toEqual(old.posts[0].comments);
  const {semanticSnapshot,snapshotHash}=await import('../src/collection/semantic-evaluator');
  const a=semanticSnapshot(old.posts[0].post,old.posts[0].comments[0],undefined,false,false),b=semanticSnapshot(next.posts[0].post,next.posts[0].comments[0],undefined,false,false);expect(b).toEqual(a);expect(snapshotHash(b)).toBe(snapshotHash(a));
 });
 it.each([
  {...avatarDiagnosticV2,token:secret},
  {...avatarDiagnosticV2,candidates:[{...avatarDiagnosticV2.candidates[0],name:'imageSecret'}]},
  {...avatarDiagnosticV2,candidates:[{...avatarDiagnosticV2.candidates[0],name:'image'+secret}]},
  {...avatarDiagnosticV2,candidates:[{...avatarDiagnosticV2.candidates[0],url:secret}]},
  {...avatarDiagnosticV2,candidates:[{...avatarDiagnosticV2.candidates[0],protocol:secret}]},
  {...avatarDiagnosticV2,candidates:[{...avatarDiagnosticV2.candidates[0],count:2}]},
  {...avatarDiagnosticV2,candidates:[{...avatarDiagnosticV2.candidates[0],shape:'NULL'}]},
  {...avatarDiagnosticV2,candidates:Array(257).fill(avatarDiagnosticV2.candidates[0])},
  {...avatarDiagnosticV2,transitions:[]},
  {...avatarDiagnosticV2,filtered:[{role:'ROOT',reason:secret,count:1}]},
 ])('rejects unsafe/inconsistent v2 without dropping comments (%#)',async diagnostic=>{
  expect(safeAvatarSourceDiagnostic(diagnostic)).toBeUndefined();
  const r=await run(envelope({data:{...detail([comment]).data,avatarSourceDiagnostic:diagnostic}}));expect(r.status).toBe('PARTIAL');expect(r.posts[0].post.imageDiagnostics?.avatarSource).toBeUndefined();expect(JSON.stringify(r)).not.toContain(secret);
 });
});


describe('mapped comment avatar provenance (synthetic MCP responses only)',()=>{
 const url='https://sns-avatar-qc.xhscdn.com/avatar/synthetic.jpg';
 it('preserves roots/replies and optional provenance without changing semantic inputs',async()=>{
  const root={...comment,userInfo:{...comment.userInfo,avatar:url,avatarSource:'image'},subComments:[{...comment,id:'reply',userInfo:{...comment.userInfo,avatar:url,avatarSource:'avatar'}}]};
  const r=await run(envelope(detail([root])));expect(r.status).toBe('PARTIAL');
  expect(r.posts[0].comments.map(c=>c.imageDiagnostics?.authorAvatar?.sourceField)).toEqual(['image','avatar']);
  expect(r.posts[0].comments[1].parentId).toBe('c1');
  const {semanticSnapshot,snapshotHash}=await import('../src/collection/semantic-evaluator');
  const original=r.posts[0].comments[0],changed={...original,imageDiagnostics:{authorAvatar:{...original.imageDiagnostics!.authorAvatar!,sourceField:'avatar' as const}}};
  const a=semanticSnapshot(r.posts[0].post,original,undefined,false,false),b=semanticSnapshot(r.posts[0].post,changed,undefined,false,false);
  expect(a).toEqual(b);expect(snapshotHash(a)).toBe(snapshotHash(b));expect(JSON.stringify(a)).not.toContain(url);expect(JSON.stringify(a)).not.toContain('sourceField');
  expect(safeImageDiagnostics(original.imageDiagnostics)?.authorAvatar?.sourceField).toBe('image');
 });
 it('metadata source changes do not create a duplicate conflict',async()=>{
  const r=await run(envelope(detail(['avatar','image'].map(avatarSource=>({...comment,userInfo:{...comment.userInfo,avatar:url,avatarSource}})))));
  expect(r.status).toBe('PARTIAL');expect(r.posts[0].comments).toHaveLength(1);
 });
 it.each([undefined,null,42,secret,{}])('ignores unsupported provenance without discarding comments (%#)',async avatarSource=>{
  const r=await run(envelope(detail([{...comment,userInfo:{...comment.userInfo,avatar:url,avatarSource}}])));
  expect(r.status).toBe('PARTIAL');expect(r.posts[0].comments[0].authorAvatarUrl).toBe(url);expect(r.posts[0].comments[0].imageDiagnostics?.authorAvatar?.sourceField).toBeUndefined();expect(JSON.stringify(r)).not.toContain(secret);
 });
 it.each([url+'?signature=FAKE_SECRET',url+'#FAKE_SECRET','http://sns-avatar-qc.xhscdn.com/avatar/FAKE_SECRET','https://evil.invalid/avatar/FAKE_SECRET'])('provenance never bypasses URL safety (%#)',async avatar=>{
  const r=await run(envelope(detail([{...comment,userInfo:{...comment.userInfo,avatar,avatarSource:'image'}}])));
  expect(r.status).toBe('PARTIAL');expect(r.posts[0].comments[0].authorAvatarUrl).toBeUndefined();expect(r.posts[0].comments[0].imageDiagnostics?.authorAvatar?.sourceField).toBe('image');expect(JSON.stringify(r)).not.toContain('FAKE_SECRET');
 });
});


import {avatarDiagnosticUrlReasons} from './fixtures/avatar-diagnostic-v2';
describe('optional URL restriction facts (synthetic only)',()=>{
 it('accepts legacy v2 and carries specific facts through the adapter without affecting LLM input',async()=>{
  expect(safeAvatarSourceDiagnostic(avatarDiagnosticV2)).toEqual(avatarDiagnosticV2);
  expect(safeAvatarSourceDiagnostic(avatarDiagnosticUrlReasons)).toEqual(avatarDiagnosticUrlReasons);
  const old=await run(envelope(detail([comment]))),r=await run(envelope({data:{...detail([comment]).data,avatarSourceDiagnostic:avatarDiagnosticUrlReasons}}));
  expect(r.posts[0].post.imageDiagnostics?.avatarSource).toEqual(avatarDiagnosticUrlReasons);
  const {semanticSnapshot,snapshotHash}=await import('../src/collection/semantic-evaluator');
  expect(snapshotHash(semanticSnapshot(r.posts[0].post,r.posts[0].comments[0],undefined,false,false))).toBe(snapshotHash(semanticSnapshot(old.posts[0].post,old.posts[0].comments[0],undefined,false,false)));
 });
 it.each([
  {restrictions:{query:true}},
  {restrictions:{...avatarDiagnosticUrlReasons.candidates[0].restrictions,query:secret}},
  {restrictions:{...avatarDiagnosticUrlReasons.candidates[0].restrictions,url:secret}},
  {queryForm:secret}, {queryForm:'BARE'},
  {restrictions:{...avatarDiagnosticUrlReasons.candidates[0].restrictions,query:true}},
  {restrictions:undefined}, {queryForm:undefined},
 ])('drops unknown, incomplete or contradictory facts without losing comments (%#)',async patch=>{
  const malformed={...avatarDiagnosticUrlReasons,candidates:[{...avatarDiagnosticUrlReasons.candidates[0],...patch},avatarDiagnosticUrlReasons.candidates[1]]};
  expect(safeAvatarSourceDiagnostic(malformed)).toBeUndefined();
  const r=await run(envelope({data:{...detail([comment]).data,avatarSourceDiagnostic:malformed}}));
  expect(r.status).toBe('PARTIAL');expect(r.posts[0].comments).toHaveLength(1);expect(r.posts[0].post.imageDiagnostics?.avatarSource).toBeUndefined();expect(JSON.stringify(r)).not.toContain(secret);
 });
});
