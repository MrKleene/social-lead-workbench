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
it('default real capability OFF, empty content blocks enable, saving cannot call sender or model', async () => { const defaultModule = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(Db).useValue(db).compile(); const defaultSender = defaultModule.get<ContactSender>(CONTACT_SENDER); expect(defaultSender).toBeInstanceOf(LocalXhsReplySender); const real = new ContactSettingsService(db, defaultSender); await defaultModule.close(); expect((await real.overview(actor)).capability.available).toBe(false); const r = await real.save(actor, 'empty', { version: 0, platform: 'XHS', policyId: 'workspace', policyRevision: 1, threshold: 80, channel: 'COMMENT', content: '', accounts: [] }); expect(r.enabled).toBe(false); await expect(real.toggle(actor, r.id, { version: r.version, enabled: true, consent: autoContactConsent, hash: ruleHash(r) })).rejects.toThrow('尚未接通'); expect(sender.send).not.toHaveBeenCalled(); expect(await db.semanticModelCall.count()).toBe(0); });
it('high score alone, insufficient, nonmatch, rejected and before-authorization never enqueue', async () => { await source(); await rule(); await source(randomUUID(), { context: 'INSUFFICIENT' }); await source(randomUUID(), { score: 79 }); await source(randomUUID(), { result: { decision: 'UNCERTAIN' } }); await source(randomUUID(), { reviewStatus: 'REJECTED' }); await source(); await service.tick(); expect(sender.send).toHaveBeenCalledTimes(1); expect(await db.autoContactJob.count({ where: { status: 'SIMULATED_SUCCESS' } })).toBe(1); expect(await db.contactAttempt.count({ where: { outcome: 'CONFIRMED' } })).toBe(0); });
it('correct reply author/post/comment are sent once, unrelated targetComment ignored; binding conflicts fail closed', async () => { await rule(); const r = await source(); await service.tick(); const request = (sender.send as any).mock.calls[0][0], s = r.snapshot as any; expect(request).toMatchObject({ recipientId: r.platformUserId, commentId: s.commentId, postId: s.postId, channel: 'COMMENT' }); expect(request.commentId).not.toBe('not-reply-target'); const bad = await source(); await db.capturedComment.update({ where: { id: bad.captureId! }, data: { snapshot: { ...(bad.snapshot as any), userId: 'conflict' } } }); await service.tick(); expect(sender.send).toHaveBeenCalledTimes(1); expect(await db.autoContactJob.count({ where: { status: 'SKIPPED' } })).toBe(1); });
it('cross-account and cross-channel recipient lock permits only one concurrent first contact', async () => { await rule('reply'); await rule('dm', 'DM'); const id = randomUUID(); await source(id); await source(id); await Promise.all([service.tick(), service.tick(), service.tick()]); await service.tick(); await service.tick(); expect(sender.send).toHaveBeenCalledTimes(1); expect(await db.contactLedger.count({ where: { mode: 'SIMULATION' } })).toBe(1); expect(await db.contactAttempt.count()).toBe(1); });
it('shared quota allocates other recipients to next account; entire pool waits then Shanghai new day resumes without repeats', async () => { const { accounts } = await rule(); await source(); await source(); await source(); await service.tick(); await service.tick(); await service.tick(); expect(sender.send).toHaveBeenCalledTimes(2); expect((sender.send as any).mock.calls.map((c: any) => c[0].accountId)).toEqual(accounts.map(a => a.id)); expect(await db.autoContactJob.count({ where: { status: 'WAITING_QUOTA' } })).toBe(1); const future = new Date(Date.now() + 86400000); vi.spyOn(service, 'now').mockResolvedValue(future); await service.tick(); expect(sender.send).toHaveBeenCalledTimes(3); await service.tick(); expect(sender.send).toHaveBeenCalledTimes(3); });
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
    await source(); expect(await service.enqueue()).toBe(100); expect(await service.enqueue()).toBe(6); expect(await service.enqueue()).toBe(0); expect(await db.autoContactJob.count({ where: { status: 'QUEUED' } })).toBe(106); expect(sender.send).not.toHaveBeenCalled(); });
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
it('quota rollover revalidates post; restoration never resumes old work or old authorization',async()=>{
 const {r,accounts}=await rule('r','COMMENT',[1]);await source();await service.tick();const row=await source();await service.tick();const waiting=await db.autoContactJob.findFirstOrThrow({where:{status:'WAITING_QUOTA'}});await mark(row,'HTTP_404');await mark(row,'EXACT_VISIBLE',1);
 vi.spyOn(service,'now').mockResolvedValue(new Date(Date.now()+86400000));await service.tick();expect(sender.send).toHaveBeenCalledTimes(1);expect(await db.autoContactJob.findUnique({where:{id:waiting.id}})).toMatchObject({status:'BLOCKED_POST'});
 // A fresh rule alone cannot recycle an old review after loss of accessibility.
 const off=await settings.toggle(actor,r.id,{version:r.version,enabled:false});await settings.toggle(actor,r.id,{version:off.version,enabled:true,consent:autoContactConsent,hash:ruleHash(off)});await service.tick();expect(sender.send).toHaveBeenCalledTimes(1);
 expect(await db.contactLedger.count()).toBe(1);expect((await db.platformAccount.findUniqueOrThrow({where:{id:accounts[0].id}})).dailyLimit).toBe(1);
});
it.each(['CONFIRMED','UNKNOWN'])('%s history, identity lock, snapshots and quota survive confirmed deletion',async kind=>{
 await rule();const r=await source();(sender.send as any).mockResolvedValueOnce(kind==='CONFIRMED'?{kind,receipt:'synthetic-platform-receipt'}:{kind,reason:'synthetic uncertain'});await service.tick();const job=await db.autoContactJob.findFirstOrThrow(),attempt=await db.contactAttempt.findFirstOrThrow(),c=await captureFor(r);
 await mark(r,'MANUAL_DELETED');expect(await db.autoContactJob.findUnique({where:{id:job.id}})).toEqual(job);expect(await db.contactAttempt.findUnique({where:{id:attempt.id}})).toEqual(attempt);expect(attempt.accountIdSnapshot).toBe(job.accountId);expect(attempt.historySnapshot).toMatchObject({recipientId:job.recipientId,postId:job.postId,commentId:job.commentId});expect(job.sourceSnapshot).toMatchObject({comment:r.snapshot});
 for(const action of [()=>db.capturedPost.delete({where:{id:c.postId}}),()=>db.capturedComment.delete({where:{id:c.id}}),()=>db.collectionRun.delete({where:{id:c.runId}}),()=>db.collectionConfig.delete({where:{id:c.configId}}),()=>db.contactLedger.delete({where:{id:attempt.ledgerId}}),async()=>db.platformIdentity.deleteMany()])await expect(action()).rejects.toThrow();
 if(kind==='UNKNOWN')await expect(rule('second-account','DM')).rejects.toThrow('暂停');else await rule('second-account','DM');await source(r.platformUserId);await service.tick();expect(sender.send).toHaveBeenCalledTimes(1);expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(1);
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
 expect((await db.platformAccount.findUniqueOrThrow({where:{id:account.id}})).status).toBe('PAUSED');
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
 await db.auditLog.createMany({data:[{actorId:actor.id,entityId:scope.approvalId,action:'BOUNDED_WORKFLOW_AUTHORIZED',metadata:{scope}},{actorId:actor.id,entityId:scope.approvalId,action:'BOUNDED_WORKFLOW_FINISHED',metadata:{kind:'FAILED',attemptId:old.id,submission:'NOT_ATTEMPTED',stopped:true}}]});
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
