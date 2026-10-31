vi.mock('../src/auto-contact/xhs-reply-deployment',()=>({exactReplyDeployment:{enabled:true,reviewedSha256:'f'.repeat(64),responseMappingReviewed:true,sendEligibilityReviewed:true}}));
import 'reflect-metadata';
import { beforeAll, beforeEach, afterAll, it, expect, vi } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { autoContactConsent } from '@crm/contracts';
import { Db } from '../src/common/db';
import { AppModule } from '../src/app';
import { configure } from '../src/bootstrap';
import { digest, type Actor } from '../src/auth/security';
import { AutoContactService } from '../src/auto-contact/auto-contact.service';
import { ContactSettingsService } from '../src/auto-contact/contact-settings.service';
import { CONTACT_SENDER, type ContactSender, type SendResult } from '../src/auto-contact/contact-sender';
import { LocalXhsReplySender } from '../src/auto-contact/local-xhs-reply-sender';
import { ruleHash, quotaBucket } from '../src/auto-contact/contact-policy';
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== '/crm_test')
    throw Error('isolated crm_test required');
const db = new Db({ datasources: { db: { url } } });
const sender: ContactSender = { mode: 'SIMULATION', capability: () => true, healthy: vi.fn(async () => true), send: vi.fn(async (): Promise<SendResult> => ({ kind: 'CONFIRMED', receipt: 'synthetic-receipt' })), reconcile: vi.fn(async (): Promise<SendResult> => ({ kind: 'FAILED', reason: 'synthetic verification: not sent' })) };
const settings = new ContactSettingsService(db, sender), service = new AutoContactService(db, sender);
let actor: Actor, sales: Actor, app: INestApplication;
let auth = { cookie: '', csrf: '' };
async function clean() { await db.$executeRawUnsafe('TRUNCATE "PostAvailability", "PostAvailabilityEvent", "AutoContactJob", "AutoContactRule", "AutoContactControl", "ContactAttempt", "ContactLedger", "AccountDay", "User", "PlatformAccount", "PlatformIdentity", "CollectionConfig", "ModelSettings", "CommentReviewPolicy" CASCADE'); }
async function source(recipient: string = randomUUID(), patch: Record<string, unknown> = {}) {
    const config = await db.collectionConfig.create({ data: { name: '合成来源', platform: 'XHS', keywords: [], excludeWords: [] } }), run = await db.collectionRun.create({ data: { configId: config.id, revision: 1, snapshot: {}, requestKey: randomUUID(), scenario: 'BASELINE', status: 'COMPLETE' } }), post = await db.capturedPost.create({ data: { configId: config.id, runId: run.id, lastRunId: run.id, platformPostId: randomUUID(), contentHash: randomUUID(), snapshot: {}, coverage: 'COMPLETE' } }), snapshot = { postId: post.platformPostId, commentId: randomUUID(), userId: recipient, comment: '合成数学专业', coverage: 'COMPLETE', isDemo: true, targetComment: { userId: 'not-recipient', id: 'not-reply-target' } };
    const c = await db.capturedComment.create({ data: { configId: config.id, runId: run.id, lastRunId: run.id, postId: post.id, platformCommentId: snapshot.commentId, contentHash: randomUUID(), contextVersion: 'v1', snapshot, isDemo: true } });
    return db.semanticReview.create({ data: { configId: config.id, runId: run.id, revision: 1, snapshotHash: randomUUID(), platform: 'XHS', platformUserId: recipient, snapshot, rules: { target: '合成专业目标' }, state: 'EVALUATED', score: 95, reason: '合成证据', context: 'SUFFICIENT', result: { decision: 'MATCH', evidence: [{ source: 'COMMENT', quote: '数学专业' }] }, provider: 'QWEN', modelVersion: 'synthetic-model-v1', selectedModel: 'qwen3.8-flash', isDemo: true, captureId: c.id, policyId: 'workspace', policyRevision: 1, evaluationInput: { inputPolicyVersion: 'synthetic-raw', observationPolicy: 'current-capture-observation-v1' }, ...patch } });
}
async function rule(id = 'workspace', channel: 'COMMENT' | 'DM' = 'COMMENT', limits = [1, 1]) { const accounts = await Promise.all(limits.map((dailyLimit, i) => db.platformAccount.create({ data: { platform: 'XHS', label: `合成账号 ${id}-${i}`, dailyLimit, isDemo: true } }))); const r = await settings.save(actor, id, { version: 0, platform: 'XHS', policyId: 'workspace', policyRevision: 1, threshold: 80, channel, content: '仅隔离测试的合成文字', accounts: accounts.map(a => ({ id: a.id, version: a.version, dailyLimit: a.dailyLimit })) }); return { r: await settings.toggle(actor, id, { version: r.version, enabled: true, consent: autoContactConsent, hash: ruleHash(r) }), accounts }; }
beforeAll(async () => { const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(Db).useValue(db).overrideProvider(CONTACT_SENDER).useValue(sender).compile(); app = module.createNestApplication({ bodyParser: false }); configure(app); await app.init(); });
beforeEach(async () => { await clean(); vi.restoreAllMocks(); (sender.send as any).mockReset().mockResolvedValue({ kind: 'CONFIRMED', receipt: 'synthetic-receipt' }); (sender.healthy as any).mockReset().mockResolvedValue(true); (sender.reconcile as any).mockReset().mockResolvedValue({ kind: 'FAILED', reason: 'not sent' }); actor = await db.user.create({ data: { email: randomUUID() + '@example.invalid', name: '合成管理员', role: 'ADMIN', passwordHash: 'unused' } }); sales = await db.user.create({ data: { email: randomUUID() + '@example.invalid', name: '合成销售', role: 'SALES', passwordHash: 'unused' } }); const token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex'); await db.session.create({ data: { id: digest(token), userId: actor.id, csrfToken: csrf, expiresAt: new Date(Date.now() + 600000) } }); auth = { cookie: 'crm_session=' + token, csrf }; await db.commentReviewPolicy.create({ data: { id: 'workspace', name: '合成', target: '合成目标', revisions: { create: { revision: 1, target: '合成目标' } } } }); await db.modelSettings.create({ data: { id: 'model', model: 'qwen3.8-flash', priceVersion: 'synthetic', consent: false } }); });
afterAll(async () => { await clean(); await app.close(); await db.$disconnect(); });
async function oneShotFixture(){
 const {SingleReplyTestService}=await import('../src/auto-contact/single-reply-test');
 const {singleReplyBuildHashes,singleReplyScopeVersion,singleReplyPurpose}=await import('../src/auto-contact/single-reply-builds');
 const {XHS_REPLY_PROTOCOL}=await import('../src/auto-contact/xhs-reply-protocol');
 const userId='d'.repeat(24),postId='b'.repeat(24),commentId='c'.repeat(24),senderId='a'.repeat(24);
 let r=await source(userId,{isDemo:false});const capture=await db.capturedComment.findUniqueOrThrow({where:{id:r.captureId!}});
 const snapshot={postId,commentId,userId,comment:'synthetic evidence',isDemo:false};
 await db.capturedPost.update({where:{id:capture.postId},data:{platformPostId:postId,snapshot:{title:'Synthetic post',sourceReference:{postId,token:'synthetic',source:'pc_feed'}}}});
 await db.capturedComment.update({where:{id:capture.id},data:{platformCommentId:commentId,snapshot,isDemo:false}});
 r=await db.semanticReview.update({where:{id:r.id},data:{snapshot,result:{decision:'MATCH',evidence:[{source:'COMMENT',quote:'evidence'}]}}});
 const sessionKey=randomUUID(),pauseReason='登录已验证；只读采集须逐次确认，发送禁用';
 const account=await db.platformAccount.create({data:{platform:'XHS',label:'Synthetic one shot',isDemo:false,status:'PAUSED',pauseReason,dailyLimit:3,loginProvider:'real',loginPlatformUserId:senderId,loginSessionKey:sessionKey,sessionReference:{create:{deviceId:randomUUID(),sessionKey,provider:'real',state:'VERIFIED'}}}});
 const template=await db.replyTemplate.create({data:{name:'Synthetic one shot only',channel:'COMMENT',body:'synthetic reply'}});
 const scope={scopeVersion:singleReplyScopeVersion,purpose:singleReplyPurpose,protocol:XHS_REPLY_PROTOCOL,availabilityVersion:0,approvalId:randomUUID(),accountId:account.id,senderId,reviewId:r.id,reviewVersion:r.version,templateId:template.id,postId,commentId,recipientId:userId,comment:'synthetic evidence',content:template.body,binarySha256:singleReplyBuildHashes[0],maximumSubmissions:1 as const,retryCount:0 as const,expiresAt:new Date(Date.now()+600000).toISOString(),pausedReason:pauseReason as '登录已验证；只读采集须逐次确认，发送禁用'};
 let calls=0;const executor={capable:()=>true,run:vi.fn(async(_c:any,before:()=>Promise<boolean>)=>{if(!await before())return {result:{kind:'FAILED' as const,reason:'synthetic rejected'},protocolCalls:0,submission:'NOT_ATTEMPTED' as const,identityVerified:true,stopped:true};calls++;return {result:{kind:'UNKNOWN' as const,reason:'synthetic only'},protocolCalls:1,submission:'AT_MOST_ONCE_UNKNOWN' as const,identityVerified:true,stopped:true};})};
 return {scope,account,template,executor,service:new SingleReplyTestService(db,executor),calls:()=>calls};
}

import {XhsRestrictionInspectionTransport,XHS_PROFILE_RESTRICTION_PROTOCOL} from '../src/auto-contact/xhs-restriction-transport';
import {XhsExactReplyTransport} from '../src/auto-contact/xhs-reply-transport';
import {accountSendObservation} from '../src/auto-contact/send-observation';
async function normalFixture(){
 const f=await oneShotFixture(),ref=await db.accountSessionReference.findUniqueOrThrow({where:{accountId:f.account.id}});
 await db.accountSessionReference.update({where:{accountId:f.account.id},data:{state:'UNVERIFIED',checkedRuntimeId:null}});
 const release=vi.fn(async()=>{}),permit={root:'/synthetic',signal:new AbortController().signal,release};
 const devices:any={enabled:()=>true,acquire:vi.fn(async()=>permit),assertPermit:vi.fn(async()=>{})};
 const endpoint={url:new URL('http://127.0.0.1:28060/mcp'),token:'f'.repeat(64),accountId:f.account.id,binarySha256:'f'.repeat(64),stop:async()=>true};
 const runtime:any={runtimeId:'synthetic-runtime',persistent:()=>true,mode:()=> 'real',deviceId:()=>ref.deviceId,inspect:async()=>'UNVERIFIED',openSavedForRestrictionInspection:vi.fn(async()=>({replyEndpoint:()=>endpoint})),openSavedForReply:vi.fn(async()=>({replyEndpoint:()=>endpoint,status:async()=>({loggedIn:true,userId:f.scope.senderId})}))};
 const inspection=vi.spyOn(XhsRestrictionInspectionTransport.prototype,'inspect').mockImplementation(async()=>({kind:'READ_ONLY_RESULT',ownedStopped:true,result:{protocol:XHS_PROFILE_RESTRICTION_PROTOCOL,kind:'OBSERVED_NO_RESTRICTION',code:'NOT_A_SEND_PERMISSION_CHECK',observedAt:new Date().toISOString(),observation:{identity:'MATCH',identitySource:'STATE_AND_SELF_LINK',title:'Synthetic',pathname:'/user/profile/[SENDER]',warnings:[],screenshotState:'NO_SAFE_REGION',consoleErrors:0,networkFailures:0},processStopped:true,writeOperations:0}}));
 vi.spyOn(XhsRestrictionInspectionTransport.prototype,'close').mockResolvedValue(true);
 const send=vi.spyOn(XhsExactReplyTransport.prototype,'send').mockResolvedValue({kind:'CONFIRMED',receipt:'e'.repeat(24)});
 vi.spyOn(XhsExactReplyTransport.prototype,'connect').mockResolvedValue(true);vi.spyOn(XhsExactReplyTransport.prototype,'stop').mockResolvedValue(true);
 const local=new LocalXhsReplySender(db,devices,runtime,{enabled:true,reviewedSha256:'f'.repeat(64),responseMappingReviewed:true,sendEligibilityReviewed:true});vi.spyOn(local,'capability').mockReturnValue(true);
 const settings=new ContactSettingsService(db,local),service=new AutoContactService(db,local);
 const r=await settings.save(actor,'normal',{version:0,platform:'XHS',policyId:'workspace',policyRevision:1,threshold:90,channel:'COMMENT',channels:['COMMENT'],content:f.template.body,accounts:[{id:f.account.id,version:f.account.version,dailyLimit:3}]});
 const enabled=await settings.toggle(actor,r.id,{version:r.version,enabled:true,consent:autoContactConsent,hash:ruleHash(r)});
 // Synthetic normal runs begin after enable; old source runs never qualify.
 const review=await db.semanticReview.findUniqueOrThrow({where:{id:f.scope.reviewId}});
 await db.collectionRun.update({where:{id:review.runId},data:{createdAt:new Date()}});
 await db.semanticReview.update({where:{id:f.scope.reviewId},data:{updatedAt:new Date()}});
 return {...f,local,settings,service,r:enabled,inspection,send,devices,runtime,release};
}
it.each(['CONFIRMED','FAILED','UNKNOWN','RISK'])('normal REAL namespace refresh -> dispatch -> independent history: %s (platform IO synthetic)',async kind=>{
 const f=await normalFixture();expect(f.inspection).not.toHaveBeenCalled();expect(f.send).not.toHaveBeenCalled();
 f.send.mockResolvedValue(kind==='CONFIRMED'?{kind,receipt:'e'.repeat(24)}:kind==='RISK'?{kind,reason:'RATE_LIMITED'}:{kind:kind as 'FAILED'|'UNKNOWN',reason:'synthetic'});
 await f.service.tick();await f.service.tick();
 expect(f.inspection,JSON.stringify(await db.auditLog.findMany({where:{action:'AUTO_CONTACT_QUALIFICATION_FAILED'},select:{metadata:true}}))).toHaveBeenCalledTimes(1);expect(f.send).toHaveBeenCalledTimes(1);expect(f.devices.acquire).toHaveBeenCalledTimes(2);
 const expected=kind==='RISK'?'UNKNOWN':kind;
 expect(await db.autoContactJob.findFirst()).toMatchObject({status:expected,accountId:f.account.id});
 expect((await f.settings.history(actor)).items[0]).toMatchObject({outcome:expected});
 expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(kind==='FAILED'?0:1);
 if(expected==='UNKNOWN'){expect(await db.autoContactRule.findFirst()).toMatchObject({enabled:false});expect((await db.autoContactControl.findFirstOrThrow()).pauseReason).toBeTruthy();}
 expect(await db.auditLog.count({where:{action:'SINGLE_REPLY_TEST_AUTHORIZED_RESERVED'}})).toBe(0);
});
it('parallel preparation shares one inspection; stale session evidence cannot authorize a different saved session',async()=>{
 const f=await normalFixture();expect(await Promise.all([f.local.prepare(actor,f.account.id),f.local.prepare(actor,f.account.id)])).toEqual([true,true]);expect(f.inspection).toHaveBeenCalledTimes(1);
 expect((await accountSendObservation(db,f.account.id,new Date())).canSend).toBe(true);
 await db.accountSessionReference.update({where:{accountId:f.account.id},data:{checkedRuntimeId:'different-runtime'}});
 expect((await accountSendObservation(db,f.account.id,new Date())).canSend).toBe(false);
 await f.service.tick();expect(f.inspection).toHaveBeenCalledTimes(2);expect(f.send).toHaveBeenCalledTimes(1);
});
it('qualification failure keeps waiting work and no quota; explicit later successful qualification resumes the same job',async()=>{
 const f=await normalFixture();f.inspection.mockResolvedValueOnce({kind:'UNAVAILABLE',reason:'PROTOCOL_UNAVAILABLE'});
 await f.service.tick();expect(await db.autoContactJob.findFirst()).toMatchObject({status:'WAITING_ACCOUNT'});expect(await db.contactAttempt.count()).toBe(0);expect(f.send).not.toHaveBeenCalled();
 await f.service.tick();expect(f.inspection).toHaveBeenCalledTimes(1);
 // A fresh worker simulates retry after the bounded cooldown/restart, without bypassing database locks.
 const next=new LocalXhsReplySender(db,f.devices,f.runtime,{enabled:true,reviewedSha256:'f'.repeat(64),responseMappingReviewed:true,sendEligibilityReviewed:true});vi.spyOn(next,'capability').mockReturnValue(true);
 await new AutoContactService(db,next).tick();expect(await db.autoContactJob.count()).toBe(1);expect(await db.autoContactJob.findFirst()).toMatchObject({status:'CONFIRMED'});expect(f.send).toHaveBeenCalledTimes(1);
});
it('historical restriction and global UNKNOWN stop preparation and cannot be cleared by fresh clean observations',async()=>{
 const f=await normalFixture();await db.auditLog.create({data:{actorId:actor.id,entityId:f.account.id,action:'ACCOUNT_SEND_OBSERVATION',metadata:{state:'RESTRICTED',source:'SAME_SESSION',observedAt:new Date().toISOString()}}});
 await f.service.tick();expect(f.inspection).not.toHaveBeenCalled();expect(f.send).not.toHaveBeenCalled();expect(await f.local.prepare(actor,f.account.id)).toBe(false);
});
it('concurrent normal ticks never duplicate the send or quota',async()=>{const f=await normalFixture();await Promise.all([f.service.tick(),f.service.tick(),f.service.tick()]);expect(f.send).toHaveBeenCalledTimes(1);expect(await db.contactAttempt.count()).toBe(1);expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(1);});

it.each(['restricted','unverified','stop-unconfirmed'])('normal qualification %s cannot submit, reserve quota, or switch accounts',async kind=>{
 const f=await normalFixture(),normal=f.inspection.getMockImplementation()!,sample=await normal({} as any,new AbortController().signal);
 if(sample.kind!=='READ_ONLY_RESULT')throw Error('fixture');
 if(kind==='restricted'){sample.result.kind='RESTRICTION_VISIBLE';sample.result.observation.warnings=[{code:'BANNED',text:'Synthetic restriction'}];}
 if(kind==='unverified'){sample.result.kind='IDENTITY_UNVERIFIED';sample.result.observation.identity='UNKNOWN';}
 if(kind==='stop-unconfirmed'){sample.ownedStopped=false;sample.result.processStopped=false;vi.mocked(XhsRestrictionInspectionTransport.prototype.close).mockResolvedValue(false);}
 f.inspection.mockResolvedValue(sample);await f.service.tick();await f.service.tick();expect(f.send).not.toHaveBeenCalled();expect(await db.contactAttempt.count()).toBe(0);expect(await db.accountDay.count()).toBe(0);
 if(kind==='unverified')expect(await db.accountSessionReference.findUnique({where:{accountId:f.account.id}})).toMatchObject({state:'EXPIRED',checkedRuntimeId:null});
 else expect((await db.autoContactControl.findFirstOrThrow()).pauseReason).toBe(kind==='restricted'?'ACCOUNT_RESTRICTED':'STOP_UNCONFIRMED');
 if(kind==='stop-unconfirmed')expect(f.release).not.toHaveBeenCalled();
});

it('normal enable excludes historical source even if old result is edited after enable',async()=>{
 const f=await normalFixture(),review=await db.semanticReview.findUniqueOrThrow({where:{id:f.scope.reviewId}});
 await db.collectionRun.update({where:{id:review.runId},data:{createdAt:new Date(f.r.authorizedAt!.getTime()-1000)}});
 await db.semanticReview.update({where:{id:review.id},data:{score:100,updatedAt:new Date()}});
 await f.service.tick();await f.service.tick();expect(f.send).not.toHaveBeenCalled();expect(f.inspection).not.toHaveBeenCalled();expect(await db.contactAttempt.count()).toBe(0);expect(await db.autoContactJob.findFirst()).toMatchObject({status:'SKIPPED'});
});
it('normal scope is rechecked after reservation when source is changed to historical run',async()=>{
 const f=await normalFixture();await f.local.prepare(actor,f.account.id);await f.service.enqueue();const job=await f.service.reserve();expect(job).toBeTruthy();
 const review=await db.semanticReview.findUniqueOrThrow({where:{id:f.scope.reviewId}});await db.collectionRun.update({where:{id:review.runId},data:{createdAt:new Date(0)}});
 await f.service.dispatch(job!.id);expect(f.send).not.toHaveBeenCalled();expect(await db.autoContactJob.findUnique({where:{id:job!.id}})).toMatchObject({status:'CANCELLED'});expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(0);
});
