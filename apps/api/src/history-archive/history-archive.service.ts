import {BadRequestException,ConflictException,Inject,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {z} from 'zod';
import {Db} from '../common/db';
import {requireAdmin,type Actor} from '../auth/security';
import {contactLock} from '../auto-contact/contact-lock';
import {lockReview} from '../comment-review/review-policy.service';
import {lockSinglePost,assertNoSinglePost} from '../collection/single-post-lock';

export const archiveInput=z.object({id:z.string().uuid(),backupSha256:z.string().regex(/^[a-f0-9]{64}$/),consent:z.literal('ARCHIVE_HISTORY_KEEP_SAFETY'),expectedPending:z.number().int().min(0),expectedPendingIds:z.array(z.string().min(1).max(200)).max(10000)}).strict();
export const restoreInput=z.object({consent:z.literal('RESTORE_DISPLAY_ONLY_NO_SEND')}).strict();
export const archiveEntities=['CollectionRun','CapturedPost','CapturedComment','SemanticReview','AutoReviewJob','ManualReviewJob','AutoContactJob','ContactAttempt','MonitorPost','CommentObservation','CommentReadCheckpoint','SourcePost','SourceComment','SourceMatch','CollectionNotice'] as const;
type Batch={id:string;createdAt:Date;restoredAt:Date|null;counts:Record<string,number>};
@Injectable()
export class HistoryArchiveService {
 constructor(@Inject(Db) private db:Db){}
 async list(actor:Actor){requireAdmin(actor);return this.db.$queryRaw<Batch[]>`SELECT id,"createdAt","restoredAt",counts FROM public."HistoryArchiveBatch" ORDER BY "createdAt" DESC LIMIT 50`;}
 private async lockIdle(tx:Prisma.TransactionClient){
  await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '2000ms'");
  await lockSinglePost(tx);await lockReview(tx);await contactLock(tx);await assertNoSinglePost(tx);
  // Hold write exclusion through snapshot + cancellation. Racing work causes a refusal, not a partial clear.
  const tables=[...archiveEntities,'SemanticModelCall','DeviceExecutionLease','AccountLogin','AccountSessionReference','NormalAutomationAcceptance','ManualReplyRequest','CollectionConfig','AutoContactRule'].sort();
  await tx.$executeRawUnsafe('LOCK TABLE '+tables.map(t=>'public."'+t+'"').join(',')+' IN SHARE ROW EXCLUSIVE MODE');
  const [r]=await tx.$queryRaw<{busy:boolean}[]>`SELECT (
   EXISTS(SELECT 1 FROM "CollectionRun" WHERE status IN ('QUEUED','RUNNING')) OR
   EXISTS(SELECT 1 FROM "AutoReviewJob" WHERE status IN ('PENDING','PROCESSING')) OR
   EXISTS(SELECT 1 FROM "SemanticReview" WHERE state='PROCESSING') OR
   EXISTS(SELECT 1 FROM "ManualReviewJob" WHERE status IN ('PENDING','QUEUED','PROCESSING','RUNNING')) OR
   EXISTS(SELECT 1 FROM "SemanticModelCall" WHERE status='RESERVED') OR
   EXISTS(SELECT 1 FROM "DeviceExecutionLease" WHERE "expiresAt">now()) OR
   EXISTS(SELECT 1 FROM "AccountLogin" WHERE state IN ('STARTING','WAITING_SCAN','CHECKING') AND "expiresAt">now()) OR
   EXISTS(SELECT 1 FROM "AccountSessionReference" WHERE "checkingUntil">now()) OR
   EXISTS(SELECT 1 FROM "AutoContactJob" WHERE status IN ('QUEUED','MANUAL_READY','WAITING_QUOTA','WAITING_ACCOUNT','RESERVED','ATTEMPTED')) OR
   EXISTS(SELECT 1 FROM "ContactAttempt" WHERE outcome IN ('RESERVED','ATTEMPTED')) OR
   EXISTS(SELECT 1 FROM "AutoContactRule" WHERE enabled) OR
   EXISTS(SELECT 1 FROM "NormalAutomationAcceptance" WHERE state='ACTIVE')
  ) busy`;
  if(r.busy)throw new ConflictException('仍有运行、核验、待发送任务或自动回复已开启；未归档，请稍后再试');
 }
 async archive(actor:Actor,raw:unknown){
  requireAdmin(actor);const parsed=archiveInput.safeParse(raw);if(!parsed.success)throw new BadRequestException('归档确认或范围无效');const input=parsed.data;
  return this.db.$transaction(async tx=>{
   const user=await tx.user.findUnique({where:{id:actor.id}});if(!user?.active||user.role!=='ADMIN')throw new ConflictException('管理员权限已变化');
   await this.lockIdle(tx);
   const old=await tx.$queryRaw<Batch[]>`SELECT id,"createdAt","restoredAt",counts FROM public."HistoryArchiveBatch" WHERE id=${input.id}`;if(old[0])return old[0];
   const pending=await tx.autoContactJob.findMany({where:{status:'PENDING_ACTION'},select:{id:true,attemptId:true,updatedAt:true}});
   if(pending.length!==input.expectedPending||new Set(input.expectedPendingIds).size!==pending.length||pending.some(j=>j.attemptId||!input.expectedPendingIds.includes(j.id)))throw new ConflictException('待处理范围已变化；未归档');
   await tx.$executeRaw`INSERT INTO public."HistoryArchiveBatch" (id,"actorId","backupSha256") VALUES (${input.id},${actor.id},${input.backupSha256})`;
   const counts:Record<string,number>={};
   for(const table of archiveEntities){
    const status=['AutoContactJob','AutoReviewJob','ManualReviewJob','CollectionRun'].includes(table)?'t.status':'NULL';
    const n=await tx.$executeRawUnsafe(`INSERT INTO public."HistoryArchiveItem" ("batchId",entity,"recordId","previousStatus") SELECT $1,$2,t.id,${status} FROM public."${table}" t WHERE NOT EXISTS (SELECT 1 FROM public."HistoryArchiveItem" i JOIN public."HistoryArchiveBatch" b ON b.id=i."batchId" WHERE i.entity=$2 AND i."recordId"=t.id AND b."restoredAt" IS NULL)`,input.id,table);
    counts[table]=n;
   }
   const cancelled=await tx.autoContactJob.updateMany({where:{id:{in:pending.map(j=>j.id)},status:'PENDING_ACTION',attemptId:null},data:{status:'CANCELLED',reason:'管理员归档；恢复历史不会恢复发送',manualRequestId:null}});
   if(cancelled.count!==pending.length)throw new ConflictException('待处理状态已变化；事务已撤销');
   counts.pendingRemoved=cancelled.count;
   await tx.$executeRaw`UPDATE public."HistoryArchiveBatch" SET counts=${JSON.stringify(counts)}::jsonb WHERE id=${input.id}`;
   await tx.auditLog.create({data:{actorId:actor.id,entityId:input.id,action:'HISTORY_ARCHIVED_KEEP_SAFETY',metadata:{counts,backupSha256:input.backupSha256,restoration:'DISPLAY_ONLY'}}});
   return (await tx.$queryRaw<Batch[]>`SELECT id,"createdAt","restoredAt",counts FROM public."HistoryArchiveBatch" WHERE id=${input.id}`)[0];
  },{timeout:30000});
 }
 async restore(actor:Actor,id:string,raw:unknown){
  requireAdmin(actor);if(!restoreInput.safeParse(raw).success)throw new BadRequestException('请确认仅恢复历史显示');
  return this.db.$transaction(async tx=>{
   const user=await tx.user.findUnique({where:{id:actor.id}});if(!user?.active||user.role!=='ADMIN')throw new ConflictException('管理员权限已变化');
   await this.lockIdle(tx);
   const [batch]=await tx.$queryRaw<Batch[]>`SELECT id,"createdAt","restoredAt",counts FROM public."HistoryArchiveBatch" WHERE id=${id} FOR UPDATE`;
   if(!batch)throw new NotFoundException('归档批次不存在');if(batch.restoredAt)return batch;
   // Do not restore statuses, authorize rules, release quota, or revive pending replies.
   await tx.$executeRaw`UPDATE public."HistoryArchiveBatch" SET "restoredAt"=now(),"restoredBy"=${actor.id} WHERE id=${id} AND "restoredAt" IS NULL`;
   await tx.auditLog.create({data:{actorId:actor.id,entityId:id,action:'HISTORY_DISPLAY_RESTORED',metadata:{noExecutionRestored:true}}});
   return (await tx.$queryRaw<Batch[]>`SELECT id,"createdAt","restoredAt",counts FROM public."HistoryArchiveBatch" WHERE id=${id}`)[0];
  },{timeout:30000});
 }
}
