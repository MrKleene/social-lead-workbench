import {prepareReviewOutbound} from './review-observation';
import {semanticHash} from '../collection/capture-archive';
import {outputFailureReason,modelOutputFailure,wholePostRequestPolicy} from '@crm/contracts';
import {assertManualReview} from './manual-review.guard';
import {assertAutoReview} from './auto-review.guard';
import {ConflictException,Inject,Injectable,NotFoundException,Optional} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {semanticEvaluateRequestSchema,semanticBatchConsent,SemanticEvaluateRequest} from '@crm/contracts';
import {Db} from '../common/db';
import {Actor,requireAdmin} from '../auth/security';
import {QwenError,QwenTransport,requestQwen} from '../collection/qwen-provider';
import {previewHash,validateQwenEvidence} from '../collection/semantic-redaction';
import {qwenModel} from '../../../../runtime/qwen-models.cjs';
import {ReviewPolicyService,ReviewDb,lockReview} from './review-policy.service';
import {wholePostCapacity,wholePostCapacityMessage,WHOLE_POST_LEASE} from '../collection/whole-post-capacity';
export const REVIEW_HTTP=Symbol('REVIEW_HTTP');
@Injectable()
export class ReviewEvaluationService {
 constructor(@Inject(Db) private db:Db,@Inject(ReviewPolicyService) private policies:ReviewPolicyService,@Optional() @Inject(REVIEW_HTTP) private options?:{transport:QwenTransport}){}
 private async batch(db:ReviewDb,id:string,reviewIds:string[],manual=false,wholePost=manual){
  const policy=await db.commentReviewPolicy.findUnique({where:{id}});if(!policy)throw new NotFoundException();
  const settings=await this.policies.models.resolve(db);
  const rows=await db.semanticReview.findMany({where:{id:{in:reviewIds},policyId:id,policyRevision:policy.revision,selectedModel:settings.status.model,reviewStatus:'PENDING',OR:[{state:{in:['UNANALYSED','UNCONFIGURED','FAILED']}},{state:'PROCESSING',leaseUntil:{lt:new Date()}}]},orderBy:{id:'asc'}});
  if(!rows.length||rows.length!==reviewIds.length||new Set(reviewIds).size!==reviewIds.length||(!wholePost&&rows.length>5))throw new ConflictException('批次已变化，请重新选择已有评论');
  let payload,inputs;try{({payload,inputs}=await prepareReviewOutbound(db,rows,wholePost));if(wholePost)payload.requestPolicy=wholePostRequestPolicy;if(!wholePost&&Buffer.byteLength(JSON.stringify(payload))>48000)throw new QwenError('PAYLOAD_LIMIT');}catch{throw new ConflictException('评论为空、单条输入超限或上下文安全检查未通过；已阻止外发，原文保留');}
  if(wholePost&&!wholePostCapacity(payload,settings.status.model).fits)throw new ConflictException(wholePostCapacityMessage);
  return {wholePost,policy,settings,rows,inputs,payload,hash:previewHash(payload,rows,policy.revision,`${id}:${manual?policy.revision:policy.version}:${settings.status.model}:${settings.configurationVersion}:${qwenModel(settings.status.model)?.priceVersion}`)};
 }
 async preview(actor:Actor,id:string,reviewIds:string[],manual=false,wholePost=manual){requireAdmin(actor);const b=await this.batch(this.db,id,reviewIds,manual,wholePost);return {hash:b.hash,reviewIds,count:b.rows.length,revision:b.policy.revision,payload:b.payload,...await this.policies.qwen.status(this.db,undefined,{enabled:true,version:b.policy.version})};}
 async evaluate(actor:Actor,id:string,input:SemanticEvaluateRequest,autoJobId?:string,manualJobId?:string){
  requireAdmin(actor);input=semanticEvaluateRequestSchema.parse(input);if(!input.reviewIds?.length)throw new ConflictException('请先选择并预览评论');
  const reserved=await this.db.$transaction(async tx=>{await lockReview(tx);
   const previous=await tx.semanticModelCall.findUnique({where:{requestKey:input.requestKey}});if(previous){if(previous.policyId!==id||previous.actorId!==actor.id||previous.previewHash!==input.previewHash)throw new ConflictException('请求标识已使用');return {previous};}
   const b=await this.batch(tx,id,input.reviewIds!,!!manualJobId,!!manualJobId||!!autoJobId),status=await this.policies.qwen.status(tx,undefined,{enabled:true,version:b.policy.version});
   if(autoJobId)await assertAutoReview(tx,autoJobId,b.settings.configurationVersion);
   if(manualJobId)await assertManualReview(tx,manualJobId,b.settings.configurationVersion,b.rows.map(r=>r.id),b.payload);
   if(!status.usage.canCall||!b.settings.status.authorized)throw new ConflictException('模型未授权、预算不足或仍在请求间隔内；未外发');
   if(b.hash!==input.previewHash||input.priceVersion!==qwenModel(b.settings.status.model)?.priceVersion)throw new ConflictException('需求、模型或批次已变化，请重新预览');
   const until=new Date(Date.now()+(b.wholePost?WHOLE_POST_LEASE:60000));
   for(const row of b.rows){const claim=await tx.semanticReview.updateMany({where:{id:row.id,version:row.version,reviewStatus:'PENDING'},data:{state:'PROCESSING',leaseUntil:until,version:{increment:1}}});if(claim.count!==1)throw new ConflictException('批次已变化');}
   const call=await tx.semanticModelCall.create({data:{requestKey:input.requestKey,previewHash:input.previewHash,policyId:id,policyRevision:b.policy.revision,actorId:actor.id,trigger:autoJobId?'AUTOMATIC':'MANUAL',configurationVersion:b.settings.configurationVersion,status:'RESERVED',rows:b.rows.length,reservedUntil:until}});return {b,call};
  });
  if('previous' in reserved)return {callId:reserved.previous!.id,status:reserved.previous!.status,errorCode:reserved.previous!.errorCode,outputFailure:modelOutputFailure(reserved.previous!.errorCode),reused:true};
  const {b,call}=reserved;let outputs:ReturnType<typeof validateQwenEvidence>=[],usage:{inputTokens:number;outputTokens:number}|null=null,errorCode:string|null=null;
  try{let flight:Promise<{response?:Awaited<ReturnType<typeof requestQwen>>;error?:unknown}>|undefined;
   await this.db.$transaction(async tx=>{await lockReview(tx);const policy=await tx.commentReviewPolicy.findUniqueOrThrow({where:{id}});
    if(manualJobId?policy.revision!==b.policy.revision:policy.version!==b.policy.version)throw new QwenError('REVIEW_CHANGED');
    const metadata=await this.policies.models.resolve(tx);if(!metadata.status.authorized||metadata.configurationVersion!==b.settings.configurationVersion)throw new QwenError('MODEL_SETTINGS_CHANGED');
    if(autoJobId)await assertAutoReview(tx,autoJobId,metadata.configurationVersion);
    if(manualJobId)await assertManualReview(tx,manualJobId,metadata.configurationVersion,b.rows.map(r=>r.id),b.payload);
    const current=await prepareReviewOutbound(tx,b.rows,b.wholePost);if(b.wholePost)current.payload.requestPolicy=wholePostRequestPolicy;
    if(semanticHash(current.payload)!==semanticHash(b.payload))throw new QwenError('REVIEW_CHANGED');
    const settings=await this.policies.models.resolve(tx,true,semanticBatchConsent);
    flight=requestQwen(settings,b.payload,this.options?.transport,'comment-first').then(response=>({response}),error=>({error}));
   });
   const outcome=await flight!;if(outcome.error)throw outcome.error;usage=outcome.response!.usage;outputs=validateQwenEvidence(outcome.response!.result,b.payload,b.inputs,true);
  }catch(e){errorCode=e instanceof QwenError?e.code:'INVALID_RESPONSE';}
  const status=errorCode?'FAILED':'COMPLETED';
  await this.db.$transaction(async tx=>{for(const row of b.rows){const output=outputs.find(o=>o.id===row.id);await tx.semanticReview.updateMany({where:{id:row.id,version:row.version+1,state:'PROCESSING'},data:{state:errorCode?'FAILED':'EVALUATED',score:errorCode?null:output!.score,reason:errorCode?(outputFailureReason(errorCode)||`评估失败（${errorCode}），原文保留，等待重新预览`):output!.reason,context:errorCode?'INSUFFICIENT':output!.context,result:errorCode?Prisma.DbNull:output as unknown as Prisma.InputJsonValue,evaluationInput:b.payload,provider:'QWEN',modelVersion:b.settings.status.model+(b.wholePost?':comment-first-whole-post-v3':':comment-first-original-v2'),leaseUntil:null,version:{increment:1}}});}
   await tx.semanticModelCall.update({where:{id:call.id},data:{status,errorCode,finishedAt:new Date(),...usage}});await tx.auditLog.create({data:{actorId:actor.id,action:'COMMENT_REVIEW_EVALUATED',entityId:id,metadata:{callId:call.id,revision:b.policy.revision,status}}});
  });return {callId:call.id,status,errorCode,processed:b.rows.length,outputFailure:modelOutputFailure(errorCode),canSend:false};
 }
}
