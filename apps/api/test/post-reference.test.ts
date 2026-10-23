import 'reflect-metadata';
import {describe,it,expect,vi,afterEach} from 'vitest';
import {randomUUID} from 'node:crypto';
import {parsePostReference,savedPostReference,postReferenceUrl,publicPostSnapshot} from '../src/collection/post-reference';
import {XhsMcpAdapter} from '../src/collection/adapters/xhs-mcp';
import {SinglePostService,singlePostSummary} from '../src/collection/single-post.service';
import {ReadFailure} from '../src/collection/contract';
import {semanticSnapshot,snapshotHash} from '../src/collection/semantic-evaluator';
import {avatarDiagnosticUrlReasons} from './fixtures/avatar-diagnostic-v2';
const id='0123456789abcdef01234567',ref={postId:id,token:'SYNTHETIC_REFERENCE_ONLY=',source:'pc_feed' as const},url=postReferenceUrl(ref);
const envelope=(v:unknown)=>({content:[{type:'text',text:JSON.stringify(v)}]});
const comment={id:'synthetic-root',noteId:id,content:'合成评论',userInfo:{userId:'synthetic-user',avatar:'https://sns-avatar-qc.xhscdn.com/avatar/fake.jpg'},subComments:[{id:'synthetic-child',noteId:id,content:'合成回复',userInfo:{userId:'synthetic-reply'},subComments:null}]};
const detail={feed_id:id,data:{note:{noteId:id,title:'合成标题',desc:'合成正文'},comments:{list:[comment],hasMore:true},avatarSourceDiagnostic:avatarDiagnosticUrlReasons}};
afterEach(()=>vi.unstubAllEnvs());
describe('bounded original source references',()=>{
 it('round trips only the official exact note and two allowed fields',()=>{expect(parsePostReference(url)).toEqual(ref);expect(savedPostReference(ref,'f'.repeat(24))).toBeUndefined();expect(publicPostSnapshot({id,sourceReference:ref,title:'safe'})).toEqual({id,title:'safe'});});
 it.each(['http://www.xiaohongshu.com/explore/'+id,'https://xiaohongshu.com/explore/'+id,'https://www.xiaohongshu.com.evil.invalid/explore/'+id,'https://u:p@www.xiaohongshu.com/explore/'+id,'https://www.xiaohongshu.com:443/explore/'+id,'https://www.xiaohongshu.com/explore/../explore/'+id,'https://www.xiaohongshu.com/explore/%30'+id.slice(1)])('rejects unsafe origin/path %s',base=>{expect(parsePostReference(base+'?xsec_token=FAKE&xsec_source=pc_feed')).toBeUndefined();});
 it.each(['#fragment','&redirect=https://evil.invalid','&xsec_token=again','&xsec_source=pc_search','&cookie=FAKE'])('rejects extra components %s',extra=>expect(parsePostReference(url+extra)).toBeUndefined());
 it('rejects missing, unknown or malformed references without echoing them',()=>{for(const u of [url.replace('pc_feed','unknown'),url.replace('xsec_token=','xsec_token=%0A'),url.replace('&xsec_source=pc_feed',''),url+'\n'])expect(parsePostReference(u)).toBeUndefined();});
 it('one detail request uses exact reference; no search/pagination; diagnostics omit all values',async()=>{
  const call=vi.fn().mockResolvedValue(envelope(detail)),connect=vi.fn(),adapter=new XhsMcpAdapter({call,connect},true,'XHS_MCP');
  const post=await adapter.postReference(ref,new AbortController().signal),comments=adapter.receivedComments(post);
  expect(connect).toHaveBeenCalledTimes(1);expect(call).toHaveBeenCalledTimes(1);expect(call.mock.calls[0].slice(0,2)).toEqual(['get_feed_detail',{feed_id:id,xsec_token:ref.token,load_all_comments:false,click_more_replies:false}]);
  expect(post.sourceReference).toEqual(ref);const out=singlePostSummary(post,comments);expect(out).toMatchObject({status:'CHECKED',roots:{count:1,displayableAvatars:1},replies:{count:1,displayableAvatars:0}});
  expect(out.imageDiagnostics?.avatarSource).toEqual(avatarDiagnosticUrlReasons);expect(JSON.stringify(out)).not.toMatch(/SYNTHETIC_REFERENCE_ONLY|synthetic-user|fake.jpg|合成正文|合成评论/);
  const snapshot=semanticSnapshot(post,comments[0],undefined,false,false);expect(JSON.stringify(snapshot)).not.toContain(ref.token);expect(snapshotHash(snapshot)).toBe(snapshotHash(semanticSnapshot({...post,sourceReference:{...ref,token:'DIFFERENT'}},comments[0],undefined,false,false)));
 });
 it('cannot attach an access reference to a mismatched or unconfirmed note identity',async()=>{
  for(const raw of [{...detail,feed_id:'f'.repeat(24)},{data:{note:{title:'no identity'},comments:{list:[]}}}]){
   const call=vi.fn().mockResolvedValue(envelope(raw)),a=new XhsMcpAdapter({call},true,'XHS_MCP');await expect(a.postReference(ref,new AbortController().signal)).rejects.toMatchObject({code:'INVALID_DATA'});expect(call).toHaveBeenCalledTimes(1);
  }
 });
});
function setup(){
 vi.stubEnv('CRM_DEVICE_MANAGEMENT','1');vi.stubEnv('CRM_PERSISTENT','1');vi.stubEnv('CRM_ACCOUNT_READ_ENABLED','1');vi.stubEnv('XHS_ACCOUNT_LOGIN_MODE','offline');vi.stubEnv('CRM_RUNTIME_ID','synthetic-runtime');
 const audits:any[]=[];let active=false,session='UNVERIFIED';
 const db:any={$queryRaw:vi.fn().mockResolvedValue([]),user:{findUnique:async()=>({active:true,role:'ADMIN'})},collectionRun:{findFirst:async()=>active?{id:'running'}:null},accountSessionReference:{findUnique:async()=>({state:session,checkedRuntimeId:'synthetic-runtime'})},auditLog:{findFirst:async({where}:any)=>audits.find(a=>where.entityId?a.entityId===where.entityId:a.action===where.action)||null,create:async({data}:any)=>{const a={id:randomUUID(),...data};audits.push(a);return a;},update:async({where,data}:any)=>Object.assign(audits.find(a=>a.id===where.id),data)}};db.$transaction=async(fn:any)=>fn(db);
 const post={id,title:'合成',imageDiagnostics:{avatarSource:avatarDiagnosticUrlReasons}},close=vi.fn().mockResolvedValue(undefined),postReference=vi.fn().mockResolvedValue(post);
 const login:any={verifySaved:vi.fn().mockResolvedValue({state:'VERIFIED'})},reads:any={authorize:vi.fn().mockResolvedValue({}),open:vi.fn().mockResolvedValue({check:vi.fn(),close,reader:{postReference,receivedComments:()=>[]}}),failure:vi.fn()};
 const service=new SinglePostService(db,reads,login),actor:any={id:'admin',role:'ADMIN'},input={accountId:'account',url,requestKey:randomUUID(),consent:'single-post-read-v1' as const};
 return {db,audits,login,reads,service,actor,input,postReference,close,setActive:(v:boolean)=>active=v,setSession:(v:string)=>session=v};
}
describe('single post guarded execution',()=>{
 it('verifies UNVERIFIED through existing login service and never creates a task or capture',async()=>{const s=setup();expect(await s.service.check(s.actor,s.input)).toMatchObject({status:'CHECKED'});expect(s.login.verifySaved).toHaveBeenCalledWith(s.actor,'account','read-local-session-v1');expect(s.reads.authorize).toHaveBeenCalled();expect(s.postReference).toHaveBeenCalledTimes(1);expect(s.close).toHaveBeenCalledTimes(1);expect(JSON.stringify(s.audits)).not.toContain(ref.token);expect(s.audits[0].action).toBe('SINGLE_POST_CHECK_FINISHED');await expect(s.service.check(s.actor,s.input)).rejects.toThrow('不会重复请求');expect(s.postReference).toHaveBeenCalledTimes(1);});
 it('rejects non-admin, missing consent, unsafe URL before verification',async()=>{const s=setup();await expect(s.service.check({...s.actor,role:'SALES'},s.input)).rejects.toThrow();await expect(s.service.check(s.actor,{...s.input,consent:undefined} as any)).rejects.toThrow();await expect(s.service.check(s.actor,{...s.input,url:'https://evil.invalid/'})).rejects.toThrow();expect(s.login.verifySaved).not.toHaveBeenCalled();expect(s.audits).toHaveLength(0);});
 it('does not interrupt a queued/running task',async()=>{const s=setup();s.setActive(true);await expect(s.service.check(s.actor,s.input)).rejects.toThrow('已有采集');expect(s.reads.open).not.toHaveBeenCalled();expect(s.login.verifySaved).not.toHaveBeenCalled();});
 it('verification failure stops without a detail request',async()=>{const s=setup();s.login.verifySaved.mockResolvedValue({state:'EXPIRED'});expect(await s.service.check(s.actor,s.input)).toEqual({status:'LOGIN_NOT_READY'});expect(s.reads.open).not.toHaveBeenCalled();});
 it('already verified still goes through account guard and device lease',async()=>{const s=setup();s.setSession('VERIFIED');await s.service.check(s.actor,s.input);expect(s.login.verifySaved).not.toHaveBeenCalled();expect(s.reads.authorize).toHaveBeenCalledTimes(1);expect(s.reads.open).toHaveBeenCalledTimes(1);});
 it.each(['RATE_LIMITED','RESTRICTED','LOGIN_EXPIRED','TIMEOUT'] as const)('stops once on %s and releases the owned lease',async code=>{const s=setup();s.postReference.mockRejectedValue(new ReadFailure(code));expect(await s.service.check(s.actor,s.input)).toEqual({status:'FAILED',reason:code});expect(s.postReference).toHaveBeenCalledTimes(1);expect(s.reads.failure).toHaveBeenCalledWith({},code);expect(s.close).toHaveBeenCalledTimes(1);});
 it('unexpected transport errors cannot leak request URLs or content',async()=>{const s=setup();s.postReference.mockRejectedValue(new Error(url+' private identity'));expect(await s.service.check(s.actor,s.input)).toEqual({status:'FAILED',reason:'CHECK_FAILED'});expect(JSON.stringify(s.audits)).not.toContain(ref.token);});
 it('reserved checks reject concurrent attempts before any additional platform request',async()=>{const s=setup();let entered!:()=>void,finish!:(p:any)=>void;const started=new Promise<void>(ok=>entered=ok);s.postReference.mockImplementation(()=>{entered();return new Promise(ok=>finish=ok);});const one=s.service.check(s.actor,s.input);await started;await expect(s.service.check(s.actor,{...s.input,requestKey:randomUUID()})).rejects.toThrow('单帖检查正在进行');finish({id,title:''});await one;expect(s.postReference).toHaveBeenCalledTimes(1);});
});
