import 'reflect-metadata';
import {expect,it,vi} from 'vitest';
import {accountSendObservation,recordSendExecution,restrictionState,sendObservationSchema} from '../src/auto-contact/send-observation';
import {ProcessDiagnostics} from '../src/accounts/process-diagnostics';
import {AutoContactService} from '../src/auto-contact/auto-contact.service';
const now=new Date('2026-10-27T12:00:00Z');
it.each(['BANNED','MUTED','VERIFICATION','RATE_LIMITED','COMMENT_RESTRICTED'])('restriction %s never becomes send permission or expires into permission',async code=>{
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
 const create=vi.fn(async(_input:any)=>{}),tx:any={auditLog:{create}};
 await recordSendExecution(tx,'admin','synthetic-account','job:1','AUTO_CONTACT_EXECUTION_STAGE',{stage:'TRANSPORT_STOP',protocolAttemptId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',stopped:true,journal:{state:'AVAILABLE',records:[{sequence:1,attemptId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',stage:'RESTRICTION_CHECK',at:now.toISOString(),evidence:{identity:'MATCH',title:'限制提示',pathname:'/explore/[POST]',warnings:[{code:'BANNED',text:'账号已封禁'}],screenshotState:'NOT_CAPTURED'}}]}});
 expect(create).toHaveBeenCalledTimes(2);expect(create.mock.calls[1][0]).toMatchObject({data:{entityId:'synthetic-account',action:'ACCOUNT_SEND_OBSERVATION',metadata:{state:'RESTRICTED'}}});
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
