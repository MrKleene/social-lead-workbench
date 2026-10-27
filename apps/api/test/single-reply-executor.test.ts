import 'reflect-metadata';
import {afterEach,expect,it,vi} from 'vitest';
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
 const c:any={actor:{id:'admin',active:true,role:'ADMIN'},request:{accountId:'account1'},binding:{senderId:'a'.repeat(24)},scope:{senderId:'a'.repeat(24)},sessionKey:'synthetic'};const before=vi.fn(async()=>true);
 return {executor,c,before,devices,runtime,driver,release};
}
it('checks live identity and device before exactly one new-tool call',async()=>{const f=fixture();const r=await f.executor.run(f.c,f.before,AbortSignal.timeout(5000));expect(r).toMatchObject({protocolCalls:1,identityVerified:true,stopped:true,submission:'AT_MOST_ONCE_UNKNOWN'});expect(f.driver.status).toHaveBeenCalledTimes(1);expect(f.before).toHaveBeenCalledTimes(1);expect(wire.send).toHaveBeenCalledTimes(1);expect(f.release).toHaveBeenCalledTimes(1);expect(f.driver.status.mock.invocationCallOrder[0]).toBeLessThan(wire.send.mock.invocationCallOrder[0]);});
it.each(['wrong-account','logged-out','metadata','revoked','scope'])('no write after %s preflight failure',async kind=>{const f=fixture();if(kind==='wrong-account')f.driver.status.mockResolvedValue({loggedIn:true,userId:'f'.repeat(24)});if(kind==='logged-out')f.driver.status.mockResolvedValue({loggedIn:false,userId:''});if(kind==='metadata')f.runtime.inspect.mockResolvedValue('MISSING');if(kind==='revoked')f.devices.assertPermit.mockRejectedValue(Error('revoked'));if(kind==='scope')f.before.mockResolvedValue(false);const r=await f.executor.run(f.c,f.before,AbortSignal.timeout(5000));expect(r).toMatchObject({protocolCalls:0,submission:'NOT_ATTEMPTED',stopped:true});expect(wire.send).not.toHaveBeenCalled();});
it.each(['RATE_LIMITED','RESTRICTED'])('read-only preflight %s retains pause signal',async reason=>{const f=fixture();f.driver.status.mockRejectedValue(Error(reason));const r=await f.executor.run(f.c,f.before,AbortSignal.timeout(5000));expect(r.result.kind).toBe('RISK');expect(wire.send).not.toHaveBeenCalled();});
it('unknown shutdown never releases the owned device lease',async()=>{const f=fixture();wire.stop.mockResolvedValue(false);const r=await f.executor.run(f.c,f.before,AbortSignal.timeout(5000));expect(r.result.kind).toBe('BLOCKED');expect(f.release).not.toHaveBeenCalled();});
it('missing new protocol prevents send',async()=>{const f=fixture();wire.connect.mockResolvedValue(false);const r=await f.executor.run(f.c,f.before,AbortSignal.timeout(5000));expect(r.protocolCalls).toBe(0);expect(wire.send).not.toHaveBeenCalled();});
