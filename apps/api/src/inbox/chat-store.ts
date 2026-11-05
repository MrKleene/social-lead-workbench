import {Inject,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {Db} from '../common/db';
import {requireAdmin,type Actor} from '../auth/security';
import {parse} from '../common/validation';
import {chatSelection,validInbound} from './chat-policy';
import {z} from 'zod';
@Injectable()
export class ChatStore {
 constructor(@Inject(Db)private db:Db){}
 async list(actor:Actor,raw:unknown){requireAdmin(actor);const q=parse(z.object({page:z.coerce.number().int().min(1).max(100000).default(1),accountId:z.string().max(100).optional(),unread:z.enum(['1']).optional()}).strict(),raw);
 const filter=q.accountId?Prisma.sql`AND m."accountId"=${q.accountId}`:Prisma.empty;
 const base=Prisma.sql`FROM "InboxMessage" m JOIN "PlatformAccount" a ON a.id=m."accountId" LEFT JOIN "InboxRead" r ON r."messageId"=m.id AND r."userId"=${actor.id} WHERE m.channel='DM' AND a."archivedAt" IS NULL AND NOT a."isDemo" AND a.platform='XHS' ${filter}`;
 const having=q.unread?Prisma.sql`HAVING count(*) FILTER (WHERE m."isNew" AND r."messageId" IS NULL)>0`:Prisma.empty;
 const grouped=Prisma.sql`SELECT m."accountId",m."senderId",a."loginNickname" AS "accountName",(array_agg(m."senderName" ORDER BY m."receivedAt" DESC,m.id DESC))[1] AS "senderName",(array_agg(m.body ORDER BY m."receivedAt" DESC,m.id DESC))[1] AS body,max(m."receivedAt") AS "lastAt",count(*) FILTER (WHERE m."isNew" AND r."messageId" IS NULL)::int AS unread ${base} GROUP BY m."accountId",m."senderId",a."loginNickname" ${having}`;
 const [items,total]=await this.db.$transaction([this.db.$queryRaw(Prisma.sql`${grouped} ORDER BY "lastAt" DESC,"accountId","senderId" LIMIT 30 OFFSET ${(q.page-1)*30}`),this.db.$queryRaw<{n:number}[]>(Prisma.sql`SELECT count(*)::int n FROM (${grouped}) t`)]);return {items,total:total[0].n,page:q.page,pageSize:30};
 }
 async thread(actor:Actor,raw:unknown){requireAdmin(actor);const q=parse(chatSelection.extend({page:z.coerce.number().int().min(1).max(100000).default(1)}),raw);
 const account=await this.db.platformAccount.findFirst({where:{id:q.accountId,archivedAt:null,isDemo:false,platform:'XHS'},select:{id:true,loginNickname:true,loginPlatformUserId:true}});if(!account)throw new NotFoundException('接收账号不存在');
 const input=Prisma.sql`SELECT m.id,'IN' AS direction,m.body AS content,COALESCE(m."publishedAt",m."receivedAt") AS at,m."publishedAt" AS "platformAt",'RECEIVED' AS outcome,(m."isNew" AND r."messageId" IS NULL) AS unread,m."senderName",NULL::text AS reason FROM "InboxMessage" m LEFT JOIN "InboxRead" r ON r."messageId"=m.id AND r."userId"=${actor.id} WHERE m."accountId"=${q.accountId} AND m."senderId"=${q.senderId} AND m.channel='DM'`;
 const output=Prisma.sql`SELECT c.id,'OUT' AS direction,c.content,COALESCE(c."confirmedAt",c."attemptedAt",c."createdAt") AS at,NULL::timestamp AS "platformAt",CASE WHEN c.outcome IN ('RESERVED','ATTEMPTED') AND c."updatedAt"<now()-interval '2 minutes' THEN 'INTERRUPTED' ELSE c.outcome::text END AS outcome,false AS unread,'' AS "senderName",c."resolutionNote" AS reason FROM "ContactAttempt" c JOIN "ContactLedger" l ON l.id=c."ledgerId" JOIN "PlatformIdentity" i ON i.id=l."identityId" WHERE c."accountIdSnapshot"=${q.accountId} AND i."platformUserId"=${q.senderId} AND i.platform='XHS' AND c.mode='REAL' AND c.channel='DM' AND c.outcome<>'CANCELLED'`;
 const union=Prisma.sql`${input} UNION ALL ${output}`;
 const [items,total,anchor]=await this.db.$transaction([this.db.$queryRaw<any[]>(Prisma.sql`SELECT * FROM (${union}) t ORDER BY at DESC,id DESC LIMIT 30 OFFSET ${(q.page-1)*30}`),this.db.$queryRaw<{n:number}[]>(Prisma.sql`SELECT count(*)::int n FROM (${union}) t`),this.db.$queryRaw<any[]>`SELECT * FROM "InboxMessage" WHERE "accountId"=${q.accountId} AND "senderId"=${q.senderId} AND channel='DM' ORDER BY "receivedAt" DESC,id DESC LIMIT 1`]);
 if(!anchor.length)throw new NotFoundException('没有该账号与用户的入站会话');return {account:{id:account.id,loginNickname:account.loginNickname},replyEvidence:!!account.loginPlatformUserId&&validInbound(anchor[0],account.loginPlatformUserId),senderId:q.senderId,senderName:anchor[0].senderName,anchorId:anchor[0].id,items:items.reverse(),total:total[0].n,page:q.page,pageSize:30};
 }
}
