import {activeAcceptance,normalAcceptanceScope,acceptanceRuleAllowed,acceptanceSendAllowed,claimAcceptanceSend,settleAcceptance} from './normal-acceptance';
import {accountModeBlocked} from '../accounts/account-execution-policy';
import {accountSendObservation} from './send-observation';
import {postAvailability,postSendBlock} from '../collection/post-availability';
import {publicPostSnapshot} from '../collection/post-reference';
import { Inject, Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, type AutoContactJob, type AutoContactRule } from '@prisma/client';
import { Db } from '../common/db';
import { requireAdmin, type Actor } from '../auth/security';
import { contactLock, contactNow, cancelReserved, type ContactDb } from './contact-settings.service';
import { normalizeSendResult, CONTACT_SENDER, type ContactSender, type SendRequest, type SendResult } from './contact-sender';
import { contactTarget, eligible, eligibilityHash, quotaBucket, ruleHash } from './contact-policy';
const json = (x: unknown) => x as Prisma.InputJsonValue;
const limit = (r: AutoContactRule, id: string, current: number) => Math.min(current, ((r.accountLimits as {
    id: string;
    dailyLimit: number;
}[]).find(a => a.id === id)?.dailyLimit ?? 0));
const waiting = ['QUEUED', 'WAITING_QUOTA', 'WAITING_ACCOUNT'];
@Injectable()
export class AutoContactService {
    constructor(
    @Inject(Db)
    private db: Db,
    @Inject(CONTACT_SENDER)
    private sender: ContactSender) { }
    now(tx: ContactDb) { return contactNow(tx); }
    private async ruleReady(tx: ContactDb, r: AutoContactRule) {
        if(!await acceptanceRuleAllowed(tx,r))return false;
        if (!r.enabled || r.mode !== this.sender.mode || r.authorizedHash !== ruleHash(r) || !r.authorizedAt || !r.authorizedBy || !r.content.trim() || !r.accountIds.length || !this.sender.capability(r.platform, r.channel))
            return false;
        if(r.mode==='REAL') for(const id of r.accountIds){const o=await accountSendObservation(tx,id,await this.now(tx));const a=await tx.platformAccount.findUnique({where:{id}});if(!a||accountModeBlocked(a,'REAL')||o.state!=='UNKNOWN'||o.evidenceInvalid)return false;}
        const [p, m, a, c] = await Promise.all([tx.commentReviewPolicy.findUnique({ where: { id: r.policyId } }), tx.modelSettings.findFirst({ select: { model: true } }), tx.user.findUnique({ where: { id: r.authorizedBy }, select: { active: true, role: true } }), tx.autoContactControl.findUnique({ where: { platform_mode: { platform: r.platform, mode: r.mode } } })]);
        return p?.revision === r.policyRevision && m?.model === r.model && a?.active && a.role === 'ADMIN' && !c?.pauseReason;
    }
    private async reviewReady(tx: ContactDb, r: AutoContactRule, id: string) {
        const row = await tx.semanticReview.findUnique({ where: { id }, include: { capture: { include: { post: true, config: { select: { platform: true } } } } } });
        if (!row || !await acceptanceSendAllowed(tx,r,id) || row.policyId !== r.policyId || row.policyRevision !== r.policyRevision || row.selectedModel !== r.model || row.platform !== r.platform || !eligible(row, r.threshold) || row.isDemo !== (r.mode === 'SIMULATION') || row.capture?.config.platform !== row.platform)
            return null;
        const target = contactTarget(row, row.capture, row.capture?.post ?? null);
        if (!target)
            return null;
        const identity = await tx.platformIdentity.findUnique({ where: { platform_platformUserId: { platform: r.platform, platformUserId: target.recipientId } }, include: { lead: true } });
        if (identity?.lead && (identity.lead.doNotContact || (!identity.lead.isDemo && (identity.lead.contactedAt || ['CONTACTED', 'INTERESTED'].includes(identity.lead.contactStage)))))
            return null;
        const availability = await postAvailability(tx,r.platform,target.postId);
        return { row, target, availability, block:postSendBlock(availability,r.authorizedAt,row.updatedAt) };
    }
    async enqueue() {
        return this.db.$transaction(async (tx) => {
            await contactLock(tx);
            const envelope=await activeAcceptance(tx),scope=envelope?normalAcceptanceScope.parse(envelope.scope):null;
            // Multi-post acceptance selects only after all whole-post model jobs
            // finish; do not prematurely mark the first post's matches SKIPPED.
            if(scope&&scope.maxPosts>1&&(!envelope!.batchPlanned||!envelope!.runId||await tx.autoReviewJob.count({where:{runId:envelope!.runId!,status:{not:'COMPLETED'}}})))return 0;
            const rules = await tx.autoContactRule.findMany({ where: { enabled: true, mode: this.sender.mode } });
            let added = 0;
            for (const r of rules) {
                if (!await this.ruleReady(tx, r))
                    continue;
                // Scan a bounded page of unprocessed *evaluations*, not a display page. Every later tick advances.
                const rows = await tx.semanticReview.findMany({ where: { ...(scope?{id:{in:envelope!.reviewIds},capture:{lastRunId:envelope!.runId??'not-bound',postId:{in:(await tx.normalAcceptancePost.findMany({where:{acceptanceId:envelope!.id},select:{postId:true}})).map(p=>p.postId)}}}:{}),policyId: r.policyId, policyRevision: r.policyRevision, selectedModel: r.model, platform: r.platform, state: 'EVALUATED', score: { gte: r.threshold }, context: 'SUFFICIENT', reviewStatus: { in: ['PENDING', 'APPROVED'] }, updatedAt: { gte: r.authorizedAt! }, contactJobs: { none: { ruleId: r.id, ruleVersion: r.version } } }, orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }], take: 100 });
                for (const row of rows) {
                    const valid = await this.reviewReady(tx, r, row.id), input = row.evaluationInput as Record<string, unknown> | null;
                    await tx.autoContactJob.create({ data: { ruleId: r.id, ruleVersion: r.version, reviewId: row.id, reviewVersion: row.version, mode: r.mode, platform: r.platform, recipientId: valid?.target.recipientId ?? '', postId: valid?.target.postId ?? '', commentId: valid?.target.commentId ?? '', channel: r.channel, content: r.content, eligibilityHash: eligibilityHash(row), availabilityVersion:valid?.availability?.version??0, sourceSnapshot:valid?json({post:publicPostSnapshot(valid.row.capture!.post.snapshot),comment:valid.row.snapshot,availability:valid.availability?{state:valid.availability.state,reason:valid.availability.reason,version:valid.availability.version,checkedAt:valid.availability.checkedAt.toISOString(),source:valid.availability.source,evidence:valid.availability.evidence}:{state:'UNKNOWN',version:0,checkedAt:null}}):Prisma.JsonNull, status: valid?.block ? 'BLOCKED_POST' : valid ? 'QUEUED' : 'SKIPPED', reason: valid?.block ?? (valid ? null : '评论作者、来源、充分性或勿联系条件未通过'), evidence: json({ score: row.score, modelVersion: row.modelVersion, target: (row.rules as {
                                    target?: string;
                                }).target ?? '', policyRevision: row.policyRevision, quotes: (row.result as {
                                    evidence?: unknown;
                                })?.evidence ?? [], inputPolicy: input?.inputPolicyVersion ?? null, observationPolicy: input?.observationPolicy ?? null, ruleHash: r.authorizedHash, sourceCaptureId: row.captureId }) } });
                    added++;
                }
            }
            return added;
        });
    }
    async reserve() {
        return this.db.$transaction(async (tx) => {
            await contactLock(tx);
            const now = await this.now(tx);
            // A crashed process never retries an attempted send. Unknown keeps recipient and original-day quota.
            for (const j of await tx.autoContactJob.findMany({ where: { mode: this.sender.mode, status: { in: ['RESERVED', 'ATTEMPTED'] }, leaseUntil: { lt: now } } })) {
                if (j.status === 'RESERVED')
                    await cancelReserved(tx, j, '执行中断，尚未发送');
                else {
                    await tx.autoContactJob.update({ where: { id: j.id }, data: { status: 'UNKNOWN', reason: '发送进程中断，需核查回执', leaseUntil: null } });
                    await tx.contactAttempt.update({ where: { id: j.attemptId! }, data: { outcome: 'UNKNOWN', resolutionNote: '执行中断，未自动重试', version: { increment: 1 } } });
                    await tx.autoContactControl.upsert({ where: { platform_mode: { platform: j.platform, mode: j.mode } }, create: { platform: j.platform, mode: j.mode, pauseReason: 'STOP_UNCONFIRMED', pausedAt: now }, update: { pauseReason: 'STOP_UNCONFIRMED', pausedAt: now } });
                    await tx.autoContactControl.updateMany({ where: { platform: j.platform, mode: j.mode, activeJobId: j.id }, data: { activeJobId: null, leaseUntil: null } });
                    await tx.autoContactRule.updateMany({ where: { platform: j.platform, mode: j.mode }, data: { enabled: false } });
                }
            }
            const envelope=await activeAcceptance(tx),scope=envelope?normalAcceptanceScope.parse(envelope.scope):null;
            const jobs = await tx.autoContactJob.findMany({ where: { mode: this.sender.mode, status: { in: waiting }, ...(scope?{ruleId:scope.ruleId,ruleVersion:scope.ruleVersion,reviewId:{in:envelope!.reviewIds}}:{}) }, include: { rule: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 100 });
            for (const j of jobs) {
                const r = j.rule;
                if (j.ruleVersion !== r.version || !await this.ruleReady(tx, r)) {
                    await cancelReserved(tx, j, '规则关闭、版本变化、权限或发送能力不可用');
                    continue;
                }
                const control = await tx.autoContactControl.findUnique({ where: { platform_mode: { platform: j.platform, mode: j.mode } } });
                if (control?.activeJobId)
                    continue;
                const valid = await this.reviewReady(tx, r, j.reviewId);
                const postBlock = valid ? postSendBlock(valid.availability,r.authorizedAt,valid.row.updatedAt,j.availabilityVersion) : null;
                if(postBlock){await cancelReserved(tx,j,postBlock);await tx.autoContactJob.update({where:{id:j.id},data:{status:'BLOCKED_POST'}});continue;}
                if (!valid || eligibilityHash(valid.row) !== j.eligibilityHash) {
                    await cancelReserved(tx, j, '审核结果或来源已变化');
                    continue;
                }
                const identity = await tx.platformIdentity.upsert({ where: { platform_platformUserId: { platform: j.platform, platformUserId: j.recipientId } }, create: { platform: j.platform, platformUserId: j.recipientId, nickname: '', isDemo: j.mode === 'SIMULATION' }, update: {} });
                const ledger = await tx.contactLedger.findUnique({ where: { identityId_mode: { identityId: identity.id, mode: j.mode } }, include: { attempts: true } });
                if (ledger?.attempts.some(a => a.outcome !== 'CANCELLED')) {
                    await tx.autoContactJob.update({ where: { id: j.id }, data: { status: 'SKIPPED', reason: '此用户已有联系尝试或成功记录；跨账号与渠道不重复' } });
                    continue;
                }
                let selected: string | undefined, healthyCount = 0;
                const day = quotaBucket(j.mode, now);
                for (const id of r.accountIds) {
                    await tx.$queryRaw `SELECT id FROM "PlatformAccount" WHERE id=${id} FOR UPDATE`;
                    const a = await tx.platformAccount.findUnique({ where: { id }, include: { sessionReference: true } });
                    if (!a || a.archivedAt || a.platform !== j.platform || accountModeBlocked(a,j.mode) || (j.mode === 'SIMULATION' ? !a.isDemo || !!a.loginSessionKey : a.isDemo || a.sessionReference?.state !== 'VERIFIED'))
                        continue;
                    if(j.mode==='REAL'&&!(await accountSendObservation(tx,id,now)).canSend)continue;
                    healthyCount++;
                    const usage = await tx.accountDay.findUnique({ where: { accountId_day: { accountId: id, day } } });
                    if ((usage?.occupied ?? 0) >= limit(r, id, a.dailyLimit))
                        continue;
                    selected = id;
                    break;
                }
                if (!selected) {
                    await tx.autoContactJob.update({ where: { id: j.id }, data: { status: healthyCount ? 'WAITING_QUOTA' : 'WAITING_ACCOUNT', reason: healthyCount ? '账号池今日共享额度已用完；上海零点后再分配' : '没有已授权且健康的发送账号' } });
                    continue;
                }
                const l = ledger ? await tx.contactLedger.update({ where: { id: ledger.id }, data: { accountId: selected } }) : await tx.contactLedger.create({ data: { identityId: identity.id, mode: j.mode, accountId: selected } });
                await tx.accountDay.upsert({ where: { accountId_day: { accountId: selected, day } }, create: { accountId: selected, day, occupied: 1 }, update: { occupied: { increment: 1 } } });
                const sendingAccount=await tx.platformAccount.findUniqueOrThrow({where:{id:selected},select:{label:true,loginPlatformUserId:true}});
                const attempt = await tx.contactAttempt.create({ data: { ledgerId: l.id, requestKey: 'auto-contact:' + j.id, jobId: j.id, mode: j.mode, kind: 'FIRST', channel: j.channel, content: j.content, outcome: 'RESERVED', day, actorId: r.authorizedBy!, accountIdSnapshot:selected, historySnapshot:json({platform:j.platform,recipientId:j.recipientId,postId:j.postId,commentId:j.commentId,accountId:selected,accountLabel:sendingAccount.label,senderPlatformId:sendingAccount.loginPlatformUserId,source:j.sourceSnapshot,evidence:j.evidence}) } }), leaseUntil = new Date(now.getTime() + 120000);
                await tx.autoContactControl.upsert({ where: { platform_mode: { platform: j.platform, mode: j.mode } }, create: { platform: j.platform, mode: j.mode, activeJobId: j.id, leaseUntil }, update: { activeJobId: j.id, leaseUntil } });
                return tx.autoContactJob.update({ where: { id: j.id }, data: { status: 'RESERVED', accountId: selected, attemptId: attempt.id, leaseUntil, reason: null } });
            }
            return null;
        });
    }
    private request(j: AutoContactJob): SendRequest { return { accountId: j.accountId!, platform: j.platform, channel: j.channel, content: j.content, recipientId: j.recipientId, postId: j.postId, commentId: j.commentId, requestKey: 'auto-contact:' + j.id }; }
    async dispatch(id: string) {
        // Health adapter is a distinct capability; the production unavailable adapter performs no IO.
        const before = await this.db.autoContactJob.findUnique({ where: { id } });
        if (!before || before.status !== 'RESERVED' || before.mode !== this.sender.mode)
            return;
        let healthy = false;
        try {
            healthy = await this.sender.healthy(before.accountId!);
        }
        catch { }
        const job = await this.db.$transaction(async (tx) => {
            await contactLock(tx);
            const j = await tx.autoContactJob.findUnique({ where: { id }, include: { rule: true } });
            if (!j || j.status !== 'RESERVED')
                return null;
            await tx.$queryRaw`SELECT id FROM "PlatformAccount" WHERE id=${j.accountId!} FOR UPDATE`;
            const valid = await this.reviewReady(tx, j.rule, j.reviewId), a = await tx.platformAccount.findUnique({ where: { id: j.accountId! }, include: { sessionReference: true } }), now = await this.now(tx);
            const postBlock = valid ? postSendBlock(valid.availability,j.rule.authorizedAt,valid.row.updatedAt,j.availabilityVersion) : null;
            if(postBlock){await cancelReserved(tx,j,postBlock);await tx.autoContactJob.update({where:{id:j.id},data:{status:'BLOCKED_POST'}});return null;}
            const attempt = await tx.contactAttempt.findUniqueOrThrow({ where: { id: j.attemptId! } }), usage = await tx.accountDay.findUnique({ where: { accountId_day: { accountId: j.accountId!, day: attempt.day } } });
            if (!healthy || !a || a.archivedAt || accountModeBlocked(a,j.mode) || !j.rule.accountIds.includes(a.id) || j.ruleVersion !== j.rule.version || !await this.ruleReady(tx, j.rule) || !valid || eligibilityHash(valid.row) !== j.eligibilityHash || !j.leaseUntil || j.leaseUntil < now || attempt.day !== quotaBucket(j.mode, now) || (usage?.occupied ?? 0) > limit(j.rule, a.id, a.dailyLimit) || (j.mode === 'REAL' ? (a.isDemo || a.sessionReference?.state !== 'VERIFIED') : (!a.isDemo || !!a.loginSessionKey))) {
                await cancelReserved(tx, j, '发送前健康、授权、额度日期或证据已变化；未发送');
                return null;
            }
            if(!await claimAcceptanceSend(tx,j.rule,j.reviewId,j.id,j.accountId!)){await cancelReserved(tx,j,'本次限定验收总提交次数已使用或范围变化');return null;}
            await tx.contactAttempt.update({ where: { id: j.attemptId! }, data: { outcome: 'ATTEMPTED', attemptedAt: now, version: { increment: 1 } } });
            return tx.autoContactJob.update({ where: { id }, data: { status: 'ATTEMPTED' } });
        });
        if (!job)
            return;
        let result: SendResult, timer: ReturnType<typeof setTimeout> | undefined;
        const abort = new AbortController();
        try {
            result = await Promise.race([this.sender.send(this.request(job), abort.signal), new Promise<SendResult>(resolve => { timer = setTimeout(() => { abort.abort(); resolve({ kind: 'BLOCKED', reason: 'STOP_UNCONFIRMED' }); }, 60000); })]);
        }
        catch {
            result = { kind: 'BLOCKED', reason: 'STOP_UNCONFIRMED' };
        }
        finally {
            if (timer)
                clearTimeout(timer);
        }
        await this.finish(job.id, result);
    }
    async finish(id: string, raw: SendResult) {
        let result = normalizeSendResult(raw);
        return this.db.$transaction(async (tx) => {
            await contactLock(tx);
            const j = await tx.autoContactJob.findUnique({ where: { id } });
            if (!j || !['ATTEMPTED', 'UNKNOWN'].includes(j.status) || j.mode !== this.sender.mode)
                return;
            const a = await tx.contactAttempt.findUniqueOrThrow({ where: { id: j.attemptId! } });
            // A late failure is not proof that an interrupted attempt never submitted.
            if ((j.status === 'UNKNOWN' || a.outcome === 'UNKNOWN') && result.kind === 'FAILED')
                result = { kind: 'UNKNOWN', reason: '既有未知结果不能降级为未提交；保留占用' };
            let status: string, reason: string | null = null, receipt: string | null = null;
            if (result.kind === 'CONFIRMED' && typeof result.receipt === 'string' && result.receipt.length > 0 && result.receipt.length <= 500) {
                status = j.mode === 'SIMULATION' ? 'SIMULATED_SUCCESS' : 'CONFIRMED';
                receipt = result.receipt;
            }
            else if (result.kind === 'FAILED') {
                status = 'FAILED';
                reason = '适配器确认未发送：'+result.reason;
            }
            else {
                status = 'UNKNOWN';
                reason = result.kind === 'BLOCKED' ? '执行停止未确认，已暂停发送；保留占用' : result.kind === 'RISK' ? '平台限制：' + result.reason : '结果未知，保留收件人与原日额度占用';
            }
            if (status === 'UNKNOWN') {
                const pause = result.kind === 'RISK' || result.kind === 'BLOCKED' ? result.reason : 'SUBMISSION_UNKNOWN';
                await tx.autoContactControl.upsert({ where: { platform_mode: { platform: j.platform, mode: j.mode } }, create: { platform: j.platform, mode: j.mode, pauseReason: pause, pausedAt: await this.now(tx) }, update: { pauseReason: pause, pausedAt: await this.now(tx) } });
                await tx.autoContactRule.updateMany({ where: { platform: j.platform, mode: j.mode }, data: { enabled: false } });
            }
            if (status === 'FAILED')
                await tx.accountDay.update({ where: { accountId_day: { accountId: j.accountId!, day: a.day } }, data: { occupied: { decrement: 1 } } });
            await tx.contactAttempt.update({ where: { id: a.id }, data: { outcome: status as any, platformReceipt: receipt, resolutionNote: reason, confirmedAt: status === 'CONFIRMED' || status === 'SIMULATED_SUCCESS' ? await this.now(tx) : null, version: { increment: 1 } } });
            await tx.autoContactJob.update({ where: { id }, data: { status, reason, leaseUntil: null } });
            await tx.autoContactControl.updateMany({ where: { platform: j.platform, mode: j.mode, activeJobId: id }, data: { activeJobId: null, leaseUntil: null } });
        });
    }
    async reconcile(actor: Actor, id: string, receipt: string) { requireAdmin(actor); const j = await this.db.autoContactJob.findUnique({ where: { id } }); if (!j || j.mode !== this.sender.mode)
        throw new NotFoundException(); if (j.status !== 'UNKNOWN' || !this.sender.reconcile || !this.sender.capability(j.platform, j.channel))
        throw new ConflictException('当前没有可核验回执的适配器；保留占用，不能换号补发'); const result = await this.sender.reconcile(this.request(j), receipt); await this.finish(id, result); return this.db.autoContactJob.findUnique({ where: { id } }); }
    async prepareWaiting(){
        if(this.sender.mode!=='REAL'||!this.sender.prepare)return;
        const jobs=await this.db.autoContactJob.findMany({where:{mode:'REAL',status:'WAITING_ACCOUNT'},include:{rule:true},orderBy:[{createdAt:'asc'},{id:'asc'}],take:100});
        const checked=new Set<string>();
        for(const j of jobs){
            const r=j.rule;if(j.ruleVersion!==r.version||!await this.ruleReady(this.db,r))continue;
            const actor=await this.db.user.findUnique({where:{id:r.authorizedBy!},select:{id:true,name:true,email:true,role:true,active:true}});if(!actor?.active||actor.role!=='ADMIN')continue;
            for(const id of r.accountIds){
                if(checked.has(id))continue;checked.add(id);
                const control=await this.db.autoContactControl.findUnique({where:{platform_mode:{platform:j.platform,mode:'REAL'}}});if(control?.pauseReason||control?.activeJobId)return;
                const account=await this.db.platformAccount.findUnique({where:{id}}),day=quotaBucket('REAL',await this.now(this.db));
                const usage=await this.db.accountDay.findUnique({where:{accountId_day:{accountId:id,day}}});
                if(!account||accountModeBlocked(account,'REAL')||(usage?.occupied??0)>=limit(r,id,account.dailyLimit))continue;
                // Only qualify accounts when there is actual authorized work. No IO in a DB transaction.
                if(await this.sender.prepare(actor,id))return;
            }
        }
    }
    async tick() { try { await this.enqueue(); let j = await this.reserve(); if(!j){await this.prepareWaiting();j=await this.reserve();} if (j)
        await this.dispatch(j.id); } finally { await this.db.$transaction(async tx=>{await contactLock(tx);await settleAcceptance(tx);}); } }
}
