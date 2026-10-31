import 'reflect-metadata';
import {expect,it,vi} from 'vitest';
import {accountSendObservation,recordSendExecution,restrictionState,sendObservationSchema} from '../src/auto-contact/send-observation';
import {ProcessDiagnostics} from '../src/accounts/process-diagnostics';
import {AutoContactService} from '../src/auto-contact/auto-contact.service';
const now=new Date('2026-10-27T12:00:00Z');
it.each(['BANNED','MUTED','ACCOUNT_CONTENT_RESTRICTED','VERIFICATION','SESSION_LIMIT','RATE_LIMITED','COMMENT_RESTRICTED'])('restriction %s never becomes send permission or expires into permission',async code=>{
 const metadata={state:restrictionState([code]),source:'SAME_SESSION',observedAt:'2026-10-27T00:00:00Z'};
 const tx:any={auditLog:{findFirst:vi.fn(async()=>({metadata}))}};
 const result=await accountSendObservation(tx,'synthetic-account',now);
 expect(result.canSend).toBe(false);expect(result.stale).toBe(true);expect(result.state).not.toBe('UNKNOWN');expect(tx.auditLog.findFirst).toHaveBeenCalledTimes(1);
});
it('missing, no-warning, mismatched, corrupt or future evidence never grants permission',async()=>{
 for(const metadata of [null,{state:'UNKNOWN',source:'SAME_SESSION',observedAt:now.toISOString()},{state:'ALLOWED',source:'USER_REPORT',observedAt:now.toISOString()},{state:'UNKNOWN',source:'SAME_SESSION',observedAt:'2099-01-01T00:00:00Z'}]){
  const tx:any={auditLog:{findFirst:vi.fn(async()=>metadata?{metadata}:null)}};
  expect((await accountSendObservation(tx,'synthetic',now)).canSend).toBe(false);
 }
});
it('only strict same-identity safe journal evidence is persisted under the request and account',async()=>{
 const create=vi.fn(async(_input:any)=>{}),tx:any={auditLog:{create},$executeRaw:vi.fn(),platformAccount:{update:vi.fn(),findUnique:vi.fn(async()=>({platform:'XHS',isDemo:false,loginPlatformUserId:'a'.repeat(24),status:'PAUSED'}))},autoContactControl:{upsert:vi.fn()},autoContactRule:{updateMany:vi.fn()}};
 await recordSendExecution(tx,'admin','synthetic-account','job:1','AUTO_CONTACT_EXECUTION_STAGE',{stage:'TRANSPORT_STOP',protocolAttemptId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',stopped:true,journal:{state:'AVAILABLE',records:[{sequence:1,attemptId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',stage:'RESTRICTION_CHECK',at:now.toISOString(),evidence:{identity:'MATCH',title:'限制提示',pathname:'/explore/[POST]',warnings:[{code:'BANNED',text:'账号已封禁'}],screenshotState:'NOT_CAPTURED'}}]}},'a'.repeat(24));
 expect(tx.platformAccount.update).toHaveBeenCalledWith({where:{id:'synthetic-account'},data:{status:'RESTRICTED',pauseReason:'RESTRICTED',version:{increment:1}}});expect(create).toHaveBeenCalledTimes(2);expect(create.mock.calls[1][0]).toMatchObject({data:{entityId:'synthetic-account',action:'ACCOUNT_SEND_OBSERVATION',metadata:{state:'RESTRICTED'}}});
 expect(sendObservationSchema.safeParse({state:'UNKNOWN',source:'SAME_SESSION',observedAt:now.toISOString(),token:'secret'}).success).toBe(false);
});
it('stderr emits fixed categories only, handles split chunks and drains bounded bytes',()=>{
 const d=new ProcessDiagnostics();d.accept(Buffer.from('pan'));d.accept(Buffer.from('ic: private https://example.invalid/?token=secret'));
 d.accept(Buffer.from('websocket connection closed'));d.accept(Buffer.alloc(70000,65));
 expect(d.snapshot()).toMatchObject({truncated:true});expect(d.snapshot().categories).toContain('PANIC');expect(d.snapshot().categories).toContain('BROWSER_DISCONNECTED');expect(JSON.stringify(d.snapshot())).not.toMatch(/private|secret|https/);d.clear();
});
function finishFixture(status='ATTEMPTED'){
 const tx:any={ $executeRaw:vi.fn(),autoContactJob:{findUnique:vi.fn(async()=>({id:'job',mode:'REAL',status,attemptId:'attempt',accountId:'account',platform:'XHS'})),update:vi.fn()},contactAttempt:{findUniqueOrThrow:vi.fn(async()=>({id:'attempt',outcome:status,day:'REAL:Asia/Shanghai:2026-10-26'})),update:vi.fn()},accountDay:{update:vi.fn()},autoContactControl:{upsert:vi.fn(),updateMany:vi.fn()},autoContactRule:{updateMany:vi.fn()}};
 const db:any={$transaction:async(fn:any)=>fn(tx)},sender:any={mode:'REAL'};const service=new AutoContactService(db,sender);vi.spyOn(service,'now').mockResolvedValue(now);return {service,tx};
}
it.each(['UNKNOWN','RISK','BLOCKED'])('%s pauses all platform accounts and retains original quota and recipient lock',async kind=>{
 const {service,tx}=finishFixture();await service.finish('job',kind==='RISK'?{kind,reason:'BANNED'}:kind==='BLOCKED'?{kind,reason:'STOP_UNCONFIRMED'}:{kind:'UNKNOWN',reason:'response lost'});
 expect(tx.accountDay.update).not.toHaveBeenCalled();expect(tx.autoContactControl.upsert).toHaveBeenCalled();expect(tx.autoContactRule.updateMany).toHaveBeenCalledWith({where:{platform:'XHS',mode:'REAL'},data:{enabled:false}});expect(tx.contactAttempt.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({outcome:'UNKNOWN'})}));
});
it('a late not-sent outcome cannot release existing UNKNOWN original-day quota',async()=>{
 const {service,tx}=finishFixture('UNKNOWN');await service.finish('job',{kind:'FAILED',reason:'late result'});expect(tx.accountDay.update).not.toHaveBeenCalled();expect(tx.autoContactJob.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:'UNKNOWN'})}));
});
it('definite pre-submit failure releases only the original day reservation',async()=>{
 const {service,tx}=finishFixture();await service.finish('job',{kind:'FAILED',reason:'stopped before submit'});expect(tx.accountDay.update).toHaveBeenCalledWith({where:{accountId_day:{accountId:'account',day:'REAL:Asia/Shanghai:2026-10-26'}},data:{occupied:{decrement:1}}});
});

it('RPC intent fails before durable dispatch when send permission has no reviewed provider',async()=>{
 const tx:any={$executeRaw:vi.fn(),platformAccount:{findUnique:vi.fn(async()=>({platform:'XHS',loginPlatformUserId:'a'.repeat(24),isDemo:false}))},autoContactControl:{findUnique:vi.fn(async()=>null)},auditLog:{findFirst:vi.fn(async()=>null),create:vi.fn()}};
 await expect(recordSendExecution(tx,'admin','account','job:1','AUTO_CONTACT_EXECUTION_STAGE',{stage:'RPC_INTENT',protocolAttemptId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'},'a'.repeat(24))).rejects.toThrow('SEND_PERMISSION_UNVERIFIED');
 expect(tx.auditLog.create).not.toHaveBeenCalled();
});
it('restriction journal cannot be attributed after account identity changes',async()=>{
 const tx:any={$executeRaw:vi.fn(),platformAccount:{findUnique:vi.fn(async()=>({platform:'XHS',loginPlatformUserId:'b'.repeat(24),isDemo:false}))},auditLog:{create:vi.fn()}};
 await expect(recordSendExecution(tx,'admin','account','job:1','AUTO_CONTACT_EXECUTION_STAGE',{stage:'RPC_ERROR',protocolAttemptId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',code:'TRANSPORT_ERROR'},'a'.repeat(24))).rejects.toThrow('SEND_EVIDENCE_ACCOUNT_MISMATCH');
 expect(tx.auditLog.create).not.toHaveBeenCalled();
});

it('durable stage write failure cannot proceed to account or platform mutations',async()=>{
 const tx:any={$executeRaw:vi.fn(),platformAccount:{findUnique:vi.fn(async()=>({platform:'XHS',loginPlatformUserId:'a'.repeat(24),isDemo:false})),update:vi.fn()},auditLog:{create:vi.fn(async()=>{throw Error('synthetic journal storage failure')})},autoContactControl:{upsert:vi.fn()},autoContactRule:{updateMany:vi.fn()}};
 await expect(recordSendExecution(tx,'admin','account','job:1','AUTO_CONTACT_EXECUTION_STAGE',{stage:'RPC_ERROR',protocolAttemptId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',code:'TRANSPORT_ERROR'},'a'.repeat(24))).rejects.toThrow('synthetic journal storage failure');
 expect(tx.autoContactControl.upsert).not.toHaveBeenCalled();expect(tx.platformAccount.update).not.toHaveBeenCalled();
});

it('automatic readiness is a reviewed application release plus fresh same-session observation, not a mythical platform can-send API',async()=>{
 const {automaticSendReady}=await import('../src/auto-contact/send-observation');
 const observation:any={state:'UNKNOWN',source:'SAME_SESSION',observedAt:now.toISOString(),evidence:{identity:'MATCH',title:'synthetic',pathname:'/user/profile/[SENDER]',warnings:[],screenshotState:'NOT_CAPTURED'}};
 const release={enabled:true,reviewedSha256:'f'.repeat(64),responseMappingReviewed:true,sendEligibilityReviewed:true};
 expect(automaticSendReady(observation,now)).toBe(true);expect(automaticSendReady(observation,now,release)).toBe(true);expect(automaticSendReady(observation,now,{...release,enabled:false})).toBe(false);
 for(const o of [null,{...observation,state:'RESTRICTED'},{...observation,source:'USER_REPORT'},{...observation,evidence:undefined},{...observation,observedAt:new Date(now.getTime()-300001).toISOString()}])expect(automaticSendReady(o,now,release)).toBe(false);
 expect(automaticSendReady(observation,now,{...release,responseMappingReviewed:false})).toBe(false);
});
