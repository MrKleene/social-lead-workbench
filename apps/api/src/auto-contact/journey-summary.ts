import type {Db} from '../common/db';
import {requireAdmin,type Actor} from '../auth/security';
import type {JourneySummary} from '@crm/contracts';
/** Read-only aggregates over the entire run, never a paginated sample or global recent list. */
export async function journeySummary(db:Db,actor:Actor,mode:string,runId:string,policyId?:string,policyRevision?:number):Promise<JourneySummary>{
 requireAdmin(actor);
 const reviewWhere={runId,...(policyId?{policyId}:{}),...(policyRevision?{policyRevision}:{})};
 const [reviews,reviewJobs,contacts,matches]=await Promise.all([
  db.semanticReview.groupBy({by:['state'],where:reviewWhere,_count:{_all:true}}),
  db.autoReviewJob.groupBy({by:['status'],where:{runId,...(policyId?{policyId}:{})},_count:{_all:true}}),
  db.autoContactJob.groupBy({by:['status'],where:{mode,review:{runId}},_count:{_all:true}}),
  db.semanticReview.count({where:{...reviewWhere,state:'EVALUATED',result:{path:['decision'],equals:'MATCH'}}}),
 ]);
 return {reviews:Object.fromEntries(reviews.map(r=>[r.state,r._count._all])),reviewJobs:Object.fromEntries(reviewJobs.map(r=>[r.status,r._count._all])),contacts:Object.fromEntries(contacts.map(r=>[r.status,r._count._all])),matches};
}
