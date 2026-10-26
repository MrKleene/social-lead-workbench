import {sessionHealth,sessionFresh} from './session-health';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Db } from "../common/db";
import { Actor, requireAdmin, requireOwner, scope } from "../auth/security";
export type AccountInput = {
  platform: "XHS" | "DOUYIN";
  label: string;
  ownerId: string | null;
  dailyLimit: number;
  status: "UNCONNECTED" | "PAUSED" | "RESTRICTED";
  pauseReason: string | null;
};
export const utcDay = (date: Date) => date.toISOString().slice(0, 10);
@Injectable()
export class AccountsService {
  constructor(@Inject(Db) private db: Db) {}
  private async now(tx: Prisma.TransactionClient) {
    const [row] = await tx.$queryRaw<
      { now: Date }[]
    >`SELECT clock_timestamp() AS now`;
    return row.now;
  }
  async list(actor: Actor) {
    return this.db.$transaction(async (tx) => {
      const day = utcDay(await this.now(tx));
      const rows = await tx.platformAccount.findMany({
        where: { ...scope(actor), archivedAt: null },
        include: { sessionReference: true, usage: { where: { day } } },
        orderBy: { createdAt: "asc" },
      });
      const owners = await tx.user.findMany({
        where: {
          id: { in: rows.flatMap((r) => (r.ownerId ? [r.ownerId] : [])) },
        },
        select: { id: true, name: true, active: true },
      });
      const accounts = rows.map(({ usage, sessionReference, ...r }) => ({
        ...r,
        owner: owners.find((u) => u.id === r.ownerId) || null,
        day,
        occupied: usage[0]?.occupied || 0,
        available:
          r.isDemo && !r.loginSessionKey &&
          !r.archivedAt &&
          r.status === "UNCONNECTED" &&
          r.dailyLimit > (usage[0]?.occupied || 0),
        sessionReference: sessionReference ? {deviceId:sessionReference.deviceId,provider:sessionReference.provider,state:sessionReference.state,verifiedAt:sessionReference.verifiedAt} : null,
        loginStatus: sessionReference ? (sessionFresh(sessionReference,process.env.CRM_RUNTIME_ID) ? (r.loginProvider==='offline'?'OFFLINE_VERIFIED':'VERIFIED') : sessionHealth(sessionReference,process.env.CRM_RUNTIME_ID).state) : r.loginVerifiedAt ? (process.env.CRM_PERSISTENT==='1'?'LEGACY_UNMAPPED':r.loginProvider==='real'?'VERIFIED':'OFFLINE_VERIFIED') : 'NOT_CONNECTED',
        capabilities: {
          simulation: !r.loginSessionKey,
          login: sessionReference ? sessionFresh(sessionReference,process.env.CRM_RUNTIME_ID) : !!r.loginVerifiedAt&&process.env.CRM_PERSISTENT!=='1',
          read: process.env.CRM_ACCOUNT_READ_ENABLED==='1'&&!!sessionReference&&sessionFresh(sessionReference,process.env.CRM_RUNTIME_ID)&&r.status!=='RESTRICTED',
          send: false,
        },
      }));
      return {
        accounts,
        summary: {
          available: accounts.filter((a) => a.available).length,
          attention: accounts.filter((a) => !a.available).length,
        },
        mode: "SIMULATION_ONLY",
        timezone: "UTC",
      };
    });
  }
  private async owner(tx: Prisma.TransactionClient, id: string | null) {
    if (
      id &&
      !(await tx.user.findFirst({ where: { id, role: "SALES", active: true } }))
    )
      throw new BadRequestException("请选择有效销售负责人");
  }
  async create(actor: Actor, data: AccountInput) {
    requireAdmin(actor);
    return this.db.$transaction(async (tx) => {
      await this.owner(tx, data.ownerId);
      const account = await tx.platformAccount.create({
        data: { ...data, isDemo: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "ACCOUNT_CREATED_SIMULATION",
          entityId: account.id,
        },
      });
      return account;
    });
  }
  async update(
    actor: Actor,
    id: string,
    version: number,
    data: Omit<AccountInput, "platform"> | { archivedAt: Date },
  ) {
    requireAdmin(actor);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "PlatformAccount" WHERE id=${id} FOR UPDATE`;
      const old = await tx.platformAccount.findUnique({ where: { id } });
      if (!old || old.archivedAt) throw new NotFoundException();
      if (old.version !== version)
        throw new ConflictException("账号已变化，请刷新");
      if ("ownerId" in data) await this.owner(tx, data.ownerId);
      const account = await tx.platformAccount.update({
        where: { id },
        data: { ...data, version: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "archivedAt" in data ? "ACCOUNT_ARCHIVED" : "ACCOUNT_UPDATED",
          entityId: id,
          metadata: {
            before: {
              label: old.label,
              pauseReason: old.pauseReason,
              ownerId: old.ownerId,
              dailyLimit: old.dailyLimit,
              status: old.status,
            },
            after: {
              label: account.label,
              pauseReason: account.pauseReason,
              ownerId: account.ownerId,
              dailyLimit: account.dailyLimit,
              status: account.status,
            },
          },
        },
      });
      return account;
    });
  }
  private async lead(tx: Prisma.TransactionClient, actor: Actor, id: string) {
    await tx.$queryRaw`SELECT id FROM "Lead" WHERE id=${id} FOR UPDATE`;
    const lead = await tx.lead.findUnique({
      where: { id },
      include: { identity: true },
    });
    if (!lead) throw new NotFoundException();
    requireOwner(actor, lead);
    return lead;
  }
  async contactState(actor: Actor, id: string) {
    const lead = await this.db.lead.findFirst({
      where: { id, ...scope(actor) },
      include: { identity: true },
    });
    if (!lead) throw new NotFoundException();
    const ledger = await this.db.contactLedger.findUnique({
      where: { identityId: lead.identityId },
      include: {
        account: { select: { id: true, label: true, platform: true } },
        attempts: { orderBy: { createdAt: "desc" }, take: 30 },
      },
    });
    return {
      ledger,
      firstContactSimulated: !!(
        ledger &&
        (await this.db.contactAttempt.findFirst({
          where: {
            ledgerId: ledger.id,
            kind: "FIRST",
            outcome: "SIMULATED_SUCCESS",
          },
          select: { id: true },
        }))
      ),
      doNotContact: lead.doNotContact,
      identityReady: !!lead.identity.platformUserId.trim(),
      manuallyRecorded: !!lead.contactedAt,
      reviewed: !!lead.reviewedAt,
      platformConfirmed: false,
    };
  }
  async block(
    actor: Actor,
    id: string,
    blocked: boolean,
    note: string,
    version: number,
  ) {
    return this.db.$transaction(async (tx) => {
      const lead = await this.lead(tx, actor, id);
      if (lead.version !== version) throw new ConflictException("线索已变化");
      const result = await tx.lead.update({
        where: { id },
        data: { doNotContact: blocked, version: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "DO_NOT_CONTACT_CHANGED",
          entityId: id,
          metadata: { blocked, note },
        },
      });
      return result;
    });
  }
  async reserve(
    actor: Actor,
    id: string,
    accountId: string,
    requestKey: string,
    kind: "FIRST" | "FOLLOWUP",
  ) {
    return this.db.$transaction(async (tx) => {
      // Global key lock before lead/account locks: retries cannot occupy two identities or quotas.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${requestKey}))`;
      const lead = await this.lead(tx, actor, id);
      await tx.$queryRaw`SELECT id FROM "PlatformAccount" WHERE id=${accountId} FOR UPDATE`;
      const account = await tx.platformAccount.findUnique({
        where: { id: accountId },
      });
      if (!account) throw new NotFoundException();
      requireOwner(actor, account);
      const prior = await tx.contactAttempt.findUnique({
        where: { requestKey },
        include: { ledger: true },
      });
      if (prior) {
        if (
          prior.ledger.identityId !== lead.identityId ||
          prior.ledger.accountId !== accountId ||
          prior.kind !== kind ||
          prior.actorId !== actor.id
        )
          throw new ConflictException("幂等键已用于其他任务");
        return prior;
      }
      if (!lead.identity.platformUserId.trim())
        throw new ConflictException("平台稳定用户 ID 缺失，待人工核查");
      if (lead.doNotContact || !lead.reviewedAt)
        throw new ConflictException(
          "勿联系或尚未人工审核；审核不代表收件人同意",
        );
      if (!lead.isDemo || !lead.identity.isDemo || !account.isDemo)
        throw new ConflictException("仅接受模拟身份与模拟账号");
      if (account.archivedAt || account.status !== "UNCONNECTED")
        throw new ConflictException("账号暂停或受限，不分配新模拟任务");
      if (account.platform !== lead.identity.platform)
        throw new ConflictException("平台不匹配");
      let ledger = await tx.contactLedger.findUnique({
        where: { identityId: lead.identityId },
        include: { attempts: true },
      });
      if (ledger && ledger.accountId !== accountId)
        throw new ConflictException("固定原联系账号，禁止失败后轮转账号");
      if (
        ledger?.attempts.some((a) =>
          ["ATTEMPTED", "UNKNOWN"].includes(a.outcome),
        )
      )
        throw new ConflictException("已有尝试或结果未知占用，先核查");
      const successful = ledger?.attempts.some(
        (a) => a.kind === "FIRST" && a.outcome === "SIMULATED_SUCCESS",
      );
      if (kind === "FIRST" && (successful || lead.contactedAt))
        throw new ConflictException("已联系或有人工联系记录，阻止重复首次联系");
      if (kind === "FOLLOWUP" && !successful)
        throw new ConflictException(
          "先完成原账号模拟首次联系核查；历史人工记录需人工处理",
        );
      const day = utcDay(await this.now(tx));
      const usage = await tx.accountDay.upsert({
        where: { accountId_day: { accountId, day } },
        create: { accountId, day },
        update: {},
      });
      if (usage.occupied >= account.dailyLimit)
        throw new ConflictException("内部今日额度耗尽，暂停接收新模拟任务");
      if (!ledger)
        ledger = await tx.contactLedger.create({
          data: { identityId: lead.identityId, accountId },
          include: { attempts: true },
        });
      await tx.accountDay.update({
        where: { accountId_day: { accountId, day } },
        data: { occupied: { increment: 1 } },
      });
      const attempt = await tx.contactAttempt.create({
        data: { ledgerId: ledger.id, requestKey, kind, day, actorId: actor.id },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "SIMULATED_CONTACT_RESERVED",
          entityId: id,
          metadata: {
            attemptId: attempt.id,
            accountId,
            kind,
            day,
            platformMessageSent: false,
          },
        },
      });
      return attempt;
    });
  }
  async resolve(
    actor: Actor,
    id: string,
    attemptId: string,
    outcome: "UNKNOWN" | "FAILED" | "SIMULATED_SUCCESS",
    note: string,
    version: number,
    pauseReason: "RATE_LIMITED" | "VERIFICATION" | "BANNED" | undefined,
  ) {
    return this.db.$transaction(async (tx) => {
      const lead = await this.lead(tx, actor, id);
      const attempt = await tx.contactAttempt.findUnique({
        where: { id: attemptId },
        include: { ledger: true },
      });
      if (!attempt || attempt.ledger.identityId !== lead.identityId)
        throw new NotFoundException();
      await tx.$queryRaw`SELECT id FROM "PlatformAccount" WHERE id=${attempt.ledger.accountId} FOR UPDATE`;
      const account = await tx.platformAccount.findUniqueOrThrow({
        where: { id: attempt.ledger.accountId },
      });
      requireOwner(actor, account);
      if (attempt.version !== version)
        throw new ConflictException("核查结果已变化");
      if (!["ATTEMPTED", "UNKNOWN"].includes(attempt.outcome))
        throw new ConflictException("终态不可覆盖");
      if (pauseReason && outcome === "SIMULATED_SUCCESS")
        throw new BadRequestException("限制事件不能标为成功");
      if (outcome === "FAILED")
        await tx.accountDay.update({
          where: { accountId_day: { accountId: account.id, day: attempt.day } },
          data: { occupied: { decrement: 1 } },
        });
      if (pauseReason)
        await tx.platformAccount.update({
          where: { id: account.id },
          data: {
            status: "RESTRICTED",
            pauseReason,
            version: { increment: 1 },
          },
        });
      const result = await tx.contactAttempt.update({
        where: { id: attemptId },
        data: { outcome, resolutionNote: note, version: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "SIMULATED_CONTACT_RECONCILED",
          entityId: id,
          metadata: {
            attemptId,
            from: attempt.outcome,
            to: outcome,
            note,
            pauseReason: pauseReason || null,
            platformConfirmed: false,
            quotaDay: attempt.day,
          },
        },
      });
      return result;
    });
  }
}
