import {wasHistoryArchived,archivedReviewIds} from '../history-archive/archive-guard';
import {historyDisplay} from '../common/db';
import {prepareReviewOutbound,reviewObservations} from './review-observation';
import {outputFailureReason,reviewObservationPolicy,semanticInputPolicy,wholePostRequestPolicy} from '@crm/contracts';
import {ConflictException,Inject,Injectable,NotFoundException} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {Prisma,type ManualReviewJob} from '@prisma/client';
import {manualPostPrepareSchema,manualPostConfirmSchema,semanticBatchConsent,type SemanticSnapshot,type SemanticRules,type SemanticOutbound} from '@crm/contracts';
import {z} from 'zod';
import {Db} from '../common/db';
import {type Actor,requireAdmin} from '../auth/security';
import {MODEL_SETTINGS_ID} from '../model-settings/model-settings.service';
import {semanticHash} from '../collection/capture-archive';
import {prepareOutbound} from '../collection/semantic-redaction';
import {qwenModel} from '../../../../runtime/qwen-models.cjs';
import {ReviewPolicyService,lockReview,type ReviewDb} from './review-policy.service';
import {ReviewEvaluationService} from './review-evaluation.service';
import {type ManualItem,assertManualReview} from './manual-review.guard';
import {wholePostCapacity,wholePostCapacityMessage,WHOLE_POST_STALE} from '../collection/whole-post-capacity';
const itemsOf=(job:ManualReviewJob)=>job.items as unknown as ManualItem[];
const json=(value:unknown)=>value as Prisma.InputJsonValue;
@Injectable()
export class ManualReviewService {
 constructor(@Inject(Db) private db:Db,@Inject(ReviewPolicyService) private policies:ReviewPolicyService,@Inject(ReviewEvaluationService) private evaluation:ReviewEvaluationService){}
 private async scope(db:ReviewDb,postId:string){return db.capturedComment.findMany({where:{postId},orderBy:{id:'asc'}});}
 private signature(observations:unknown,rows:Awaited<ReturnType<ManualReviewService['scope']>>,revision:number,modelVersion:number,postId:string,policyId:string){return semanticHash({observations,observationPolicy:reviewObservationPolicy,requestPolicy:wholePostRequestPolicy,inputPolicyVersion:semanticInputPolicy,policyId,postId,revision,modelVersion,rows:rows.map(c=>({id:c.id,hash:c.contentHash,snapshot:c.snapshot}))});}
 private async view(job:ManualReviewJob){const items=itemsOf(job),settings=await this.policies.models.resolve(),catalog=qwenModel(job.model),payload=job.preview as unknown as SemanticOutbound;return {id:job.id,postId:job.postId,title:job.title,coverage:job.coverage,policyRevision:job.policyRevision,model:job.model,modelVersion:job.modelVersion,priceVersion:job.priceVersion,scopeHash:job.scopeHash,status:job.status,reason:job.reason,total:items.length,pending:items.filter(i=>i.state==='PENDING').length,success:items.filter(i=>i.state==='SUCCESS').length,failed:items.filter(i=>i.state==='FAILED').length,skipped:items.filter(i=>i.state==='SKIPPED').length,maxCalls:items.some(i=>i.state==='PENDING')?1:0,retrying:items.filter(i=>i.state==='PENDING'&&i.previousAttempt).length,capacityError:payload.items.length&&!wholePostCapacity(payload,job.model).fits?wholePostCapacityMessage:null,target:payload.target,priceDescription:catalog?.priceDescription,dailyLimit:settings.status.dailyLimit,authorized:settings.status.authorized};}
 async list(actor:Actor,policyId:string){requireAdmin(actor);return Promise.all((await historyDisplay(this.db).manualReviewJob.findMany({where:{policyId,actorId:actor.id,status:{not:'PREVIEW'}},orderBy:{createdAt:'desc'},take:20})).map(j=>this.view(j)));}
 async get(actor:Actor,id:string){requireAdmin(actor);const j=await this.db.manualReviewJob.findFirst({where:{id,actorId:actor.id}});if(!j)throw new NotFoundException();return j;}
 async previewPage(actor:Actor,id:string,offset:number){const j=await this.get(actor,id),payload=j.preview as unknown as SemanticOutbound;return {items:payload.items.slice(offset,offset+20),hasMore:offset+20<payload.items.length};}
 async prepare(actor:Actor,policyId:string,input:z.infer<typeof manualPostPrepareSchema>){
  requireAdmin(actor);input=manualPostPrepareSchema.parse(input);
  const job=await this.db.$transaction(async tx=>{await lockReview(tx);
   const policy=await tx.commentReviewPolicy.findUnique({where:{id:policyId}}),model=await this.policies.models.resolve(tx);
   if(!policy||policy.revision!==input.revision)throw new ConflictException('请先保存或刷新审核需求');
   if(model.status.state!=='READY')throw new ConflictException('请先配置模型和 Key');
   const catalog=qwenModel(model.status.model);if(!catalog)throw new ConflictException('模型价格不可用');
   const post=await tx.capturedPost.findUnique({where:{id:input.postId}});if(!post)throw new NotFoundException();
   const captures=await this.scope(tx,post.id);if(!captures.length)throw new ConflictException('该帖没有已保存评论');
   const scopeHash=this.signature([...await reviewObservations(tx,captures.map(c=>c.id))],captures,policy.revision,model.configurationVersion,post.id,policyId);
   const existing=await tx.manualReviewJob.findFirst({where:{scopeHash,actorId:actor.id,status:{in:['PREVIEW','PENDING','PROCESSING','COMPLETED']}},orderBy:{createdAt:'desc'}});
   if(existing&&existing.status!=='PREVIEW')return existing;
   if(existing&&Date.now()-existing.createdAt.getTime()<=900000){const current=await tx.semanticReview.findMany({where:{id:{in:itemsOf(existing).map(i=>i.reviewId)}}});if(itemsOf(existing).every(i=>{const row=current.find(r=>r.id===i.reviewId);return row&&row.version===i.reviewVersion;}))return existing;}
   const archived=new Set(await archivedReviewIds(tx));
   const rules={version:1,target:policy.target,reviewThreshold:0},items:ManualItem[]=[],outbound:SemanticOutbound={observationPolicy:reviewObservationPolicy,requestPolicy:wholePostRequestPolicy,inputPolicyVersion:semanticInputPolicy,target:'',redactionVersion:'',items:[]},seen=new Set<string>();
   const reviews=await tx.semanticReview.findMany({where:{policyId,policyRevision:policy.revision,selectedModel:model.status.model,sourceContentHash:{in:captures.map(c=>c.contentHash)}}});
   for(const c of captures){
    const previous=reviews.find(r=>r.sourceContentHash===c.contentHash),duplicate=seen.has(c.contentHash);seen.add(c.contentHash);
    if(duplicate||previous&&(archived.has(previous.id)||!['UNANALYSED','UNCONFIGURED','FAILED'].includes(previous.state)||previous.reviewStatus!=='PENDING')){items.push({captureId:c.id,reviewId:previous?.id||'',reviewVersion:previous?.version,state:'SKIPPED'});continue;}
    const s=c.snapshot as unknown as SemanticSnapshot,hash=semanticHash({policyId,revision:policy.revision,content:c.contentHash,model:model.status.model});
    const row=previous??await tx.semanticReview.create({data:{policyId,policyRevision:policy.revision,sourceContentHash:c.contentHash,configId:c.configId,runId:c.runId,revision:policy.revision,captureId:c.id,analysisKey:hash,snapshotHash:hash,selectedModel:model.status.model,ruleHash:semanticHash(rules),contextVersion:c.contextVersion,platform:(await tx.collectionConfig.findUniqueOrThrow({where:{id:c.configId}})).platform,platformUserId:s.userId,snapshot:c.snapshot as Prisma.InputJsonValue,rules,isDemo:c.isDemo,state:'UNANALYSED',reason:'整帖手动测试 · 等待确认'}});
    // Validate comments and context before confirmation without rewriting the saved comment.
    let prepared:SemanticOutbound;try{prepared=prepareOutbound([{id:row.id,snapshot:row.snapshot as unknown as SemanticSnapshot,rules:row.rules as unknown as SemanticRules}],true);}catch{throw new ConflictException('评论为空、单条输入超过大小限制或上下文安全检查未通过；未创建可执行任务，原文保留');}
    outbound.target=prepared.target;outbound.redactionVersion=prepared.redactionVersion;outbound.items.push({...prepared.items[0],id:row.id});items.push({captureId:c.id,reviewId:row.id,state:'PENDING',reviewVersion:row.version,...(row.state==='FAILED'?{previousAttempt:JSON.parse(JSON.stringify(row))}: {})});
   }
   // Build the final payload in the same stable row order used at dispatch.
   const selected=await tx.semanticReview.findMany({where:{id:{in:items.filter(i=>i.state==='PENDING').map(i=>i.reviewId)}},orderBy:{id:'asc'}});
   if(selected.length){const prepared=(await prepareReviewOutbound(tx,selected,true)).payload;Object.assign(outbound,prepared,{requestPolicy:wholePostRequestPolicy,items:prepared.items.map((item,i)=>({...item,id:selected[i].id}))});}
   if(!outbound.target)outbound.target=policy.target;
   if(outbound.items.length&&!wholePostCapacity(outbound,model.status.model).fits)throw new ConflictException(wholePostCapacityMessage);
   return tx.manualReviewJob.create({data:{policyId,policyRevision:policy.revision,modelVersion:model.configurationVersion,model:model.status.model,priceVersion:catalog.priceVersion,actorId:actor.id,postId:post.id,title:(post.snapshot as {title?:string}).title||'未提供标题',coverage:post.coverage,scopeHash,items:json(items),preview:json(outbound)}});
  },{timeout:30000});return this.view(job);
 }
 async confirm(actor:Actor,id:string,input:z.infer<typeof manualPostConfirmSchema>){
  requireAdmin(actor);input=manualPostConfirmSchema.parse(input);
  const job=await this.db.$transaction(async tx=>{await lockReview(tx);if(await wasHistoryArchived(tx,'ManualReviewJob',id))throw new ConflictException('已归档任务不能重新执行');const job=await tx.manualReviewJob.findFirst({where:{id,actorId:actor.id}});if(!job)throw new NotFoundException();
   if((job.preview as unknown as SemanticOutbound).observationPolicy!==reviewObservationPolicy)throw new ConflictException('覆盖上下文策略已变化，请重新预览确认');
   if((job.preview as unknown as SemanticOutbound).inputPolicyVersion!==semanticInputPolicy)throw new ConflictException('输入策略已变化，请重新预览并确认评论原文外发');
   if((job.preview as unknown as SemanticOutbound).requestPolicy!==wholePostRequestPolicy)throw new ConflictException('整帖处理范围策略已变化，请重新选择帖子并确认');
   if(input.hash!==job.scopeHash)throw new ConflictException('确认范围不匹配');
   if(job.status!=='PREVIEW'){if(job.requestKey===input.requestKey)return job;throw new ConflictException('任务已确认或已结束，请刷新进度');}
   const policy=await tx.commentReviewPolicy.findUniqueOrThrow({where:{id:job.policyId}}),model=await this.policies.models.resolve(tx);
   const captures=await this.scope(tx,job.postId);
   const current=this.signature([...await reviewObservations(tx,captures.map(c=>c.id))],captures,policy.revision,model.configurationVersion,job.postId,job.policyId);
   if(Date.now()-job.createdAt.getTime()>900000||current!==job.scopeHash||model.status.state!=='READY'||qwenModel(model.status.model)?.priceVersion!==job.priceVersion)throw new ConflictException('范围、目标、模型或价格已变化，或预览超过 15 分钟，请重新选择帖子');
   const expected=itemsOf(job).filter(i=>i.state==='PENDING'),currentRows=await tx.semanticReview.findMany({where:{id:{in:expected.map(i=>i.reviewId)}}});
   if(expected.some(i=>{const r=currentRows.find(r=>r.id===i.reviewId);return !r||r.version!==i.reviewVersion||r.reviewStatus!=='PENDING'||!['UNANALYSED','UNCONFIGURED','FAILED'].includes(r.state);}))throw new ConflictException('待处理状态已变化，请重新预览确认');
   if(expected.length&&!wholePostCapacity(job.preview as unknown as SemanticOutbound,job.model).fits)throw new ConflictException(wholePostCapacityMessage);
   await tx.modelSettings.update({where:{id:MODEL_SETTINGS_ID},data:{consent:true,consentInputPolicy:semanticInputPolicy}});
   await tx.auditLog.create({data:{actorId:actor.id,action:'COMMENT_REVIEW_POST_CONSENT',entityId:id,metadata:{scopeHash:job.scopeHash,modelVersion:job.modelVersion,total:itemsOf(job).length,priceVersion:job.priceVersion}}});
   return tx.manualReviewJob.update({where:{id},data:{requestKey:input.requestKey,status:itemsOf(job).some(i=>i.state==='PENDING')?'PENDING':'COMPLETED',reason:'已确认本次全部待处理评论，一次请求；失败后停止，重新预览确认才再次调用'}});
  });return this.view(job);
 }
 async cancel(actor:Actor,id:string){await this.get(actor,id);return this.db.$transaction(async tx=>{await lockReview(tx);await tx.manualReviewJob.updateMany({where:{id,status:{in:['PREVIEW','PENDING','PROCESSING']}},data:{status:'CANCELLED',reason:'已取消未开始的调用；在途请求仍可能计费并保留结果'}});return {cancelled:true};});}
 async tick(){
  const job=await this.db.$transaction(async tx=>{await lockReview(tx);
   for(const stale of await tx.manualReviewJob.findMany({where:{status:'PROCESSING',updatedAt:{lt:new Date(Date.now()-WHOLE_POST_STALE)}}}))await tx.manualReviewJob.update({where:{id:stale.id},data:{status:'FAILED',reason:'执行中断，本批结果可能未知；不自动重试，其余未处理',items:json(itemsOf(stale).map(i=>stale.batchIds.includes(i.reviewId)?{...i,state:'FAILED'}:i))}});
   const next=await tx.manualReviewJob.findFirst({where:{status:'PENDING'},orderBy:{updatedAt:'asc'}});if(!next)return null;
   const policy=await tx.commentReviewPolicy.findUniqueOrThrow({where:{id:next.policyId}}),model=await this.policies.models.resolve(tx),actor=await tx.user.findUnique({where:{id:next.actorId}});
   if((next.preview as unknown as SemanticOutbound).observationPolicy!==reviewObservationPolicy||(next.preview as unknown as SemanticOutbound).requestPolicy!==wholePostRequestPolicy||(next.preview as unknown as SemanticOutbound).inputPolicyVersion!==semanticInputPolicy||policy.revision!==next.policyRevision||model.configurationVersion!==next.modelVersion||qwenModel(model.status.model)?.priceVersion!==next.priceVersion||!model.status.authorized||model.status.state!=='READY'||actor?.role!=='ADMIN'){await tx.manualReviewJob.update({where:{id:next.id},data:{status:'INVALIDATED',reason:'输入策略、目标、模型或管理员授权已变化，剩余评论未送审'}});return null;}
   const items=itemsOf(next),pending=items.filter(i=>i.state==='PENDING'),rows=await tx.semanticReview.findMany({where:{id:{in:pending.map(i=>i.reviewId)}}});
   if(pending.some(item=>{const row=rows.find(r=>r.id===item.reviewId);return !row||row.version!==item.reviewVersion||!['UNANALYSED','UNCONFIGURED','FAILED'].includes(row.state)||row.reviewStatus!=='PENDING';})){await tx.manualReviewJob.update({where:{id:next.id},data:{status:'INVALIDATED',reason:'待处理状态已变化，请重新预览确认；未缩小或扩大已确认范围'}});return null;}
   const pendingIds=new Set(items.filter(i=>i.state==='PENDING').map(i=>i.reviewId)),payload=next.preview as unknown as SemanticOutbound;
   const batchIds=payload.items.filter(i=>pendingIds.has(i.id)).map(i=>i.id);
   if(batchIds.length&&!wholePostCapacity(payload,next.model).fits){await tx.manualReviewJob.update({where:{id:next.id},data:{status:'INVALIDATED',reason:wholePostCapacityMessage}});return null;}
   if(!batchIds.length){await tx.manualReviewJob.update({where:{id:next.id},data:{items:json(items),status:'COMPLETED',reason:'全部已保存评论已处理或跳过'}});return null;}
   const usage=await this.policies.qwen.status(tx,undefined,{enabled:true,version:policy.version});
   if(!usage.usage.canCall){await tx.manualReviewJob.update({where:{id:next.id},data:{items:json(items),reason:'等待每日预算、在途请求或失败退避；可取消'}});return null;}
   return tx.manualReviewJob.update({where:{id:next.id},data:{status:'PROCESSING',items:json(items),batchIds,reason:'正在处理已确认范围'}});
  });if(!job)return;
  let success=false,reason='批次检查失败，未自动重试；剩余未处理';
  try{
   const actor=await this.db.user.findUniqueOrThrow({where:{id:job.actorId}});await assertManualReview(this.db,job.id,job.modelVersion,job.batchIds);
   const preview=await this.evaluation.preview(actor,job.policyId,job.batchIds,true);
   const result=await this.evaluation.evaluate(actor,job.policyId,{requestKey:randomUUID(),reviewIds:job.batchIds,previewHash:preview.hash,priceVersion:job.priceVersion,consent:semanticBatchConsent},undefined,job.id);
   success=result.status==='COMPLETED';reason=success?'本次整帖处理完成':(outputFailureReason('errorCode' in result?result.errorCode:null)||`本批失败（${'errorCode' in result?result.errorCode:'未知'}）；不自动重试`)+` 本批 ${job.batchIds.length} 条未采纳，剩余待处理评论尚未送审。`;
  }catch{ /* No automatic retry after an uncertain dispatch. */ }
  await this.db.$transaction(async tx=>{await lockReview(tx);const current=await tx.manualReviewJob.findUniqueOrThrow({where:{id:job.id}}),items=itemsOf(current).map(i=>job.batchIds.includes(i.reviewId)?{...i,state:success?'SUCCESS' as const:'FAILED' as const}:i);
   await tx.manualReviewJob.update({where:{id:job.id},data:{items:json(items),batchIds:[],...(current.status==='PROCESSING'?{status:success?(items.some(i=>i.state==='PENDING')?'PENDING':'COMPLETED'):'FAILED',reason}: {})}});
  });
 }
}
