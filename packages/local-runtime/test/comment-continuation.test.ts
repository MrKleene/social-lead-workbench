import {describe,it,expect,vi} from 'vitest';
import {XhsMcpAdapter} from '../src/adapters/collection/adapters/xhs-mcp';
import {collect} from '@crm/domain/collection/collector';
import {ReadFailure,limits} from '@crm/domain/collection/contract';
import {runCoverage} from '@crm/domain/collection/run-coverage';
import {fixture,window,spec,report,sample} from './fixtures/comment-continuation';
describe('live comment continuation: synthetic, no browser/platform',()=>{
 it('checkpoints each finite window, continues same handle, deduplicates and retains per-window evidence',async()=>{
 const t=fixture(),a=new XhsMcpAdapter(t,true,'XHS_MCP',window),saved:any[]=[];
 const result=await collect(a,spec,async()=>false,undefined,async r=>{saved.push(structuredClone(r));});
 expect(result.posts[0].comments).toHaveLength(6);expect(result.posts[0].post.boundedReadWindows).toHaveLength(3);expect(runCoverage(result)?.posts[0].boundedReadWindows).toHaveLength(3);
 expect(saved.some(r=>r.posts[0]?.comments.length===2)).toBe(true);expect(saved.some(r=>r.posts[0]?.comments.length===4)).toBe(true);
 expect(JSON.stringify(saved)).not.toContain('0000000000000000000000000000000000000000000000000000000000000001');
 expect(t.call.mock.calls.filter(c=>c[0]==='get_feed_detail')).toHaveLength(3);
 expect(result.status).toBe('PARTIAL');expect(result.posts[0].complete).toBe(false);
 });
 it('stops on a platform limit as a partial run and keeps what it already read',async()=>{
 const t=fixture();
 t.call.mockImplementation(async(name:string,args:Record<string,unknown>)=>{
  if(name==='check_login_status')return {content:[{type:'text',text:'✅ 已登录\n'}]};
  if(name==='search_feeds')return {content:[{type:'text',text:JSON.stringify({feeds:[{id:'synthetic',xsecToken:'SYNTHETIC_REFERENCE'}]})}]};
  expect(args.read_continuation).toEqual({mode:'START'});
  return {content:[{type:'text',text:JSON.stringify({feed_id:'synthetic',data:{note:{noteId:'synthetic',title:'合成'},comments:{list:[{id:'root0',content:'合成正文0',userInfo:{userId:'synthetic-user'},subComments:[]},{id:'root1',content:'合成正文1',userInfo:{userId:'synthetic-user'},subComments:[]}]},boundedRead:{...report(1,2,false),state:'PARTIAL',reason:'PLATFORM_LIMIT',rootStop:'NOT_RUN',replyStop:'NOT_RUN'},continuation:{state:'ENDED'}}})}]};
 });
 const a=new XhsMcpAdapter(t,true,'XHS_MCP',window);
 const r=await collect(a,spec,async()=>false);
 expect(r.reason).toBe('PLATFORM_LIMIT');expect(r.status).toBe('PARTIAL');expect(r.posts[0].comments).toHaveLength(2);
 expect(runCoverage(r)?.reasons).toContain('PLATFORM_LIMIT');
 expect(t.call.mock.calls.filter(c=>c[0]==='get_feed_detail')).toHaveLength(1);
 });
 it('does not repeat an uncertain failed continuation and keeps prior checkpoint',async()=>{
 const t=fixture(2),a=new XhsMcpAdapter(t,true,'XHS_MCP',window),saved:any[]=[];
 const r=await collect(a,spec,async()=>false,undefined,async p=>{saved.push(structuredClone(p));});
 expect(r.status).toBe('FAILED');expect(r.reason).toBe('MCP_PROTOCOL');expect(r.posts[0].comments).toHaveLength(2);
 expect(saved.some(p=>p.posts[0]?.comments.length===2)).toBe(true);expect(t.call.mock.calls.filter(c=>c[0]==='get_feed_detail')).toHaveLength(2);
 expect(a.canContinuePost(r.posts[0].post)).toBe(false);
 });
 it('rejects reused handles without a third platform call',async()=>{
 const t=fixture(0,true),a=new XhsMcpAdapter(t,true,'XHS_MCP',window);const r=await collect(a,spec,async()=>false);
 expect(r.status).toBe('FAILED');expect(r.reason).toBe('INVALID_DATA');expect(t.call.mock.calls.filter(c=>c[0]==='get_feed_detail')).toHaveLength(2);
 });
 it('recognizes only exact controlled expired-handle errors, no automatic retry',async()=>{
  const t=fixture();t.call.mockImplementation(async()=>({isError:true,content:[{type:'text',text:'获取Feed详情失败: CONTINUATION_EXPIRED'}]}));
  const a=new XhsMcpAdapter(t,true,'XHS_MCP',window);
  await expect(a.postReference({postId:'0123456789abcdef01234567',token:'SYNTHETIC',source:'pc_feed'},new AbortController().signal)).rejects.toMatchObject({code:'MCP_SESSION_EXPIRED'});
  expect(t.call).toHaveBeenCalledTimes(1);
 });
 it('checks cancellation and checkpoint failure before any next window request',async()=>{
  for(const failure of ['cancel','checkpoint']){
   const t=fixture(),a=new XhsMcpAdapter(t,true,'XHS_MCP',window);let stopped=false;const saved:any[]=[];
   const r=await collect(a,spec,async()=>stopped,undefined,async p=>{if(p.posts[0]?.comments.length===2){if(failure==='checkpoint'&&saved.length)throw new ReadFailure('INVALID_DATA');saved.push(structuredClone(p));if(failure==='cancel')stopped=true;}});
   expect(r.status).toBe(failure==='cancel'?'PAUSED':'FAILED');expect(saved[0].posts[0].comments).toHaveLength(2);if(failure==='checkpoint')expect(r.discarded).toBe(true);expect(t.call.mock.calls.filter(c=>c[0]==='get_feed_detail')).toHaveLength(1);
  }
 });
 it('whole-run request budget still bounds continuation; no hidden retry',async()=>{
  const t=fixture(),a=new XhsMcpAdapter(t,true,'XHS_MCP',window);const r=await collect(a,spec,async()=>false,{...limits,requests:3});
  expect(r.reason).toBe('BUDGET');expect(r.posts[0].comments).toHaveLength(2);expect(t.call.mock.calls.filter(c=>c[0]==='get_feed_detail')).toHaveLength(1);
 });
 it('old MCP never receives a continuation argument',async()=>{
 const t=fixture();t.supportsCommentContinuation=()=>false;
 const a=new XhsMcpAdapter(t,true,'XHS_MCP',window);t.call.mockImplementation(async(name,args)=>({content:[{type:'text',text:JSON.stringify(name==='search_feeds'?{feeds:[{id:'synthetic',xsecToken:'SYNTHETIC'}]}:{feed_id:'synthetic',data:{note:{noteId:'synthetic',title:'合成'},comments:{list:[]},boundedRead:{...report(1,2,false),initial:sample(0,true),final:sample(0,false),retained:sample(0,false),window:undefined,actions:undefined}}})}]}));
 const p=(await a.search('合成',undefined,new AbortController().signal)).items[0];const post=await a.post(p,new AbortController().signal);expect(a.canContinuePost(post)).toBe(false);
 expect(t.call.mock.calls[1][1]).not.toHaveProperty('read_continuation');
 });
});
