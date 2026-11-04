import {recipientRecoveryBlocked} from './user-reviewed-recovery';
import {randomUUID} from 'node:crypto';
import type {Db} from '../common/db';import type {LoginRuntime} from '../accounts/login-runtime';import type {Actor} from '../auth/security';
import {accountSystemBlock} from '../accounts/account-execution-policy';import {effectiveAccountLimit} from '../accounts/account-day-limit';
import {LocalDmExecutor,DM_PRODUCTION_ACCEPTED} from '../direct-messages/dm-executor';import {DM_SEND_PROTOCOL,dmDigest,parseDmExecution,validDmMessageId,type DmCommand} from '../direct-messages/dm-send-protocol';
import {channelSendObservation} from './channel-send-observation';import {contactLock} from './contact-lock';import {manualAuthority} from './manual-reply-authority';
import {acceptanceSendThreshold,acceptanceSendAllowed} from './normal-acceptance';import {postAvailability,postSendBlock} from '../collection/post-availability';
import {contactTarget,eligibilityHash,eligible,ruleHash,quotaBucket} from './contact-policy';import type {ContactSender,SendRequest,SendResult} from './contact-sender';
export class LocalXhsDmSender implements ContactSender {
 readonly mode='REAL' as const;
 constructor(private db:Db,private runtime:LoginRuntime,private executor:LocalDmExecutor){}
 capability(platform:string,channel:string){return platform==='XHS'&&channel==='DM'&&DM_PRODUCTION_ACCEPTED&&this.executor.available()}
 async healthy(accountId:string){if(!this.capability('XHS','DM'))return false;return (await channelSendObservation(this.db,accountId,new Date(),'DM')).canSend}
 async prepare(_actor:Actor,accountId:string){return this.healthy(accountId)}
    private async authorized(request: SendRequest) {
        if (!this.capability(request.platform, request.channel) || !request.requestKey.startsWith('auto-contact:') || !await this.healthy(request.accountId)) return null;
        if(await recipientRecoveryBlocked(this.db,request.platform,request.recipientId))return null;
        const id = request.requestKey.slice('auto-contact:'.length);
        const j = await this.db.autoContactJob.findUnique({ where: { id }, include: { rule: true, review: { include: { capture: { include: { post: true, config: { select: { platform: true } } } } } } } });
        const manual=j?.manualRequestId?await manualAuthority(this.db,j,new Date()):null;
        if (!j || (j.manualRequestId&&!manual) || j.mode !== 'REAL' || j.status !== 'ATTEMPTED' || !j.leaseUntil || j.leaseUntil < new Date() ||
            j.accountId !== request.accountId || j.platform !== 'XHS' || j.channel !== 'DM' || j.content !== request.content ||
            j.postId !== request.postId || j.commentId !== request.commentId || j.recipientId !== request.recipientId ||
            (!manual&&(!j.rule.enabled||!j.rule.authorizedAt||j.rule.content!==request.content||j.ruleVersion!==j.rule.version||j.rule.authorizedHash!==ruleHash(j.rule)||!j.rule.authorizedBy)) || j.rule.mode!=='REAL'||j.rule.platform!=='XHS'||j.rule.channel!=='DM'||(manual&&manual.accountId!==request.accountId)||
            !j.rule.accountIds.includes(request.accountId) || eligibilityHash(j.review) !== j.eligibilityHash || !eligible(j.review, manual?j.rule.threshold:await acceptanceSendThreshold(this.db,j.rule,j.reviewId))) return null;
        if(!manual&&!await acceptanceSendAllowed(this.db,j.rule,j.reviewId,j.id))return null;
        if (j.review.isDemo || j.review.platform !== 'XHS' || j.review.capture?.config.platform !== 'XHS' || j.review.policyId !== j.rule.policyId || j.review.policyRevision !== j.rule.policyRevision || j.review.selectedModel !== j.rule.model) return null;
        if(postSendBlock(await postAvailability(this.db,j.platform,j.postId),manual?.authorizedAt??j.rule.authorizedAt,j.review.updatedAt,j.availabilityVersion))return null;
        const target = contactTarget(j.review, j.review.capture, j.review.capture?.post ?? null);
        if (!target || target.recipientId !== request.recipientId || target.commentId !== request.commentId || target.postId !== request.postId) return null;
        const [actor, policy, model, control, identity, attempt] = await Promise.all([
            this.db.user.findUnique({ where: { id: manual?.actorId??j.rule.authorizedBy! }, select: { id: true, name: true, email: true, role: true, active: true } }),
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

        const account = await this.db.platformAccount.findUnique({ where: { id: request.accountId }, include: { sessionReference: true } });
        if (!account?.loginPlatformUserId || !account.sessionReference || account.isDemo || account.archivedAt || accountSystemBlock(account) || account.sessionReference.state !== 'VERIFIED' || account.sessionReference.deviceId !== this.runtime.deviceId() || account.sessionReference.sessionKey !== account.loginSessionKey || account.sessionReference.provider !== 'real') return null;
        const limits = j.rule.accountLimits as { id: string; dailyLimit: number }[];
        const usage = await this.db.accountDay.findUnique({ where: { accountId_day: { accountId: account.id, day } } });
        const limit = Math.min(effectiveAccountLimit(account.dailyLimit,usage,day), Array.isArray(limits) ? limits.find(a => a.id === account.id)?.dailyLimit ?? 0 : 0);
        if (!usage || usage.occupied <= 0 || usage.occupied > limit) return null;
        return { actor, account, job:j, attempt };
    }
 async reconcile(request:SendRequest,_receipt:string):Promise<SendResult>{
  const unknown:SendResult={kind:'UNKNOWN',reason:'未取得一致的私信回执，保留占用，请勿重发'};
  if(!this.capability(request.platform,request.channel)||!request.requestKey.startsWith('auto-contact:'))return unknown;
  const j=await this.db.autoContactJob.findUnique({where:{id:request.requestKey.slice('auto-contact:'.length)}});
  if(!j||j.mode!=='REAL'||j.channel!=='DM'||j.status!=='UNKNOWN'||j.accountId!==request.accountId||j.recipientId!==request.recipientId||j.content!==request.content||!j.attemptId)return unknown;
  const a=await this.db.contactAttempt.findUnique({where:{id:j.attemptId}}),account=await this.db.platformAccount.findUnique({where:{id:request.accountId},include:{sessionReference:true}});
  const snap=a?.historySnapshot as {senderPlatformId?:string;recipientId?:string}|undefined;
  if(!a||a.outcome!=='UNKNOWN'||a.channel!=='DM'||a.requestKey!==request.requestKey||a.content!==request.content||!a.actorId||!account||account.archivedAt||!account.loginSessionKey||account.loginPlatformUserId!==snap?.senderPlatformId||snap?.recipientId!==request.recipientId||account.sessionReference?.state!=='VERIFIED'||account.sessionReference.sessionKey!==account.loginSessionKey)return unknown;
  const actor=await this.db.user.findUnique({where:{id:a.actorId},select:{id:true,name:true,email:true,role:true,active:true}});if(!actor?.active||actor.role!=='ADMIN')return unknown;
  const c:DmCommand={protocol:DM_SEND_PROTOCOL,attemptId:randomUUID(),requestKey:request.requestKey,accountId:account.id,senderId:account.loginPlatformUserId!,recipientId:request.recipientId,content:request.content,contentSha256:dmDigest(request.content),maxSubmissions:1,expiresAt:new Date(Date.now()+180000).toISOString()};
  try{const proof=await this.executor.verify(actor,c,account.loginSessionKey,AbortSignal.timeout(100000)),o=proof.observations;
   if(proof.stopped!==true||o.length!==2||o[0].inspectionId===o[1].inspectionId||o[0].messageId!==o[1].messageId||o.some(x=>!validDmMessageId(x.messageId,c.senderId,c.recipientId)||x.senderId!==c.senderId||x.recipientId!==c.recipientId||x.contentSha256!==c.contentSha256||!Number.isFinite(Date.parse(x.observedAt))||Date.parse(x.observedAt)<Date.now()-180000||Date.parse(x.observedAt)>Date.now()+5000))return unknown;
   await this.db.auditLog.create({data:{actorId:actor.id,entityId:request.requestKey,action:'DM_AUTO_UNKNOWN_READBACK_CONFIRMED',metadata:proof as any}});
   return {kind:'CONFIRMED',receipt:o[0].messageId};
  }catch{return unknown}
 }
 async send(request:SendRequest,signal:AbortSignal=AbortSignal.timeout(55000)):Promise<SendResult>{
  const initial=await this.authorized(request);if(!initial)return {kind:'FAILED',reason:'私信授权、收件人或账号条件已变化，未提交'};
  const c:DmCommand={protocol:DM_SEND_PROTOCOL,attemptId:randomUUID(),requestKey:request.requestKey,accountId:request.accountId,senderId:initial.account.loginPlatformUserId!,recipientId:request.recipientId,content:request.content,contentSha256:dmDigest(request.content),maxSubmissions:1,expiresAt:new Date(Math.min(Date.now()+55000,initial.job.leaseUntil!.getTime())).toISOString()};
  let dispatched=false;
  try{const r=parseDmExecution(await this.executor.run(initial.actor,c,initial.account.loginSessionKey!,async()=>{
   const current=await this.authorized(request);if(!current||current.account.version!==initial.account.version||current.account.loginSessionKey!==initial.account.loginSessionKey||current.account.loginPlatformUserId!==c.senderId||dispatched)return false;
   return this.db.$transaction(async tx=>{await contactLock(tx);const j=await tx.autoContactJob.findUnique({where:{id:initial.job.id},include:{rule:true}}),control=await tx.autoContactControl.findUnique({where:{platform_mode:{platform:'XHS',mode:'REAL'}}});if(!j||j.status!=='ATTEMPTED'||j.attemptId!==initial.attempt.id||j.rule.version!==initial.job.rule.version||control?.activeJobId!==j.id||control.pauseReason||await tx.auditLog.count({where:{entityId:request.requestKey,action:'DM_AUTO_DISPATCHED_ONCE'}}))return false;await tx.auditLog.create({data:{actorId:initial.actor.id,entityId:request.requestKey,action:'DM_AUTO_DISPATCHED_ONCE',metadata:{attemptId:initial.attempt.id,protocolAttemptId:c.attemptId,contentHash:c.contentSha256}}});dispatched=true;return true;});
  },signal),c);await this.db.auditLog.create({data:{actorId:initial.actor.id,entityId:request.requestKey,action:'DM_AUTO_EXECUTION_FINISHED',metadata:r as any}});
  if(!r.stopped)return {kind:'BLOCKED',reason:'STOP_UNCONFIRMED'};
  if(dispatched&&r.kind==='CONFIRMED')return {kind:'CONFIRMED',receipt:r.receipt!.messageId};
  if(r.kind==='NOT_SENT'&&r.submissions===0)return {kind:'FAILED',reason:'未提交私信：'+r.reason};return {kind:'UNKNOWN',reason:'私信回执未确认，禁止重发：'+r.reason};
  }catch{return {kind:'UNKNOWN',reason:'私信执行结果未确认，禁止重发'}}
 }
}
/** Preserve comment adapter behaviour; no channel is inferred from login or message text. */
export class ChannelContactSender implements ContactSender {
 readonly mode='REAL' as const;constructor(private comment:ContactSender,private dm:ContactSender){}
 private select(channel?:string){return channel==='DM'?this.dm:this.comment}
 capability(platform:string,channel:string){return this.select(channel).capability(platform,channel)}
 healthy(accountId:string,channel='COMMENT'){return this.select(channel).healthy(accountId,channel)}
 async prepare(actor:Actor,accountId:string,channel='COMMENT',onChecking?:()=>Promise<void>){const s=this.select(channel);return s.prepare?await s.prepare(actor,accountId,channel,onChecking):await s.healthy(accountId,channel)}
 send(request:SendRequest,signal?:AbortSignal){return this.select(request.channel).send(request,signal)}
 async reconcile(request:SendRequest,receipt:string):Promise<SendResult>{const sender=this.select(request.channel);return sender.reconcile?sender.reconcile(request,receipt):{kind:"UNKNOWN",reason:"当前渠道没有可靠回执核查能力，请勿重发"}}
}
