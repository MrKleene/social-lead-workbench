import {acceptanceSendThreshold,acceptanceSendAllowed} from './normal-acceptance';
import {randomUUID} from 'node:crypto';
import type {Actor} from '../auth/security';
import {inspectBoundedAccount} from './bounded-account-inspection';
import {accountSystemBlock} from '../accounts/account-execution-policy';
import {accountSendObservation,recordSendExecution} from './send-observation';
import {executionEventSchema, type ExecutionEvent} from './reply-stage-journal';
import {postAvailability,postSendBlock} from '../collection/post-availability';
import type { Db } from '../common/db';
import type { DeviceService, ExecutionPermit } from '../devices/device.service';
import type { LoginRuntime, SessionDriver } from '../accounts/login-runtime';
import { toolPlan } from '../../../../runtime/platform.cjs';
import { savedPostReference } from '../collection/post-reference';
import { contactTarget, eligibilityHash, eligible, ruleHash, quotaBucket } from './contact-policy';
import type { ContactSender, SendRequest, SendResult } from './contact-sender';
import { exactReplyDeployment, type ExactReplyDeployment } from './xhs-reply-deployment';
import { XhsExactReplyTransport } from './xhs-reply-transport';
/** Concrete worker adapter. Reviewed component capability is separate from explicit rule authorization.
 * No credentials, endpoint, binary path, approval hash or rule text comes from HTTP. */
export class LocalXhsReplySender implements ContactSender {
    readonly mode = 'REAL' as const;
    constructor(private db: Db, private devices: DeviceService, private runtime: LoginRuntime, private deployment: ExactReplyDeployment = exactReplyDeployment) { }
    capability(platform: string, channel: string) {
        return platform === 'XHS' && channel === 'COMMENT' && process.platform === 'darwin' &&
            this.deployment.enabled && this.deployment.responseMappingReviewed === true && this.deployment.sendEligibilityReviewed === true && !!this.deployment.reviewedSha256 &&
            toolPlan(process.env.HOME ?? '').hash === this.deployment.reviewedSha256;
    }
    private preparations=new Map<string,Promise<boolean>>();
    private nextCheck=new Map<string,number>();
    async prepare(actor:Actor,accountId:string):Promise<boolean>{
        if(!this.capability('XHS','COMMENT')||!this.devices.enabled()||!this.runtime.persistent()||this.runtime.mode()!=='real')return false;
        const pending=this.preparations.get(accountId);if(pending)return pending;
        const work=(async()=>{
            if(await this.healthy(accountId))return true;
            if((this.nextCheck.get(accountId)??0)>Date.now())return false;
            const control=await this.db.autoContactControl.findUnique({where:{platform_mode:{platform:'XHS',mode:'REAL'}}});
            const account=await this.db.platformAccount.findUnique({where:{id:accountId}});
            if(control?.pauseReason||control?.activeJobId||!account?.loginPlatformUserId||account.archivedAt||accountSystemBlock(account))return false;
            this.nextCheck.set(accountId,Date.now()+60000);
            try{await inspectBoundedAccount(this.db,this.devices,this.runtime,actor,{workflowId:'auto-qualification:'+randomUUID(),accountId,senderId:account.loginPlatformUserId,binarySha256:this.deployment.reviewedSha256!},AbortSignal.timeout(60000));this.nextCheck.delete(accountId);return await this.healthy(accountId);}catch(error){await this.db.auditLog.create({data:{actorId:actor.id,entityId:accountId,action:'AUTO_CONTACT_QUALIFICATION_FAILED',metadata:{reason:error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'QUALIFICATION_UNAVAILABLE',submissions:0}}});return false;}
        })();this.preparations.set(accountId,work);try{return await work;}finally{this.preparations.delete(accountId);}
    }
    async healthy(accountId: string) {
        if (!this.capability('XHS', 'COMMENT') || !this.devices.enabled() || this.runtime.mode() !== 'real' || !this.runtime.persistent()) return false;
        const a = await this.db.platformAccount.findUnique({ where: { id: accountId }, include: { sessionReference: true } });
        const ref = a?.sessionReference;
        const restriction=await accountSendObservation(this.db,accountId,new Date());
        if(!restriction.canSend)return false;
        return !!a && a.platform === 'XHS' && !a.isDemo && !a.archivedAt && !accountSystemBlock(a) &&
            !!a.loginPlatformUserId && !!a.loginSessionKey && ref?.sessionKey === a.loginSessionKey && ref?.provider === 'real' &&
            ref?.state === 'VERIFIED' && currentRuntimeVerification(ref.checkedRuntimeId,this.runtime.runtimeId) && ref.deviceId === this.runtime.deviceId();
    }
    private async authorized(request: SendRequest) {
        if (!this.capability(request.platform, request.channel) || !request.requestKey.startsWith('auto-contact:') || !await this.healthy(request.accountId)) return null;
        const id = request.requestKey.slice('auto-contact:'.length);
        const j = await this.db.autoContactJob.findUnique({ where: { id }, include: { rule: true, review: { include: { capture: { include: { post: true, config: { select: { platform: true } } } } } } } });
        if (!j || j.mode !== 'REAL' || j.status !== 'ATTEMPTED' || !j.leaseUntil || j.leaseUntil < new Date() ||
            j.accountId !== request.accountId || j.platform !== 'XHS' || j.channel !== 'COMMENT' || j.content !== request.content ||
            j.postId !== request.postId || j.commentId !== request.commentId || j.recipientId !== request.recipientId ||
            !j.rule.enabled || !j.rule.authorizedAt || j.rule.mode !== 'REAL' || j.rule.platform !== 'XHS' || j.rule.channel !== 'COMMENT' || j.rule.content !== request.content || j.ruleVersion !== j.rule.version || j.rule.authorizedHash !== ruleHash(j.rule) || !j.rule.authorizedBy ||
            !j.rule.accountIds.includes(request.accountId) || eligibilityHash(j.review) !== j.eligibilityHash || !eligible(j.review, await acceptanceSendThreshold(this.db,j.rule,j.reviewId))) return null;
        if(!await acceptanceSendAllowed(this.db,j.rule,j.reviewId,j.id))return null;
        if (j.review.isDemo || j.review.platform !== 'XHS' || j.review.capture?.config.platform !== 'XHS' || j.review.policyId !== j.rule.policyId || j.review.policyRevision !== j.rule.policyRevision || j.review.selectedModel !== j.rule.model) return null;
        if(postSendBlock(await postAvailability(this.db,j.platform,j.postId),j.rule.authorizedAt,j.review.updatedAt,j.availabilityVersion))return null;
        const target = contactTarget(j.review, j.review.capture, j.review.capture?.post ?? null);
        if (!target || target.recipientId !== request.recipientId || target.commentId !== request.commentId || target.postId !== request.postId) return null;
        const [actor, policy, model, control, identity, attempt] = await Promise.all([
            this.db.user.findUnique({ where: { id: j.rule.authorizedBy }, select: { id: true, name: true, email: true, role: true, active: true } }),
            this.db.commentReviewPolicy.findUnique({ where: { id: j.rule.policyId }, select: { revision: true } }),
            this.db.modelSettings.findFirst({ select: { model: true } }),
            this.db.autoContactControl.findUnique({ where: { platform_mode: { platform: 'XHS', mode: 'REAL' } } }),
            this.db.platformIdentity.findUnique({ where: { platform_platformUserId: { platform: 'XHS', platformUserId: request.recipientId } }, include: { lead: true } }),
            j.attemptId ? this.db.contactAttempt.findUnique({ where: { id: j.attemptId } }) : null,
        ]);
        if (!actor?.active || actor.role !== 'ADMIN' || policy?.revision !== j.rule.policyRevision || model?.model !== j.rule.model || control?.pauseReason || control?.activeJobId !== j.id) return null;
        if (identity?.lead && (identity.lead.doNotContact || (!identity.lead.isDemo && (identity.lead.contactedAt || ['CONTACTED', 'INTERESTED'].includes(identity.lead.contactStage))))) return null;
        const day = quotaBucket('REAL', new Date());
        if (!attempt || attempt.jobId !== j.id || attempt.mode !== 'REAL' || attempt.outcome !== 'ATTEMPTED' || attempt.day !== day || attempt.requestKey !== request.requestKey) return null;
        const snapshot = j.review.capture?.post.snapshot as Record<string, unknown> | undefined;
        const reference = savedPostReference(snapshot?.sourceReference, j.postId);
        if (!reference) return null;
        const account = await this.db.platformAccount.findUnique({ where: { id: request.accountId }, include: { sessionReference: true } });
        if (!account?.loginPlatformUserId || !account.sessionReference || account.isDemo || account.archivedAt || accountSystemBlock(account) || account.sessionReference.state !== 'VERIFIED' || !currentRuntimeVerification(account.sessionReference.checkedRuntimeId,this.runtime.runtimeId) || account.sessionReference.deviceId !== this.runtime.deviceId() || account.sessionReference.sessionKey !== account.loginSessionKey || account.sessionReference.provider !== 'real') return null;
        const limits = j.rule.accountLimits as { id: string; dailyLimit: number }[];
        const limit = Math.min(account.dailyLimit, Array.isArray(limits) ? limits.find(a => a.id === account.id)?.dailyLimit ?? 0 : 0);
        const usage = await this.db.accountDay.findUnique({ where: { accountId_day: { accountId: account.id, day } } });
        if (!usage || usage.occupied <= 0 || usage.occupied > limit) return null;
        return { actor, account, reference };
    }
    async send(request: SendRequest, signal: AbortSignal = AbortSignal.timeout(50000)): Promise<SendResult> {
        const notSent = (): SendResult => ({ kind: 'FAILED', reason: '发送前权限、账号或新协议未就绪，未执行提交' });
        const initial = await this.authorized(request); if (!initial) return notSent();
        let permit: ExecutionPermit | undefined, driver: SessionDriver | undefined, transport: XhsExactReplyTransport | undefined;
        let stopped = true, attempted = false;
        try {
            permit = await this.devices.acquire(initial.actor, request.accountId);
            const combined = AbortSignal.any([signal, permit.signal, AbortSignal.timeout(50000)]);
            driver = await this.runtime.openSavedForReply(request.accountId, initial.account.sessionReference!.sessionKey, combined, permit.root, this.deployment.reviewedSha256!);
            stopped = false;
            if (!driver.replyEndpoint) return { kind: 'BLOCKED', reason: 'STOP_UNCONFIRMED' };
            transport = new XhsExactReplyTransport(driver.replyEndpoint(), { enabled: true, reviewedSha256: this.deployment.reviewedSha256!, requireJournal: true, requireConfirmedMapping: true });
            if (!await transport.connect(combined)) { const failure = transport.connectionFailure(); stopped = await transport.stop(); return stopped || failure.kind === 'RISK' ? failure : { kind: 'BLOCKED', reason: 'STOP_UNCONFIRMED' }; }
            const login=await driver.status(combined);
            if(!login.loggedIn||login.userId!==initial.account.loginPlatformUserId){stopped=await transport.stop();return stopped?notSent():{kind:'BLOCKED',reason:'STOP_UNCONFIRMED'};}
            const current = await this.authorized(request);
            if (!current || current.account.version !== initial.account.version || current.account.loginPlatformUserId !== initial.account.loginPlatformUserId || current.account.sessionReference?.sessionKey !== initial.account.sessionReference?.sessionKey || combined.aborted) {
                stopped = await transport.stop(); return stopped ? notSent() : { kind: 'BLOCKED', reason: 'STOP_UNCONFIRMED' };
            }
            await this.db.$transaction(tx => this.devices.assertPermit(tx, permit!));
            attempted = true;
            const result = await transport.send(request, { accountId: request.accountId, senderId: current.account.loginPlatformUserId!, postReference: current.reference }, combined, async (event: ExecutionEvent) => {
                await this.db.$transaction(tx=>recordSendExecution(tx,current.actor.id,request.accountId,request.requestKey,'AUTO_CONTACT_EXECUTION_STAGE',event,current.account.loginPlatformUserId!));
            });
            stopped = await transport.stop(); return !stopped && result.kind !== 'RISK' ? { kind: 'BLOCKED', reason: 'STOP_UNCONFIRMED' } : result;
        } catch (error) {
            if (transport) stopped = await transport.stop();
            if (error instanceof Error && error.message === 'RATE_LIMITED') return { kind: 'RISK', reason: 'RATE_LIMITED' };
            if (error instanceof Error && error.message === 'RESTRICTED') return { kind: 'RISK', reason: 'PLATFORM_REFUSED' };
            if (!stopped || attempted) return { kind: 'BLOCKED', reason: 'STOP_UNCONFIRMED' };
            return notSent();
        } finally {
            if (transport) stopped = await transport.stop();
            else if (driver) { await driver.stop().catch(() => {}); stopped = false; }
            // On uncertain shutdown keep the device lease; platform workflow is also paused.
            if (permit && stopped) await permit.release();
        }
    }
}

/** Collection records the same runtime with a task suffix. It is still a login
 * proof, never a send permission; restriction observation and leases remain required. */
export function currentRuntimeVerification(value:string|null,runtimeId:string){return value===runtimeId||!!value?.startsWith(runtimeId+':task:')&&value.length>runtimeId.length+6;}
