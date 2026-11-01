import {readPostEvidence} from './post-read-evidence';
import {postAvailabilityMap} from './post-availability';
import {postStates,unknownPostAvailability} from '@crm/contracts';
import type {Platform} from '@prisma/client';
import {ConflictException} from '@nestjs/common';
import {z} from 'zod';
import type {Db} from '../common/db';
import {publicPostSnapshot,savedPostReference} from './post-reference';
export const savedPostPageInput=z.object({offset:z.coerce.number().int().min(0).max(100000).default(0),q:z.string().trim().max(200).default(''),runId:z.string().max(200).default(''),availability:z.enum(['',...postStates]).default('')}).strict();
export async function readSavedPostPage(db:Db,configId:string,platform:string,input:z.input<typeof savedPostPageInput>){
 const {offset,q,runId,availability}=savedPostPageInput.parse(input),pageSize=20;
 // The unit being ordered/paged is a unique platform post, never a comment or a snapshot version.
 const [index]=await db.$queryRaw<{total:number;posts:{id:string;platformPostId:string}[]}[]>`
 WITH scoped AS (
  SELECT p.id,p."platformPostId",p."lastSeenAt",ROW_NUMBER() OVER(PARTITION BY p."platformPostId" ORDER BY p."lastSeenAt" DESC,p.id DESC) AS version
  FROM "CapturedPost" p WHERE p."configId"=${configId}
   AND (${availability}='' OR coalesce((SELECT a.state FROM "PostAvailability" a WHERE a.platform::text=${platform} AND a."postId"=p."platformPostId"),'UNKNOWN')=${availability})
   AND (${runId}='' OR EXISTS(SELECT 1 FROM "CollectionRun" r WHERE r.id=${runId} AND r."configId"=${configId} AND r.metrics->'coverage'->'posts' @> jsonb_build_array(jsonb_build_object('postRef',p."platformPostId"))) OR p."runId"=${runId} OR p."lastRunId"=${runId} OR EXISTS(SELECT 1 FROM "CapturedComment" c WHERE c."postId"=p.id AND c."configId"=${configId} AND (c."runId"=${runId} OR c."lastRunId"=${runId})))
   AND (${q}='' OR strpos(lower(p."platformPostId" || ' ' || coalesce(p.snapshot->>'title','') || ' ' || coalesce(p.snapshot->>'body','') || ' ' || coalesce(p.snapshot->>'authorNickname','')),lower(${q}))>0
    OR EXISTS(SELECT 1 FROM "CapturedComment" c WHERE c."postId"=p.id AND c."configId"=${configId} AND strpos(lower(coalesce(c.snapshot->>'comment','') || ' ' || coalesce(c.snapshot->>'authorNickname','')),lower(${q}))>0))
 ), unique_posts AS (SELECT id,"platformPostId","lastSeenAt" FROM scoped WHERE version=1)
 SELECT (SELECT count(*)::int FROM unique_posts) AS total,
 coalesce((SELECT jsonb_agg(page ORDER BY page."lastSeenAt" DESC,page.id DESC) FROM (SELECT id,"platformPostId","lastSeenAt" FROM unique_posts ORDER BY "lastSeenAt" DESC,id DESC LIMIT ${pageSize} OFFSET ${offset}) page),'[]'::jsonb) AS posts`;
 const chosen=index?.posts||[],ids=chosen.map(p=>p.id),platformIds=chosen.map(p=>p.platformPostId);
 const [stored,counts]=ids.length?await Promise.all([
  db.capturedPost.findMany({where:{configId,id:{in:ids}}}),
  db.$queryRaw<{platformPostId:string;count:bigint}[]>`SELECT p."platformPostId",count(DISTINCT c."platformCommentId") AS count FROM "CapturedPost" p LEFT JOIN "CapturedComment" c ON c."postId"=p.id AND c."configId"=p."configId" WHERE p."configId"=${configId} AND p."platformPostId"=ANY(${platformIds}::text[]) GROUP BY p."platformPostId"`
 ]):[[],[]];
 if(stored.length!==ids.length)throw new ConflictException('帖子记录发生变化，请刷新列表');
 const availabilityRows=await postAvailabilityMap(db,platform as Platform,platformIds);
 const byId=new Map(stored.map(p=>[p.id,p])),saved=new Map(counts.map(p=>[p.platformPostId,Number(p.count)]));
 return {posts:await Promise.all(chosen.map(async({id})=>{const p=byId.get(id)!;return {...p,readEvidence:await readPostEvidence(db,p,runId),availability:availabilityRows.get(p.platformPostId)??unknownPostAvailability,savedComments:saved.get(p.platformPostId)??0,snapshot:publicPostSnapshot(p.snapshot),sourceAvailable:platform==='XHS'&&!!savedPostReference((p.snapshot as Record<string,unknown>).sourceReference,p.platformPostId)};})),postTotal:index?.total??0,offset,postPageSize:pageSize,hasMore:offset+chosen.length<(index?.total??0)};
}
