import {Prisma} from '@prisma/client';
/** Job tombstones survive restoring the display. */
export async function wasHistoryArchived(tx:Prisma.TransactionClient,entity:string,id:string){
 const rows=await tx.$queryRaw<{yes:boolean}[]>`SELECT EXISTS(SELECT 1 FROM public."HistoryArchiveItem" WHERE entity=${entity} AND "recordId"=${id}) yes`;return rows?.[0]?.yes===true;
}
/** A genuinely new collection may reuse a saved score; restoring an old run cannot.
 * Existing identity/quota/dedup checks still apply, and cancelled jobs stay cancelled. */
const blockedReview=Prisma.sql`FROM public."HistoryArchiveItem" i JOIN public."HistoryArchiveBatch" b ON b.id=i."batchId"
 WHERE i.entity='SemanticReview' AND NOT EXISTS (
  SELECT 1 FROM public."SemanticReview" s JOIN public."CapturedComment" c ON c.id=s."captureId"
  JOIN public."CollectionRun" r ON r.id=c."lastRunId"
  WHERE s.id=i."recordId" AND r."createdAt">b."createdAt"
  AND NOT EXISTS (SELECT 1 FROM public."HistoryArchiveItem" j WHERE j.entity='CollectionRun' AND j."recordId"=r.id)
 )`;
export async function archivedReviewIds(tx:Prisma.TransactionClient){
 const rows=await tx.$queryRaw<{recordId:string}[]>(Prisma.sql`SELECT DISTINCT i."recordId" ${blockedReview}`);
 return (rows??[]).flatMap(r=>typeof r.recordId==='string'?[r.recordId]:[]);
}
export async function isReviewArchiveBlocked(tx:Prisma.TransactionClient,id:string){
 const rows=await tx.$queryRaw<{yes:boolean}[]>(Prisma.sql`SELECT EXISTS(SELECT 1 ${blockedReview} AND i."recordId"=${id}) yes`);return rows?.[0]?.yes===true;
}
