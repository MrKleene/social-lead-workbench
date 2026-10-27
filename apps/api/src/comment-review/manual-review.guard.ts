import {semanticHash} from '../collection/capture-archive';
import {ConflictException} from '@nestjs/common';
import {reviewObservationPolicy,semanticInputPolicy,wholePostRequestPolicy,type SemanticOutbound} from '@crm/contracts';
import type {ReviewDb} from './review-policy.service';
export type ManualItem={captureId:string;reviewId:string;state:'PENDING'|'SUCCESS'|'FAILED'|'SKIPPED';reviewVersion?:number;previousAttempt?:Record<string,unknown>};
export async function assertManualReview(db:ReviewDb,id:string,modelVersion:number,reviewIds:string[],payload?:SemanticOutbound){
 const job=await db.manualReviewJob.findUnique({where:{id},include:{policy:true}});
 const actor=job&&await db.user.findUnique({where:{id:job.actorId},select:{role:true}});
 if(!job||(job.preview as unknown as SemanticOutbound).observationPolicy!==reviewObservationPolicy||(job.preview as unknown as SemanticOutbound).requestPolicy!==wholePostRequestPolicy||(job.preview as unknown as SemanticOutbound).inputPolicyVersion!==semanticInputPolicy||job.status!=='PROCESSING'||job.policy.revision!==job.policyRevision||job.modelVersion!==modelVersion||actor?.role!=='ADMIN'||reviewIds.some(id=>!job.batchIds.includes(id)))throw new ConflictException('整帖任务已取消或目标、模型、权限已变化；未开始的调用已阻止');
 const expected=(job.items as unknown as ManualItem[]).filter(i=>reviewIds.includes(i.reviewId)),rows=await db.semanticReview.findMany({where:{id:{in:reviewIds}}});
 if(expected.length!==reviewIds.length||expected.some(i=>{const row=rows.find(r=>r.id===i.reviewId);return !row||row.reviewStatus!=='PENDING'||(row.version!==i.reviewVersion&&!(row.state==='PROCESSING'&&row.version===(i.reviewVersion??-2)+1));}))throw new ConflictException('待处理状态已变化，请重新预览确认');
 if(payload){const stored=job.preview as unknown as SemanticOutbound;const expected={...stored,items:reviewIds.map((id,i)=>({...stored.items.find(item=>item.id===id),id:'item'+(i+1)}))};if(semanticHash(expected)!==semanticHash(payload))throw new ConflictException('输入策略或文本已变化，请重新确认');}
}
