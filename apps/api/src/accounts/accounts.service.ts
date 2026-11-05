import {effectiveAccountLimit} from '../accounts/account-day-limit';
import {quotaBucket,shanghaiDay} from '../auto-contact/contact-policy';
import {accountSystemBlock,recordedAccountBlocks} from './account-execution-policy';
import {boundAccountNickname} from './account-display';
import {sessionHealth} from './session-health';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Db } from "../common/db";
import { Actor, requireAdmin, scope } from "../auth/security";
export type AccountInput = {
  platform: "XHS" | "DOUYIN";
  label: string;
  ownerId: string | null;
  dailyLimit: number;
  status?: "UNCONNECTED" | "PAUSED" | "RESTRICTED";
  pauseReason?: string | null;
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
      const now=await this.now(tx), day = utcDay(now), realDay=quotaBucket('REAL',now);
      const rows = await tx.platformAccount.findMany({
        where: { ...scope(actor), archivedAt: null },
        include: { sessionReference: true, usage: { where: { day:{in:[day,realDay]} } } },
        orderBy: { createdAt: "asc" },
      });
      const owners = await tx.user.findMany({
        where: {
          id: { in: rows.flatMap((r) => (r.ownerId ? [r.ownerId] : [])) },
        },
        select: { id: true, name: true, active: true },
      });
      const riskBlocks=await recordedAccountBlocks(tx,rows.map(a=>a.id));
      const accounts = rows.map(({ usage, sessionReference, ...r }) => ({
        ...r,
        systemBlockReason:accountSystemBlock(r)||(riskBlocks.has(r.id)?'历史平台限制，待核查':null),
        loginNickname:boundAccountNickname({...r,sessionReference}),
        owner: owners.find((u) => u.id === r.ownerId) || null,
        day:r.isDemo?day:shanghaiDay(now),
        occupied: usage.find(u=>u.day===(r.isDemo?day:realDay))?.occupied || 0,
        todayLimit:effectiveAccountLimit(r.dailyLimit,usage.find(u=>u.day===realDay),r.isDemo?day:realDay),
        available:
          r.isDemo && !r.loginSessionKey &&
          !r.archivedAt &&
          r.status === "UNCONNECTED" &&
          r.dailyLimit > (usage[0]?.occupied || 0),
        sessionReference: sessionReference ? {deviceId:sessionReference.deviceId,provider:sessionReference.provider,state:sessionReference.state,verifiedAt:sessionReference.verifiedAt} : null,
        loginStatus: sessionReference ? (sessionReference.state==='VERIFIED' ? (r.loginProvider==='offline'?'OFFLINE_VERIFIED':'PREVIOUSLY_VERIFIED') : sessionHealth(sessionReference,process.env.CRM_RUNTIME_ID).state) : r.loginVerifiedAt ? (process.env.CRM_PERSISTENT==='1'?'LEGACY_UNMAPPED':r.loginProvider==='real'?'VERIFIED':'OFFLINE_VERIFIED') : 'NOT_CONNECTED',
        capabilities: {
          simulation: !r.loginSessionKey,
          login: sessionReference ? false : !!r.loginVerifiedAt&&process.env.CRM_PERSISTENT!=='1',
          read: false,
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
      if ((!old.isDemo || old.loginSessionKey) && ('status' in data && data.status!==old.status || 'pauseReason' in data && data.pauseReason!==old.pauseReason))
        throw new ConflictException('账号资格由系统检查维护，不能通过元数据修改限制');
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
}
