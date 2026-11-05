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
import {ChannelContactSender} from '../src/auto-contact/local-xhs-dm-sender';
import { ruleHash, quotaBucket } from '../src/auto-contact/contact-policy';
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== '/crm_test')
    throw Error('isolated crm_test required');
const db = new Db({ datasources: { db: { url } } });
const sender: ContactSender = { mode: 'SIMULATION', capability: () => true, healthy: vi.fn(async () => true), send: vi.fn(async (): Promise<SendResult> => ({ kind: 'CONFIRMED', receipt: 'synthetic-receipt' })), reconcile: vi.fn(async (): Promise<SendResult> => ({ kind: 'FAILED', reason: 'synthetic verification: not sent' })) };
const settings = new ContactSettingsService(db, sender), service = new AutoContactService(db, sender);
let actor: Actor, sales: Actor, app: INestApplication;
let auth = { cookie: '', csrf: '' };
async function clean() { await db.$executeRawUnsafe('TRUNCATE "ManualReplyRequest", "PostAvailability", "PostAvailabilityEvent", "AutoContactJob", "AutoContactRule", "AutoContactControl", "ContactAttempt", "ContactLedger", "AccountDay", "User", "PlatformAccount", "PlatformIdentity", "CollectionConfig", "ModelSettings", "CommentReviewPolicy" CASCADE'); }
async function source(recipient: string = randomUUID(), patch: Record<string, unknown> = {}) {
    const config = await db.collectionConfig.create({ data: { name: '合成来源', platform: 'XHS', keywords: [], excludeWords: [] } }), run = await db.collectionRun.create({ data: { configId: config.id, revision: 1, snapshot: {mode:'MOCK',strictStages:{version:1,policies:[{id:'workspace',version:1,revision:1,modelVersion:null}]}}, capturedPosts:1,capturedCommentsCount:1,finishedAt:new Date(),requestKey: randomUUID(), scenario: 'BASELINE', status: 'COMPLETE' } }), post = await db.capturedPost.create({ data: { configId: config.id, runId: run.id, lastRunId: run.id, platformPostId: randomUUID(), contentHash: randomUUID(), snapshot: {}, coverage: 'COMPLETE' } }), snapshot = { postId: post.platformPostId, commentId: randomUUID(), userId: recipient, comment: '合成数学专业', coverage: 'COMPLETE', isDemo: true, targetComment: { userId: 'not-recipient', id: 'not-reply-target' } };
    const c = await db.capturedComment.create({ data: { configId: config.id, runId: run.id, lastRunId: run.id, postId: post.id, platformCommentId: snapshot.commentId, contentHash: randomUUID(), contextVersion: 'v1', snapshot, isDemo: true } });
    await db.autoReviewJob.create({data:{runId:run.id,postId:post.id,policyId:'workspace',policyVersion:1,status:'COMPLETED',processed:1}});
    return db.semanticReview.create({ data: { configId: config.id, runId: run.id, revision: 1, snapshotHash: randomUUID(), platform: 'XHS', platformUserId: recipient, snapshot, rules: { target: '合成专业目标' }, state: 'EVALUATED', score: 95, reason: '合成证据', context: 'SUFFICIENT', result: { decision: 'MATCH', evidence: [{ source: 'COMMENT', quote: '数学专业' }] }, provider: 'QWEN', modelVersion: 'synthetic-model-v1', selectedModel: 'qwen3.8-flash', isDemo: true, captureId: c.id, sourceContentHash:c.contentHash,policyId: 'workspace', policyRevision: 1, evaluationInput: { inputPolicyVersion: 'synthetic-raw', observationPolicy: 'current-capture-observation-v1' }, ...patch } });
}
async function rule(id = 'workspace', channel: 'COMMENT' | 'DM' = 'COMMENT', limits = [1, 1]) { const accounts = await Promise.all(limits.map((dailyLimit, i) => db.platformAccount.create({ data: { platform: 'XHS', label: `合成账号 ${id}-${i}`, dailyLimit, isDemo: true } }))); const r = await settings.save(actor, id, { version: 0, platform: 'XHS', policyId: 'workspace', policyRevision: 1, threshold: 80, channel, content: '仅隔离测试的合成文字', accounts: accounts.map(a => ({ id: a.id, version: a.version, dailyLimit: a.dailyLimit })) }); return { r: await settings.toggle(actor, id, { version: r.version, enabled: true, consent: autoContactConsent, hash: ruleHash(r) }), accounts }; }
beforeAll(async () => { const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(Db).useValue(db).overrideProvider(CONTACT_SENDER).useValue(sender).compile(); app = module.createNestApplication({ bodyParser: false }); configure(app); await app.init(); });
beforeEach(async () => { await clean(); vi.restoreAllMocks(); (sender.send as any).mockReset().mockResolvedValue({ kind: 'CONFIRMED', receipt: 'synthetic-receipt' }); (sender.healthy as any).mockReset().mockResolvedValue(true); (sender.reconcile as any).mockReset().mockResolvedValue({ kind: 'FAILED', reason: 'not sent' }); actor = await db.user.create({ data: { email: randomUUID() + '@example.invalid', name: '合成管理员', role: 'ADMIN', passwordHash: 'unused' } }); sales = await db.user.create({ data: { email: randomUUID() + '@example.invalid', name: '合成销售', role: 'SALES', passwordHash: 'unused' } }); const token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex'); await db.session.create({ data: { id: digest(token), userId: actor.id, csrfToken: csrf, expiresAt: new Date(Date.now() + 600000) } }); auth = { cookie: 'crm_session=' + token, csrf }; await db.commentReviewPolicy.create({ data: { id: 'workspace', autoEnabled:true,name: '合成', target: '合成目标', revisions: { create: { revision: 1, target: '合成目标' } } } }); await db.modelSettings.create({ data: { id: 'model', model: 'qwen3.8-flash', priceVersion: 'synthetic', consent: false } }); });
afterAll(async () => { await clean(); await app.close(); await db.$disconnect(); });
it('explicitly disabled real capability blocks enable; saving cannot call sender or model', async () => { const defaultModule = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(Db).useValue(db).compile(); const defaultSender = defaultModule.get<ContactSender>(CONTACT_SENDER); expect(defaultSender).toBeInstanceOf(ChannelContactSender); /* Exercise the disabled branch independently of the locally approved deployment. */ vi.spyOn(defaultSender,'capability').mockReturnValue(false); const real = new ContactSettingsService(db, defaultSender); await defaultModule.close(); expect((await real.overview(actor)).capability.available).toBe(false); const r = await real.save(actor, 'empty', { version: 0, platform: 'XHS', policyId: 'workspace', policyRevision: 1, threshold: 80, channel: 'COMMENT', content: '', accounts: [] }); expect(r.enabled).toBe(false); await expect(real.toggle(actor, r.id, { version: r.version, enabled: true, consent: autoContactConsent, hash: ruleHash(r) })).rejects.toThrow('尚未接通'); expect(sender.send).not.toHaveBeenCalled(); expect(await db.semanticModelCall.count()).toBe(0); });
it('high score alone, insufficient, nonmatch, rejected and before-authorization never enqueue', async () => { await source(); await rule(); await source(randomUUID(), { context: 'INSUFFICIENT' }); await source(randomUUID(), { score: 79 }); await source(randomUUID(), { result: { decision: 'UNCERTAIN' } }); await source(randomUUID(), { reviewStatus: 'REJECTED' }); await source(); await service.tick(); expect(sender.send).toHaveBeenCalledTimes(1); expect(await db.autoContactJob.count({ where: { status: 'SIMULATED_SUCCESS' } })).toBe(1); expect(await db.contactAttempt.count({ where: { outcome: 'CONFIRMED' } })).toBe(0); });
it('correct reply author/post/comment are sent once, unrelated targetComment ignored; binding conflicts fail closed', async () => { await rule(); const r = await source(); await service.tick(); const request = (sender.send as any).mock.calls[0][0], s = r.snapshot as any; expect(request).toMatchObject({ recipientId: r.platformUserId, commentId: s.commentId, postId: s.postId, channel: 'COMMENT' }); expect(request.commentId).not.toBe('not-reply-target'); const bad = await source(); await db.capturedComment.update({ where: { id: bad.captureId! }, data: { snapshot: { ...(bad.snapshot as any), userId: 'conflict' } } }); await service.tick(); expect(sender.send).toHaveBeenCalledTimes(1); expect(await db.autoContactJob.count({ where: { reviewId:bad.id } })).toBe(0); });
it('same-channel cross-account duplicate lock allows at most one per channel', async () => { await rule('reply'); await rule('dm', 'DM'); const id = randomUUID(); await source(id); await source(id); await Promise.all([service.tick(), service.tick(), service.tick()]); await service.tick(); await service.tick(); expect(sender.send).toHaveBeenCalledTimes(2); expect(new Set((sender.send as any).mock.calls.map((x:any)=>x[0].channel))).toEqual(new Set(['COMMENT','DM'])); expect(await db.contactLedger.count({ where: { mode: 'SIMULATION' } })).toBe(1); expect(await db.contactAttempt.count()).toBe(2); });
it('shared quota allocates other recipients to next account; entire exhausted pool becomes manual pending and never resumes across Shanghai days', async () => { const { accounts } = await rule(); await source(); await source(); await source(); await service.tick(); await service.tick(); await service.tick(); expect(sender.send).toHaveBeenCalledTimes(2); expect((sender.send as any).mock.calls.map((c: any) => c[0].accountId)).toEqual(accounts.map(a => a.id)); expect(await db.autoContactJob.count({ where: { status: 'PENDING_ACTION' } })).toBe(1); const future = new Date(Date.now() + 86400000); vi.spyOn(service, 'now').mockResolvedValue(future); await service.tick(); expect(sender.send).toHaveBeenCalledTimes(2); await service.tick(); expect(sender.send).toHaveBeenCalledTimes(2); });
it('UNKNOWN retains original-day quota through late failure and never automatically retries same user', async () => { const { accounts } = await rule(); (sender.send as any).mockResolvedValueOnce({ kind: 'UNKNOWN', reason: 'synthetic' }); const row = await source(); await service.tick(); const j = await db.autoContactJob.findFirstOrThrow(), a = await db.contactAttempt.findFirstOrThrow(); expect(j.status).toBe('UNKNOWN'); expect((await db.accountDay.findUniqueOrThrow({ where: { accountId_day: { accountId: accounts[0].id, day: a.day } } })).occupied).toBe(1); await source(row.platformUserId); await service.tick(); expect(sender.send).toHaveBeenCalledTimes(1); vi.spyOn(service, 'now').mockResolvedValue(new Date(Date.now() + 86400000)); await service.reconcile(actor, j.id, 'synthetic-query-receipt'); expect((await db.accountDay.findUniqueOrThrow({ where: { accountId_day: { accountId: accounts[0].id, day: a.day } } })).occupied).toBe(1); await service.reconcile(actor, j.id, 'again');expect((await db.contactAttempt.findFirstOrThrow()).outcome).toBe('UNKNOWN'); await service.tick(); expect(sender.send).toHaveBeenCalledTimes(1); });
it.each(['RATE_LIMITED', 'VERIFICATION', 'BANNED', 'PLATFORM_REFUSED'])('platform %s pauses every related rule without account rotation', async (reason) => { await rule('a'); await rule('b', 'DM'); await source(); await source(); (sender.send as any).mockResolvedValueOnce({ kind: 'RISK', reason }); await service.tick(); await service.tick(); await service.tick(); expect(sender.send).toHaveBeenCalledTimes(1); expect(await db.autoContactRule.count({ where: { enabled: true } })).toBe(0); expect(await db.autoContactControl.findFirst()).toMatchObject({ pauseReason: reason }); const r = await db.autoContactRule.findUniqueOrThrow({ where: { id: 'b' } }); await expect(settings.toggle(actor, 'b', { version: r.version, enabled: true, consent: autoContactConsent, hash: ruleHash(r) })).rejects.toThrow('风控'); });
it('concurrent enqueue, reservation and duplicate dispatch are exactly one invocation', async () => { await rule(); await source(); await Promise.all([service.enqueue(), service.enqueue()]); const [a, b] = await Promise.all([service.reserve(), service.reserve()]); const j = a || b; expect(j).toBeTruthy(); await Promise.all([service.dispatch(j!.id), service.dispatch(j!.id)]); expect(sender.send).toHaveBeenCalledTimes(1); expect(await db.autoContactJob.count()).toBe(1); });
it('disable cancels reserved quota before send; stale previous enable cannot re-enable', async () => { const { r } = await rule(); await source(); await service.enqueue(); const j = await service.reserve(); await settings.toggle(actor, r.id, { version: r.version, enabled: false }); await service.dispatch(j!.id); expect(sender.send).not.toHaveBeenCalled(); expect(await db.autoContactJob.findUnique({ where: { id: j!.id } })).toMatchObject({ status: 'CANCELLED' }); expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(0); await expect(settings.toggle(actor, r.id, { version: r.version, enabled: true, consent: autoContactConsent, hash: ruleHash(r) })).rejects.toThrow('已变化'); });
it.each(['target', 'review', 'account', 'quota', 'model', 'role'])('rechecks %s at final dispatch; no request after changed authorization', async (kind) => { const { accounts } = await rule(); const row = await source(); await service.enqueue(); const j = await service.reserve(); if (kind === 'target')
    await db.commentReviewPolicy.update({ where: { id: 'workspace' }, data: { revision: 2 } }); if (kind === 'review')
    await db.semanticReview.update({ where: { id: row.id }, data: { reviewStatus: 'REJECTED', version: { increment: 1 } } }); if (kind === 'account')
    await db.platformAccount.update({ where: { id: accounts[0].id }, data: { status: 'PAUSED' } }); if (kind === 'quota')
    await db.platformAccount.update({ where: { id: accounts[0].id }, data: { dailyLimit: 0 } }); if (kind === 'model')
    await db.modelSettings.updateMany({ data: { model: 'other-model' } }); if (kind === 'role')
    await db.user.update({ where: { id: actor.id }, data: { role: 'SALES' } }); await service.dispatch(j!.id); expect(sender.send).not.toHaveBeenCalled(); expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(0); });
it.each(['present','missing'])('crashed attempted operation pauses with %s control row and is never dispatched again', async control => { await rule(); await source(); await service.enqueue(); const j = await service.reserve(); await db.autoContactJob.update({ where: { id: j!.id }, data: { status: 'ATTEMPTED', leaseUntil: new Date(0) } }); await db.contactAttempt.update({ where: { id: j!.attemptId! }, data: { outcome: 'ATTEMPTED' } }); if(control==='missing')await db.autoContactControl.deleteMany(); await service.tick(); expect(await db.autoContactJob.findUnique({ where: { id: j!.id } })).toMatchObject({ status: 'UNKNOWN' }); expect(sender.send).not.toHaveBeenCalled(); expect(await db.autoContactRule.count({where:{enabled:true}})).toBe(0); expect(await db.autoContactControl.findFirst()).toMatchObject({pauseReason:'STOP_UNCONFIRMED'}); await expect(settings.cancel(actor, j!.id)).rejects.toThrow('不能取消'); });
it('cancel and confirmed failed attempt release quota; failed recipient never rotates/retries', async () => { await rule('one', 'COMMENT', [1]); const row = await source(); (sender.send as any).mockResolvedValueOnce({ kind: 'FAILED', reason: 'not sent' }); await service.tick(); expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(0); await source(row.platformUserId); await source(); await service.enqueue(); const cancelJob = await db.autoContactJob.findFirstOrThrow({ where: { status: 'QUEUED', recipientId: { not: row.platformUserId } } }); await settings.cancel(actor, cancelJob.id); await settings.cancel(actor, cancelJob.id); await service.tick(); expect(sender.send).toHaveBeenCalledTimes(1); });
it('legacy simulation history and UTC quota remain intact and separate from new delivery namespace', async () => { const { accounts } = await rule(); const row = await source(), identity = await db.platformIdentity.create({ data: { platform: 'XHS', platformUserId: row.platformUserId, nickname: '合成', isDemo: true } }), ledger = await db.contactLedger.create({ data: { identityId: identity.id, accountId: accounts[0].id } }), old = await db.contactAttempt.create({ data: { ledgerId: ledger.id, requestKey: randomUUID(), kind: 'FIRST', outcome: 'SIMULATED_SUCCESS', day: '2026-10-26', actorId: actor.id } }); await db.accountDay.create({ data: { accountId: accounts[0].id, day: old.day, occupied: 1 } }); await service.tick(); expect(sender.send).toHaveBeenCalledTimes(1); expect(await db.contactAttempt.findUnique({ where: { id: old.id } })).toEqual(old); expect(await db.contactLedger.count({ where: { identityId: identity.id } })).toBe(2); expect((await db.accountDay.findUniqueOrThrow({ where: { accountId_day: { accountId: accounts[0].id, day: old.day } } })).occupied).toBe(1); expect(await db.contactLedger.count({ where: { mode: 'REAL' } })).toBe(0); });
it('unknown and confirmed summary separated; quota increases outside rule cannot expand old consent', async () => { const { accounts } = await rule('one', 'COMMENT', [1]); await db.platformAccount.update({ where: { id: accounts[0].id }, data: { dailyLimit: 10 } }); await source(); await source(); (sender.send as any).mockResolvedValueOnce({ kind: 'UNKNOWN', reason: 'network' }); await service.tick(); await service.tick(); expect(sender.send).toHaveBeenCalledTimes(1); const o = await settings.overview(actor); expect(o.accounts[0]).toMatchObject({ occupied: 1, unknown: 1, confirmed: 0, reserved: 0 }); expect((await db.autoContactControl.findFirstOrThrow()).pauseReason).toBe('SUBMISSION_UNKNOWN');expect(await db.autoContactRule.count({where:{enabled:true}})).toBe(0); });
it('admin access and CSRF on writes; read endpoints have no side effects; ledger pagination stable', async () => { const api = request(app.getHttpServer()), base = '/api/auto-contact'; expect((await api.get(base)).status).toBe(401); await expect(settings.overview(sales)).rejects.toThrow(); expect((await api.get(base).set('Cookie', auth.cookie)).status).toBe(200); expect(await db.autoContactRule.count()).toBe(0); expect((await api.put(base + '/rules/workspace').set('Cookie', auth.cookie).send({})).status).toBe(403); await rule('one', 'COMMENT', [100]); for (let i = 0; i < 23; i++)
    await source(); await service.enqueue(); expect((await settings.jobs(actor, 0)).items).toHaveLength(20); expect((await settings.jobs(actor, 20)).items).toHaveLength(3); expect(new Set([...(await settings.jobs(actor, 0)).items, ...(await settings.jobs(actor, 20)).items].map(i => i.id)).size).toBe(23); await expect(settings.cancel(sales, (await db.autoContactJob.findFirstOrThrow()).id)).rejects.toThrow(); });
it('bounded scan advances beyond 100 reviews without display pagination loss', async () => { await rule('large', 'COMMENT', [200]); for (let i = 0; i < 106; i++)
    await source(); expect(await service.enqueue()).toBe(106); expect(await service.enqueue()).toBe(0); expect(await service.enqueue()).toBe(0); expect(await db.autoContactJob.count({ where: { status: 'QUEUED' } })).toBe(106); expect(sender.send).not.toHaveBeenCalled(); });
it.each([{ kind: 'CONFIRMED', receipt: '' }, { kind: 'CONFIRMED', receipt: '   ' }, { kind: 'CONFIRMED', receipt: 'x'.repeat(501) }, { kind: 'FAKE' }, { kind: 'FAILED', reason: 'x'.repeat(501) }])('invalid receipt/adapter shape becomes UNKNOWN and holds quota: %j', async (result) => { await rule(); await source(); (sender.send as any).mockResolvedValueOnce(result); await service.tick(); expect((await db.autoContactJob.findFirstOrThrow()).status).toBe('UNKNOWN'); expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(1); await service.tick(); expect(sender.send).toHaveBeenCalledTimes(1); });
it.each(['throw', 'blocked'])('adapter %s pauses all rules, holds quota and prevents account rotation', async kind => { await rule('one', 'COMMENT', [2]); await rule('two', 'DM'); await source(); await source(); if(kind==='throw') (sender.send as any).mockRejectedValueOnce(new Error('synthetic connection loss')); else (sender.send as any).mockResolvedValueOnce({kind:'BLOCKED',reason:'STOP_UNCONFIRMED'}); await service.tick(); await service.tick(); expect((await db.autoContactJob.findFirstOrThrow({where:{status:'UNKNOWN'}})).status).toBe('UNKNOWN'); expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(1); expect(await db.autoContactRule.count({where:{enabled:true}})).toBe(0); expect(await db.autoContactControl.findFirst()).toMatchObject({pauseReason:'STOP_UNCONFIRMED'}); expect(sender.send).toHaveBeenCalledTimes(1); });
it('expired unattempted reservation releases without send or platform pause', async () => { await rule(); await source(); await service.enqueue(); const j=await service.reserve(); await db.autoContactJob.update({where:{id:j!.id},data:{leaseUntil:new Date(0)}}); await service.reserve(); expect(await db.autoContactJob.findUnique({where:{id:j!.id}})).toMatchObject({status:'CANCELLED'}); expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(0); expect((await db.autoContactControl.findFirstOrThrow()).pauseReason).toBeNull(); expect(sender.send).not.toHaveBeenCalled(); });
it('unhealthy pool waits, adapter health changes cancel before invocation', async () => { const { accounts } = await rule(); await source(); await db.platformAccount.updateMany({ where: { id: { in: accounts.map(a => a.id) } }, data: { status: 'PAUSED' } }); await service.tick(); expect((await db.autoContactJob.findFirstOrThrow()).status).toBe('WAITING_ACCOUNT'); await db.platformAccount.updateMany({ where: { id: { in: accounts.map(a => a.id) } }, data: { status: 'UNCONNECTED' } }); (sender.healthy as any).mockResolvedValue(false); await service.tick(); expect((await db.autoContactJob.findFirstOrThrow()).status).toBe('CANCELLED'); expect(sender.send).not.toHaveBeenCalled(); });
it('stale account settings do not overwrite a concurrent quota edit', async () => { const { r, accounts } = await rule(); const a = await db.platformAccount.findUniqueOrThrow({ where: { id: accounts[0].id } }); await db.platformAccount.update({ where: { id: a.id }, data: { dailyLimit: 7, version: { increment: 1 } } }); await expect(settings.save(actor, r.id, { version: r.version, platform: 'XHS', policyId: 'workspace', policyRevision: 1, threshold: 80, channel: 'COMMENT', content: '合成', accounts: [{ id: a.id, version: a.version, dailyLimit: 3 }] })).rejects.toThrow('账号额度或状态已变化'); expect((await db.platformAccount.findUniqueOrThrow({ where: { id: a.id } })).dailyLimit).toBe(7); });
it.each(['do-not-contact','manual-contact'])('existing %s protection blocks new contact without changing CRM history',async kind=>{
 await rule();const row=await source();const identity=await db.platformIdentity.create({data:{platform:'XHS',platformUserId:row.platformUserId,nickname:'合成',isDemo:false}});
 const lead=await db.lead.create({data:{identityId:identity.id,summary:'合成历史',evidence:'合成证据',isDemo:false,...(kind==='do-not-contact'?{doNotContact:true}:{contactedAt:new Date(),contactStage:'CONTACTED' as const})}});
 await service.tick();expect(sender.send).not.toHaveBeenCalled();expect((await db.autoContactJob.findFirstOrThrow()).status).toBe('SKIPPED');expect(await db.lead.findUnique({where:{id:lead.id}})).toEqual(lead);
});
it('disable during an attempted send allows only its receipt, never cancels/refunds or starts another',async()=>{
 const {r}=await rule();await source();await source();await service.enqueue();const j=await service.reserve();let resolve!:(r:SendResult)=>void;(sender.send as any).mockImplementationOnce(()=>new Promise<SendResult>(ok=>{resolve=ok;}));
 const pending=service.dispatch(j!.id);await vi.waitFor(()=>expect(sender.send).toHaveBeenCalledTimes(1));await expect(settings.cancel(actor,j!.id)).rejects.toThrow('不能取消');await settings.toggle(actor,r.id,{version:r.version,enabled:false});await service.tick();resolve({kind:'CONFIRMED',receipt:'synthetic-receipt'});await pending;expect(sender.send).toHaveBeenCalledTimes(1);expect((await db.autoContactJob.findUniqueOrThrow({where:{id:j!.id}})).status).toBe('SIMULATED_SUCCESS');expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(1);
});

it('dispatch deadline pauses before allowing another account and aborts the sender',async()=>{await rule();await source();await source();let signal:AbortSignal|undefined;(sender.send as any).mockImplementationOnce((_r:any,s:AbortSignal)=>{signal=s;return new Promise(()=>{});});const realSetTimeout=globalThis.setTimeout;vi.spyOn(globalThis,'setTimeout').mockImplementation(((fn:any,ms:any,...args:any[])=>realSetTimeout(fn,ms===60000?10:ms,...args)) as any);await service.tick();await service.tick();expect(signal?.aborted).toBe(true);expect(sender.send).toHaveBeenCalledTimes(1);expect(await db.autoContactControl.findFirst()).toMatchObject({pauseReason:'STOP_UNCONFIRMED'});expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(1);});

// One-shot fixtures only. These tests never launch a browser or contact a platform.
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
it('one-shot reserves real namespace once while keeping account PAUSED and all automation OFF',async()=>{
 const f=await oneShotFixture();const result=await f.service.execute(actor,f.scope);expect(result.outcome).toBe('UNKNOWN');expect(f.calls()).toBe(1);expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(1);expect((await db.platformAccount.findUniqueOrThrow({where:{id:f.account.id}})).status).toBe('PAUSED');expect(await db.autoContactRule.count()).toBe(0);expect(await db.autoContactJob.count()).toBe(0);expect((await db.autoContactControl.findFirstOrThrow()).activeJobId).toBeNull();expect(await db.auditLog.count({where:{action:'SINGLE_REPLY_TEST_DISPATCHED_ONCE'}})).toBe(1);
 expect(await f.service.execute(actor,f.scope)).toMatchObject({reused:true,outcome:'UNKNOWN'});expect(f.calls()).toBe(1);
});
it('concurrent same approval consumes only one invocation and one quota unit',async()=>{const f=await oneShotFixture();await Promise.all([f.service.execute(actor,f.scope),f.service.execute(actor,f.scope)]);expect(f.calls()).toBe(1);expect(await db.contactAttempt.count()).toBe(1);expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(1);});
it.each(['score','uncertain','target','text','paused','expired','template-linked'])('one-shot rejects changed %s before reservation or executor',async kind=>{
 const f=await oneShotFixture();if(kind==='score')await db.semanticReview.update({where:{id:f.scope.reviewId},data:{score:90}});if(kind==='uncertain')await db.semanticReview.update({where:{id:f.scope.reviewId},data:{result:{decision:'UNCERTAIN',evidence:[{source:'COMMENT',quote:'evidence'}]}}});if(kind==='target')f.scope.commentId='f'.repeat(24);if(kind==='text')f.scope.content='changed';if(kind==='paused')await db.platformAccount.update({where:{id:f.account.id},data:{pauseReason:'RATE_LIMITED'}});if(kind==='expired')f.scope.expiresAt=new Date(0).toISOString();if(kind==='template-linked')await db.collectionConfig.updateMany({data:{defaultReplyTemplateId:f.template.id}});
 await expect(f.service.execute(actor,f.scope)).rejects.toThrow();expect(f.executor.run).not.toHaveBeenCalled();expect(await db.contactAttempt.count()).toBe(0);
});
it('one-shot refuses exhausted configured account quota without expanding it',async()=>{const f=await oneShotFixture();await db.accountDay.create({data:{accountId:f.account.id,day:quotaBucket('REAL',new Date()),occupied:3}});await expect(f.service.execute(actor,f.scope)).rejects.toThrow('QUOTA');expect(f.executor.run).not.toHaveBeenCalled();expect((await db.platformAccount.findUniqueOrThrow({where:{id:f.account.id}})).dailyLimit).toBe(3);});
it('one-shot unknown blocks a new approval for the recipient across channels/accounts',async()=>{const f=await oneShotFixture();await f.service.execute(actor,f.scope);const attempt=await db.contactAttempt.findFirstOrThrow();await db.contactAttempt.update({where:{id:attempt.id},data:{channel:'DM'}});await expect(f.service.execute(actor,{...f.scope,approvalId:randomUUID()})).rejects.toThrow('PLATFORM_BUSY_OR_PAUSED');expect(f.calls()).toBe(1);});
it('one-shot pre-submit refusal refunds once but consumes the approval permanently',async()=>{const f=await oneShotFixture();f.executor.run.mockResolvedValue({result:{kind:'FAILED',reason:'synthetic target missing'},protocolCalls:0,submission:'NOT_ATTEMPTED',identityVerified:true,stopped:true} as any);expect((await f.service.execute(actor,f.scope)).outcome).toBe('FAILED');expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(0);expect((await db.auditLog.findFirstOrThrow({where:{action:'SINGLE_REPLY_TEST_FINISHED'}})).metadata).toMatchObject({result:'NOT_ATTEMPTED',resultReason:'synthetic target missing'});await f.service.execute(actor,f.scope);expect(f.executor.run).toHaveBeenCalledTimes(1);});
it.each(['RISK','BLOCKED'])('one-shot %s keeps quota and pauses the platform',async kind=>{const f=await oneShotFixture();f.executor.run.mockImplementation(async(_c,before)=>{await before();return {result:{kind,reason:kind==='RISK'?'RATE_LIMITED':'STOP_UNCONFIRMED'},protocolCalls:1,submission:'AT_MOST_ONCE_UNKNOWN',identityVerified:true,stopped:false} as any;});expect((await f.service.execute(actor,f.scope)).outcome).toBe('UNKNOWN');expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(1);expect((await db.autoContactControl.findFirstOrThrow()).pauseReason).toBe(kind==='RISK'?'RATE_LIMITED':'STOP_UNCONFIRMED');});
it('one-shot rechecks scope after preflight and permits beforeSubmit only once',async()=>{const f=await oneShotFixture();f.executor.run.mockImplementation(async(_c,before)=>{expect(await before()).toBe(true);expect(await before()).toBe(false);return {result:{kind:'UNKNOWN',reason:'synthetic'},protocolCalls:1,submission:'AT_MOST_ONCE_UNKNOWN',identityVerified:true,stopped:true};});await f.service.execute(actor,f.scope);expect(await db.auditLog.count({where:{action:'SINGLE_REPLY_TEST_DISPATCHED_ONCE'}})).toBe(1);});
it('one-shot template change during read-only preflight prevents the submit callback',async()=>{const f=await oneShotFixture();f.executor.run.mockImplementation(async(_c,before)=>{await db.replyTemplate.update({where:{id:f.template.id},data:{body:'changed'}});await expect(before()).rejects.toThrow();return {result:{kind:'FAILED',reason:'synthetic scope changed'},protocolCalls:0,submission:'NOT_ATTEMPTED',identityVerified:true,stopped:true} as any;});await f.service.execute(actor,f.scope);expect(await db.auditLog.count({where:{action:'SINGLE_REPLY_TEST_DISPATCHED_ONCE'}})).toBe(0);expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(0);});

// Availability is exercised only in this randomly provisioned, synthetic database.
import {markAvailability,readAvailability} from '../src/collection/post-availability';
import {CaptureService} from '../src/collection/capture.service';
async function captureFor(row:{captureId:string|null}){return db.capturedComment.findUniqueOrThrow({where:{id:row.captureId!}});}
async function mark(row:{captureId:string|null},reason:string,version=0){return markAvailability(db,actor,(await captureFor(row)).postId,{reason,version,evidence:'Synthetic offline observation and source, never real platform evidence',confirmDeleted:reason==='MANUAL_DELETED'});}
it.each(['HTTP_404','REDIRECT','LOGIN_REQUIRED','RATE_LIMITED','NETWORK_ERROR','NO_RESULT','MANUAL_DELETED'])('known %s blocks enqueue; no send, quota or loss of archive',async reason=>{
 await rule();const r=await source(),c=await captureFor(r),before=await db.capturedPost.findUniqueOrThrow({where:{id:c.postId}});const status=await mark(r,reason);
 await service.tick();expect(sender.send).not.toHaveBeenCalled();expect(await db.contactAttempt.count()).toBe(0);expect(await db.accountDay.count()).toBe(0);expect(await db.autoContactJob.findFirst()).toMatchObject({status:'BLOCKED_POST',postId:before.platformPostId});
 expect(await db.capturedPost.findUnique({where:{id:c.postId}})).toEqual(before);expect(await db.semanticReview.findUnique({where:{id:r.id}})).toEqual(r);expect(status.state).toBe(reason==='MANUAL_DELETED'?'CONFIRMED_DELETED':reason==='NO_RESULT'?'UNKNOWN':'UNAVAILABLE');
});
it('reserved inaccessible post refunds original day once; healthy unrelated task still dispatches',async()=>{
 await rule('r','COMMENT',[3]);const bad=await source();await service.enqueue();const j=await service.reserve(),attempt=await db.contactAttempt.findUniqueOrThrow({where:{id:j!.attemptId!}});
 vi.spyOn(service,'now').mockResolvedValue(new Date(Date.now()+86400000));await mark(bad,'HTTP_404');await service.dispatch(j!.id);
 expect(await db.autoContactJob.findUnique({where:{id:j!.id}})).toMatchObject({status:'BLOCKED_POST'});expect(await db.contactAttempt.findUnique({where:{id:attempt.id}})).toMatchObject({outcome:'CANCELLED'});expect((await db.accountDay.findUniqueOrThrow({where:{accountId_day:{accountId:j!.accountId!,day:attempt.day}}})).occupied).toBe(0);
 await mark(bad,'HTTP_404',1);expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(0);await source();await service.tick();expect(sender.send).toHaveBeenCalledTimes(1);
});
it('state change during health check blocks final dispatch and frees reservation',async()=>{
 await rule();const r=await source();await service.enqueue();const j=await service.reserve();(sender.healthy as any).mockImplementationOnce(async()=>{await mark(r,'LOGIN_REQUIRED');return true;});await service.dispatch(j!.id);expect(sender.send).not.toHaveBeenCalled();expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(0);
});
it('quota-held work stays pending after rollover and manual preview still rejects restored stale post',async()=>{
 const {r,accounts}=await rule('r','COMMENT',[1]);await source();await service.tick();const row=await source();await service.tick();const waiting=await db.autoContactJob.findFirstOrThrow({where:{status:'PENDING_ACTION'}});await mark(row,'HTTP_404');await mark(row,'EXACT_VISIBLE',1);
 vi.spyOn(service,'now').mockResolvedValue(new Date(Date.now()+86400000));await service.tick();expect(sender.send).toHaveBeenCalledTimes(1);expect(await db.autoContactJob.findUnique({where:{id:waiting.id}})).toMatchObject({status:'PENDING_ACTION'});await expect(pending.preview(actor,{accountId:accounts[0].id,jobs:[{id:waiting.id,version:waiting.updatedAt.toISOString()}]})).rejects.toThrow();
 // A fresh rule alone cannot recycle an old review after loss of accessibility.
 const off=await settings.toggle(actor,r.id,{version:r.version,enabled:false});await settings.toggle(actor,r.id,{version:off.version,enabled:true,consent:autoContactConsent,hash:ruleHash(off)});await service.tick();expect(sender.send).toHaveBeenCalledTimes(1);
 expect(await db.contactLedger.count()).toBe(1);expect((await db.platformAccount.findUniqueOrThrow({where:{id:accounts[0].id}})).dailyLimit).toBe(1);
});
it.each(['CONFIRMED','UNKNOWN'])('%s history, identity lock, snapshots and quota survive confirmed deletion',async kind=>{
 await rule();const r=await source();(sender.send as any).mockResolvedValueOnce(kind==='CONFIRMED'?{kind,receipt:'synthetic-platform-receipt'}:{kind,reason:'synthetic uncertain'});await service.tick();const job=await db.autoContactJob.findFirstOrThrow(),attempt=await db.contactAttempt.findFirstOrThrow(),c=await captureFor(r);
 await mark(r,'MANUAL_DELETED');expect(await db.autoContactJob.findUnique({where:{id:job.id}})).toEqual(job);expect(await db.contactAttempt.findUnique({where:{id:attempt.id}})).toEqual(attempt);expect(attempt.accountIdSnapshot).toBe(job.accountId);expect(attempt.historySnapshot).toMatchObject({recipientId:job.recipientId,postId:job.postId,commentId:job.commentId});expect(job.sourceSnapshot).toMatchObject({comment:r.snapshot});
 for(const action of [()=>db.capturedPost.delete({where:{id:c.postId}}),()=>db.capturedComment.delete({where:{id:c.id}}),()=>db.collectionRun.delete({where:{id:c.runId}}),()=>db.collectionConfig.delete({where:{id:c.configId}}),()=>db.contactLedger.delete({where:{id:attempt.ledgerId}}),async()=>db.platformIdentity.deleteMany()])await expect(action()).rejects.toThrow();
 if(kind==='UNKNOWN')await expect(rule('second-account','DM')).rejects.toThrow('暂停');else await rule('second-account','DM');await source(r.platformUserId);await service.tick();expect(sender.send).toHaveBeenCalledTimes(kind==='CONFIRMED'?2:1);expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(1);
 const view=(await settings.jobs(actor,0)).items.find(v=>v.id===job.id)!;expect(view.availability.state).toBe('CONFIRMED_DELETED');expect(view.sourceSnapshot).toEqual(job.sourceSnapshot);
});
it('attempt already in flight remains uncertain through invalidation; never released by state mutation',async()=>{
 await rule();const r=await source();await service.enqueue();const j=await service.reserve();let resolve!:(r:SendResult)=>void;(sender.send as any).mockImplementationOnce(()=>new Promise<SendResult>(ok=>resolve=ok));const pending=service.dispatch(j!.id);await vi.waitFor(()=>expect(sender.send).toHaveBeenCalledTimes(1));await mark(r,'HTTP_404');expect((await db.contactAttempt.findFirstOrThrow()).outcome).toBe('ATTEMPTED');expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(1);resolve({kind:'UNKNOWN',reason:'synthetic no receipt'});await pending;expect((await db.autoContactJob.findFirstOrThrow()).status).toBe('UNKNOWN');expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(1);
});
it('availability HTTP permissions, CSRF, stale version, explicit deletion and no-op recheck',async()=>{
 const r=await source(),c=await captureFor(r),base='/api/collection/captured-posts/'+c.postId+'/availability',api=request(app.getHttpServer());
 expect((await api.get(base)).status).toBe(401);await expect(readAvailability(db,sales,c.postId)).rejects.toThrow();await expect(markAvailability(db,sales,c.postId,{version:0,reason:'HTTP_404',evidence:'synthetic observation'})).rejects.toThrow();
 const current=await api.get(base).set('Cookie',auth.cookie);expect(current.status).toBe(200);expect(current.body.current).toMatchObject({state:'UNKNOWN',version:0,checkedAt:null});
 expect((await api.patch(base).set('Cookie',auth.cookie).send({version:0,reason:'HTTP_404',evidence:'synthetic observation'})).status).toBe(403);
 const write=(method:'post'|'patch',path:string,body:object)=>api[method](path).set('Cookie',auth.cookie).set('Origin','http://127.0.0.1:5173').set('x-csrf-token',auth.csrf).send(body);
 expect((await write('patch',base,{version:0,reason:'MANUAL_DELETED',evidence:'synthetic explicit source'})).status).toBe(400);
 expect((await write('patch',base,{version:0,reason:'HTTP_404',evidence:'synthetic source observation'})).status).toBe(200);
 expect((await write('patch',base,{version:0,reason:'EXACT_VISIBLE',evidence:'synthetic source observation'})).status).toBe(409);
 const recheck=await write('post',base+'/recheck',{});expect(recheck.status).toBe(201);expect(recheck.body.recheck.available).toBe(false);expect(recheck.body.current).toMatchObject({state:'UNAVAILABLE',reason:'HTTP_404',version:1});expect(await db.postAvailabilityEvent.count()).toBe(1);expect(await db.semanticModelCall.count()).toBe(0);expect(sender.send).not.toHaveBeenCalled();
 const captures=new CaptureService(db);expect((await captures.posts(actor,c.configId,{availability:'UNAVAILABLE'})).postTotal).toBe(1);expect((await captures.posts(actor,c.configId,{availability:'NORMAL'})).postTotal).toBe(0);expect((await captures.posts(actor,c.configId,{availability:'UNKNOWN'})).postTotal).toBe(0);expect((await captures.list(actor,c.configId,0,(r.snapshot as any).postId)).posts[0].availability.state).toBe('UNAVAILABLE');
});
it('single-shot old preview or an inaccessible source cannot reserve or dispatch',async()=>{const f=await oneShotFixture();const r=await db.semanticReview.findUniqueOrThrow({where:{id:f.scope.reviewId}});await mark(r,'HTTP_404');await expect(f.service.execute(actor,f.scope)).rejects.toThrow();await mark(r,'EXACT_VISIBLE',1);await expect(f.service.execute(actor,f.scope)).rejects.toThrow();expect(f.executor.run).not.toHaveBeenCalled();expect(await db.contactAttempt.count()).toBe(0);});

it('authorization made during outage is invalid after restoration, even with a later review',async()=>{
 await rule();const r=await source();const down=await mark(r,'HTTP_404');const during=new Date(down.checkedAt.getTime()+1);await new Promise(ok=>setTimeout(ok,5));const restored=await mark(r,'EXACT_VISIBLE',1);expect(restored.invalidatedAt).toEqual(restored.checkedAt);const {postSendBlock}=await import('../src/collection/post-availability');expect(postSendBlock(restored,during,new Date(restored.checkedAt.getTime()+1),2)).toBe('POST_RESTORED_REAUTHORIZE_AND_REVIEW');
});

it('new build approval cannot revive a consumed failed recipient or rewrite its receipt',async()=>{
 const f=await oneShotFixture();f.executor.run.mockResolvedValueOnce({result:{kind:'FAILED',reason:'synthetic old pre-submit refusal'},protocolCalls:0,submission:'NOT_ATTEMPTED',identityVerified:true,stopped:true} as any);
 await f.service.execute(actor,f.scope);const old=await db.contactAttempt.findFirstOrThrow();const audits=await db.auditLog.count();
 // A valid new-format replay of an existing approval remains a receipt lookup only.
 await expect(f.service.execute(actor,{...f.scope,commentId:'e'.repeat(24)})).resolves.toMatchObject({reused:true,outcome:'FAILED'});
 await expect(f.service.execute(actor,{...f.scope,approvalId:randomUUID()})).rejects.toThrow('RECIPIENT_ALREADY_RESERVED_OR_CONTACTED');
 expect(f.executor.run).toHaveBeenCalledTimes(1);expect(await db.contactAttempt.findUnique({where:{id:old.id}})).toEqual(old);expect(await db.auditLog.count()).toBe(audits);expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(0);
});
it('old or read-only authorization is rejected before reservation and does not become new consent',async()=>{
 const f=await oneShotFixture();const {scopeVersion,purpose,protocol,...legacy}=f.scope;
 for(const scope of [legacy,{...f.scope,purpose:'INSPECT_ONLY'},{...f.scope,protocol:'workbench.xhs.exact-preflight.v2'},{...f.scope,binarySha256:'ee0901efc70426a8d44eef00e731cf474447967057d3b50df4727bb1cf032d96'}])await expect(f.service.execute(actor,scope)).rejects.toThrow();
 expect(f.executor.run).not.toHaveBeenCalled();expect(await db.contactAttempt.count()).toBe(0);expect(await db.accountDay.count()).toBe(0);expect(await db.auditLog.count()).toBe(0);
});

async function provenNotAttemptedFixture(){
 const f=await oneShotFixture();
 f.executor.run.mockImplementationOnce(async(_c,before)=>{expect(await before()).toBe(true);return {result:{kind:'FAILED',reason:'synthetic stopped before any submit'},protocolCalls:1,submission:'NOT_ATTEMPTED',identityVerified:true,stopped:true} as any;});
 await f.service.execute(actor,f.scope);const old=await db.contactAttempt.findFirstOrThrow(),ledger=await db.contactLedger.findFirstOrThrow();
 return {...f,old,ledger,next:{...f.scope,approvalId:randomUUID(),previousNotAttemptedId:old.id}};
}
it('explicit new approval referencing proven non-submission preserves old row and identity lock',async()=>{
 const f=await provenNotAttemptedFixture();expect((await f.service.execute(actor,f.next)).outcome).toBe('UNKNOWN');
 expect(await db.contactAttempt.findUnique({where:{id:f.old.id}})).toEqual(f.old);expect(await db.contactLedger.findUnique({where:{id:f.ledger.id}})).toEqual(f.ledger);
 expect(await db.contactAttempt.count()).toBe(2);expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(1);
 await f.service.execute(actor,f.scope);await f.service.execute(actor,f.next);expect(f.executor.run).toHaveBeenCalledTimes(2);
 await expect(f.service.execute(actor,{...f.next,approvalId:randomUUID()})).rejects.toThrow('PLATFORM_BUSY_OR_PAUSED');
});
it.each(['UNKNOWN','CONFIRMED','ATTEMPTED','RESERVED'])('fresh approval cannot reopen %s history',async outcome=>{
 const f=await provenNotAttemptedFixture();await db.contactAttempt.update({where:{id:f.old.id},data:{outcome:outcome as any}});
 await expect(f.service.execute(actor,f.next)).rejects.toThrow('PREVIOUS_SUBMISSION_NOT_PROVEN_ABSENT');expect(f.executor.run).toHaveBeenCalledTimes(1);expect(await db.contactAttempt.count()).toBe(1);
});
it.each([{submission:'AT_MOST_ONCE_UNKNOWN'},{stopped:false},{result:'UNKNOWN'},{pause:'RATE_LIMITED'},{scopeHash:'changed'}])('fresh approval requires complete matching stopped/no-submit evidence %#',async change=>{
 const f=await provenNotAttemptedFixture(),end=await db.auditLog.findFirstOrThrow({where:{entityId:f.old.requestKey,action:'SINGLE_REPLY_TEST_FINISHED'}});
 await db.auditLog.update({where:{id:end.id},data:{metadata:{...(end.metadata as any),...change}}});
 await expect(f.service.execute(actor,f.next)).rejects.toThrow('PREVIOUS_SUBMISSION_NOT_PROVEN_ABSENT');expect(f.executor.run).toHaveBeenCalledTimes(1);expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(0);
});
it('two new approvals cannot race past the existing recipient lock',async()=>{
 const f=await provenNotAttemptedFixture();const outcomes=await Promise.allSettled([f.service.execute(actor,f.next),f.service.execute(actor,{...f.next,approvalId:randomUUID()})]);
 expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(f.executor.run).toHaveBeenCalledTimes(2);expect(await db.contactAttempt.count()).toBe(2);expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(1);
});
it('missing or incorrect predecessor never bypasses a failed recipient',async()=>{
 const f=await provenNotAttemptedFixture();for(const previousNotAttemptedId of [undefined,'wrong'])await expect(f.service.execute(actor,{...f.next,previousNotAttemptedId})).rejects.toThrow('RECIPIENT_ALREADY_RESERVED_OR_CONTACTED');expect(f.executor.run).toHaveBeenCalledTimes(1);
});
it('inconsistent executor failure cannot refund an uncertain submission',async()=>{
 const f=await oneShotFixture();f.executor.run.mockResolvedValue({result:{kind:'FAILED',reason:'synthetic inconsistent'},protocolCalls:1,submission:'AT_MOST_ONCE_UNKNOWN',identityVerified:true,stopped:true} as any);
 expect((await f.service.execute(actor,f.scope)).outcome).toBe('UNKNOWN');expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(1);expect((await db.contactAttempt.findFirstOrThrow()).outcome).toBe('UNKNOWN');
});

it('account restriction survives restart and a later no-warning observation cannot clear it',async()=>{
 const {accounts}=await rule();const account=accounts[0];
 await db.auditLog.create({data:{entityId:account.id,action:'ACCOUNT_SEND_OBSERVATION',metadata:{state:'RESTRICTED',source:'USER_REPORT',observedAt:'2026-10-27T00:00:00Z'}}});
 await db.auditLog.create({data:{entityId:account.id,action:'ACCOUNT_SEND_OBSERVATION',metadata:{state:'UNKNOWN',source:'SAME_SESSION',observedAt:new Date().toISOString()}}});
 const restarted=new ContactSettingsService(db,sender);const view=await restarted.overview(actor);
 expect(view.accounts.find(a=>a.id===account.id)?.sendEligibility).toMatchObject({state:'RESTRICTED',source:'USER_REPORT',canSend:false,stale:true});
});

it('single-shot UNKNOWN remains visible without an automatic rule or job and cannot acquire invented stage evidence',async()=>{
 const f=await oneShotFixture();await f.service.execute(actor,f.scope);
 const realSettings=new ContactSettingsService(db,{...sender,mode:'REAL'});
 const view=await realSettings.overview(actor);expect(view.rules).toHaveLength(0);expect(view.recentAttempts).toHaveLength(1);expect(view.recentAttempts[0]).toMatchObject({outcome:'UNKNOWN',executionEvidence:[]});expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(1);
});

// Synthetic journal from the same owned sender. No platform session is opened.
import {recordSendExecution,accountSendObservation} from '../src/auto-contact/send-observation';
import type {ExecutionEvent} from '../src/auto-contact/reply-stage-journal';
const syntheticSender='a'.repeat(24), syntheticAttempt='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
function profileJournal(code='ACCOUNT_CONTENT_RESTRICTED'):ExecutionEvent{return {stage:'TRANSPORT_STOP',protocolAttemptId:syntheticAttempt,stopped:true,journal:{state:'AVAILABLE',records:[{sequence:1,attemptId:syntheticAttempt,stage:'RESTRICTION_CHECK',at:new Date().toISOString(),evidence:{identity:'MATCH',title:'合成账号',pathname:'/user/profile/[SENDER]',warnings:code?[{code:code as any,text:'接相关投诉该账户违反 《社区规范》 其内容无法查看'}]:[],screenshotState:'NOT_CAPTURED'}}]}};}
async function realRestrictionFixture(){
 const f=await rule();await db.platformAccount.update({where:{id:f.accounts[0].id},data:{isDemo:false,loginPlatformUserId:syntheticSender}});
 await db.autoContactRule.update({where:{id:f.r.id},data:{mode:'REAL'}});
 return f;
}
it('same-session profile restriction atomically pauses account and every REAL rule, preserving UNKNOWN history',async()=>{
 const f=await oneShotFixture();await f.service.execute(actor,f.scope);
 const account=await db.platformAccount.findUniqueOrThrow({where:{id:f.account.id}});
 const attempts=await db.contactAttempt.findMany(),ledgers=await db.contactLedger.findMany(),quotas=await db.accountDay.findMany();
 await db.$transaction(tx=>recordSendExecution(tx,actor.id,account.id,'synthetic-profile','AUTO_CONTACT_EXECUTION_STAGE',profileJournal(),account.loginPlatformUserId!));
 expect(await db.contactAttempt.findMany()).toEqual(attempts);expect(await db.contactLedger.findMany()).toEqual(ledgers);expect(await db.accountDay.findMany()).toEqual(quotas);
 expect(await db.platformAccount.findUniqueOrThrow({where:{id:account.id}})).toMatchObject({status:'RESTRICTED',pauseReason:'RESTRICTED'});
 expect((await db.autoContactControl.findUniqueOrThrow({where:{platform_mode:{platform:'XHS',mode:'REAL'}}})).pauseReason).toBeTruthy();
 const fresh=new ContactSettingsService(db,{...sender,mode:'REAL'});const view=await fresh.overview(actor);
 expect(view.accounts.find(a=>a.id===account.id)?.sendEligibility).toMatchObject({state:'RESTRICTED',canSend:false,evidence:{pathname:'/user/profile/[SENDER]',screenshotState:'NOT_CAPTURED'}});
});
it('concurrent profile observations and scheduler attempts do not reserve quota or switch accounts; restart retains restriction',async()=>{
 const f=await realRestrictionFixture();const realSender:ContactSender={...sender,mode:'REAL'};const scheduler=new AutoContactService(db,realSender);
 await Promise.all([db.$transaction(tx=>recordSendExecution(tx,actor.id,f.accounts[0].id,'synthetic-profile','AUTO_CONTACT_EXECUTION_STAGE',profileJournal(),syntheticSender)),scheduler.tick(),scheduler.tick()]);
 expect((await db.autoContactRule.findUniqueOrThrow({where:{id:f.r.id}})).enabled).toBe(false);
 expect(await db.contactAttempt.count()).toBe(0);expect(await db.accountDay.count()).toBe(0);expect(sender.send).not.toHaveBeenCalled();
 await db.$transaction(tx=>recordSendExecution(tx,actor.id,f.accounts[0].id,'synthetic-empty','AUTO_CONTACT_EXECUTION_STAGE',profileJournal(''),syntheticSender));
 expect(await accountSendObservation(db,f.accounts[0].id,new Date(Date.now()+86400000))).toMatchObject({state:'RESTRICTED',stale:true,canSend:false});
 await new AutoContactService(db,realSender).tick();expect(sender.send).not.toHaveBeenCalled();
});
it('wrong identity or mismatched protocol attempt rolls back observation and platform pause',async()=>{
 const f=await realRestrictionFixture();const bad=profileJournal();if(bad.stage==='TRANSPORT_STOP')bad.journal.records[0].attemptId='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
 for(const [event,senderId] of [[profileJournal(),'b'.repeat(24)],[bad,syntheticSender]] as const){
  await expect(db.$transaction(tx=>recordSendExecution(tx,actor.id,f.accounts[0].id,'synthetic-profile','AUTO_CONTACT_EXECUTION_STAGE',event,senderId))).rejects.toThrow();
 }
 expect(await db.auditLog.count({where:{action:'ACCOUNT_SEND_OBSERVATION'}})).toBe(0);expect(await db.autoContactControl.count({where:{mode:'REAL'}})).toBe(0);
});
it('missing or empty restriction evidence cannot enable a REAL rule even with a healthy adapter',async()=>{
 const f=await realRestrictionFixture();const realSettings=new ContactSettingsService(db,{...sender,mode:'REAL'});
 const r=await db.autoContactRule.update({where:{id:f.r.id},data:{enabled:false}});
 await expect(realSettings.toggle(actor,r.id,{version:r.version,enabled:true,consent:autoContactConsent,hash:ruleHash(r)})).rejects.toThrow();
 expect((await realSettings.overview(actor)).accounts.every(a=>!a.sendEligibility?.canSend)).toBe(true);expect(sender.send).not.toHaveBeenCalled();
});

function captureScope(scope:any){return {...scope,scopeVersion:'workbench.single-reply-authorization.v3',purpose:'CAPTURE_EXACT_COMMENT_RECEIPT_ONCE',receiptCapture:'workbench.reply-receipt-capture.v1',binarySha256:'f'.repeat(64),excludedPostIds:['e'.repeat(24)],excludedRecipientIds:['e'.repeat(24)]};}
it('controlled capture crosses durable intent exactly once, remains unknown across restart and retains quota',async()=>{
 const f=await oneShotFixture(),scope=captureScope(f.scope);const {recordSendExecution}=await import('../src/auto-contact/send-observation');
 f.executor.run.mockImplementation(async(c,before)=>{
  expect(await before()).toBe(true);
  const record=()=>db.$transaction(tx=>recordSendExecution(tx,actor.id,c.request.accountId,c.request.requestKey,'SINGLE_REPLY_EXECUTION_STAGE',{stage:'RPC_INTENT',protocolAttemptId:randomUUID()},scope.senderId));
  await record();await expect(record()).rejects.toThrow('SEND_PERMISSION_UNVERIFIED');
  return {result:{kind:'UNKNOWN',reason:'unreviewed capture'},protocolCalls:1,submission:'AT_MOST_ONCE_UNKNOWN',identityVerified:true,stopped:true};
 });
 expect((await f.service.execute(actor,scope)).outcome).toBe('UNKNOWN');
 const {SingleReplyTestService}=await import('../src/auto-contact/single-reply-test');expect(await new SingleReplyTestService(db,f.executor).execute(actor,scope)).toMatchObject({reused:true,outcome:'UNKNOWN'});
 expect(f.executor.run).toHaveBeenCalledTimes(1);expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(1);expect(await db.contactLedger.count()).toBe(1);expect(await db.autoContactRule.count({where:{enabled:true}})).toBe(0);
});
it.each(['RESTRICTED','VERIFY_REQUIRED','RATE_LIMITED','REPLY_DISABLED'])('controlled capture cannot reserve account with durable %s evidence',async state=>{
 const f=await oneShotFixture();await db.auditLog.create({data:{actorId:actor.id,entityId:f.account.id,action:'ACCOUNT_SEND_OBSERVATION',metadata:{state,source:'USER_REPORT',observedAt:new Date(0).toISOString()}}});
 await expect(f.service.execute(actor,captureScope(f.scope))).rejects.toThrow();expect(f.executor.run).not.toHaveBeenCalled();expect(await db.contactAttempt.count()).toBe(0);
});
it('restriction arriving after preflight blocks controlled RPC intent without clearing reservation',async()=>{
 const f=await oneShotFixture(),scope=captureScope(f.scope);const {recordSendExecution}=await import('../src/auto-contact/send-observation');
 f.executor.run.mockImplementation(async(c,before)=>{await before();await db.auditLog.create({data:{actorId:actor.id,entityId:f.account.id,action:'ACCOUNT_SEND_OBSERVATION',metadata:{state:'RESTRICTED',source:'USER_REPORT',observedAt:new Date().toISOString()}}});
  await expect(db.$transaction(tx=>recordSendExecution(tx,actor.id,c.request.accountId,c.request.requestKey,'SINGLE_REPLY_EXECUTION_STAGE',{stage:'RPC_INTENT',protocolAttemptId:randomUUID()},scope.senderId))).rejects.toThrow('SEND_PERMISSION_UNVERIFIED');
  return {result:{kind:'UNKNOWN',reason:'concurrent restriction'},protocolCalls:0,submission:'AT_MOST_ONCE_UNKNOWN',identityVerified:true,stopped:true};
 });
 expect((await f.service.execute(actor,scope)).outcome).toBe('UNKNOWN');expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(1);
});

async function boundedCaptureRecoveryFixture(){
 const f=await oneShotFixture();const scope={...f.scope,scopeVersion:'workbench.single-reply-authorization.v3',purpose:'CAPTURE_EXACT_COMMENT_RECEIPT_ONCE',receiptCapture:'workbench.reply-receipt-capture.v1',excludedPostIds:['e'.repeat(24)],excludedRecipientIds:['f'.repeat(24)]};
 f.executor.run.mockImplementationOnce(async(_c,before)=>{await before();return {result:{kind:'FAILED',reason:'synthetic composer not ready'},protocolCalls:1,submission:'NOT_ATTEMPTED',identityVerified:true,stopped:true} as any;});
 await f.service.execute(actor,scope);const old=await db.contactAttempt.findFirstOrThrow(),protocolAttemptId=randomUUID(),at=new Date().toISOString();
 const workflowScope={workflowId:scope.approvalId,accountId:scope.accountId,senderId:scope.senderId,content:scope.content,maximumSubmissions:1,retryCount:0};
 const {semanticHash}=await import('../src/collection/capture-archive');
 await db.auditLog.createMany({data:[{actorId:actor.id,entityId:scope.approvalId,action:'BOUNDED_WORKFLOW_AUTHORIZED',metadata:{scope:workflowScope,scopeHash:semanticHash(workflowScope)}},{actorId:actor.id,entityId:scope.approvalId,action:'BOUNDED_WORKFLOW_FINISHED',metadata:{kind:'FAILED',attemptId:old.id,submission:'NOT_ATTEMPTED',stopped:true}}]});
 const metadata=[{stage:'RPC_INTENT',protocolAttemptId},{stage:'RPC_RETURNED',protocolAttemptId,kind:'NOT_SENT',envelopeValid:true},{stage:'TRANSPORT_STOP',protocolAttemptId,stopped:true,journal:{state:'AVAILABLE',records:[{sequence:1,stage:'STARTED',attemptId:protocolAttemptId,at},{sequence:2,stage:'DRIVER_CLOSED',attemptId:protocolAttemptId,at,stopped:true}]}}];
 for(let i=0;i<metadata.length;i++)await db.auditLog.create({data:{actorId:actor.id,entityId:old.requestKey,action:'SINGLE_REPLY_EXECUTION_STAGE',metadata:metadata[i] as any,createdAt:new Date(Date.now()+i)}});
 return {...f,old,next:{...scope,approvalId:randomUUID(),previousNotAttemptedId:old.id,recoveryWorkflowId:scope.approvalId}};
}
it('explicit capture recovery requires completed bounded workflow and same stopped journal; old row is preserved',async()=>{
 const f=await boundedCaptureRecoveryFixture();expect((await f.service.execute(actor,f.next)).outcome).toBe('UNKNOWN');expect(await db.contactAttempt.findUnique({where:{id:f.old.id}})).toEqual(f.old);expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(1);await f.service.execute(actor,f.next);expect(f.executor.run).toHaveBeenCalledTimes(2);
});
it.each(['missing-workflow','wrong-workflow','unknown-finish','journal-unknown','journal-attempted','missing-close','account-change','content-change'])('capture recovery stops on %s without another execution',async kind=>{
 const f=await boundedCaptureRecoveryFixture();
 if(kind==='missing-workflow')await db.auditLog.deleteMany({where:{entityId:f.next.recoveryWorkflowId,action:'BOUNDED_WORKFLOW_FINISHED'}});
 if(kind==='wrong-workflow')f.next.recoveryWorkflowId=randomUUID();
 if(kind==='unknown-finish'){const e=await db.auditLog.findFirstOrThrow({where:{entityId:f.next.recoveryWorkflowId,action:'BOUNDED_WORKFLOW_FINISHED'}});await db.auditLog.update({where:{id:e.id},data:{metadata:{...(e.metadata as any),kind:'UNKNOWN'}}});}
 if(['journal-unknown','journal-attempted','missing-close'].includes(kind)){const events=await db.auditLog.findMany({where:{entityId:f.old.requestKey,action:'SINGLE_REPLY_EXECUTION_STAGE'},orderBy:{createdAt:'asc'}});const event=events[kind==='journal-unknown'?1:2],m=JSON.parse(JSON.stringify(event.metadata));if(kind==='journal-unknown')m.kind='UNKNOWN';if(kind==='journal-attempted')m.journal.records[0].attempted=true;if(kind==='missing-close')m.journal.records.pop();await db.auditLog.update({where:{id:event.id},data:{metadata:m}});}
 if(kind==='account-change')f.next.accountId='different';if(kind==='content-change')f.next.content='different';
 await expect(f.service.execute(actor,f.next)).rejects.toThrow();expect(f.executor.run).toHaveBeenCalledTimes(1);expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(0);expect(await db.contactAttempt.findUnique({where:{id:f.old.id}})).toEqual(f.old);
});

import {CapturedReplyReconciliation} from '../src/auto-contact/captured-reply-reconciliation';
import {captureEvents} from './captured-reply-fixture';
import {createHash} from 'node:crypto';
async function capturedConfirmationFixture(){
 const f=await oneShotFixture();const scope={...f.scope,scopeVersion:'workbench.single-reply-authorization.v3',purpose:'CAPTURE_EXACT_COMMENT_RECEIPT_ONCE',receiptCapture:'workbench.reply-receipt-capture.v1',excludedPostIds:['e'.repeat(24)],excludedRecipientIds:['f'.repeat(24)]};await f.service.execute(actor,scope);
 const attempt=await db.contactAttempt.findFirstOrThrow(),replyId='e'.repeat(24),protocol=randomUUID(),readbackRequestId=randomUUID(),at=new Date(Date.now()).toISOString();
 for(const metadata of captureEvents(protocol,replyId,at))await db.auditLog.create({data:{actorId:actor.id,entityId:attempt.requestKey,action:'SINGLE_REPLY_EXECUTION_STAGE',metadata}});
 const verified=await db.auditLog.create({data:{actorId:actor.id,entityId:readbackRequestId,action:'ACCOUNT_TASK_LOGIN_CHECK_RESULT',metadata:{state:'VERIFIED',purpose:'task-start'}}});
 const proof={source:'OWNED_MCP_BOUNDED_READBACK',attemptId:attempt.id,readbackRequestId,accountId:f.account.id,senderId:scope.senderId,postId:scope.postId,commentId:scope.commentId,recipientId:scope.recipientId,replyId,contentSha256:createHash('sha256').update(scope.content).digest('hex'),observedAt:new Date(Math.max(Date.now(),verified.createdAt.getTime())).toISOString(),identityVerified:true,stopped:true,matches:1};
 return {...f,attempt,proof,reconciler:new CapturedReplyReconciliation(db)};
}
it('captured response plus independent exact readback confirms once and preserves locks/quota/other UNKNOWN',async()=>{
 const f=await capturedConfirmationFixture(),usage=await db.accountDay.findMany(),ledger=await db.contactLedger.findMany(),control=await db.autoContactControl.findMany();const old=await db.contactAttempt.create({data:{ledgerId:f.attempt.ledgerId,requestKey:'old-unknown',kind:'FIRST',mode:'REAL',channel:'COMMENT',content:'old',outcome:'UNKNOWN',day:'old',actorId:actor.id,accountIdSnapshot:f.account.id}});
 expect(await f.reconciler.confirm(actor,f.proof)).toMatchObject({outcome:'CONFIRMED',reused:false,replyId:f.proof.replyId});expect(await f.reconciler.confirm(actor,f.proof)).toMatchObject({reused:true});expect(await db.accountDay.findMany()).toEqual(usage);expect(await db.contactLedger.findMany()).toEqual(ledger);expect(await db.autoContactControl.findMany()).toEqual(control);expect(await db.contactAttempt.findUnique({where:{id:old.id}})).toEqual(old);expect(await db.auditLog.count({where:{action:'SINGLE_REPLY_CAPTURE_RECONCILED'}})).toBe(1);expect(f.executor.run).toHaveBeenCalledTimes(1);
});
it.each(['reply','sender','recipient','content','target','post','expired','missing-login','missing-receipt','not-closed','no-match'])('reconciliation refuses %s without releasing quota or changing UNKNOWN',async kind=>{
 const f=await capturedConfirmationFixture();const p:any={...f.proof};if(kind==='reply')p.replyId='f'.repeat(24);if(kind==='sender')p.senderId='f'.repeat(24);if(kind==='recipient')p.recipientId='f'.repeat(24);if(kind==='content')p.contentSha256='f'.repeat(64);if(kind==='target')p.commentId='f'.repeat(24);if(kind==='post')p.postId='f'.repeat(24);if(kind==='expired')p.observedAt=new Date(0).toISOString();if(kind==='missing-login')await db.auditLog.deleteMany({where:{entityId:p.readbackRequestId}});if(kind==='missing-receipt')await db.auditLog.deleteMany({where:{entityId:f.attempt.requestKey,action:'SINGLE_REPLY_EXECUTION_STAGE'}});if(kind==='not-closed')p.stopped=false;if(kind==='no-match')p.matches=0;
 await expect(f.reconciler.confirm(actor,p)).rejects.toThrow();expect(await db.contactAttempt.findUnique({where:{id:f.attempt.id}})).toEqual(f.attempt);expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(1);expect(await db.auditLog.count({where:{action:'SINGLE_REPLY_CAPTURE_RECONCILED'}})).toBe(0);
});

import {resolveConfirmedCapturePause} from '../src/auto-contact/resolved-capture-pause';
import {BoundedCaptureReadback} from '../src/auto-contact/bounded-capture-readback';
it('resolved same-transaction pause closes once without enabling rules or changing prior UNKNOWN/quota/locks',async()=>{
 const f=await capturedConfirmationFixture();await f.reconciler.confirm(actor,f.proof);
 const old=await db.contactAttempt.create({data:{ledgerId:f.attempt.ledgerId,requestKey:'unrelated-old-unknown',kind:'FIRST',mode:'REAL',channel:'COMMENT',content:'old',outcome:'UNKNOWN',day:'old',actorId:actor.id,accountIdSnapshot:'different-restricted-account'}});
 const attempts=await db.contactAttempt.findMany(),usage=await db.accountDay.findMany(),ledger=await db.contactLedger.findMany();
 const results=await Promise.all([resolveConfirmedCapturePause(db,actor,f.account.id),resolveConfirmedCapturePause(db,actor,f.account.id)]);
 expect(results.filter(x=>x.resolved)).toHaveLength(1);expect(await db.autoContactControl.findFirst()).toMatchObject({pauseReason:null,pausedAt:null});expect(await db.contactAttempt.findMany()).toEqual(attempts);expect(await db.accountDay.findMany()).toEqual(usage);expect(await db.contactLedger.findMany()).toEqual(ledger);expect(await db.autoContactRule.count({where:{enabled:true}})).toBe(0);expect(await db.contactAttempt.findUnique({where:{id:old.id}})).toEqual(old);
});
it.each(['unknown','rewritten-pause','restriction','other-account','new-unknown','missing-proof','missing-origin','sender-change'])('resolved-pause closure refuses %s',async kind=>{
 const f=await capturedConfirmationFixture();if(kind!=='unknown')await f.reconciler.confirm(actor,f.proof);
 if(kind==='rewritten-pause')await db.autoContactControl.updateMany({data:{pauseReason:'SUBMISSION_UNKNOWN'}});
 if(kind==='restriction')await db.auditLog.create({data:{entityId:f.account.id,action:'ACCOUNT_SEND_OBSERVATION',metadata:{state:'RESTRICTED',source:'USER_REPORT',observedAt:new Date().toISOString()}}});
 if(kind==='new-unknown')await db.contactAttempt.create({data:{ledgerId:f.attempt.ledgerId,requestKey:'new-unknown',kind:'FIRST',mode:'REAL',channel:'COMMENT',content:'new',outcome:'UNKNOWN',day:'new',actorId:actor.id,accountIdSnapshot:f.account.id}});
 if(kind==='missing-proof')await db.auditLog.deleteMany({where:{action:'SINGLE_REPLY_CAPTURE_RECONCILED'}});if(kind==='missing-origin')await db.auditLog.deleteMany({where:{action:'SINGLE_REPLY_TEST_FINISHED'}});if(kind==='sender-change')await db.platformAccount.update({where:{id:f.account.id},data:{loginPlatformUserId:'f'.repeat(24)}});
 const before=await db.autoContactControl.findMany();await expect(resolveConfirmedCapturePause(db,actor,kind==='other-account'?'other':f.account.id)).rejects.toThrow();expect(await db.autoContactControl.findMany()).toEqual(before);expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(1);
});
it.each(['match','no-match','wrong-parent','read-failure','close-failure'])('automatic one-window reconciliation handles %s without another send',async kind=>{
 const f=await capturedConfirmationFixture();const p=f.proof;let rows:any[]=[{id:p.commentId,userId:p.recipientId,text:f.scope.comment},{id:p.replyId,userId:p.senderId,text:f.scope.content,parentId:p.commentId,replyTarget:{commentId:p.commentId,userId:p.recipientId}}];if(kind==='no-match')rows.pop();if(kind==='wrong-parent')rows[1].parentId='f'.repeat(24);
 const reader={postReference:vi.fn(async()=>{if(kind==='read-failure')throw Error('synthetic');return {id:p.postId};}),receivedComments:vi.fn(()=>rows),chunkReceipt:vi.fn(()=>null)},close=vi.fn(async()=>{if(kind==='close-failure')throw Error('synthetic');});
 const reads:any={authorize:vi.fn(async()=>({})),open:vi.fn(async(_e:any,_cancel:any,id:string)=>{await db.auditLog.create({data:{actorId:actor.id,entityId:id,action:'ACCOUNT_TASK_LOGIN_CHECK_RESULT',metadata:{state:'VERIFIED'}}});return {reader,check:async()=>{},close};}),failure:vi.fn(async()=>{})};
 const s=new BoundedCaptureReadback(db,reads),result=await s.run(actor,f.attempt.id,new AbortController().signal);
 expect(result.kind).toBe(kind==='match'?'CONFIRMED':'UNKNOWN');expect(reader.postReference).toHaveBeenCalledTimes(1);expect(close).toHaveBeenCalledTimes(1);expect(f.executor.run).toHaveBeenCalledTimes(1);expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(1);
 await expect(s.run(actor,f.attempt.id,new AbortController().signal)).rejects.toThrow();expect(reads.open).toHaveBeenCalledTimes(1);expect(await db.contactLedger.count()).toBe(1);
});

import {inspectBoundedAccount} from '../src/auto-contact/bounded-account-inspection';
import {XhsRestrictionInspectionTransport,XHS_PROFILE_RESTRICTION_PROTOCOL} from '../src/auto-contact/xhs-restriction-transport';
it.each(['clean','restricted','unverified','stop-unconfirmed'])('bounded profile preflight %s is observed before collection, never send permission',async kind=>{
 const f=await oneShotFixture(),release=vi.fn(async()=>{}),permit:any={root:'/synthetic',signal:new AbortController().signal,release},devices:any={acquire:async()=>permit,assertPermit:async()=>{}},scope={workflowId:randomUUID(),accountId:f.account.id,senderId:f.scope.senderId,binarySha256:f.scope.binarySha256};
 const ref=await db.accountSessionReference.findUniqueOrThrow({where:{accountId:f.account.id}});
 const endpoint={url:new URL('http://127.0.0.1:28060/mcp'),token:'a'.repeat(64),accountId:f.account.id,binarySha256:f.scope.binarySha256,stop:async()=>true},runtime:any={runtimeId:'synthetic-runtime',deviceId:()=>(ref.deviceId),inspect:async()=>'UNVERIFIED',openSavedForRestrictionInspection:async()=>({replyEndpoint:()=>endpoint})};
 vi.spyOn(XhsRestrictionInspectionTransport.prototype,'inspect').mockResolvedValue({kind:'READ_ONLY_RESULT',ownedStopped:kind!=='stop-unconfirmed',result:{accountId:scope.accountId,senderId:scope.senderId,protocol:XHS_PROFILE_RESTRICTION_PROTOCOL,kind:kind==='restricted'?'RESTRICTION_VISIBLE':kind==='unverified'?'IDENTITY_UNVERIFIED':'OBSERVED_NO_RESTRICTION',code:kind==='restricted'?'VISIBLE_NOTICE':'NOT_A_SEND_PERMISSION_CHECK',observedAt:new Date().toISOString(),observation:{identity:kind==='unverified'?'UNKNOWN':'MATCH',identitySource:'STATE_AND_SELF_LINK',title:'合成账号',pathname:'/user/profile/[SENDER]',warnings:kind==='restricted'?[{code:'ACCOUNT_CONTENT_RESTRICTED',text:'合成限制'}]:[],screenshotState:'NO_SAFE_REGION',consoleErrors:0,networkFailures:0},processStopped:kind!=='stop-unconfirmed',writeOperations:0}});
 vi.spyOn(XhsRestrictionInspectionTransport.prototype,'close').mockResolvedValue(kind!=='stop-unconfirmed');
 if(kind==='clean'){expect(await inspectBoundedAccount(db,devices,runtime,actor,scope,new AbortController().signal)).toMatchObject({sendPermission:false,kind:'OBSERVED_NO_RESTRICTION'});await expect(inspectBoundedAccount(db,devices,runtime,actor,scope,new AbortController().signal)).rejects.toThrow('PROFILE_CHECK_ALREADY_CONSUMED');}
 else await expect(inspectBoundedAccount(db,devices,runtime,actor,scope,new AbortController().signal)).rejects.toThrow();
 expect(await db.collectionRun.count()).toBe(1);expect(await db.contactAttempt.count()).toBe(0);expect(await db.semanticModelCall.count()).toBe(0);expect(release).toHaveBeenCalledTimes(kind==='stop-unconfirmed'?0:1);
 if(kind==='restricted'){expect(await accountSendObservation(db,scope.accountId,new Date())).toMatchObject({state:'RESTRICTED',canSend:false});expect(await db.autoContactControl.findFirst()).toMatchObject({pauseReason:'ACCOUNT_RESTRICTED'});}
});

it('same-transaction provenance tolerates application/DB clock ordering without accepting another transaction',async()=>{const f=await capturedConfirmationFixture();await f.reconciler.confirm(actor,f.proof);const c=await db.autoContactControl.findFirstOrThrow(),e=await db.auditLog.findFirstOrThrow({where:{entityId:f.attempt.requestKey,action:'SINGLE_REPLY_TEST_FINISHED'}});await db.$transaction(async tx=>{await tx.autoContactControl.updateMany({data:{pausedAt:c.pausedAt}});await tx.auditLog.update({where:{id:e.id},data:{createdAt:new Date(c.pausedAt!.getTime()+5)}});});expect(await resolveConfirmedCapturePause(db,actor,f.account.id)).toMatchObject({resolved:true});});

async function secondUnsubmittedCaptureFixture(){
 const f=await boundedCaptureRecoveryFixture();
 f.executor.run.mockImplementationOnce(async(_c,before)=>{await before();return {result:{kind:'FAILED',reason:'synthetic binding still empty'},protocolCalls:1,submission:'NOT_ATTEMPTED',identityVerified:true,stopped:true} as any;});
 const result=await f.service.execute(actor,f.next),old2=await db.contactAttempt.findUniqueOrThrow({where:{id:result.attemptId}});
 const protocolAttemptId=randomUUID(),at=new Date().toISOString();
 const metadata=[{stage:'RPC_INTENT',protocolAttemptId},{stage:'RPC_RETURNED',protocolAttemptId,kind:'NOT_SENT',envelopeValid:true},{stage:'TRANSPORT_STOP',protocolAttemptId,stopped:true,journal:{state:'AVAILABLE',records:[{sequence:1,stage:'STARTED',attemptId:protocolAttemptId,at},{sequence:2,stage:'INITIAL_BINDING_WAIT',attemptId:protocolAttemptId,at},{sequence:3,stage:'INITIAL_BINDING_EMPTY_TIMEOUT',attemptId:protocolAttemptId,at},{sequence:4,stage:'DRIVER_CLOSED',attemptId:protocolAttemptId,at,stopped:true}]}}];
 for(let i=0;i<metadata.length;i++)await db.auditLog.create({data:{actorId:actor.id,entityId:old2.requestKey,action:'SINGLE_REPLY_EXECUTION_STAGE',metadata:metadata[i] as any,createdAt:new Date(Date.now()+i)}});
 return {...f,old2,next2:{...f.next,approvalId:randomUUID(),previousNotAttemptedId:old2.id}};
}
it('explicit same-workflow recovery verifies every predecessor and preserves two FAILED rows',async()=>{
 const f=await secondUnsubmittedCaptureFixture(),oldRows=await db.contactAttempt.findMany({orderBy:{id:'asc'}});
 const result=await f.service.execute(actor,f.next2);expect(result.outcome).toBe('UNKNOWN');
 expect(await db.contactAttempt.findMany({where:{id:{in:oldRows.map(a=>a.id)}},orderBy:{id:'asc'}})).toEqual(oldRows);
 expect(await db.contactAttempt.count()).toBe(3);expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(1);
 await f.service.execute(actor,f.next2);expect(f.executor.run).toHaveBeenCalledTimes(3);
});
it.each(['root-unknown','ancestor-submit','ancestor-journal-missing','stale-predecessor','history-link','scope-link','workflow-scope','cancelled-extra','same-id-authorization'])('multi-predecessor recovery refuses %s without discarding history',async kind=>{
 const f=await secondUnsubmittedCaptureFixture();
 if(kind==='root-unknown')await db.contactAttempt.update({where:{id:f.old.id},data:{outcome:'UNKNOWN'}});
 if(kind==='ancestor-submit'||kind==='ancestor-journal-missing'){
  const e=await db.auditLog.findFirstOrThrow({where:{entityId:f.old.requestKey,action:'SINGLE_REPLY_EXECUTION_STAGE',metadata:{path:['stage'],equals:'TRANSPORT_STOP'}}});
  if(kind==='ancestor-journal-missing')await db.auditLog.delete({where:{id:e.id}});
  else {const m=JSON.parse(JSON.stringify(e.metadata));m.journal.records[0].attempted=true;await db.auditLog.update({where:{id:e.id},data:{metadata:m}});}
 }
 if(kind==='stale-predecessor')f.next2.previousNotAttemptedId=f.old.id;
 if(kind==='same-id-authorization')f.next2.approvalId=f.next.approvalId;
 if(kind==='workflow-scope'){const e=await db.auditLog.findFirstOrThrow({where:{entityId:f.next2.recoveryWorkflowId,action:'BOUNDED_WORKFLOW_AUTHORIZED'}});await db.auditLog.update({where:{id:e.id},data:{metadata:{scope:{accountId:'other'}}}});}
 if(kind==='history-link')await db.contactAttempt.update({where:{id:f.old2.id},data:{historySnapshot:{previousNotAttemptedId:'wrong'}}});
 if(kind==='scope-link'){
  const e=await db.auditLog.findFirstOrThrow({where:{entityId:f.old2.requestKey,action:'SINGLE_REPLY_TEST_AUTHORIZED_RESERVED'}}),m=e.metadata as any;
  await db.auditLog.update({where:{id:e.id},data:{metadata:{...m,scope:{...m.scope,previousNotAttemptedId:f.old2.id}}}});
 }
 if(kind==='cancelled-extra')await db.contactAttempt.create({data:{ledgerId:f.old.ledgerId,requestKey:randomUUID(),kind:'FIRST',mode:'REAL',channel:'COMMENT',content:'unrelated',outcome:'CANCELLED',day:f.old.day,actorId:actor.id,accountIdSnapshot:f.account.id}});
 const before=await db.contactAttempt.findMany({orderBy:{id:'asc'}}),usage=await db.accountDay.findMany();
 if(kind==='same-id-authorization')expect(await f.service.execute(actor,f.next2)).toMatchObject({reused:true});
 else await expect(f.service.execute(actor,f.next2)).rejects.toThrow();
 expect(await db.contactAttempt.findMany({orderBy:{id:'asc'}})).toEqual(before);expect(await db.accountDay.findMany()).toEqual(usage);expect(f.executor.run).toHaveBeenCalledTimes(2);
});
it('two simultaneous explicit recoveries cannot both consume a verified chain',async()=>{
 const f=await secondUnsubmittedCaptureFixture();
 const results=await Promise.allSettled([f.service.execute(actor,f.next2),f.service.execute(actor,{...f.next2,approvalId:randomUUID()})]);
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(f.executor.run).toHaveBeenCalledTimes(3);expect(await db.contactAttempt.count()).toBe(3);expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(1);
});

import {journeySummary} from '../src/auto-contact/journey-summary';
it('run progress includes scoped attempts, follows reconciliation, isolates mode/run and avoids duplicate counting',async()=>{
 const review=await source(), other=await source();
 const account=await db.platformAccount.create({data:{platform:'XHS',label:'synthetic bounded sender'}});
 const identity=await db.platformIdentity.create({data:{platform:'XHS',platformUserId:randomUUID(),nickname:'synthetic'}});
 const ledger=await db.contactLedger.create({data:{identityId:identity.id,accountId:account.id,mode:'REAL'}});
 const attempt=await db.contactAttempt.create({data:{ledgerId:ledger.id,requestKey:'single-reply:'+randomUUID(),kind:'FIRST',mode:'REAL',outcome:'UNKNOWN',day:'synthetic',actorId:actor.id,accountIdSnapshot:account.id}});
 const event={actorId:actor.id,entityId:attempt.requestKey,action:'SINGLE_REPLY_TEST_AUTHORIZED_RESERVED',metadata:{attemptId:attempt.id,scope:{reviewId:review.id,accountId:account.id}}};
 await db.auditLog.create({data:event});
 await db.auditLog.create({data:event}); // A repeated audit row cannot inflate totals.
 expect((await journeySummary(db,actor,'REAL',review.runId!)).contacts).toEqual({UNKNOWN:1});
 expect((await journeySummary(db,actor,'REAL',other.runId!)).contacts).toEqual({});
 expect((await journeySummary(db,actor,'SIMULATION',review.runId!)).contacts).toEqual({});
 await db.contactAttempt.update({where:{id:attempt.id},data:{outcome:'CONFIRMED',platformReceipt:'synthetic-receipt',confirmedAt:new Date()}});
 expect((await journeySummary(db,actor,'REAL',review.runId!)).contacts).toEqual({CONFIRMED:1});
 const r=await db.autoContactRule.create({data:{platform:'XHS',policyId:'workspace',policyRevision:1,mode:'REAL'}});
 const job=await db.autoContactJob.create({data:{ruleId:r.id,ruleVersion:r.version,reviewId:review.id,reviewVersion:review.version,mode:'REAL',platform:'XHS',recipientId:'synthetic',postId:'synthetic',commentId:'synthetic',channel:'COMMENT',content:'synthetic',evidence:{},eligibilityHash:'synthetic',status:'CONFIRMED',attemptId:attempt.id}});
 expect((await journeySummary(db,actor,'REAL',review.runId!)).contacts).toEqual({CONFIRMED:1});
 await db.autoContactJob.delete({where:{id:job.id}});
 await db.auditLog.deleteMany({where:{entityId:attempt.requestKey}});
 await db.auditLog.create({data:{...event,actorId:sales.id}});
 expect((await journeySummary(db,actor,'REAL',review.runId!)).contacts).toEqual({});
 await db.auditLog.deleteMany({where:{entityId:attempt.requestKey}});
 await db.auditLog.create({data:{...event,metadata:{attemptId:attempt.id,scope:{reviewId:review.id,accountId:'wrong-account'}}}});
 expect((await journeySummary(db,actor,'REAL',review.runId!)).contacts).toEqual({});
 expect(sender.send).not.toHaveBeenCalled();
});

it('legacy paired checkboxes require content before re-enabling and never invent a DM',async()=>{
 const template=await db.replyTemplate.create({data:{name:'合成发送方案',body:'合成正文',channel:'COMMENT'}});
 const account=await db.platformAccount.create({data:{platform:'XHS',label:'合成多渠道账号',dailyLimit:2,isDemo:true}});
 const r=await settings.save(actor,'preset-XHS',{version:0,platform:'XHS',policyId:'workspace',policyRevision:1,threshold:90,channel:'DM',channels:['DM','COMMENT'],templateId:template.id,templateVersion:template.version,content:template.body,accounts:[{id:account.id,version:account.version,dailyLimit:2}]});
 expect(r).toMatchObject({enabled:false,channel:'COMMENT',channels:['DM','COMMENT'],templateId:template.id,templateVersion:template.version});
 await expect(settings.toggle(actor,r.id,{version:r.version,enabled:true,consent:autoContactConsent,hash:ruleHash(r)})).rejects.toThrow('分别选择');
 await db.autoContactRule.update({where:{id:r.id},data:{enabled:true,authorizedAt:new Date(),authorizedBy:actor.id,authorizedHash:ruleHash(r)}});
 const recipient=randomUUID();await source(recipient);await source(recipient);await service.tick();await service.tick();expect(sender.send).toHaveBeenCalledTimes(1);expect((sender.send as any).mock.calls[0][0].channel).toBe('COMMENT');expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(1);
 const dy=await settings.save(actor,'preset-DOUYIN',{version:0,platform:'DOUYIN',policyId:'workspace',policyRevision:1,threshold:92,channel:'COMMENT',channels:[],content:'另一个平台',accounts:[]});expect(dy.enabled).toBe(false);await expect(settings.toggle(actor,dy.id,{version:dy.version,enabled:true,consent:autoContactConsent,hash:ruleHash(dy)})).rejects.toThrow();
 expect((await settings.overview(actor)).rules).toHaveLength(2);expect(sender.send).toHaveBeenCalledTimes(1);
 await db.replyTemplate.update({where:{id:template.id},data:{version:{increment:1},body:'新正文'}});
 await expect(settings.save(actor,'other',{version:0,platform:'XHS',policyId:'workspace',policyRevision:1,threshold:90,channel:'COMMENT',templateId:template.id,templateVersion:template.version,content:'合成正文',accounts:[]})).rejects.toThrow('发送模板已变化');expect((await db.autoContactRule.findUniqueOrThrow({where:{id:r.id}})).content).toBe('合成正文');
});
it('preset selection uses optimistic versions and preserves historical policy revisions',async()=>{
 const {readAutomationPreferences,saveAutomationPreferences}=await import('../src/auto-contact/automation-preferences');
 await db.automationPreferences.deleteMany();const old=await readAutomationPreferences(db,actor);expect(old.version).toBe(0);
 const second=await db.commentReviewPolicy.create({data:{id:randomUUID(),name:'第二个匹配方案',target:'新的语义需求',revisions:{create:{revision:1,target:'新的语义需求'}}}});
 await db.commentReviewPolicy.update({where:{id:'workspace'},data:{autoEnabled:true}});
 const prefs=await saveAutomationPreferences(db,actor,{version:0,policyId:second.id});expect(prefs.policyId).toBe(second.id);expect((await db.commentReviewPolicy.findUniqueOrThrow({where:{id:'workspace'}})).autoEnabled).toBe(false);expect(await db.commentReviewPolicyVersion.count()).toBe(2);
 await expect(saveAutomationPreferences(db,actor,{version:0,policyId:'workspace'})).rejects.toThrow('当前选用方案已变化');await expect(saveAutomationPreferences(db,sales,{version:1,policyId:'workspace'})).rejects.toThrow();expect(sender.send).not.toHaveBeenCalled();
 await db.automationPreferences.deleteMany();
});
it('selection-only autosave reads quotas without changing account settings or authorizing sends',async()=>{
 const account=await db.platformAccount.create({data:{platform:'XHS',label:'只读额度账号',dailyLimit:7,isDemo:true,status:'PAUSED'}});
 const r=await settings.save(actor,'selector-XHS',{version:0,platform:'XHS',policyId:'workspace',policyRevision:1,threshold:90,channel:'COMMENT',channels:['COMMENT'],content:'合成模板',accounts:[{id:account.id,version:account.version,dailyLimit:999}],preserveAccountLimits:true});
 expect(await db.platformAccount.findUniqueOrThrow({where:{id:account.id}})).toEqual(account);expect(r.accountLimits).toEqual([{id:account.id,dailyLimit:7}]);expect(r.enabled).toBe(false);expect(sender.send).not.toHaveBeenCalled();expect(await db.autoContactJob.count()).toBe(0);
 await db.platformAccount.update({where:{id:account.id},data:{dailyLimit:4,version:{increment:1}}});
 const next=await settings.save(actor,r.id,{version:r.version,platform:'XHS',policyId:'workspace',policyRevision:1,threshold:91,channel:'COMMENT',content:'合成模板',accounts:[{id:account.id,version:account.version,dailyLimit:999}],preserveAccountLimits:true});expect(next.accountLimits).toEqual([{id:account.id,dailyLimit:4}]);expect((await db.platformAccount.findUniqueOrThrow({where:{id:account.id}})).version).toBe(account.version+1);
});

it('dashboard high relevance is strictly above 90, evaluated, and scoped to run and version',async()=>{
 const first=await source(), other=await source();
 expect((await journeySummary(db,actor,'REAL',first.runId!)).highRelevance).toBe(1);
 await db.semanticReview.update({where:{id:first.id},data:{score:90}});
 expect((await journeySummary(db,actor,'REAL',first.runId!)).highRelevance).toBe(0);
 await db.semanticReview.update({where:{id:first.id},data:{score:91,state:'FAILED'}});
 expect((await journeySummary(db,actor,'REAL',first.runId!)).highRelevance).toBe(0);
 await db.semanticReview.update({where:{id:first.id},data:{score:91,state:'EVALUATED'}});
 expect((await journeySummary(db,actor,'REAL',first.runId!,'workspace',2)).highRelevance).toBe(0);
 expect((await journeySummary(db,actor,'REAL',other.runId!)).highRelevance).toBe(1);
 expect(sender.send).not.toHaveBeenCalled();
});

import {projectOverview} from '../src/collection/project-overview';
it('project overview deduplicates across groups, original versions and review versions, excluding synthetic data',async()=>{
 const a=await source(),b=await source();
 const ca=await db.capturedComment.findUniqueOrThrow({where:{id:a.captureId!}}),cb=await db.capturedComment.findUniqueOrThrow({where:{id:b.captureId!}}),pa=await db.capturedPost.findUniqueOrThrow({where:{id:ca.postId}});
 await db.collectionConfig.updateMany({where:{id:{in:[a.configId,b.configId]}},data:{mode:'XHS_MCP'}});await db.collectionRun.updateMany({where:{id:{in:[a.runId,b.runId]}},data:{snapshot:{mode:'XHS_MCP'}}});
 await db.capturedPost.update({where:{id:cb.postId},data:{platformPostId:pa.platformPostId}});
 await db.capturedComment.update({where:{id:ca.id},data:{isDemo:false}});
 await db.capturedComment.update({where:{id:cb.id},data:{isDemo:false,platformCommentId:ca.platformCommentId,contentHash:ca.contentHash,contextVersion:ca.contextVersion}});
 await db.semanticReview.updateMany({where:{id:{in:[a.id,b.id]}},data:{isDemo:false}});
 await db.collectionConfig.update({where:{id:a.configId},data:{archivedAt:new Date()}});
 const sim=await source(); // Configuration mode may change; historical snapshot remains authoritative.
 await db.collectionConfig.update({where:{id:sim.configId},data:{mode:'XHS_MCP'}});
 await db.collectionRun.update({where:{id:sim.runId},data:{snapshot:{mode:'MOCK'}}});
 expect((await projectOverview(db,actor)).activity.some(x=>x.id===sim.runId)).toBe(false);
 expect((await projectOverview(db,actor)).archive).toEqual({posts:1,comments:1,scored:1,unscored:0,failed:0});
 const newer=await db.capturedComment.create({data:{configId:a.configId,runId:a.runId,lastRunId:a.runId,postId:ca.postId,platformCommentId:ca.platformCommentId,contentHash:'new original',contextVersion:'v2',snapshot:{comment:'changed'},isDemo:false,lastSeenAt:new Date('2099-01-01')}});
 expect((await projectOverview(db,actor)).archive).toEqual({posts:1,comments:1,scored:0,unscored:1,failed:0});
 await db.semanticReview.update({where:{id:a.id},data:{captureId:newer.id,state:'FAILED'}});
 expect((await projectOverview(db,actor)).archive.failed).toBe(1);
 await db.semanticReview.update({where:{id:a.id},data:{state:'EVALUATED',score:10}});
 expect((await projectOverview(db,actor)).archive.scored).toBe(1); // Coverage is not a merged threshold.
 expect(sender.send).not.toHaveBeenCalled();
});
it('project overview counts real attempts once, preserves unknown, and uses Shanghai quota day',async()=>{
 const a=await source(),b=await source(),now=new Date('2026-10-30T16:00:01Z');
 const account=await db.platformAccount.create({data:{platform:'XHS',label:'Synthetic real-namespace fixture',isDemo:false,status:'PAUSED',dailyLimit:10}});
 const identity=await db.platformIdentity.create({data:{platform:'XHS',platformUserId:randomUUID(),nickname:'synthetic'}}),ledger=await db.contactLedger.create({data:{identityId:identity.id,accountId:account.id,mode:'REAL'}});
 const attempts=[] as {id:string}[];
 for(const outcome of ['CONFIRMED','UNKNOWN','FAILED','RESERVED'] as const)attempts.push(await db.contactAttempt.create({data:{ledgerId:ledger.id,mode:'REAL',outcome,kind:'FIRST',requestKey:randomUUID(),day:quotaBucket('REAL',now),actorId:actor.id}}));
 await db.contactAttempt.create({data:{ledgerId:ledger.id,mode:'SIMULATION',outcome:'SIMULATED_SUCCESS',kind:'FIRST',requestKey:randomUUID(),day:'synthetic',actorId:actor.id}});
 const r=await db.autoContactRule.create({data:{platform:'XHS',policyId:'workspace',policyRevision:1,mode:'REAL'}});
 const base={ruleId:r.id,ruleVersion:1,reviewVersion:0,mode:'REAL',platform:'XHS' as const,recipientId:'fixture',postId:'fixture',commentId:'fixture',channel:'COMMENT' as const,content:'synthetic',evidence:{},eligibilityHash:'synthetic',status:'QUEUED'};
 await db.autoContactJob.create({data:{...base,reviewId:a.id,attemptId:attempts[3].id}});
 await db.autoContactJob.create({data:{...base,reviewId:b.id}});
 await db.accountDay.create({data:{accountId:account.id,day:quotaBucket('REAL',now),occupied:2}});
 await db.accountDay.create({data:{accountId:account.id,day:quotaBucket('REAL',new Date('2026-10-30T15:59:59Z')),occupied:9}});
 const d=await projectOverview(db,actor,now);expect(d.day).toBe('2026-10-31');expect(d.sends).toEqual({confirmed:1,unknown:1,failed:1,pending:2,cancelled:0,blockedJobs:0});expect(d.accounts).toEqual({total:1,paused:1,restricted:0,notPaused:0,dailyLimit:10,occupied:2});
 expect(await db.accountDay.count()).toBe(2);expect(sender.send).not.toHaveBeenCalled();
});
it('project overview returns a genuine empty state and enforces administrator access',async()=>{
 const d=await projectOverview(db,actor);expect(d.archive).toEqual({posts:0,comments:0,scored:0,unscored:0,failed:0});expect(d.activity).toEqual([]);
 await expect(projectOverview(db,sales)).rejects.toThrow();
 expect((await request(app.getHttpServer()).get('/api/collection/overview')).status).toBe(401);
 expect((await request(app.getHttpServer()).get('/api/collection/overview').set('Cookie',auth.cookie)).status).toBe(200);
});

import {NormalReplyReconciliation} from '../src/auto-contact/normal-reply-reconciliation';
async function normalReadbackFixture(){
 const f=await capturedConfirmationFixture(),r=await db.autoContactRule.create({data:{id:'normal-readback',platform:'XHS',mode:'REAL',channel:'COMMENT',policyId:'workspace',policyRevision:1,model:'qwen3.8-flash',content:f.scope.content,accountIds:[f.account.id],accountLimits:[],threshold:100}});
 const job=await db.autoContactJob.create({data:{ruleId:r.id,ruleVersion:r.version,reviewId:f.scope.reviewId,reviewVersion:f.scope.reviewVersion,mode:'REAL',platform:'XHS',recipientId:f.scope.recipientId,postId:f.scope.postId,commentId:f.scope.commentId,channel:'COMMENT',content:f.scope.content,evidence:{},eligibilityHash:'synthetic',status:'UNKNOWN',accountId:f.account.id,attemptId:f.attempt.id,sourceSnapshot:{comment:{comment:f.scope.comment}}}});
 const key=`auto-contact:${job.id}`;await db.contactAttempt.update({where:{id:f.attempt.id},data:{requestKey:key,jobId:job.id}});
 const events=await db.auditLog.findMany({where:{entityId:f.attempt.requestKey,action:'SINGLE_REPLY_EXECUTION_STAGE'}});for(const e of events)await db.auditLog.create({data:{entityId:key,actorId:actor.id,action:'AUTO_CONTACT_EXECUTION_STAGE',metadata:e.metadata as any}});
 const p=f.proof;const observation=await db.auditLog.create({data:{entityId:key,actorId:actor.id,action:'NORMAL_REPLY_READBACK_DIAGNOSIS_OBSERVED',metadata:{attemptId:f.attempt.id,requestId:p.readbackRequestId,postId:p.postId,replyId:p.replyId,observedAt:p.observedAt,submissions:0,replyIdCount:1,targetCount:1,matches:[{id:p.replyId,userId:p.senderId,text:f.scope.content,parentId:p.commentId,replyTarget:{commentId:p.commentId,userId:p.recipientId}}],target:[{id:p.commentId,userId:p.recipientId,text:f.scope.comment}]}}});
 return {...f,job,key,observation,reconciler:new NormalReplyReconciliation(db)};
}
it('normal UNKNOWN reconciliation changes only the proved attempt/job and preserves quota, lock, pause and original failure',async()=>{
 const f=await normalReadbackFixture(),quota=await db.accountDay.findMany(),ledger=await db.contactLedger.findMany(),control=await db.autoContactControl.findMany(),events=await db.auditLog.findMany({where:{entityId:f.key}});
 expect(await f.reconciler.confirm(actor,f.proof)).toMatchObject({outcome:'CONFIRMED',reused:false});expect(await f.reconciler.confirm(actor,f.proof)).toMatchObject({reused:true});
 expect(await db.autoContactJob.findUnique({where:{id:f.job.id}})).toMatchObject({status:'CONFIRMED'});expect(await db.accountDay.findMany()).toEqual(quota);expect(await db.contactLedger.findMany()).toEqual(ledger);expect(await db.autoContactControl.findMany()).toEqual(control);expect(await db.auditLog.findMany({where:{id:{in:events.map(e=>e.id)}}})).toEqual(events);expect(await db.auditLog.count({where:{action:'NORMAL_REPLY_CAPTURE_RECONCILED'}})).toBe(1);expect(f.executor.run).toHaveBeenCalledTimes(1);
});
it.each(['duplicate','missing','sender','recipient','parent','body','target','post','login','receipt','expired','quota'])('normal reconciliation refuses %s without changing UNKNOWN',async kind=>{
 const f=await normalReadbackFixture(),m=JSON.parse(JSON.stringify(f.observation.metadata)),p={...f.proof};
 if(kind==='duplicate'){m.matches.push(m.matches[0]);m.replyIdCount=2;}if(kind==='missing')m.matches=[];if(kind==='sender')m.matches[0].userId='f'.repeat(24);if(kind==='recipient')m.matches[0].replyTarget.userId='f'.repeat(24);if(kind==='parent')m.matches[0].parentId='f'.repeat(24);if(kind==='body')m.matches[0].text='other';if(kind==='target')m.target[0].text='other';if(kind==='post')m.postId='f'.repeat(24);if(kind==='login')await db.auditLog.deleteMany({where:{entityId:p.readbackRequestId}});if(kind==='receipt')await db.auditLog.deleteMany({where:{entityId:f.key,action:'AUTO_CONTACT_EXECUTION_STAGE'}});if(kind==='expired')p.observedAt=new Date(0).toISOString();if(kind==='quota')await db.accountDay.updateMany({data:{occupied:0}});
 await db.auditLog.update({where:{id:f.observation.id},data:{metadata:m}});const before=await db.contactAttempt.findUnique({where:{id:f.attempt.id}}),quota=await db.accountDay.findMany();await expect(f.reconciler.confirm(actor,p)).rejects.toThrow();expect(await db.contactAttempt.findUnique({where:{id:f.attempt.id}})).toEqual(before);expect(await db.accountDay.findMany()).toEqual(quota);expect(await db.autoContactJob.findUnique({where:{id:f.job.id}})).toMatchObject({status:'UNKNOWN'});expect(await db.auditLog.count({where:{action:'NORMAL_REPLY_CAPTURE_RECONCILED'}})).toBe(0);
});

import {resolveReviewedNormalPause} from '../src/auto-contact/resolved-normal-pause';
async function reviewedNormalPauseFixture(){
 const f=await normalReadbackFixture();await f.reconciler.confirm(actor,f.proof);
 const audit=await db.auditLog.findFirstOrThrow({where:{entityId:f.key,action:'NORMAL_REPLY_CAPTURE_RECONCILED'}}),c=await db.autoContactControl.findFirstOrThrow();
 const [v]=await db.$queryRaw<{xmin:string}[]>`SELECT xmin::text AS xmin FROM "AutoContactControl" WHERE platform='XHS' AND mode='REAL'`;
 return {...f,input:{jobId:f.job.id,expectedControlXmin:v.xmin,expectedPausedAt:c.pausedAt!.toISOString(),reconciliationAuditId:audit.id}};
}
it('explicit normal pause recovery compares reviewed row version and preserves all rules, attempts, quotas and locks',async()=>{
 const f=await reviewedNormalPauseFixture();await db.contactAttempt.create({data:{ledgerId:f.attempt.ledgerId,requestKey:'older-other-account',kind:'FIRST',mode:'REAL',channel:'COMMENT',content:'old',outcome:'UNKNOWN',day:'old',actorId:actor.id,accountIdSnapshot:'old-restricted',createdAt:new Date(0)}});
 const before=await Promise.all([db.contactAttempt.findMany(),db.accountDay.findMany(),db.contactLedger.findMany(),db.autoContactRule.findMany()]);
 expect(await resolveReviewedNormalPause(db,actor,f.input)).toMatchObject({resolved:true,replyId:f.proof.replyId});
 expect(await Promise.all([db.contactAttempt.findMany(),db.accountDay.findMany(),db.contactLedger.findMany(),db.autoContactRule.findMany()])).toEqual(before);
 expect(await db.autoContactControl.findFirst()).toMatchObject({pauseReason:null,pausedAt:null});expect(await db.auditLog.count({where:{action:'REVIEWED_NORMAL_REPLY_PAUSE_RESOLVED'}})).toBe(1);
 await expect(resolveReviewedNormalPause(db,actor,f.input)).rejects.toThrow('REVIEWED_PAUSE_CHANGED');
});
it.each(['same-text-rewrite','risk','unknown','missing-proof','wrong-proof','quota','enabled','active','later-unknown'])('reviewed normal pause recovery rejects %s without changing control or ledger',async kind=>{
 const f=await reviewedNormalPauseFixture();
 if(kind==='same-text-rewrite')await db.autoContactControl.updateMany({data:{pauseReason:'SUBMISSION_UNKNOWN'}});
 if(kind==='risk')await db.platformAccount.update({where:{id:f.account.id},data:{status:'RESTRICTED'}});
 if(kind==='unknown')await db.contactAttempt.update({where:{id:f.attempt.id},data:{outcome:'UNKNOWN'}});
 if(kind==='missing-proof')f.input.reconciliationAuditId='missing';if(kind==='wrong-proof')f.input.jobId='other';
 if(kind==='quota')await db.accountDay.updateMany({data:{occupied:0}});
 if(kind==='enabled')await db.autoContactRule.updateMany({data:{enabled:true}});
 if(kind==='active')await db.autoContactJob.update({where:{id:f.job.id},data:{status:'ATTEMPTED'}});
 if(kind==='later-unknown')await db.contactAttempt.create({data:{ledgerId:f.attempt.ledgerId,requestKey:'later-other-account',kind:'FIRST',mode:'REAL',channel:'COMMENT',content:'later',outcome:'UNKNOWN',day:'old',actorId:actor.id,accountIdSnapshot:'other'}});
 const before=await Promise.all([db.autoContactControl.findMany(),db.contactAttempt.findMany(),db.accountDay.findMany(),db.contactLedger.findMany()]);await expect(resolveReviewedNormalPause(db,actor,f.input)).rejects.toThrow();
 expect(await Promise.all([db.autoContactControl.findMany(),db.contactAttempt.findMany(),db.accountDay.findMany(),db.contactLedger.findMany()])).toEqual(before);expect(await db.auditLog.count({where:{action:'REVIEWED_NORMAL_REPLY_PAUSE_RESOLVED'}})).toBe(0);
});

import {PendingRepliesService} from '../src/auto-contact/pending-replies.service';
const pending=new PendingRepliesService(db,sender);
async function pendingFixture(count=1){const f=await rule('workspace','COMMENT',[5]);for(let i=0;i<count;i++)await source();await service.enqueue();await db.autoContactJob.updateMany({data:{status:'PENDING_ACTION',reason:'synthetic quota'}});const jobs=await db.autoContactJob.findMany({orderBy:{id:'asc'}});return {...f,jobs:jobs.map(j=>({id:j.id,version:j.updatedAt.toISOString()}))};}
it('manual pending accepts a single item only; concurrent confirmation sends once',async()=>{const f=await pendingFixture(2);await expect(pending.preview(actor,{accountId:f.accounts[0].id,jobs:f.jobs})).rejects.toThrow();const p=await pending.preview(actor,{accountId:f.accounts[0].id,jobs:[f.jobs[0]]});expect(sender.send).not.toHaveBeenCalled();const input={previewId:p.previewId,token:p.token,requestKey:randomUUID()};await Promise.all([pending.confirm(actor,input),pending.confirm(actor,input)]);await service.tick();await service.tick();expect(sender.send).toHaveBeenCalledTimes(1);expect(await db.autoContactJob.count({where:{status:'PENDING_ACTION'}})).toBe(1);await pending.confirm(actor,input);await service.tick();expect(sender.send).toHaveBeenCalledTimes(1);});
it('explicit manual confirmation may process saved pending while automatic switch remains OFF',async()=>{const f=await pendingFixture();await settings.toggle(actor,f.r.id,{version:f.r.version,enabled:false});const p=await pending.preview(actor,{accountId:f.accounts[0].id,jobs:f.jobs});await pending.confirm(actor,{previewId:p.previewId,token:p.token,requestKey:randomUUID()});await service.tick();expect(sender.send).toHaveBeenCalledTimes(1);expect((await db.autoContactRule.findUniqueOrThrow({where:{id:f.r.id}})).enabled).toBe(false);});
it.each(['sales','token','stale','version','quota','recipient','score','account'])('manual preview/confirm rejects %s without executing',async kind=>{const f=await pendingFixture();if(kind==='sales'){await expect(pending.preview(sales,{accountId:f.accounts[0].id,jobs:f.jobs})).rejects.toThrow();return;}if(kind==='stale'){f.jobs[0].version=new Date(0).toISOString();await expect(pending.preview(actor,{accountId:f.accounts[0].id,jobs:f.jobs})).rejects.toThrow();return;}const p=await pending.preview(actor,{accountId:f.accounts[0].id,jobs:f.jobs});if(kind==='version')await db.autoContactRule.update({where:{id:f.r.id},data:{version:{increment:1}}});if(kind==='quota')await db.accountDay.create({data:{accountId:f.accounts[0].id,day:quotaBucket('SIMULATION',new Date()),occupied:5}});if(kind==='score')await db.semanticReview.updateMany({data:{score:0}});if(kind==='recipient')await db.autoContactJob.updateMany({data:{recipientId:'changed'}});if(kind==='account')await db.platformAccount.update({where:{id:f.accounts[0].id},data:{archivedAt:new Date()}});await expect(pending.confirm(actor,{previewId:p.previewId,token:kind==='token'?'x'.repeat(44):p.token,requestKey:randomUUID()})).rejects.toThrow();await service.tick();expect(sender.send).not.toHaveBeenCalled();});
it.each(['expired','version','quota','risk','prepare'])('confirmed manual request returns pending on %s and does not resume automatically',async kind=>{const f=await pendingFixture();const p=await pending.preview(actor,{accountId:f.accounts[0].id,jobs:f.jobs});await pending.confirm(actor,{previewId:p.previewId,token:p.token,requestKey:randomUUID()});if(kind==='expired')await db.manualReplyRequest.update({where:{id:p.previewId},data:{expiresAt:new Date(0)}});if(kind==='version')await db.autoContactRule.update({where:{id:f.r.id},data:{version:{increment:1}}});if(kind==='quota')await db.accountDay.create({data:{accountId:f.accounts[0].id,day:quotaBucket('SIMULATION',new Date()),occupied:5}});if(kind==='risk')await db.autoContactControl.upsert({where:{platform_mode:{platform:'XHS',mode:'SIMULATION'}},create:{platform:'XHS',mode:'SIMULATION',pauseReason:'RATE_LIMITED'},update:{pauseReason:'RATE_LIMITED'}});if(kind==='prepare')(sender.healthy as any).mockResolvedValue(false);await service.tick();expect((await db.autoContactJob.findUniqueOrThrow({where:{id:f.jobs[0].id}})).status).toBe('PENDING_ACTION');expect(sender.send).not.toHaveBeenCalled();vi.spyOn(service,'now').mockResolvedValue(new Date(Date.now()+86400000));await service.tick();expect(sender.send).not.toHaveBeenCalled();});
it('manual UNKNOWN is never selectable again and retains quota and ledger',async()=>{const f=await pendingFixture();const p=await pending.preview(actor,{accountId:f.accounts[0].id,jobs:f.jobs});await pending.confirm(actor,{previewId:p.previewId,token:p.token,requestKey:randomUUID()});(sender.send as any).mockResolvedValue({kind:'UNKNOWN',reason:'synthetic uncertain'});await service.tick();const j=await db.autoContactJob.findUniqueOrThrow({where:{id:f.jobs[0].id}});expect(j.status).toBe('UNKNOWN');expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(1);await expect(pending.preview(actor,{accountId:f.accounts[0].id,jobs:[{id:j.id,version:j.updatedAt.toISOString()}]})).rejects.toThrow();await service.tick();expect(sender.send).toHaveBeenCalledTimes(1);});
it('manual preview cancel has no sending or job side effects, and expires across Shanghai midnight',async()=>{const f=await pendingFixture();const p=await pending.preview(actor,{accountId:f.accounts[0].id,jobs:f.jobs});await service.tick();expect((await db.autoContactJob.findUniqueOrThrow({where:{id:f.jobs[0].id}})).status).toBe('PENDING_ACTION');expect(await db.contactAttempt.count()).toBe(0);await db.manualReplyRequest.update({where:{id:p.previewId},data:{expiresAt:new Date(0)}});await expect(pending.confirm(actor,{previewId:p.previewId,token:p.token,requestKey:randomUUID()})).rejects.toThrow('过期');expect(sender.send).not.toHaveBeenCalled();});

it('DM quota exhaustion stays pending across days and can only be explicitly selected later',async()=>{await rule('dm-only','DM',[1]);await source();await source();await service.tick();await service.tick();expect(sender.send).toHaveBeenCalledTimes(1);expect((sender.send as any).mock.calls[0][0].channel).toBe('DM');expect(await db.autoContactJob.count({where:{channel:'DM',status:'PENDING_ACTION'}})).toBe(1);vi.spyOn(service,'now').mockResolvedValue(new Date(Date.now()+86400000));await service.tick();expect(sender.send).toHaveBeenCalledTimes(1)});

it('pending account choices are a per-task read-only eligibility projection; result remains distinct from delivery',async()=>{
 const {accounts}=await rule('one','COMMENT',[1,2]);await source();await service.enqueue();const j=await db.autoContactJob.findFirstOrThrow();await db.autoContactJob.update({where:{id:j.id},data:{status:'PENDING_ACTION'}});
 const {PendingRepliesService}=await import('../src/auto-contact/pending-replies.service');const p=new PendingRepliesService(db,sender);
 await db.accountDay.create({data:{accountId:accounts[0].id,day:quotaBucket('SIMULATION',await service.now(db)),occupied:1}});
 const before=await db.autoContactJob.findUniqueOrThrow({where:{id:j.id}});const result=await p.options(actor,j.id);
 expect(result.accounts.find(a=>a.id===accounts[0].id)).toMatchObject({available:false,remaining:0});expect(result.accounts.find(a=>a.id===accounts[1].id)).toMatchObject({available:true,remaining:2});
 expect(await p.result(actor,j.id)).toMatchObject({status:'PENDING_ACTION'});expect(await db.autoContactJob.findUniqueOrThrow({where:{id:j.id}})).toEqual(before);expect(await db.manualReplyRequest.count()).toBe(0);expect(sender.send).not.toHaveBeenCalled();await expect(p.options(sales,j.id)).rejects.toThrow();
});

it('whole-run gate waits for collection and every review, survives reconstruction, and never releases old or reread work',async()=>{
 await rule('one','COMMENT',[10]);const a=await source(),b=await source();const ca=await db.capturedComment.findUniqueOrThrow({where:{id:a.captureId!}}),cb=await db.capturedComment.findUniqueOrThrow({where:{id:b.captureId!}});
 await db.capturedPost.update({where:{id:cb.postId},data:{configId:ca.configId,lastRunId:a.runId}});await db.capturedComment.update({where:{id:cb.id},data:{configId:ca.configId,lastRunId:a.runId}});await db.semanticReview.update({where:{id:b.id},data:{configId:ca.configId,runId:a.runId}});await db.autoReviewJob.updateMany({where:{postId:cb.postId},data:{runId:a.runId,status:'PENDING'}});
 await db.collectionRun.update({where:{id:a.runId},data:{status:'RUNNING',finishedAt:null,capturedPosts:2,capturedCommentsCount:2}});
 expect(await service.enqueue()).toBe(0);expect(await db.contactAttempt.count()).toBe(0);
 await db.collectionRun.update({where:{id:a.runId},data:{status:'COMPLETE',finishedAt:new Date()}});expect(await service.enqueue()).toBe(0);
 await db.autoReviewJob.updateMany({where:{runId:a.runId},data:{status:'COMPLETED'}});await db.semanticReview.update({where:{id:b.id},data:{state:'FAILED'}});expect(await service.enqueue()).toBe(0);
 await db.semanticReview.update({where:{id:b.id},data:{state:'EVALUATED'}});const restarted=new AutoContactService(db,sender);expect(await restarted.enqueue()).toBe(2);const reserved=await restarted.reserve();expect(reserved).toBeTruthy();
 await db.collectionRun.update({where:{id:a.runId},data:{cancelRequested:true}});await restarted.dispatch(reserved!.id);expect(sender.send).not.toHaveBeenCalled();
 await db.collectionRun.update({where:{id:a.runId},data:{cancelRequested:false,readPlan:{savedPostId:ca.postId}}});expect(await restarted.reserve()).toBeNull();expect(sender.send).not.toHaveBeenCalled();
});

it('a blocked page of old runs cannot starve a later valid run',async()=>{await rule('fair','COMMENT',[200]);for(let i=0;i<101;i++){const r=await source();await db.collectionRun.update({where:{id:r.runId},data:{snapshot:{}}});}const valid=await source();expect(await service.enqueue()).toBe(1);expect(await db.autoContactJob.findFirst()).toMatchObject({reviewId:valid.id,status:'QUEUED'});expect(sender.send).not.toHaveBeenCalled();});

async function pairedFixture(limit=4){
 const account=await db.platformAccount.create({data:{platform:'XHS',label:'Synthetic paired account',dailyLimit:limit,isDemo:true}});
 const templates=await Promise.all((['COMMENT','DM'] as const).map(channel=>db.replyTemplate.create({data:{channel,name:'Synthetic '+channel,body:'Synthetic '+channel+' body'}})));
 const input={version:0,platform:'XHS' as const,policyId:'workspace',policyRevision:1,threshold:90,channel:'COMMENT' as const,channels:['COMMENT','DM'] as ('COMMENT'|'DM')[],content:templates[0].body,channelPlans:templates.map(t=>({channel:t.channel,templateId:t.id,templateVersion:t.version,content:t.body})),accounts:[{id:account.id,version:account.version,dailyLimit:limit}]};
 const saved=await settings.save(actor,'paired',input),r=await settings.toggle(actor,saved.id,{version:saved.version,enabled:true,consent:autoContactConsent,hash:ruleHash(saved)});
 const review=await source();const run=await db.collectionRun.findUniqueOrThrow({where:{id:review.runId!}});await db.collectionRun.update({where:{id:run.id},data:{snapshot:{...(run.snapshot as any),strictStages:{...(run.snapshot as any).strictStages,contactRules:[{id:r.id,version:r.version,hash:r.authorizedHash}]}}}});
 return {r,review,account,input,templates};
}
async function commentFirst(){const jobs=await db.autoContactJob.findMany();for(const j of jobs)await db.autoContactJob.update({where:{id:j.id},data:{createdAt:new Date(Date.now()+(j.channel==='DM'?1000:0))}});}
it.each(['success','dm-failed','comment-unknown','quota'])('paired jobs freeze separate content, shared quota and restart safety: %s',async kind=>{
 const f=await pairedFixture(kind==='quota'?1:4);
 await db.autoReviewJob.updateMany({where:{runId:f.review.runId!},data:{status:'PROCESSING'}});expect(await service.enqueue()).toBe(0);expect(sender.send).not.toHaveBeenCalled();
 await db.autoReviewJob.updateMany({where:{runId:f.review.runId!},data:{status:'COMPLETED'}});expect((await Promise.all([service.enqueue(),service.enqueue()])).reduce((a,b)=>a+b,0)).toBe(2);await commentFirst();
 (sender.send as any).mockImplementation(async(req:any)=>kind==='dm-failed'&&req.channel==='DM'?{kind:'FAILED',reason:'synthetic before-submit refusal'}:kind==='comment-unknown'&&req.channel==='COMMENT'?{kind:'UNKNOWN',reason:'synthetic no receipt'}:{kind:'CONFIRMED',receipt:'synthetic-'+req.channel});
 const restarted=new AutoContactService(db,sender);for(let i=0;i<4;i++)await restarted.tick();
 const jobs=await db.autoContactJob.findMany({orderBy:{channel:'asc'}});expect(jobs).toHaveLength(2);expect(jobs.map(j=>[j.channel,j.content])).toEqual([['COMMENT','Synthetic COMMENT body'],['DM','Synthetic DM body']]);
 const calls=(sender.send as any).mock.calls.map((x:any)=>x[0]);expect(calls.filter((x:any)=>x.channel==='COMMENT')).toHaveLength(1);
 if(kind==='success'||kind==='dm-failed'){expect(calls.filter((x:any)=>x.channel==='DM')).toHaveLength(1);expect(jobs.find(j=>j.channel==='DM')?.status).toBe(kind==='success'?'SIMULATED_SUCCESS':'FAILED');expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(kind==='success'?2:1);}
 else {expect(calls).toHaveLength(1);expect(jobs.find(j=>j.channel==='DM')?.status).toBe(kind==='quota'?'PENDING_ACTION':'CANCELLED');if(kind==='quota'){vi.spyOn(restarted,'now').mockResolvedValue(new Date(Date.now()+86400000));await restarted.tick();expect(sender.send).toHaveBeenCalledTimes(1);}else expect((await db.autoContactControl.findFirstOrThrow()).pauseReason).toBe('SUBMISSION_UNKNOWN');}
 const response=await request(app.getHttpServer()).get('/api/auto-contact/jobs').set('Cookie',auth.cookie);expect(response.status).toBe(200);expect(new Set(response.body.items.map((j:any)=>j.channel))).toEqual(new Set(['COMMENT','DM']));
 if(kind==='quota'){const pending=await request(app.getHttpServer()).get('/api/auto-contact/pending').set('Cookie',auth.cookie);expect(pending.body.items).toEqual([expect.objectContaining({channel:'DM',content:'Synthetic DM body'})]);}
 expect(await service.enqueue()).toBe(0);await restarted.tick();expect(sender.send).toHaveBeenCalledTimes(kind==='success'||kind==='dm-failed'?2:1);
});
it('paired configuration rejects wrong-channel templates and variables; old runs never gain a DM',async()=>{
 const f=await pairedFixture();const old=await source();expect(await service.enqueue()).toBe(2);expect(await db.autoContactJob.count({where:{reviewId:old.id}})).toBe(0);
 await expect(settings.save(actor,'bad-channel',{...f.input,accounts:[],channelPlans:[f.input.channelPlans[0],{...f.input.channelPlans[1],templateId:f.templates[0].id,templateVersion:f.templates[0].version,content:f.templates[0].body}]})).rejects.toThrow('发送模板已变化');
 await expect(settings.save(actor,'bad-variable',{...f.input,accounts:[],channelPlans:[f.input.channelPlans[0],{channel:'DM',templateId:null,templateVersion:null,content:'hello {{昵称}}'}]})).rejects.toThrow('固定正文');
 expect(sender.send).not.toHaveBeenCalled();
});
it('pending DM can be explicitly previewed after COMMENT without repeating COMMENT; channel is frozen in confirmation',async()=>{
 const f=await pairedFixture(2);await service.enqueue();await commentFirst();await service.tick();const dm=await db.autoContactJob.findFirstOrThrow({where:{channel:'DM'}});await db.autoContactJob.update({where:{id:dm.id},data:{status:'PENDING_ACTION',reason:'synthetic manual hold'}});const held=await db.autoContactJob.findUniqueOrThrow({where:{id:dm.id}});
 expect((await pending.options(actor,held.id)).accounts[0]).toMatchObject({available:true,remaining:1});
 const preview=await pending.preview(actor,{accountId:f.account.id,jobs:[{id:held.id,version:held.updatedAt.toISOString()}]});expect(preview.items[0]).toMatchObject({channel:'DM',content:'Synthetic DM body'});const confirmed=await pending.confirm(actor,{previewId:preview.previewId,token:preview.token,requestKey:randomUUID()});expect(confirmed.accepted).toBe(true);
 await service.tick();expect((sender.send as any).mock.calls.map((c:any)=>c[0].channel)).toEqual(['COMMENT','DM']);expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(2);await service.tick();expect(sender.send).toHaveBeenCalledTimes(2);
});

it.each(['COMMENT','DM'] as const)('manual pending selects a %s template; previews do not mutate and dispatch uses exact chosen content',async channel=>{
 const f=await pairedFixture(4);await service.enqueue();await db.autoContactJob.updateMany({data:{status:'PENDING_ACTION',reason:'synthetic hold'}});
 const j=await db.autoContactJob.findFirstOrThrow({where:{channel}}),t=await db.replyTemplate.create({data:{name:'Synthetic manual '+channel,channel,body:'Chosen manual '+channel}});
 const options=await pending.options(actor,j.id);expect(options.templates.every(x=>x.channel===channel)).toBe(true);
 const input={accountId:f.account.id,template:{id:t.id,version:t.version},jobs:[{id:j.id,version:j.updatedAt.toISOString()}]};
 const p=await pending.preview(actor,input);expect(p.items[0]).toMatchObject({channel,content:t.body,templateName:t.name});expect((await db.autoContactJob.findUniqueOrThrow({where:{id:j.id}})).content).toBe(j.content);expect(sender.send).not.toHaveBeenCalled();
 const c={previewId:p.previewId,token:p.token,requestKey:randomUUID()};await Promise.all([pending.confirm(actor,c),pending.confirm(actor,c)]);await service.tick();await service.tick();expect(sender.send).toHaveBeenCalledTimes(1);expect((sender.send as any).mock.calls[0][0]).toMatchObject({channel,content:t.body,accountId:f.account.id});expect(await db.autoContactJob.count({where:{status:'PENDING_ACTION'}})).toBe(1);
});
it.each(['channel','missing','changed-before-confirm','changed-before-send'] as const)('manual template guards %s',async kind=>{
 const f=await pairedFixture();await service.enqueue();await db.autoContactJob.updateMany({data:{status:'PENDING_ACTION'}});const j=await db.autoContactJob.findFirstOrThrow({where:{channel:'DM'}});
 const t=await db.replyTemplate.create({data:{channel:kind==='channel'?'COMMENT':'DM',name:'Synthetic choice',body:kind==='missing'?'Hello {{专业}}':'Synthetic chosen body'}});
 const input={accountId:f.account.id,template:{id:t.id,version:t.version},jobs:[{id:j.id,version:j.updatedAt.toISOString()}]};
 if(kind==='channel'||kind==='missing'){await expect(pending.preview(actor,input)).rejects.toThrow();return;}
 const p=await pending.preview(actor,input),confirm={previewId:p.previewId,token:p.token,requestKey:randomUUID()};
 if(kind==='changed-before-send')await pending.confirm(actor,confirm);
 await db.replyTemplate.update({where:{id:t.id},data:{body:'Changed source',version:{increment:1}}});
 if(kind==='changed-before-confirm')await expect(pending.confirm(actor,confirm)).rejects.toThrow('模板');else{await service.tick();expect((await db.autoContactJob.findUniqueOrThrow({where:{id:j.id}})).status).toBe('PENDING_ACTION');}
 expect(sender.send).not.toHaveBeenCalled();
});
it('pending menu shows failed/unknown channels but cannot reselect an attempted task',async()=>{
 const f=await pairedFixture();await service.enqueue();await commentFirst();(sender.send as any).mockResolvedValue({kind:'FAILED',reason:'mock no submission'});await service.tick();
 const comment=await db.autoContactJob.findFirstOrThrow({where:{channel:'COMMENT'}});expect(comment.status).toBe('FAILED');
 const list=await pending.list(actor);expect(list.items).toContainEqual(expect.objectContaining({id:comment.id,status:'FAILED',selectable:false,channel:'COMMENT'}));await expect(pending.preview(actor,{accountId:f.account.id,jobs:[{id:comment.id,version:comment.updatedAt.toISOString()}]})).rejects.toThrow();
 (sender.send as any).mockResolvedValue({kind:'UNKNOWN',reason:'mock uncertain'});await service.tick();const dm=await db.autoContactJob.findFirstOrThrow({where:{channel:'DM'}});expect((await pending.list(actor)).items).toContainEqual(expect.objectContaining({id:dm.id,status:'UNKNOWN',selectable:false}));expect(sender.send).toHaveBeenCalledTimes(2);
});

it('display ordering matches reservation order across pages, tied timestamps and per-row live evidence',async()=>{
 await rule('ordered','COMMENT',[100]);for(let i=0;i<23;i++)await source();await service.enqueue();
 const all=await db.autoContactJob.findMany({orderBy:[{createdAt:'asc'},{id:'asc'}]});
 const tie=new Date('2026-01-01T00:00:00Z');await db.autoContactJob.updateMany({where:{id:{in:all.slice(0,3).map(j=>j.id)}},data:{createdAt:tie}});
 const expected=await db.autoContactJob.findMany({orderBy:[{createdAt:'asc'},{id:'asc'}]});
 const page1=await settings.jobs(actor,0),page2=await settings.jobs(actor,20);expect([...page1.items,...page2.items].map(j=>j.id)).toEqual(expected.map(j=>j.id));
 const reserved=await service.reserve();expect(reserved!.id).toBe(page1.items[0].id);expect(sender.send).not.toHaveBeenCalled();
 const review=await db.semanticReview.findUniqueOrThrow({where:{id:reserved!.reviewId}});
 await db.auditLog.create({data:{actorId:actor.id,entityId:review.runId!,action:'JOURNEY_PROGRESS',metadata:{v:1,executionId:reserved!.id,stage:'contact',phase:'CHECKING_ACCOUNT',session:'synthetic-session'}}});
 const view=await settings.jobs(actor,0,undefined,review.runId!);expect(view.items[0].live).toMatchObject({executionId:reserved!.id,phase:'CHECKING_ACCOUNT',state:'running'});
 await db.autoContactJob.update({where:{id:reserved!.id},data:{status:'UNKNOWN'}});expect((await settings.jobs(actor,0,'UNKNOWN',review.runId!)).items[0].live).toBeUndefined();
 expect(sender.send).not.toHaveBeenCalled();expect(await db.semanticModelCall.count()).toBe(0);
});
