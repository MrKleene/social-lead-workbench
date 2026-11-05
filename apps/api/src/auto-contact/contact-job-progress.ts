import type {Db} from '../common/db';
import {projectLive,type ProgressRow} from './journey-live-query';
/** Only IDs from the authenticated, archive-filtered result page may be supplied. */
export async function contactJobProgress(db:Db,ids:string[],mode:string){
 if(!ids.length)return new Map();
 const rows=await db.$queryRaw<ProgressRow[]>`
 SELECT DISTINCT ON (j.id) j.id AS "executionId",'contact' AS stage,
 a.metadata->>'phase' AS phase,a.metadata->>'session' AS session,a."createdAt" AS at,j.status::text AS status
 FROM "AutoContactJob" j JOIN "SemanticReview" s ON s.id=j."reviewId"
 JOIN "AuditLog" a ON a."entityId"=s."runId" AND a.action='JOURNEY_PROGRESS'
 AND a.metadata->>'v'='1' AND a.metadata->>'stage'='contact' AND a.metadata->>'executionId'=j.id
 WHERE j.id=ANY(${ids}::text[]) AND j.mode=${mode}
 ORDER BY j.id,a."createdAt" DESC,a.id DESC`;
 const now=new Date();return new Map(rows.map(row=>[row.executionId,projectLive([row],now).current[0]]));
}
