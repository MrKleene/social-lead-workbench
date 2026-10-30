import {replyHistoryItem} from './reply-history';
import {accountSendObservation} from './send-observation';
import {executionEventSchema} from './reply-stage-journal';
import {postAvailability} from '../collection/post-availability';
import {unknownPostAvailability} from '@crm/contracts';
import { Inject, Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, type ContactOutcome } from '@prisma/client';
import { autoContactConsent, contactTimezone, type AutoContactRuleInput } from '@crm/contracts';
import { Db } from '../common/db';
import { requireAdmin, type Actor } from '../auth/security';
import { CONTACT_SENDER, UnavailableContactSender, senderUnavailable, type ContactSender } from './contact-sender';
import { ruleHash, shanghaiDay, quotaBucket } from './contact-policy';
export type ContactDb = Prisma.TransactionClient;
import {contactLock} from './contact-lock';
export {contactLock} from './contact-lock';
export async function contactNow(tx: ContactDb) { const [r] = await tx.$queryRaw<{
    now: Date;
}[]> `SELECT clock_timestamp() AS now`; return r.now; }
export async function cancelReserved(tx: ContactDb, job: {
    id: string;
    attemptId: string | null;
    platform: any;
    mode: string;
}, reason: string) {
    if (job.attemptId) {
        const a = await tx.contactAttempt.findUniqueOrThrow({ where: { id: job.attemptId }, include: { ledger: true } });
        if (a.outcome !== 'RESERVED')
            throw new ConflictException('已开始尝试，不能当作未发送取消');
        await tx.accountDay.update({ where: { accountId_day: { accountId: a.accountIdSnapshot ?? a.ledger.accountId, day: a.day } }, data: { occupied: { decrement: 1 } } });
        await tx.contactAttempt.update({ where: { id: a.id }, data: { outcome: 'CANCELLED', resolutionNote: reason, version: { increment: 1 } } });
    }
    await tx.autoContactJob.update({ where: { id: job.id }, data: { status: 'CANCELLED', reason, leaseUntil: null } });
    await tx.autoContactControl.updateMany({ where: { platform: job.platform, mode: job.mode, activeJobId: job.id }, data: { activeJobId: null, leaseUntil: null } });
}
@Injectable()
export class ContactSettingsService {
    constructor(
    @Inject(Db)
    readonly db: Db,
    @Inject(CONTACT_SENDER)
    readonly sender: ContactSender = new UnavailableContactSender()) { }
    async overview(actor: Actor) {
        requireAdmin(actor);
        return this.db.$transaction(async (tx) => {
            const now = await contactNow(tx), day = quotaBucket(this.sender.mode, now), accounts = await tx.platformAccount.findMany({ where: { archivedAt: null }, include: { sessionReference: true, usage: { where: { day } } }, orderBy: { createdAt: 'asc' } }), attempts = await tx.contactAttempt.findMany({ where: { mode: this.sender.mode, day }, include: { ledger: { select: { accountId: true } } } }), rules = await tx.autoContactRule.findMany({ where: { mode: this.sender.mode }, orderBy: { createdAt: 'asc' } }), controls = await tx.autoContactControl.findMany({ where: { mode: this.sender.mode } });
            const recent=await tx.contactAttempt.findMany({where:{mode:this.sender.mode},orderBy:{createdAt:'desc'},take:20,select:{id:true,requestKey:true,accountIdSnapshot:true,outcome:true,day:true,createdAt:true,attemptedAt:true,confirmedAt:true,platformReceipt:true,resolutionNote:true}});
            const stages=await tx.auditLog.findMany({where:{entityId:{in:recent.map(a=>a.requestKey)},action:{in:['SINGLE_REPLY_EXECUTION_STAGE','AUTO_CONTACT_EXECUTION_STAGE']}},orderBy:{createdAt:'asc'},take:500});
            const observations=new Map(await Promise.all(accounts.map(async a=>[a.id,await accountSendObservation(tx,a.id,now)] as const)));
            return { recentAttempts:recent.map(a=>({...a,createdAt:a.createdAt.toISOString(),accountLabel:accounts.find(x=>x.id===a.accountIdSnapshot)?.label??'历史账号',executionEvidence:stages.filter(s=>s.entityId===a.requestKey).flatMap(s=>{const parsed=executionEventSchema.safeParse(s.metadata);return parsed.success?[{at:s.createdAt.toISOString(),event:parsed.data}]:[]})})), rules: rules.map(r => ({ ...r, hash: ruleHash(r), pauseReason: controls.find(c => c.platform === r.platform)?.pauseReason ?? null })), accounts: accounts.map(a => { const aa = attempts.filter(t => (t.accountIdSnapshot ?? t.ledger.accountId) === a.id), occupied = a.usage[0]?.occupied ?? 0; return { id: a.id, version: a.version, label: a.loginPlatformUserId && a.loginNickname?.trim() ? a.loginNickname.trim() : a.label, platform: a.platform, isDemo: a.isDemo, workbenchStatus:a.status, sendEligibility:observations.get(a.id), dailyLimit: a.dailyLimit, healthy: !a.archivedAt && a.status === 'UNCONNECTED' && (this.sender.mode === 'SIMULATION' ? a.isDemo && !a.loginSessionKey : !a.isDemo && a.sessionReference?.state === 'VERIFIED' && Boolean(observations.get(a.id)?.canSend)), occupied, confirmed: aa.filter(t => ['CONFIRMED', 'SIMULATED_SUCCESS'].includes(t.outcome)).length, reserved: aa.filter(t => ['RESERVED', 'ATTEMPTED'].includes(t.outcome)).length, unknown: aa.filter(t => t.outcome === 'UNKNOWN').length, remaining: Math.max(0, Math.min(a.dailyLimit, ((rules[0]?.accountLimits as {
                        id: string;
                        dailyLimit: number;
                    }[] | undefined)?.find(x => x.id === a.id)?.dailyLimit ?? a.dailyLimit)) - occupied), authorizedLimit: Math.min(a.dailyLimit, ((rules[0]?.accountLimits as {
                        id: string;
                        dailyLimit: number;
                    }[] | undefined)?.find(x => x.id === a.id)?.dailyLimit ?? a.dailyLimit)) }; }), policies: await tx.commentReviewPolicy.findMany({ select: { id: true, name:true, revision: true, target: true } }), capabilities:['XHS','DOUYIN'].flatMap(platform=>['COMMENT','DM'].map(channel=>({platform,channel,available:this.sender.capability(platform,channel),supported:this.sender.mode==='SIMULATION'||(platform==='XHS'&&channel==='COMMENT')}))), capability: { available: ['XHS', 'DOUYIN'].some(p => ['COMMENT', 'DM'].some(c => this.sender.capability(p, c))), reason: senderUnavailable, recognition:'OFFLINE_TESTED',sending:this.sender.mode==='SIMULATION'?'SIMULATION_ONLY':'UNVERIFIED' }, timezone: contactTimezone, day: shanghaiDay(now) };
        });
    }
    async history(actor: Actor, offset = 0, outcome?: ContactOutcome | 'NOT_ATTEMPTED') {
        requireAdmin(actor);
        return this.db.$transaction(async tx => {
            const where: Prisma.ContactAttemptWhereInput = {mode: this.sender.mode, ...(outcome && outcome !== 'NOT_ATTEMPTED' ? {outcome} : {})};
            if (outcome === 'NOT_ATTEMPTED') {
                const proofs = await tx.auditLog.findMany({where:{action:'SINGLE_REPLY_TEST_FINISHED',AND:[{metadata:{path:['result'],equals:'NOT_ATTEMPTED'}},{metadata:{path:['submission'],equals:'NOT_ATTEMPTED'}},{metadata:{path:['stopped'],equals:true}}]},select:{entityId:true,metadata:true}});
                const pairs = proofs.flatMap(p=>{const m=p.metadata as Record<string,unknown>;return typeof m?.attemptId==='string'?[{id:m.attemptId,requestKey:p.entityId}]:[];});
                Object.assign(where,{outcome:'FAILED',confirmedAt:null,platformReceipt:null,OR:pairs});
            }
            const [attempts, total, allTotal, confirmedTotal] = await Promise.all([
                tx.contactAttempt.findMany({where, orderBy: [{createdAt: 'desc'}, {id: 'desc'}], skip: offset, take: 20,
                    select: {id:true,requestKey:true,jobId:true,mode:true,channel:true,outcome:true,content:true,day:true,createdAt:true,attemptedAt:true,confirmedAt:true,platformReceipt:true,resolutionNote:true,historySnapshot:true}}),
                tx.contactAttempt.count({where}), tx.contactAttempt.count({where:{mode:this.sender.mode}}),
                tx.contactAttempt.count({where:{mode:this.sender.mode,outcome:'CONFIRMED'}}),
            ]);
            const audit = await tx.auditLog.findMany({where:{entityId:{in:attempts.map(a=>a.requestKey)},action:{in:['SINGLE_REPLY_EXECUTION_STAGE','AUTO_CONTACT_EXECUTION_STAGE','SINGLE_REPLY_TEST_FINISHED']}},orderBy:[{createdAt:'asc'},{id:'asc'}]});
            return {items:attempts.map(a=>replyHistoryItem(a,audit.filter(x=>x.entityId===a.requestKey))), total, allTotal, confirmedTotal, offset, limit:20, mode:this.sender.mode};
        });
    }
    async save(actor: Actor, id: string, input: AutoContactRuleInput) {
        requireAdmin(actor);
        return this.db.$transaction(async (tx) => {
            await contactLock(tx);
            const old = await tx.autoContactRule.findUnique({ where: { id } });
            if ((old?.version ?? 0) !== input.version || old && old.mode !== this.sender.mode)
                throw new ConflictException('设置已变化，请刷新');
            const channels=input.channels??[input.channel];
            const channel=channels.includes('COMMENT')?'COMMENT':channels.includes('DM')?'DM':input.channel;
            if(input.templateId){await tx.$queryRaw`SELECT id FROM "ReplyTemplate" WHERE id=${input.templateId} FOR UPDATE`;const template=await tx.replyTemplate.findUnique({where:{id:input.templateId}});if(!template||template.version!==input.templateVersion||template.body!==input.content)throw new ConflictException('发送模板已变化，请重新选择并保存');}
            const policy = await tx.commentReviewPolicy.findUnique({ where: { id: input.policyId } });
            if (!policy || policy.revision !== input.policyRevision)
                throw new ConflictException('审核目标已变化');
            const accounts = await tx.platformAccount.findMany({ where: { id: { in: input.accounts.map(a => a.id) }, platform: input.platform, archivedAt: null } });
            if (accounts.length !== input.accounts.length)
                throw new ConflictException('账号池已变化或平台不一致');
            for (const a of [...input.accounts].sort((a, b) => a.id.localeCompare(b.id))) {
                await tx.$queryRaw `SELECT id FROM "PlatformAccount" WHERE id=${a.id} FOR UPDATE`;
                const updated = await tx.platformAccount.updateMany({ where: { id: a.id, version: a.version, archivedAt: null, platform: input.platform }, data: { dailyLimit: a.dailyLimit, version: { increment: 1 } } });
                if (updated.count !== 1)
                    throw new ConflictException('账号额度或状态已变化，请刷新后保存');
            }
            if (old) {
                const pending = await tx.autoContactJob.findMany({ where: { ruleId: id, status: { in: ['QUEUED', 'WAITING_QUOTA', 'WAITING_ACCOUNT', 'RESERVED'] } } });
                for (const j of pending)
                    await cancelReserved(tx, j, '规则已修改，需重新授权');
            }
            const model = await tx.modelSettings.findFirst({ select: { model: true } }), data = { accountLimits: input.accounts.map(({ id, dailyLimit }) => ({ id, dailyLimit })), platform: input.platform, model: model?.model ?? '', policyId: input.policyId, policyRevision: input.policyRevision, threshold: input.threshold, channel, channels, templateId:input.templateId??null,templateVersion:input.templateId?input.templateVersion:null, content: input.content, accountIds: input.accounts.map(a => a.id), enabled: false, authorizedBy: null, authorizedAt: null, authorizedHash: null, version: (old?.version ?? 0) + 1, mode: this.sender.mode };
            const rule = await tx.autoContactRule.upsert({ where: { id }, create: { id, ...data }, update: data });
            await tx.auditLog.create({ data: { actorId: actor.id, action: 'AUTO_CONTACT_RULE_SAVED_OFF', entityId: id, metadata: { version: rule.version, accountIds: rule.accountIds, threshold: rule.threshold, channel: rule.channel } } });
            return rule;
        });
    }
    async toggle(actor: Actor, id: string, input: {
        version: number;
        enabled: boolean;
        consent?: string;
        hash?: string;
    }) {
        requireAdmin(actor);
        return this.db.$transaction(async (tx) => {
            await contactLock(tx);
            const r = await tx.autoContactRule.findUnique({ where: { id } });
            if (!r || r.mode !== this.sender.mode)
                throw new NotFoundException();
            if (r.version !== input.version)
                throw new ConflictException('设置已变化，请重新确认');
            if (input.enabled) {
                if (!r.channels.length || !r.channels.includes(r.channel) || r.channels.some(channel=>!this.sender.capability(r.platform,channel)))
                    throw new ConflictException(senderUnavailable);
                if (!r.content.trim() || !r.accountIds.length || !r.model)
                    throw new ConflictException('请先设置内容、账号池和审核模型');
                if (input.consent !== autoContactConsent || input.hash !== ruleHash(r))
                    throw new ConflictException('请确认此版本的渠道、阈值、账号和内容');
                const [policy, model, control, actorNow, accounts] = await Promise.all([tx.commentReviewPolicy.findUnique({ where: { id: r.policyId } }), tx.modelSettings.findFirst({ select: { model: true } }), tx.autoContactControl.findUnique({ where: { platform_mode: { platform: r.platform, mode: r.mode } } }), tx.user.findUnique({ where: { id: actor.id } }), tx.platformAccount.findMany({ where: { id: { in: r.accountIds }, platform: r.platform, archivedAt: null, status: 'UNCONNECTED' }, include: { sessionReference: true } })]);
                if (control?.pauseReason)
                    throw new ConflictException('平台发送流程因风控暂停；核查限制前不能换号或重新开启');
                if (policy?.revision !== r.policyRevision || model?.model !== r.model || !actorNow?.active || actorNow.role !== 'ADMIN')
                    throw new ConflictException('目标、模型或权限已变化');
                if (accounts.length !== r.accountIds.length || !accounts.every(a => r.mode === 'SIMULATION' ? a.isDemo && !a.loginSessionKey : !a.isDemo && a.sessionReference?.state === 'VERIFIED'))
                    throw new ConflictException('账号池存在未授权或不健康账号');
                if(r.mode==='REAL') for(const account of accounts){
                    if(!(await accountSendObservation(tx,account.id,await contactNow(tx))).canSend)
                        throw new ConflictException('账号受限或发送资格待核验，不能开启自动联系');
                }
                await tx.autoContactControl.upsert({ where: { platform_mode: { platform: r.platform, mode: r.mode } }, create: { platform: r.platform, mode: r.mode }, update: {} });
            }
            else {
                for (const j of await tx.autoContactJob.findMany({ where: { ruleId: id, status: { in: ['QUEUED', 'WAITING_QUOTA', 'WAITING_ACCOUNT', 'RESERVED'] } } }))
                    await cancelReserved(tx, j, '自动联系已关闭');
            }
            // Every authorization epoch changes version; an old enable confirmation cannot re-enable after OFF.
            if (r.enabled === input.enabled)
                return r;
            const next = { ...r, version: r.version + 1 };
            const result = await tx.autoContactRule.update({ where: { id }, data: { version: next.version, enabled: input.enabled, authorizedBy: input.enabled ? actor.id : null, authorizedAt: input.enabled ? await contactNow(tx) : null, authorizedHash: input.enabled ? ruleHash(next) : null } });
            await tx.auditLog.create({ data: { actorId: actor.id, action: input.enabled ? 'AUTO_CONTACT_AUTHORIZED' : 'AUTO_CONTACT_DISABLED', entityId: id, metadata: { version: r.version, hash: ruleHash(r) } } });
            return result;
        });
    }
    async cancel(actor: Actor, id: string) { requireAdmin(actor); return this.db.$transaction(async (tx) => { await contactLock(tx); const j = await tx.autoContactJob.findUnique({ where: { id } }); if (!j || j.mode !== this.sender.mode)
        throw new NotFoundException(); if (j.status === 'CANCELLED')
        return j; if (!['QUEUED', 'WAITING_QUOTA', 'WAITING_ACCOUNT', 'RESERVED'].includes(j.status))
        throw new ConflictException('已开始尝试或已结束，不能取消并释放占用'); await cancelReserved(tx, j, '管理员取消'); return tx.autoContactJob.findUnique({ where: { id } }); }); }
    async jobs(actor: Actor, offset: number, status?: string, runId?:string) { requireAdmin(actor); const where = { mode: this.sender.mode, ...(status ? { status } : {}), ...(runId?{review:{runId}}:{}) }, [items, total] = await Promise.all([this.db.autoContactJob.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: offset, take: 20 }), this.db.autoContactJob.count({ where })]); const attempts = await this.db.contactAttempt.findMany({ where: { id: { in: items.flatMap(i => i.attemptId ? [i.attemptId] : []) } }, select: { id: true, accountIdSnapshot:true, historySnapshot:true, outcome: true, day: true, createdAt: true, attemptedAt: true, confirmedAt: true, platformReceipt: true, resolutionNote: true } }), accounts = await this.db.platformAccount.findMany({ where: { id: { in: items.flatMap(i => i.accountId ? [i.accountId] : []) } }, select: { id: true, label: true } }); const logs=await this.db.auditLog.findMany({where:{entityId:{in:items.map(j=>'auto-contact:'+j.id)},action:'AUTO_CONTACT_EXECUTION_STAGE'},orderBy:{createdAt:'asc'},take:500}); const states=await Promise.all(items.map(j=>postAvailability(this.db,j.platform,j.postId))); return { total, items: items.map((j,index) => ({ ...j, executionEvidence:logs.filter(l=>l.entityId==='auto-contact:'+j.id).flatMap(l=>{const parsed=executionEventSchema.safeParse(l.metadata);return parsed.success?[{at:l.createdAt.toISOString(),event:parsed.data}]:[]}), availability:states[index]??unknownPostAvailability, attempt: attempts.find(a => a.id === j.attemptId) ?? null, accountLabel: accounts.find(a => a.id === j.accountId)?.label ?? null })) }; }
}
