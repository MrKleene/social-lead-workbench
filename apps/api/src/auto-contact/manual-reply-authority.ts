import {activeAcceptance} from './normal-acceptance';
import {z} from 'zod';
import type {Prisma} from '@prisma/client';
import {eligibilityHash,quotaBucket} from './contact-policy';
export const pendingJobScope=z.object({channel:z.enum(['COMMENT','DM']).optional(),id:z.string(),version:z.string(),ruleId:z.string(),ruleVersion:z.number(),reviewHash:z.string(),content:z.string(),recipientId:z.string(),postId:z.string(),commentId:z.string(),availabilityVersion:z.number()}).strict();
export const manualReplyScope=z.object({day:z.string(),jobs:z.array(pendingJobScope).min(1).max(20)}).strict();
export type ManualAuthority={actorId:string;accountId:string;accountVersion:number;authorizedAt:Date;requestId:string};
/** Called again at reservation, dispatch and final RPC. Request fields never confer authority. */
export async function manualAuthority(tx:Prisma.TransactionClient,j:{channel?:string;id:string;manualRequestId?:string|null;status:string;mode:string;ruleId:string;ruleVersion:number;reviewId:string;eligibilityHash:string;content:string;recipientId:string;postId:string;commentId:string;availabilityVersion:number},now:Date):Promise<ManualAuthority|null>{
 if(await activeAcceptance(tx))return null;
 if(!j.manualRequestId||!['MANUAL_READY','RESERVED','ATTEMPTED'].includes(j.status))return null;
 const r=await tx.manualReplyRequest.findUnique({where:{id:j.manualRequestId}}),scope=manualReplyScope.safeParse(r?.scope);
 if(!r?.confirmedAt||r.expiresAt<=now||!scope.success||scope.data.day!==quotaBucket(j.mode,now))return null;
 const s=scope.data.jobs.find(s=>s.id===j.id);if(!s||(s.channel&&s.channel!==j.channel)||s.ruleId!==j.ruleId||s.content!==j.content||s.recipientId!==j.recipientId||s.postId!==j.postId||s.commentId!==j.commentId||s.availabilityVersion!==j.availabilityVersion)return null;
 const [rule,review,account,actor]=await Promise.all([tx.autoContactRule.findUnique({where:{id:j.ruleId}}),tx.semanticReview.findUnique({where:{id:j.reviewId}}),tx.platformAccount.findUnique({where:{id:r.accountId},select:{version:true}}),tx.user.findUnique({where:{id:r.actorId},select:{active:true,role:true}})]);
 if(!rule||rule.version!==s.ruleVersion||!rule.accountIds.includes(r.accountId)||!review||eligibilityHash(review)!==s.reviewHash||s.reviewHash!==j.eligibilityHash||account?.version!==r.accountVersion||!actor?.active||actor.role!=='ADMIN')return null;
 return {actorId:r.actorId,accountId:r.accountId,accountVersion:r.accountVersion,authorizedAt:r.confirmedAt,requestId:r.id};
}
