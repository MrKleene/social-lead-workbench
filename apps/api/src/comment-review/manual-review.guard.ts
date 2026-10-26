import {semanticHash} from '../collection/capture-archive';
import {ConflictException} from '@nestjs/common';
import type {SemanticOutbound} from '@crm/contracts';
import type {ReviewDb} from './review-policy.service';
export type ManualItem={captureId:string;reviewId:string;state:'PENDING'|'SUCCESS'|'FAILED'|'SKIPPED'};
export async function assertManualReview(db:ReviewDb,id:string,modelVersion:number,reviewIds:string[],payload?:SemanticOutbound){
 const job=await db.manualReviewJob.findUnique({where:{id},include:{policy:true}});
 const actor=job&&await db.user.findUnique({where:{id:job.actorId},select:{role:true}});
 if(!job||job.status!=='PROCESSING'||job.policy.revision!==job.policyRevision||job.modelVersion!==modelVersion||actor?.role!=='ADMIN'||reviewIds.some(id=>!job.batchIds.includes(id)))throw new ConflictException('整帖任务已取消或目标、模型、权限已变化；未开始的调用已阻止');
 if(payload){const stored=job.preview as unknown as SemanticOutbound;const expected={...stored,items:reviewIds.map((id,i)=>({...stored.items.find(item=>item.id===id),id:'item'+(i+1)}))};if(semanticHash(expected)!==semanticHash(payload))throw new ConflictException('脱敏文本已变化，请重新确认');}
}
