import {Prisma} from '@prisma/client';
import {captureDisplay,safePostCoverUrl,reviewResultFilterSchema,type CaptureDisplay} from '@crm/contracts';
import type {Db} from '../common/db';
import {z} from 'zod';
type Filters=z.infer<typeof reviewResultFilterSchema>;
/** Read-only projection. Publication time is never inferred from ingestion/review dates. */
export function reviewResultsSql(policyId:string|undefined,f:Filters){
 const clauses=[policyId?Prisma.sql`r."policyId"=${policyId}`:Prisma.sql`r."policyId" IS NULL`];
 if(f.runId)clauses.push(Prisma.sql`r."runId"=${f.runId}`);
 if(f.policyRevision)clauses.push(Prisma.sql`r."policyRevision"=${f.policyRevision}`);
 if(f.postId)clauses.push(Prisma.sql`(c."postId"=${f.postId} OR EXISTS(SELECT 1 FROM "CapturedComment" sc WHERE sc."postId"=${f.postId} AND sc."contentHash"=r."sourceContentHash"))`);
 if(f.search)clauses.push(Prisma.sql`strpos(r.snapshot->>'comment',${f.search})>0`);
 if(f.minScore!==undefined)clauses.push(Prisma.sql`r.score>=${f.minScore}`);
 if(f.maxScore!==undefined)clauses.push(Prisma.sql`r.score<=${f.maxScore}`);
 if(f.state)clauses.push(Prisma.sql`r.state=${f.state}`);
 if(f.status)clauses.push(Prisma.sql`r."reviewStatus"=${f.status}`);
 const raw=Prisma.sql`COALESCE(NULLIF(r.snapshot->>'publishedAt',''),c.snapshot->>'publishedAt')`;
 // Stored display timestamps are normalized UTC ISO strings. Safe input validation
 // precedes casting so a malformed legacy value cannot break the whole list.
 const date=Prisma.sql`CASE WHEN ${raw} ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{3})?Z$' AND pg_input_is_valid(${raw},'timestamp with time zone') THEN CASE WHEN (${raw})::timestamptz <= now()+interval '1 day' THEN (${raw})::timestamptz END END`;
 const range=[];
 if(f.publishedFrom)range.push(Prisma.sql`"publishedAt">=${f.publishedFrom}::timestamptz`);
 if(f.publishedTo)range.push(Prisma.sql`"publishedAt"<${f.publishedTo}::timestamptz`);
 if(f.publication)range.push(f.publication==='unknown'?Prisma.sql`"publishedAt" IS NULL`:Prisma.sql`"publishedAt" IS NOT NULL`);
 return Prisma.sql`WITH source AS (SELECT r.id,r.score,r."createdAt",${date} AS "publishedAt" FROM "SemanticReview" r LEFT JOIN "CapturedComment" c ON c.id=r."captureId" AND c."configId"=r."configId" WHERE ${Prisma.join(clauses,' AND ')}), filtered AS(SELECT * FROM source ${range.length?Prisma.sql`WHERE ${Prisma.join(range,' AND ')}`:Prisma.empty})`;
}
export async function readReviewResults(db:Db|Prisma.TransactionClient,policyId:string|undefined,offset:number,f:Filters){
 const base=reviewResultsSql(policyId,f);
 const order=f.sort==='comment-newest'?Prisma.sql`"publishedAt" DESC NULLS LAST,id ASC`:f.sort==='comment-oldest'?Prisma.sql`"publishedAt" ASC NULLS LAST,id ASC`:f.sort==='review-oldest'?Prisma.sql`"createdAt" ASC,id ASC`:f.sort==='newest'?Prisma.sql`"createdAt" DESC,id ASC`:f.sort==='score-asc'?Prisma.sql`score ASC NULLS LAST,"createdAt" DESC,id ASC`:Prisma.sql`score DESC NULLS LAST,"createdAt" DESC,id ASC`;
 const [page,count]=await Promise.all([db.$queryRaw<{id:string;publishedAt:Date|null}[]>(Prisma.sql`${base} SELECT id,"publishedAt" FROM filtered ORDER BY ${order} OFFSET ${offset} LIMIT 20`),db.$queryRaw<{total:bigint}[]>(Prisma.sql`${base} SELECT count(*) AS total FROM filtered`)]);
 const rows=await db.semanticReview.findMany({where:{id:{in:page.map(r=>r.id)}},include:{capture:{select:{configId:true,postId:true,snapshot:true,post:{select:{platformPostId:true,snapshot:true}}}}}});
 const byId=new Map(rows.map(r=>[r.id,r]));
 const items=page.flatMap(p=>{const r=byId.get(p.id);if(!r)return [];const {capture,...review}=r;const own=captureDisplay(r.snapshot as CaptureDisplay),saved=capture?.configId===r.configId?capture:null,display={...captureDisplay((saved?.snapshot||{}) as CaptureDisplay),...own};
 return [{...review,source:{...display,publishedAt:p.publishedAt?.toISOString(),...(saved?{postId:saved.postId,configId:saved.configId,platformPostId:saved.post.platformPostId,coverUrl:safePostCoverUrl((saved.post.snapshot as {coverUrl?:unknown}).coverUrl)}:{})}}];});
 const total=Number(count[0]?.total||0);return {items,total,hasMore:offset+items.length<total};
}
