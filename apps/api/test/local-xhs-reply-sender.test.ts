// Eligibility is synthetic in these executor tests; production has no positive permission provider.
vi.mock('../src/auto-contact/send-observation',async importOriginal=>({...await importOriginal<any>(),accountSendObservation:vi.fn(async()=>({state:'UNKNOWN',canSend:true}))}));
import 'reflect-metadata';
import { afterEach, expect, it, vi } from 'vitest';
import { LocalXhsReplySender } from '../src/auto-contact/local-xhs-reply-sender';
import { eligibilityHash, ruleHash, quotaBucket } from '../src/auto-contact/contact-policy';
const wire = vi.hoisted(() => ({ connect: vi.fn(), send: vi.fn(), stop: vi.fn(), connectionFailure: vi.fn() }));
vi.mock('../src/auto-contact/xhs-reply-transport', () => ({ XhsExactReplyTransport: class { connect=wire.connect; send=wire.send; stop=wire.stop; connectionFailure=wire.connectionFailure; } }));
afterEach(()=>vi.restoreAllMocks());
const req={platform:'XHS',channel:'COMMENT' as const,accountId:'account1',requestKey:'auto-contact:job1',postId:'b'.repeat(24),commentId:'c'.repeat(24),recipientId:'d'.repeat(24),content:'synthetic only'};
function fixture(){
 wire.connect.mockReset().mockResolvedValue(true);wire.send.mockReset().mockResolvedValue({kind:'UNKNOWN',reason:'synthetic only'});wire.stop.mockReset().mockResolvedValue(true);wire.connectionFailure.mockReset().mockReturnValue({kind:'FAILED',reason:'not available'});
 const snapshot={postId:req.postId,commentId:req.commentId,userId:req.recipientId,comment:'synthetic evidence',targetComment:{id:'not-target',userId:'not-recipient'}};
 const review:any={id:'review1',version:1,platform:'XHS',policyId:'policy',policyRevision:1,selectedModel:'synthetic-model',platformUserId:req.recipientId,isDemo:false,state:'EVALUATED',score:95,context:'SUFFICIENT',reviewStatus:'PENDING',result:{decision:'MATCH',evidence:[{source:'COMMENT',quote:'evidence'}]},snapshot,capture:{config:{platform:'XHS'},platformCommentId:req.commentId,isDemo:false,snapshot,post:{platformPostId:req.postId,snapshot:{sourceReference:{postId:req.postId,token:'synthetic',source:'pc_feed'}}}}};
 const rule:any={enabled:true,authorizedAt:new Date(0),version:1,mode:'REAL',platform:'XHS',policyId:'policy',policyRevision:1,threshold:80,channel:'COMMENT',content:req.content,model:'synthetic-model',accountIds:[req.accountId],accountLimits:[{id:req.accountId,dailyLimit:3}],authorizedBy:'admin'};rule.authorizedHash=ruleHash(rule);
 const job:any={availabilityVersion:0,id:'job1',attemptId:'attempt1',mode:'REAL',status:'ATTEMPTED',leaseUntil:new Date(Date.now()+60000),...req,rule,ruleVersion:1,review,eligibilityHash:eligibilityHash(review)};
 const account:any={id:req.accountId,dailyLimit:3,platform:'XHS',isDemo:false,status:'UNCONNECTED',version:1,loginPlatformUserId:'a'.repeat(24),loginSessionKey:'session',sessionReference:{sessionKey:'session',provider:'real',state:'VERIFIED',checkedRuntimeId:'runtime',deviceId:'device'}};
 const db:any={postAvailability:{findUnique:vi.fn(async()=>null)},platformIdentity:{findUnique:vi.fn(async()=>({lead:null}))},contactAttempt:{findUnique:vi.fn(async()=>({jobId:'job1',mode:'REAL',outcome:'ATTEMPTED',day:quotaBucket('REAL',new Date()),requestKey:req.requestKey}))},accountDay:{findUnique:vi.fn(async()=>({occupied:1}))},platformAccount:{findUnique:vi.fn(async()=>account)},autoContactJob:{findUnique:vi.fn(async()=>job)},user:{findUnique:vi.fn(async()=>({id:'admin',name:'Synthetic',email:'synthetic@example.invalid',role:'ADMIN',active:true}))},commentReviewPolicy:{findUnique:vi.fn(async()=>({revision:1}))},modelSettings:{findFirst:vi.fn(async()=>({model:'synthetic-model'}))},autoContactControl:{findUnique:vi.fn(async()=>({activeJobId:'job1',pauseReason:null}))},$transaction:vi.fn(async(fn:any)=>fn({}))};
 const release=vi.fn(async()=>{}),permit={root:'/synthetic',signal:new AbortController().signal,release};
 const devices:any={enabled:()=>true,acquire:vi.fn(async()=>permit),assertPermit:vi.fn(async()=>{})};
 const endpoint={url:new URL('http://127.0.0.1:1/mcp'),token:'1'.repeat(64),accountId:req.accountId,binarySha256:'2'.repeat(64),stop:vi.fn(async()=>true)};
 const driver={replyEndpoint:()=>endpoint,stop:vi.fn(async()=>{})};
 const runtime:any={runtimeId:'runtime',mode:()=> 'real',persistent:()=>true,deviceId:()=> 'device',openSavedForReply:vi.fn(async()=>driver)};
 const sender=new LocalXhsReplySender(db,devices,runtime,{enabled:true,reviewedSha256:'2'.repeat(64)});
 // Only this synthetic test bypasses the immutable production deployment/hash gate.
 vi.spyOn(sender,'capability').mockReturnValue(true);
 return {sender,db,devices,runtime,job,account,release,driver};
}
it('production default and unapproved hash stay unavailable without database, credentials or process IO',async()=>{
 const db:any={postAvailability:{findUnique:vi.fn(async()=>null)},platformIdentity:{findUnique:vi.fn(async()=>({lead:null}))},contactAttempt:{findUnique:vi.fn(async()=>({jobId:'job1',mode:'REAL',outcome:'ATTEMPTED',day:quotaBucket('REAL',new Date()),requestKey:req.requestKey}))},accountDay:{findUnique:vi.fn(async()=>({occupied:1}))},platformAccount:{findUnique:vi.fn()}},devices:any={enabled:vi.fn()},runtime:any={openSavedForReply:vi.fn()};
 for(const sender of [new LocalXhsReplySender(db,devices,runtime),new LocalXhsReplySender(db,devices,runtime,{enabled:true,reviewedSha256:'0'.repeat(64)})]){
 expect(sender.capability('XHS','COMMENT')).toBe(false);expect(sender.capability('XHS','DM')).toBe(false);expect(await sender.healthy(req.accountId)).toBe(false);expect((await sender.send(req)).kind).toBe('FAILED');}
 expect(db.platformAccount.findUnique).not.toHaveBeenCalled();expect(devices.enabled).not.toHaveBeenCalled();expect(runtime.openSavedForReply).not.toHaveBeenCalled();
});
it('authorized persisted job reaches separate transport with exact selected comment and owned permit',async()=>{
 const f=fixture();expect((await f.sender.send(req)).kind).toBe('UNKNOWN');expect(wire.send).toHaveBeenCalledTimes(1);expect(wire.send.mock.calls[0][0]).toEqual(req);expect(wire.send.mock.calls[0][1]).toMatchObject({accountId:req.accountId,senderId:'a'.repeat(24),postReference:{postId:req.postId}});expect(f.devices.assertPermit).toHaveBeenCalledTimes(1);expect(f.release).toHaveBeenCalledTimes(1);
});
it.each(['disabled','target','hash','lease','actor','session','reference','paused','quota','contacted'])('rejects changed %s before opening a process',async kind=>{
 const f=fixture();if(kind==='disabled')f.job.rule.enabled=false;if(kind==='target')f.job.commentId='f'.repeat(24);if(kind==='hash')f.job.rule.authorizedHash='bad';if(kind==='lease')f.job.leaseUntil=new Date(0);if(kind==='actor')f.db.user.findUnique.mockResolvedValue({active:true,role:'SALES'});if(kind==='session')f.account.sessionReference.checkedRuntimeId='old';if(kind==='reference')f.job.review.capture.post.snapshot={};if(kind==='paused')f.db.autoContactControl.findUnique.mockResolvedValue({activeJobId:'job1',pauseReason:'RATE_LIMITED'});
 if(kind==='quota')f.account.dailyLimit=0;if(kind==='contacted')f.db.platformIdentity.findUnique.mockResolvedValue({lead:{doNotContact:true}});
 expect((await f.sender.send(req)).kind).toBe('FAILED');expect(f.runtime.openSavedForReply).not.toHaveBeenCalled();expect(wire.send).not.toHaveBeenCalled();
});
it('authorization changed during negotiation stops without sending',async()=>{const f=fixture();wire.connect.mockImplementationOnce(async()=>{f.job.rule.enabled=false;return true;});expect((await f.sender.send(req)).kind).toBe('FAILED');expect(wire.send).not.toHaveBeenCalled();expect(f.release).toHaveBeenCalledTimes(1);});
it('old capabilities stop without sending or changing the read allowlist',async()=>{const f=fixture();wire.connect.mockResolvedValue(false);expect((await f.sender.send(req)).kind).toBe('FAILED');expect(wire.send).not.toHaveBeenCalled();expect(f.release).toHaveBeenCalledTimes(1);});
it('negotiation risk is preserved even when stopping is uncertain',async()=>{const f=fixture();wire.connect.mockResolvedValue(false);wire.connectionFailure.mockReturnValue({kind:'RISK',reason:'RATE_LIMITED'});wire.stop.mockResolvedValue(false);expect(await f.sender.send(req)).toEqual({kind:'RISK',reason:'RATE_LIMITED'});expect(f.release).not.toHaveBeenCalled();expect(wire.send).not.toHaveBeenCalled();});
it('uncertain process shutdown keeps device permit and returns blocked',async()=>{const f=fixture();wire.send.mockResolvedValue({kind:'BLOCKED',reason:'STOP_UNCONFIRMED'});wire.stop.mockResolvedValue(false);expect((await f.sender.send(req)).kind).toBe('BLOCKED');expect(f.release).not.toHaveBeenCalled();});
it('adapter throws after attempt cannot refund or release unconfirmed execution',async()=>{const f=fixture();wire.send.mockRejectedValue(Error('synthetic'));wire.stop.mockResolvedValue(false);expect((await f.sender.send(req)).kind).toBe('BLOCKED');expect(f.release).not.toHaveBeenCalled();});

it('initial login pause does not block an otherwise qualified synthetic real job',async()=>{const f=fixture();f.account.status='PAUSED';f.account.pauseReason='登录已验证；只读采集须逐次确认，发送禁用';expect((await f.sender.send(req)).kind).toBe('UNKNOWN');expect(wire.send).toHaveBeenCalledTimes(1);});
it.each(['legacy-hold','restricted','historical-report'])('system %s blocks before acquiring a send process',async kind=>{const f=fixture();if(kind==='legacy-hold'){f.account.status='PAUSED';f.account.pauseReason=null;}if(kind==='restricted')f.account.status='RESTRICTED';if(kind==='historical-report')f.account.loginPlatformUserId='6334380e000000001802cc73';expect((await f.sender.send(req)).kind).toBe('FAILED');expect(f.runtime.openSavedForReply).not.toHaveBeenCalled();expect(wire.send).not.toHaveBeenCalled();});
