import {ConflictException,NotFoundException} from '@nestjs/common';
import type {Platform,PostAvailability} from '@prisma/client';
import {availabilityInput,unknownPostAvailability} from '@crm/contracts';
import type {Db} from '../common/db';
import {requireAdmin,type Actor} from '../auth/security';
import {contactLock,contactNow,cancelReserved,type ContactDb} from '../auto-contact/contact-settings.service';
export const postUnavailable=(a:{state:string}|null|undefined)=>!!a&&a.state!=='NORMAL';
export function classifyPostReason(reason:string){
 if(reason==='EXACT_VISIBLE')return 'NORMAL';
 if(reason==='MANUAL_DELETED'||reason==='PLATFORM_DELETED')return 'CONFIRMED_DELETED';
 if(reason==='NO_RESULT'||reason==='NOT_CHECKED')return 'UNKNOWN';
 return 'UNAVAILABLE';
}
export async function postAvailability(db:Pick<ContactDb,'postAvailability'>,platform:Platform,postId:string){return db.postAvailability.findUnique({where:{platform_postId:{platform,postId}}});}
export function postSendBlock(a:PostAvailability|null,authorizedAt?:Date|null,reviewedAt?:Date,version?:number){
 if(a&&postUnavailable(a))return `POST_${a.state}:${a.reason}`;
 if(version!==undefined&&version!==(a?.version??0))return 'POST_EVIDENCE_CHANGED';
 if(a?.invalidatedAt&&(!authorizedAt||authorizedAt<=a.invalidatedAt||!reviewedAt||reviewedAt<=a.invalidatedAt))return 'POST_RESTORED_REAUTHORIZE_AND_REVIEW';
 return null;
}
export async function postAvailabilityMap(db:Pick<ContactDb,'postAvailability'>,platform:Platform,ids:string[]){const rows=ids.length?await db.postAvailability.findMany({where:{platform,postId:{in:ids}}}):[];return new Map(rows.map(r=>[r.postId,r]));}
// Caller holds the same transaction lock as reservation and dispatch. No platform IO here.
export async function recordPostAvailability(tx:ContactDb,actor:Actor,platform:Platform,postId:string,input:ReturnType<typeof availabilityInput.parse>){
 const old=await postAvailability(tx,platform,postId);
 if((old?.version??0)!==input.version)throw new ConflictException('帖子状态已变化，请刷新后重新确认');
 const state=classifyPostReason(input.reason),now=await contactNow(tx),version=(old?.version??0)+1;
 const evidence={note:input.evidence,actorId:actor.id,explicitDeletion:input.reason==='MANUAL_DELETED'&&input.confirmDeleted};
 const data={state,reason:input.reason,version,checkedAt:now,source:'MANUAL',evidence,invalidatedAt:state!=='NORMAL'||(old&&old.state!=='NORMAL')?now:old?.invalidatedAt??null};
 const row=await tx.postAvailability.upsert({where:{platform_postId:{platform,postId}},create:{platform,postId,...data},update:data});
 await tx.postAvailabilityEvent.create({data:{platform,postId,state,reason:input.reason,version,checkedAt:now,source:'MANUAL',evidence,actorId:actor.id}});
 // Old work is terminally blocked, even on restoration. New authorization never resurrects it.
 for(const j of await tx.autoContactJob.findMany({where:{platform,postId,status:{in:['QUEUED','WAITING_QUOTA','WAITING_ACCOUNT','RESERVED']}}})){
  const reason=state==='NORMAL'?'POST_EVIDENCE_CHANGED：请重新核验并授权当前范围':`POST_${state}:${input.reason}`;
  await cancelReserved(tx,j,reason);
  await tx.autoContactJob.update({where:{id:j.id},data:{status:'BLOCKED_POST',reason}});
 }
 await tx.auditLog.create({data:{actorId:actor.id,entityId:postId,action:'POST_AVAILABILITY_RECORDED',metadata:{platform,version,state,reason:input.reason}}});
 return row;
}
export async function readAvailability(db:Db,actor:Actor,id:string){
 requireAdmin(actor);const p=await db.capturedPost.findUnique({where:{id},include:{config:{select:{platform:true}}}});if(!p)throw new NotFoundException();
 const row=await postAvailability(db,p.config.platform,p.platformPostId);
 const events=await db.postAvailabilityEvent.findMany({where:{platform:p.config.platform,postId:p.platformPostId},orderBy:{version:'desc'},take:20});
 return {current:row??unknownPostAvailability,events,recheck:{available:false,reason:'当前平台适配器不能独立提供可靠的精确帖子可访问证据；待检查。可查看原文后人工记录来源，不会自动请求平台。'}};
}
export async function markAvailability(db:Db,actor:Actor,id:string,raw:unknown){
 requireAdmin(actor);const input=availabilityInput.parse(raw);
 return db.$transaction(async tx=>{await contactLock(tx);const p=await tx.capturedPost.findUnique({where:{id},include:{config:{select:{platform:true}}}});if(!p)throw new NotFoundException();return recordPostAvailability(tx,actor,p.config.platform,p.platformPostId,input);});
}
