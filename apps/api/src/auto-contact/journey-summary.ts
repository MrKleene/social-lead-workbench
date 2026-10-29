import type {Db} from '../common/db';
import {requireAdmin,type Actor} from '../auth/security';
import type {JourneySummary} from '@crm/contracts';
/** Read-only aggregates over the entire run, never a paginated sample or global recent list. */
export async function journeySummary(db:Db,actor:Actor,mode:string,runId:string,policyId?:string,policyRevision?:number):Promise<JourneySummary>{
 requireAdmin(actor);
 const reviewWhere={runId,...(policyId?{policyId}:{}),...(policyRevision?{policyRevision}:{})};
 const [reviews,reviewJobs,contacts,matches,scopedAttempts]=await Promise.all([
  db.semanticReview.groupBy({by:['state'],where:reviewWhere,_count:{_all:true}}),
  db.autoReviewJob.groupBy({by:['status'],where:{runId,...(policyId?{policyId}:{})},_count:{_all:true}}),
  db.autoContactJob.groupBy({by:['status'],where:{mode,review:{runId}},_count:{_all:true}}),
  db.semanticReview.count({where:{...reviewWhere,state:'EVALUATED',result:{path:['decision'],equals:'MATCH'}}}),
  // Bounded runs reserve the same durable attempt ledger without a recurring
  // AutoContactJob. Bind by the original authorization, never current post data
  // or a global recent-history sample. Read final ledger outcomes, not receipts
  // copied into intermediate audit events; UNKNOWN remains unresolved.
  db.$queryRaw<{outcome:string;count:number}[]>`
   SELECT a.outcome::text AS outcome, count(DISTINCT a.id)::int AS count
   FROM "ContactAttempt" a
   JOIN "AuditLog" l ON l."entityId"=a."requestKey"
    AND l.action='SINGLE_REPLY_TEST_AUTHORIZED_RESERVED'
    AND l."actorId"=a."actorId" AND l.metadata->>'attemptId'=a.id
   JOIN "SemanticReview" r ON r.id=l.metadata->'scope'->>'reviewId'
   WHERE r."runId"=${runId} AND a.mode=${mode} AND a."jobId" IS NULL
    AND a."accountIdSnapshot"=l.metadata->'scope'->>'accountId'
    AND NOT EXISTS (SELECT 1 FROM "AutoContactJob" j WHERE j."attemptId"=a.id)
   GROUP BY a.outcome`,
 ]);
 const contactCounts=Object.fromEntries(contacts.map(r=>[r.status,r._count._all]));
 for(const row of scopedAttempts)contactCounts[row.outcome]=(contactCounts[row.outcome]||0)+row.count;
 return {reviews:Object.fromEntries(reviews.map(r=>[r.state,r._count._all])),reviewJobs:Object.fromEntries(reviewJobs.map(r=>[r.status,r._count._all])),contacts:contactCounts,matches};
}
