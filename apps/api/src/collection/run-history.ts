import {historyDisplay} from '../common/db';
import {NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {z} from 'zod';
import {requireAdmin,type Actor} from '../auth/security';
import type {Db} from '../common/db';
import {withCoveragePostLabels} from './run-coverage-labels';
export const runHistoryInput=z.object({runId:z.string().min(1).max(200).optional(),before:z.string().min(1).max(200).optional()}).strict();
const projection={id:true,configId:true,scenario:true,status:true,reason:true,requests:true,observed:true,matched:true,added:true,notices:true,createdAt:true,finishedAt:true,capturedPosts:true,capturedCommentsCount:true,readPlan:true,metrics:true,snapshot:true} as const;
/** Metadata only. Keyset history and current execution are independent of the selected record. */
export async function runHistory(db:Db,actor:Actor,configId:string,input:z.infer<typeof runHistoryInput>){
 requireAdmin(actor);const source=db;db=historyDisplay(db);
 if(!await db.collectionConfig.findUnique({where:{id:configId},select:{id:true}}))throw new NotFoundException('关键词组不存在');
 const cursor=input.before?await db.collectionRun.findFirst({where:{id:input.before,configId},select:{id:true,createdAt:true}}):null;
 if(input.before&&!cursor)throw new NotFoundException('历史分页位置已失效');
 const [page,latest,selected,active]=await Promise.all([
  db.collectionRun.findMany({where:{configId,...(cursor?{OR:[{createdAt:{lt:cursor.createdAt}},{createdAt:cursor.createdAt,id:{lt:cursor.id}}]}:{})},orderBy:[{createdAt:'desc'},{id:'desc'}],take:21,select:projection}),
  db.collectionRun.findFirst({where:{configId},orderBy:[{createdAt:'desc'},{id:'desc'}],select:projection}),
  input.runId?db.collectionRun.findFirst({where:{configId,id:input.runId},select:projection}):null,
  db.$queryRaw<{id:string;phase:string}[]>(Prisma.sql`
   SELECT r.id, CASE WHEN r.status IN ('QUEUED','RUNNING') THEN 'collect'
    WHEN EXISTS(SELECT 1 FROM "AutoReviewJob" a WHERE a."runId"=r.id AND a.status IN ('PENDING','PROCESSING'))
      OR EXISTS(SELECT 1 FROM "SemanticReview" s WHERE s."runId"=r.id AND s.state='PROCESSING') THEN 'review'
    ELSE 'contact' END AS phase
   FROM "CollectionRun" r WHERE r."configId"=${configId} AND (
    r.status IN ('QUEUED','RUNNING') OR EXISTS(SELECT 1 FROM "AutoReviewJob" a WHERE a."runId"=r.id AND a.status IN ('PENDING','PROCESSING'))
    OR EXISTS(SELECT 1 FROM "SemanticReview" s WHERE s."runId"=r.id AND s.state='PROCESSING')
    OR EXISTS(SELECT 1 FROM "AutoContactJob" j JOIN "SemanticReview" s ON s.id=j."reviewId" WHERE s."runId"=r.id AND j.status IN ('MANUAL_READY','QUEUED','WAITING_QUOTA','WAITING_ACCOUNT','RESERVED','ATTEMPTED')))
   ORDER BY r."createdAt" DESC,r.id DESC LIMIT 1`)
 ]);
 // Only a same-config record with an active archive marker may be auto-cleared.
 // Unknown IDs and records outside this configuration retain the missing result.
 const archived=input.runId&&!selected?await source.$queryRaw<{id:string}[]>(Prisma.sql`
  SELECT r.id FROM public."CollectionRun" r
  WHERE r.id=${input.runId} AND r."configId"=${configId}
   AND EXISTS (SELECT 1 FROM public."HistoryArchiveItem" i
    JOIN public."HistoryArchiveBatch" b ON b.id=i."batchId"
    WHERE i.entity='CollectionRun' AND i."recordId"=r.id AND b."restoredAt" IS NULL)
  LIMIT 1`):[];
 const current=active[0]?await db.collectionRun.findUnique({where:{id:active[0].id},select:projection}):latest;
 const all=[...new Map([...page.slice(0,20),...(selected?[selected]:[]),...(current?[current]:[])].map(r=>[r.id,r])).values()];
 const labeled=(await withCoveragePostLabels(db,[{id:configId,runs:all}]))[0].runs;
 const safe=(id:string)=>{const r=labeled.find(r=>r.id===id);if(!r)return null;const s=r.snapshot as Record<string,unknown>;return {...r,snapshot:{name:typeof s.name==='string'?s.name:undefined,keywords:Array.isArray(s.keywords)?s.keywords:[],mode:s.mode}};};
 return {items:page.slice(0,20).map(r=>safe(r.id)),nextCursor:page.length>20?page[19].id:null,current:current?safe(current.id):null,activePhase:active[0]?.phase??null,selected:input.runId?(selected?safe(selected.id):null):null,selectedMissing:!!input.runId&&!selected,selectedArchived:archived.length>0};
}
