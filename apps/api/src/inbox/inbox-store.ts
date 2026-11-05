import {BadRequestException,ConflictException,Inject,Injectable} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {Subject} from 'rxjs';
import {z} from 'zod';
import {Db} from '../common/db';
import {requireAdmin,type Actor} from '../auth/security';
export const messageSchema=z.object({id:z.string().min(1).max(200),sender:z.string().min(1).max(128),nickname:z.string().max(200).default(''),body:z.string().max(10000).default(''),published:z.number().nullable().optional(),channel:z.enum(['COMMENT','DM']),postId:z.string().max(128).optional().nullable(),postTitle:z.string().max(500).optional().nullable(),commentId:z.string().max(128).optional().nullable(),type:z.enum(['TEXT','UNSUPPORTED']).default('TEXT')}).strip();
export type InboxItem=z.infer<typeof messageSchema>;
export function eventTime(value:number|null|undefined,now:number){if(!value||!Number.isSafeInteger(value))return null;const ms=value<100000000000?value*1000:value;return ms>=946684800000&&ms<=now+5000?new Date(ms):null}
export type ReceiverRow={accountId:string;generation:string;ownerId:string;state:string;commentMode:string;dmMode:string;baselineAt:Date;updatedAt:Date;lastEventAt:Date|null;expiresAt:Date|null;leaseToken:string|null;stopRequested:boolean;coverage:string;reason:string|null};
@Injectable()
export class InboxStore {
 readonly changed=new Subject<void>();
 constructor(@Inject(Db)readonly db:Db){}
 async accounts(actor:Actor){requireAdmin(actor);return this.db.platformAccount.findMany({where:{platform:'XHS',archivedAt:null,isDemo:false},select:{id:true,loginNickname:true,status:true}})}
 async receivers(actor:Actor){requireAdmin(actor);return this.db.$queryRaw<ReceiverRow[]>`SELECT "accountId","state","commentMode","dmMode","updatedAt","lastEventAt","expiresAt","coverage","reason" FROM "InboxReceiver" ORDER BY "updatedAt" DESC`}
 async get(accountId:string){return(await this.db.$queryRaw<ReceiverRow[]>`SELECT * FROM "InboxReceiver" WHERE "accountId"=${accountId}`)[0]}
 async create(actor:Actor,accountId:string,generation:string){
  requireAdmin(actor);await this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(31174038)`;
   const active=await tx.$queryRaw<{n:number}[]>`SELECT count(*)::int n FROM "InboxReceiver" WHERE "state" IN ('CONNECTING','SYNCING','LISTENING','RECONNECTING','YIELDING') AND "updatedAt">now()-interval '45 seconds'`;
   if(active[0].n)throw new ConflictException('已有接收窗口，请先停止');
   await tx.$executeRaw`INSERT INTO "InboxReceiver" ("accountId","ownerId","generation","state","expiresAt") VALUES (${accountId},${actor.id},${generation},'CONNECTING',now()+interval '15 minutes') ON CONFLICT ("accountId") DO UPDATE SET "ownerId"=excluded."ownerId","generation"=excluded."generation","state"='CONNECTING',"commentMode"='UNCONFIRMED',"dmMode"='UNCONFIRMED',"reason"=NULL,"stopRequested"=false,"leaseToken"=NULL,"expiresAt"=excluded."expiresAt","updatedAt"=now()`;
  await tx.auditLog.create({data:{actorId:actor.id,entityId:accountId,action:'INBOX_RECEIVE_STARTED',metadata:{generation,consent:'receive-inbox-may-mark-read-v1',maxSubmissions:0,minutes:15}}});
  });this.changed.next();
 }
 async status(accountId:string,generation:string,patch:{state?:string;commentMode?:string;dmMode?:string;reason?:string|null;coverage?:string;leaseToken?:string|null}){
  await this.db.$executeRaw`UPDATE "InboxReceiver" SET "state"=COALESCE(${patch.state??null},"state"),"commentMode"=COALESCE(${patch.commentMode??null},"commentMode"),"dmMode"=COALESCE(${patch.dmMode??null},"dmMode"),"coverage"=COALESCE(${patch.coverage??null},"coverage"),"reason"=${patch.reason??null},"leaseToken"=${patch.leaseToken??null},"updatedAt"=now() WHERE "accountId"=${accountId} AND "generation"=${generation}`;this.changed.next();
 }
 async ingest(accountId:string,generation:string,expectedSender:string,items:InboxItem[],source:'PUSH'|'RECONCILIATION'){
  if(items.length>500)throw Error('INBOX_BOUND');const rows=items.map(x=>messageSchema.parse(x));let added=0;
  await this.db.$transaction(async tx=>{
   const s=(await tx.$queryRaw<ReceiverRow[]>`SELECT * FROM "InboxReceiver" WHERE "accountId"=${accountId} AND "generation"=${generation} FOR UPDATE`)[0];if(!s||s.stopRequested)throw Error('STALE_RECEIVER');
   for(const r of rows){if(r.sender===expectedSender)continue;const published=eventTime(r.published,Date.now()),fresh=!!published&&published>s.baselineAt;
    added+=await tx.$executeRaw`INSERT INTO "InboxMessage" ("id","accountId","channel","platformId","senderId","senderName","body","postId","postTitle","commentId","publishedAt","isNew","source","contentType") VALUES (${randomUUID()},${accountId},${r.channel},${r.id},${r.sender},${r.nickname},${r.body},${r.postId??null},${r.postTitle??null},${r.commentId??null},${published},${fresh},${source},${r.type}) ON CONFLICT ("accountId","channel","platformId") DO UPDATE SET "publishedAt"=excluded."publishedAt","isNew"=excluded."isNew","source"=excluded."source","senderName"=CASE WHEN "InboxMessage"."senderName"='' THEN excluded."senderName" ELSE "InboxMessage"."senderName" END WHERE excluded."source"='PUSH' AND "InboxMessage"."publishedAt" IS NULL AND excluded."publishedAt" IS NOT NULL AND "InboxMessage"."senderId"=excluded."senderId"`;
   }
   if(added)await tx.$executeRaw`UPDATE "InboxReceiver" SET "lastEventAt"=now() WHERE "accountId"=${accountId} AND "generation"=${generation}`;
  });if(added)this.changed.next();return added;
 }
 async list(actor:Actor,input:unknown){requireAdmin(actor);const q=z.object({page:z.coerce.number().int().min(1).max(100000).default(1),channel:z.enum(['COMMENT','DM']).optional(),accountId:z.string().max(100).optional(),unread:z.enum(['1']).optional()}).strict().safeParse(input);if(!q.success)throw new BadRequestException('筛选参数无效');
  const {page,channel,accountId,unread}=q.data;const where=Prisma.sql`WHERE ${channel?Prisma.sql`m."channel"=${channel}`:Prisma.sql`true`} AND ${accountId?Prisma.sql`m."accountId"=${accountId}`:Prisma.sql`true`} AND ${unread?Prisma.sql`m."isNew" AND r."messageId" IS NULL`:Prisma.sql`true`}`;
  const joins=Prisma.sql`FROM "InboxMessage" m JOIN "PlatformAccount" a ON a.id=m."accountId" LEFT JOIN "InboxRead" r ON r."messageId"=m.id AND r."userId"=${actor.id}`;
  const [counts,items]=await this.db.$transaction([this.db.$queryRaw<{n:number}[]>(Prisma.sql`SELECT count(*)::int n ${joins} ${where}`),this.db.$queryRaw(Prisma.sql`SELECT m.*,a."loginNickname" "accountName",(m."isNew" AND r."messageId" IS NULL) "unread" ${joins} ${where} ORDER BY m."receivedAt" DESC,m.id DESC LIMIT 30 OFFSET ${(page-1)*30}`)]);return{items,total:counts[0].n,page,pageSize:30};
 }
 async unread(actor:Actor){requireAdmin(actor);const r=await this.db.$queryRaw<{count:number}[]>`SELECT count(*)::int count FROM "InboxMessage" m LEFT JOIN "InboxRead" r ON r."messageId"=m.id AND r."userId"=${actor.id} WHERE m."isNew" AND r."messageId" IS NULL`;return r[0]}
 async markRead(actor:Actor,id:string){requireAdmin(actor);await this.db.$executeRaw`INSERT INTO "InboxRead" ("messageId","userId") SELECT id,${actor.id} FROM "InboxMessage" WHERE id=${id} ON CONFLICT DO NOTHING`;this.changed.next();return{ok:true}}
}
