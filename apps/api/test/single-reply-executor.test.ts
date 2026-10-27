// Eligibility is synthetic in these executor tests; production has no positive permission provider.
vi.mock('../src/auto-contact/send-observation',async importOriginal=>({...await importOriginal<any>(),accountSendObservation:vi.fn(async()=>({state:'UNKNOWN',canSend:true}))}));
import 'reflect-metadata';
import {afterEach,expect,it,vi} from 'vitest';
import {singleReplyBuildHashes,singleReplyScopeVersion,singleReplyPurpose,compatibleSingleReplyScope} from '../src/auto-contact/single-reply-builds';
import {singleReplyScopeSchema} from '../src/auto-contact/single-reply-test';
import {XHS_REPLY_PROTOCOL} from '../src/auto-contact/xhs-reply-protocol';
import {LocalSingleReplyExecutor} from '../src/auto-contact/single-reply-executor';
const wire=vi.hoisted(()=>({connect:vi.fn(),send:vi.fn(),stop:vi.fn(),connectionFailure:vi.fn()}));
vi.mock('../src/auto-contact/xhs-reply-transport',()=>({XhsExactReplyTransport:class {connect=wire.connect;send=wire.send;stop=wire.stop;connectionFailure=wire.connectionFailure;}}));
afterEach(()=>vi.restoreAllMocks());
function fixture(){
 wire.connect.mockReset().mockResolvedValue(true);wire.send.mockReset().mockResolvedValue({kind:'UNKNOWN',reason:'synthetic'});wire.stop.mockReset().mockResolvedValue(true);wire.connectionFailure.mockReset().mockReturnValue({kind:'FAILED',reason:'no new protocol'});
 const release=vi.fn(async()=>{}),permit={signal:new AbortController().signal,root:'/synthetic',release};
 const driver={status:vi.fn(async()=>({loggedIn:true,userId:'a'.repeat(24)})),replyEndpoint:()=>({}),stop:vi.fn(async()=>{})};
 const devices:any={enabled:()=>true,acquire:vi.fn(async()=>permit),assertPermit:vi.fn(async()=>{})},runtime:any={mode:()=> 'real',persistent:()=>true,deviceId:()=> 'synthetic',inspect:vi.fn(async()=> 'UNVERIFIED'),openSavedForReply:vi.fn(async()=>driver)};
 const db:any={$transaction:vi.fn(async(fn:any)=>fn({}))},executor=new LocalSingleReplyExecutor(db,devices,runtime);vi.spyOn(executor,'capable').mockReturnValue(true);
 const c:any={actor:{id:'admin',active:true,role:'ADMIN'},request:{accountId:'account1'},binding:{senderId:'a'.repeat(24)},scope:{senderId:'a'.repeat(24),binarySha256:singleReplyBuildHashes[0],scopeVersion:singleReplyScopeVersion,purpose:singleReplyPurpose,protocol:XHS_REPLY_PROTOCOL},sessionKey:'synthetic'};const before=vi.fn(async()=>true);
 return {executor,c,before,devices,runtime,driver,release};
}
it('checks live identity and device before exactly one new-tool call',async()=>{const f=fixture();const r=await f.executor.run(f.c,f.before,AbortSignal.timeout(5000));expect(r).toMatchObject({protocolCalls:1,identityVerified:true,stopped:true,submission:'AT_MOST_ONCE_UNKNOWN'});expect(f.driver.status).toHaveBeenCalledTimes(1);expect(f.before).toHaveBeenCalledTimes(1);expect(wire.send).toHaveBeenCalledTimes(1);expect(f.release).toHaveBeenCalledTimes(1);expect(f.driver.status.mock.invocationCallOrder[0]).toBeLessThan(wire.send.mock.invocationCallOrder[0]);});
it.each(['wrong-account','logged-out','metadata','revoked','scope'])('no write after %s preflight failure',async kind=>{const f=fixture();if(kind==='wrong-account')f.driver.status.mockResolvedValue({loggedIn:true,userId:'f'.repeat(24)});if(kind==='logged-out')f.driver.status.mockResolvedValue({loggedIn:false,userId:''});if(kind==='metadata')f.runtime.inspect.mockResolvedValue('MISSING');if(kind==='revoked')f.devices.assertPermit.mockRejectedValue(Error('revoked'));if(kind==='scope')f.before.mockResolvedValue(false);const r=await f.executor.run(f.c,f.before,AbortSignal.timeout(5000));expect(r).toMatchObject({protocolCalls:0,submission:'NOT_ATTEMPTED',stopped:true});expect(wire.send).not.toHaveBeenCalled();});
it.each(['RATE_LIMITED','RESTRICTED'])('read-only preflight %s retains pause signal',async reason=>{const f=fixture();f.driver.status.mockRejectedValue(Error(reason));const r=await f.executor.run(f.c,f.before,AbortSignal.timeout(5000));expect(r.result.kind).toBe('RISK');expect(wire.send).not.toHaveBeenCalled();});
it('unknown shutdown never releases the owned device lease',async()=>{const f=fixture();wire.stop.mockResolvedValue(false);const r=await f.executor.run(f.c,f.before,AbortSignal.timeout(5000));expect(r.result.kind).toBe('BLOCKED');expect(f.release).not.toHaveBeenCalled();});
it('missing new protocol prevents send',async()=>{const f=fixture();wire.connect.mockResolvedValue(false);const r=await f.executor.run(f.c,f.before,AbortSignal.timeout(5000));expect(r.protocolCalls).toBe(0);expect(wire.send).not.toHaveBeenCalled();});

it('binds owned process and transport to the new explicitly scoped hash',async()=>{const f=fixture();await f.executor.run(f.c,f.before,AbortSignal.timeout(5000));expect(f.runtime.openSavedForReply).toHaveBeenCalledWith('account1','synthetic',expect.any(AbortSignal),'/synthetic',singleReplyBuildHashes[0]);expect(f.executor.capable).toHaveBeenCalledWith(f.c.scope);});
it('runtime compatibility refusal happens before lease/session acquisition',async()=>{const f=fixture();vi.mocked(f.executor.capable).mockReturnValue(false);const result=await f.executor.run(f.c,f.before,AbortSignal.timeout(5000));expect(f.devices.acquire).not.toHaveBeenCalled();expect(f.runtime.openSavedForReply).not.toHaveBeenCalled();expect(wire.send).not.toHaveBeenCalled();expect(result.submission).toBe('NOT_ATTEMPTED');});
it.each(['old-binary','unreviewed-binary','installed-mismatch','readonly-purpose','old-scope','wrong-protocol'])('rejects %s without upgrading authority',kind=>{
 const scope={scopeVersion:singleReplyScopeVersion as string,purpose:singleReplyPurpose as string,binarySha256:singleReplyBuildHashes[0] as string,protocol:XHS_REPLY_PROTOCOL as string};let installed=singleReplyBuildHashes[0] as string;
 if(kind==='old-binary')scope.binarySha256=installed='ee0901efc70426a8d44eef00e731cf474447967057d3b50df4727bb1cf032d96';
 if(kind==='unreviewed-binary')scope.binarySha256=installed='f'.repeat(64);
 if(kind==='installed-mismatch')installed='a'.repeat(64);
 if(kind==='readonly-purpose')scope.purpose='INSPECT_ONLY';
 if(kind==='old-scope')scope.scopeVersion='workbench.single-reply-authorization.v1';
 if(kind==='wrong-protocol')scope.protocol='workbench.xhs.exact-preflight.v2';
 expect(compatibleSingleReplyScope(scope,installed)).toBe(false);
});
it('new scope requires explicit submission purpose and protocol, no default migration',()=>{
 const f=fixture(),scope={...f.c.scope,availabilityVersion:0,approvalId:'11111111-1111-4111-8111-111111111111',accountId:'account1',reviewId:'review1',reviewVersion:4,templateId:'template1',postId:'b'.repeat(24),commentId:'c'.repeat(24),recipientId:'d'.repeat(24),comment:'synthetic',content:'synthetic reply',maximumSubmissions:1,retryCount:0,expiresAt:'2026-10-27T14:00:00.000Z',pausedReason:'登录已验证；只读采集须逐次确认，发送禁用'};
 expect(singleReplyScopeSchema.safeParse(scope).success).toBe(true);expect(compatibleSingleReplyScope(scope,scope.binarySha256)).toBe(true);
 for(const key of ['scopeVersion','purpose','protocol']){const missing={...scope};delete missing[key];expect(singleReplyScopeSchema.safeParse(missing).success).toBe(false);}
 expect(singleReplyScopeSchema.safeParse({...scope,binarySha256:'f'.repeat(64)}).success).toBe(false);
});

it('persists only validated fixed execution evidence under the same authorization key',async()=>{
 const f=fixture(),events:any[]=[];
 const db:any={$executeRaw:vi.fn(),platformAccount:{findUnique:vi.fn(async()=>({platform:'XHS',isDemo:false,loginPlatformUserId:'a'.repeat(24)}))},auditLog:{create:vi.fn(async(e:any)=>{events.push(e);})},$transaction:vi.fn(async(fn:any)=>fn(db))};
 const executor=new LocalSingleReplyExecutor(db,f.devices,f.runtime);vi.spyOn(executor,'capable').mockReturnValue(true);
 f.c.request.requestKey='single-reply:synthetic';
 wire.send.mockImplementation(async(_r:any,_b:any,_s:any,record:any)=>{await record({stage:'RPC_RETURNED',kind:'UNKNOWN',envelopeValid:true,protocolAttemptId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'});await expect(record({stage:'RPC_INTENT',protocolAttemptId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',token:'secret'})).rejects.toThrow();return {kind:'UNKNOWN',reason:'synthetic'};});
 await executor.run(f.c,f.before,AbortSignal.timeout(5000));expect(events).toHaveLength(1);expect(events[0].data).toMatchObject({entityId:'single-reply:synthetic',action:'SINGLE_REPLY_EXECUTION_STAGE'});expect(JSON.stringify(events)).not.toContain('secret');
});
