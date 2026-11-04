import {channelPlanSchema,type ChannelPlan} from '@crm/contracts';
import type {Prisma} from '@prisma/client';
/** Empty plans are legacy: never invent a second channel/content from its checkbox. */
export function rulePlans(r:{channel:string;content:string;channels?:string[];templateId?:string|null;templateVersion?:number|null;channelPlans?:unknown}):ChannelPlan[]{
 if(Array.isArray(r.channelPlans)&&r.channelPlans.length){const parsed=channelPlanSchema.array().safeParse(r.channelPlans);return parsed.success?parsed.data.filter(p=>(r.channels??[r.channel]).includes(p.channel)):[];}
 if(r.channel!=='COMMENT'&&r.channel!=='DM')return [];
 return [{channel:r.channel,content:r.content,templateId:r.templateId??null,templateVersion:r.templateVersion??null}];
}
export function jobMatchesPlan(r:Parameters<typeof rulePlans>[0],j:{channel:string;content:string},manual=false){return rulePlans(r).some(p=>p.channel===j.channel&&(manual||p.content===j.content));}
/** Unknown/in-flight/legacy attempts block every channel; terminal known attempts
 * deduplicate their own channel across accounts. This never grants a retry. */
export function attemptBlocksChannel(a:{channel?:string|null;outcome:string},channel:string){return a.outcome!=='CANCELLED'&&(!a.channel||a.channel===channel||['UNKNOWN','RESERVED','ATTEMPTED'].includes(a.outcome));}
/** A newly enabled paired rule only applies to new runs frozen under that exact
 * authorization. No migration/backfill can manufacture a missing historical DM. */
export async function pairedRunBound(db:Prisma.TransactionClient,reviewId:string,r:{id:string;version:number;authorizedHash:string|null;channel:string;content:string;channelPlans?:unknown}){
 if(rulePlans(r).length<2)return true;
 const review=await db.semanticReview.findUnique({where:{id:reviewId},select:{capture:{select:{lastRunId:true}}}});
 if(!review?.capture)return false;
 const run=await db.collectionRun.findUnique({where:{id:review.capture.lastRunId},select:{snapshot:true}});
 const frozen=(run?.snapshot as {strictStages?:{contactRules?:{id:string;version:number;hash:string|null}[]}}|null)?.strictStages?.contactRules;
 return !!frozen?.some(f=>f.id===r.id&&f.version===r.version&&f.hash===r.authorizedHash&&!!f.hash);
}
