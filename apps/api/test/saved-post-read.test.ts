import 'reflect-metadata';
import {it,expect,vi} from 'vitest';
import {readPlanSchema,savedReadTarget} from '../src/collection/saved-post-read';
const id='0123456789abcdef01234567',ref={postId:id,token:'SYNTHETIC_ACCESS_REFERENCE',source:'pc_search'};
it('only uses a saved reference matching the selected post; no arbitrary URL or missing-reference fallback',async()=>{
 const findFirst=vi.fn(async()=>({platformPostId:id,snapshot:{title:'合成',sourceReference:ref}})),db={capturedPost:{findFirst}} as any;
 expect(await savedReadTarget(db,'cfg','row','XHS_MCP')).toEqual({id,title:'合成',sourceReference:ref});
 expect(findFirst).toHaveBeenCalledWith({where:{id:'row',configId:'cfg'},select:{platformPostId:true,snapshot:true}});
 for(const sourceReference of [undefined,{...ref,postId:'fedcba9876543210fedcba98'},{...ref,token:'bad?token=value'},{...ref,source:'evil'}]){
  findFirst.mockResolvedValueOnce({platformPostId:id,snapshot:{title:'合成',sourceReference}} as any);
  await expect(savedReadTarget(db,'cfg','row','XHS_MCP')).rejects.toThrow('缺少有效原文访问引用');
 }
 findFirst.mockResolvedValueOnce(null as any);await expect(savedReadTarget(db,'other','row','XHS_MCP')).rejects.toThrow('不属于');
});
it('saved selection cannot broaden to multi-post, multi-window or caller-supplied reference',()=>{
 const p={rounds:1,postsPerRound:1,commentPages:1,savedPostId:'row'};
 expect(readPlanSchema.safeParse(p).success).toBe(true);
 for(const v of [{...p,postsPerRound:3},{...p,commentPages:2},{...p,url:'https://example.invalid'},{...p,rounds:2},{...p,sourceReference:ref}])expect(readPlanSchema.safeParse(v).success).toBe(false);
});

// Synthetic raw MCP transport: exercise the production adapter, not MockAdapter.
it('saved target goes through login then one bounded detail without search or a warm token cache',async()=>{
 const {XhsMcpAdapter}=await import('../src/collection/adapters/xhs-mcp');
 const {collect}=await import('../src/collection/collector');
 const {readFileSync}=await import('node:fs');const {resolve}=await import('node:path');
 const policy=await import('../../../runtime/comment-read-policy.cjs');
 const sample=JSON.parse(readFileSync(resolve(__dirname,'../../../scripts/mcp-avatar-diagnostics/coverage-cases.json'),'utf8')).diagnostic.samples[0];
 const boundedRead={version:1,state:'UNKNOWN',reason:'VISIBLE_WINDOW_READ',rootStop:'ROOT_END',replyStop:'DECLARED_REPLIES_LOADED',rootActions:1,replyActions:2,excludedRoots:0,elapsedMs:750,initial:sample,final:sample,retained:sample};
 const call=vi.fn(async(name:string,args:Record<string,unknown>)=>{
  if(name==='check_login_status')return {content:[{type:'text',text:'✅ 已登录'}]};
  expect(name).toBe('get_feed_detail');expect(args).toEqual({feed_id:id,xsec_token:ref.token,load_all_comments:false,click_more_replies:false,read_window:policy.readWindow});
  const raw={feed_id:id,data:{boundedRead,note:{noteId:id,title:'合成帖子',desc:'合成正文'},comments:{list:[{id:'root',content:'合成主评',userInfo:{userId:'synthetic-user'},subComments:[{id:'reply',content:'合成回复',userInfo:{userId:'synthetic-reply-user'}}]}]}}};
  return {content:[{type:'text',text:JSON.stringify(raw)}]};
 });
 const adapter=new XhsMcpAdapter({call,supportsBoundedComments:()=>true},true,'XHS_MCP',policy.readWindow as any),checkpoints:any[]=[];
 const target=await savedReadTarget({capturedPost:{findFirst:async()=>({platformPostId:id,snapshot:{title:'合成',sourceReference:ref}})}} as any,'cfg','saved','XHS_MCP');
 const result=await collect(adapter,{name:'synthetic',platform:'XHS',mode:'XHS_MCP',keywords:['never-search'],excludeWords:[],batchLimit:1,enabled:true},async()=>false,undefined,async r=>{checkpoints.push(structuredClone(r));},target);
 expect(result.status).toBe('PARTIAL');expect(result.selection).toBe('SAVED_POST');expect(call.mock.calls.map(c=>c[0])).toEqual(['check_login_status','get_feed_detail']);
 expect(result.posts[0].comments.map(c=>[c.id,c.parentId])).toEqual([['root',undefined],['reply','root']]);expect(result.posts[0].post.sourceReference).toEqual(ref);
 expect(checkpoints.some(c=>c.posts[0]?.comments.length===2)).toBe(true);
 const {runCoverage}=await import('../src/collection/run-coverage');expect(JSON.stringify(runCoverage(result))).not.toContain(ref.token);
 await adapter.close();
});
it('rejects absent, malformed or mismatched saved references before any detail call',async()=>{
 const {XhsMcpAdapter}=await import('../src/collection/adapters/xhs-mcp');
 for(const sourceReference of [undefined,{...ref,postId:'f'.repeat(24)},{...ref,token:'unsafe?value'}, {...ref,source:'unknown'}]){
  const call=vi.fn(),a=new XhsMcpAdapter({call},true,'XHS_MCP',undefined);
  await expect(a.post({id,title:'合成',sourceReference} as any,new AbortController().signal)).rejects.toMatchObject({code:'INVALID_DATA'});
  expect(call).not.toHaveBeenCalled();
 }
});
it('keeps a current search reference preferred, and requires returned identity for a saved reference',async()=>{
 const {XhsMcpAdapter}=await import('../src/collection/adapters/xhs-mcp');
 const envelope=(v:unknown)=>({content:[{type:'text',text:JSON.stringify(v)}]});
 const detail=(noteId?:string)=>envelope({data:{note:{...(noteId?{noteId}:{}),title:'合成'},comments:{list:[]}}});
 const call=vi.fn().mockResolvedValueOnce(envelope({feeds:[{id,xsecToken:'SYNTHETIC_NEWER_REFERENCE'}]})).mockResolvedValueOnce(detail(id));
 const a=new XhsMcpAdapter({call},true,'XHS_MCP',undefined);await a.search('合成',undefined,new AbortController().signal);
 await a.post({id,title:'合成',sourceReference:ref as any},new AbortController().signal);
 expect(call.mock.calls[1][1].xsec_token).toBe('SYNTHETIC_NEWER_REFERENCE');
 for(const returned of [undefined,'f'.repeat(24)]){
  const t=vi.fn().mockResolvedValue(detail(returned));
  await expect(new XhsMcpAdapter({call:t},true,'XHS_MCP',undefined).post({id,title:'合成',sourceReference:ref as any},new AbortController().signal)).rejects.toMatchObject({code:'INVALID_DATA',diagnostic:{kind:'IDENTITY_CONFLICT',field:'noteId'}});
  expect(t).toHaveBeenCalledTimes(1);
 }
});
it('saved reference cannot bypass disabled transport or login verification',async()=>{
 const {XhsMcpAdapter}=await import('../src/collection/adapters/xhs-mcp');const {collect}=await import('../src/collection/collector');
 const selected={id,title:'合成',sourceReference:ref as any},signal=new AbortController().signal,call=vi.fn();
 await expect(new XhsMcpAdapter({call},false,'XHS_MCP',undefined).post(selected,signal)).rejects.toMatchObject({code:'REAL_DISABLED'});expect(call).not.toHaveBeenCalled();
 const t=vi.fn(async(_name:string)=>({content:[{type:'text',text:'未登录'}]}));
 const result=await collect(new XhsMcpAdapter({call:t},true,'XHS_MCP',undefined),{name:'synthetic',platform:'XHS',mode:'XHS_MCP',keywords:['never-search'],excludeWords:[],batchLimit:1,enabled:true},async()=>false,undefined,undefined,selected);
 expect(result.reason).toBe('LOGIN_EXPIRED');expect(t.mock.calls).toHaveLength(1);expect(t.mock.calls[0][0]).toBe('check_login_status');
});

it('fresh-only plan stays within three posts and rejects a saved-post run',()=>{
 const plan={rounds:1,postsPerRound:1,commentPages:1,freshPostsOnly:true};expect(readPlanSchema.safeParse(plan).success).toBe(true);
 expect(readPlanSchema.safeParse({...plan,postsPerRound:3}).success).toBe(true);expect(readPlanSchema.safeParse({...plan,postsPerRound:4}).success).toBe(false);expect(readPlanSchema.safeParse({...plan,savedPostId:'old'}).success).toBe(false);
});
it('fresh-only selection reads one new actual search result and preserves raw search evidence',async()=>{
 const {collect}=await import('../src/collection/collector');
 const posts=[{id:'old',title:'previously captured'},{id:'new',title:'new source'},{id:'extra',title:'not selected'}];
 const adapter:any={mode:'XHS_MCP',platform:'XHS',search:vi.fn(async()=>({items:posts,complete:false,searchEvidence:{evidence:'LEGACY_UNAVAILABLE',returnedCount:3}})),post:vi.fn(async(p:any)=>p),receivedComments:()=>[],comments:async()=>({items:[],complete:true})};
 const r=await collect(adapter,{name:'synthetic',platform:'XHS',mode:'XHS_MCP',keywords:['scope'],excludeWords:[],batchLimit:1,enabled:true},async()=>false,undefined,undefined,undefined,undefined,undefined,p=>p.id!=='old');
 expect(r.posts.map(p=>p.post.id)).toEqual(['new']);expect(adapter.post).toHaveBeenCalledTimes(1);expect(r.searchAttempts?.[0].returnedCount).toBe(3);
 const none=await collect(adapter,{name:'synthetic',platform:'XHS',mode:'XHS_MCP',keywords:['scope'],excludeWords:[],batchLimit:1,enabled:true},async()=>false,undefined,undefined,undefined,undefined,undefined,()=>false);expect(none.posts).toHaveLength(0);expect(adapter.post).toHaveBeenCalledTimes(1);
});
