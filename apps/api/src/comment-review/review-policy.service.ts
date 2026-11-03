import {archivedReviewIds} from '../history-archive/archive-guard';
import {historyDisplay} from '../common/db';
import {readReviewResults} from './review-results-query';
import {autoReviewScope} from './auto-review-scope';
import {readRunReview} from './run-review-query';
import {activeAcceptance,normalAcceptanceScope,liveAcceptance,acceptanceConflict} from '../auto-contact/normal-acceptance';
import {randomUUID} from 'node:crypto';
import {postAvailability} from '../collection/post-availability';
import {unknownPostAvailability} from '@crm/contracts';
import {wholePostRequestPolicy} from '@crm/contracts';
import {displayReviewFailure} from '@crm/contracts';
import {semanticInputPolicy} from '@crm/contracts';
import {BadRequestException,ConflictException,Inject,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {reviewAutoToggleSchema,reviewAutoConsent,reviewAuthorizationSchema,reviewPolicySaveSchema,reviewPolicyToggleSchema,reviewPrepareSchema,reviewUseConsent,SemanticSnapshot} from '@crm/contracts';
import {safePostCoverUrl,reviewResultFilterSchema} from '@crm/contracts';
import {z} from 'zod';
import {Db} from '../common/db';
import {Actor,requireAdmin} from '../auth/security';
import {ModelSettingsService,MODEL_SETTINGS_ID} from '../model-settings/model-settings.service';
import {QwenMatchingService} from '../collection/qwen-matching.service';
import {semanticHash} from '../collection/capture-archive';
import {qwenModel} from '../../../../runtime/qwen-models.cjs';
export type ReviewDb=Db|Prisma.TransactionClient;
export const lockReview=async(db:ReviewDb)=>{await db.$queryRaw`SELECT pg_advisory_xact_lock(63967,210003)::text`;};
@Injectable()
export class ReviewPolicyService {
 constructor(@Inject(Db) readonly db:Db,@Inject(ModelSettingsService) readonly models:ModelSettingsService,@Inject(QwenMatchingService) readonly qwen:QwenMatchingService){}
 runReview(actor:Actor,runId:string,input:unknown){return readRunReview(historyDisplay(this.db),actor,runId,input);}
 async overview(actor:Actor){requireAdmin(actor);const [policies,settings,status,capturedComments]=await Promise.all([historyDisplay(this.db).commentReviewPolicy.findMany({orderBy:{createdAt:'asc'}}),this.models.resolve(),this.qwen.status(),historyDisplay(this.db).capturedComment.count()]);const autoJobs=await historyDisplay(this.db).autoReviewJob.findMany({orderBy:{createdAt:'desc'},take:20});const jobPosts=await historyDisplay(this.db).capturedPost.findMany({where:{id:{in:autoJobs.map(j=>j.postId)}},select:{id:true,snapshot:true}});return {policies,autoJobs:autoJobs.map(j=>({...j,title:(jobPosts.find(p=>p.id===j.postId)?.snapshot as {title?:string})?.title||'已保存帖子'})),...status,modelVersion:settings.configurationVersion,capturedComments};}
 async create(actor:Actor,input:{name:string;target:string}){requireAdmin(actor);return this.save(actor,randomUUID(),{...input,version:0},true);}
 async save(actor:Actor,id:string,input:z.infer<typeof reviewPolicySaveSchema>,create=false){
  requireAdmin(actor);input=reviewPolicySaveSchema.parse(input);
  return this.db.$transaction(async tx=>{await lockReview(tx);const old=await tx.commentReviewPolicy.findUnique({where:{id}});
   if((old?.version??0)!==input.version)throw new ConflictException('审核需求已变化，请刷新');
   if(!old&&id!=='workspace'&&!create)throw new NotFoundException();
   if(!old&&await tx.commentReviewPolicy.count()>=100)throw new BadRequestException('最多100个匹配方案');
   const changed=!old||old.target!==input.target,revision=(old?.revision??0)+(changed?1:0);
   const row=await tx.commentReviewPolicy.upsert({where:{id},create:{id,name:input.name||'评论审核',target:input.target,revision,enabled:false},update:{name:input.name??old?.name,target:input.target,revision,version:{increment:1},...(changed?{autoEnabled:false}: {})}});
   if(changed)await tx.autoReviewJob.updateMany({where:{policyId:id,status:{in:['PENDING','PROCESSING']}},data:{status:'CANCELLED',reason:'目标已变化，请重新确认自动识别'}});
   if(changed)await tx.commentReviewPolicyVersion.create({data:{policyId:id,revision,target:input.target}});
   await tx.auditLog.create({data:{actorId:actor.id,action:'COMMENT_REVIEW_POLICY_SAVED',entityId:id,metadata:{revision,version:row.version}}});return row;
  });
 }
 async toggle(actor:Actor,id:string,input:z.infer<typeof reviewPolicyToggleSchema>){
  requireAdmin(actor);input=reviewPolicyToggleSchema.parse(input);
  return this.db.$transaction(async tx=>{await lockReview(tx);const old=await tx.commentReviewPolicy.findUnique({where:{id}});if(!old)throw new NotFoundException();if(old.version!==input.version)throw new ConflictException('审核开关已变化，请刷新');
   if(input.enabled){const model=await this.models.resolve(tx);if(model.status.state!=='READY')throw new ConflictException('请先保存模型设置；未启用审核');
    if(!model.status.authorized){if(input.consent!==reviewUseConsent||input.modelVersion!==model.configurationVersion||input.priceVersion!==qwenModel(model.status.model)?.priceVersion)throw new BadRequestException('首次启用请确认当前模型费用和评论原文外发范围');
     await tx.modelSettings.update({where:{id:MODEL_SETTINGS_ID},data:{consent:true,consentInputPolicy:semanticInputPolicy}});
    }
   }
   const row=await tx.commentReviewPolicy.update({where:{id},data:{enabled:input.enabled,version:{increment:1}}});await tx.auditLog.create({data:{actorId:actor.id,action:'COMMENT_REVIEW_TOGGLED',entityId:id,metadata:{enabled:row.enabled,version:row.version}}});return row;
  });
 }
 async authorize(actor:Actor,input:z.infer<typeof reviewAuthorizationSchema>){
  requireAdmin(actor);input=reviewAuthorizationSchema.parse(input);
  return this.db.$transaction(async tx=>{await lockReview(tx);const model=await this.models.resolve(tx);
   if(model.status.state!=='READY'||input.modelVersion!==model.configurationVersion||input.priceVersion!==qwenModel(model.status.model)?.priceVersion)throw new ConflictException('模型已变化，请重新确认');
   await tx.modelSettings.update({where:{id:MODEL_SETTINGS_ID},data:{consent:true,consentInputPolicy:semanticInputPolicy}});
   await tx.auditLog.create({data:{actorId:actor.id,action:'COMMENT_REVIEW_MANUAL_CONSENT',entityId:MODEL_SETTINGS_ID,metadata:{modelVersion:input.modelVersion}}});return {authorized:true};
  });
 }
 async automatic(actor:Actor,id:string,input:z.infer<typeof reviewAutoToggleSchema>){
  requireAdmin(actor);input=reviewAutoToggleSchema.parse(input);
  return this.db.$transaction(async tx=>{await lockReview(tx);const policy=await tx.commentReviewPolicy.findUnique({where:{id}});
   if(!policy||policy.version!==input.version)throw new ConflictException('审核需求已变化，请刷新');
   const model=await this.models.resolve(tx);
   if(input.enabled){
    const envelope=await activeAcceptance(tx);if(envelope){const scope=normalAcceptanceScope.parse(envelope.scope);if(!liveAcceptance(envelope)||envelope.actorId!==actor.id||scope.policyId!==id||scope.policyVersion!==policy.version+1)acceptanceConflict();}
    if(model.status.state!=='READY')throw new ConflictException('请先配置模型');
    if(input.consent!==reviewAutoConsent||input.modelVersion!==model.configurationVersion||input.priceVersion!==qwenModel(model.status.model)?.priceVersion)throw new BadRequestException('请明确确认持续调用、费用和数据范围');
    await tx.modelSettings.update({where:{id:MODEL_SETTINGS_ID},data:{consent:true,consentInputPolicy:semanticInputPolicy}});
   }
   const row=await tx.commentReviewPolicy.update({where:{id},data:{autoEnabled:input.enabled,autoModelVersion:input.enabled?model.configurationVersion:null,autoActorId:input.enabled?actor.id:null,version:{increment:1}}});
   const continuation=await activeAcceptance(tx),continuationScope=continuation?normalAcceptanceScope.parse(continuation.scope):null;
   await tx.autoReviewJob.updateMany({where:{policyId:id,status:{in:['PENDING','PROCESSING']},...(input.enabled&&continuation?.runId&&continuationScope?.reviewConfigRevision?{NOT:{runId:continuation.runId,policyVersion:row.version,status:'PENDING'}}:{})},data:{status:'CANCELLED',reason:'自动设置变化，未开始的调用已取消'}});
   await tx.auditLog.create({data:{actorId:actor.id,action:'COMMENT_REVIEW_AUTO_CONSENT',entityId:id,metadata:{enabled:input.enabled,modelVersion:model.configurationVersion,policyVersion:row.version,requestPolicy:wholePostRequestPolicy}}});return row;
  });
 }
 async comments(actor:Actor,postId:string,offset:number){requireAdmin(actor);const rows=await historyDisplay(this.db).capturedComment.findMany({where:{postId},orderBy:[{createdAt:'asc'},{id:'asc'}],skip:offset,take:21});return {items:rows.slice(0,20).map(c=>({id:c.id,comment:(c.snapshot as unknown as SemanticSnapshot).comment,coverage:(c.snapshot as unknown as SemanticSnapshot).coverage})),hasMore:rows.length>20};}
 async posts(actor:Actor,offset:number,search=''){requireAdmin(actor);const rows=await historyDisplay(this.db).capturedPost.findMany({where:search?{snapshot:{path:['title'],string_contains:search}}:{},orderBy:[{lastSeenAt:'desc'},{id:'asc'}],skip:offset,take:21,select:{id:true,snapshot:true,coverage:true,_count:{select:{comments:true}}}});return {items:rows.slice(0,20).map(p=>({id:p.id,title:typeof (p.snapshot as any)?.title==='string'?(p.snapshot as any).title:'未提供标题',comments:p._count.comments,coverage:p.coverage,coverUrl:safePostCoverUrl((p.snapshot as any)?.coverUrl)})),hasMore:rows.length>20};}
 async prepare(actor:Actor,id:string,input:z.infer<typeof reviewPrepareSchema>,automatic=false,automaticRunId?:string){
  requireAdmin(actor);input=reviewPrepareSchema.parse(input);
  return this.db.$transaction(async tx=>{await lockReview(tx);const policy=await tx.commentReviewPolicy.findUnique({where:{id}});if(!policy||policy.version!==input.version)throw new ConflictException('审核需求已变化，请刷新');
   const model=(await this.models.resolve(tx)).status;if(model.state!=='READY'||!model.authorized)throw new ConflictException('模型尚未授权，请先确认使用');
   const posts=input.scope.kind==='POSTS'?input.scope.postIds:[],comments=input.scope.kind==='COMMENTS'?input.scope.commentIds:[];
   if(automatic&&(posts.length!==1||comments.length))throw new ConflictException('自动审核必须绑定本轮单帖范围');
   const reviewOnlyRun=automaticRunId?await tx.collectionRun.findUnique({where:{id:automaticRunId},select:{readPlan:true}}):null;
   const reviewOnly=!!(reviewOnlyRun?.readPlan as {savedPostId?:string}|null)?.savedPostId;
   const contactScope=reviewOnly?{automaticContactAllowed:false,runId:automaticRunId!}:{automaticContactAllowed:true};
   const automaticIds=automatic?(await autoReviewScope(tx,posts[0],automaticRunId)).map(c=>c.id):null;
   if(automaticIds&&!automaticIds.length)return {reviewIds:[],count:0,scope:input.scope,revision:policy.revision};
   if(comments.length&&await tx.capturedComment.count({where:{id:{in:comments}}})!==comments.length)throw new ConflictException('所选评论不存在，请刷新');
   if(posts.length&&await tx.capturedPost.count({where:{id:{in:posts}}})!==posts.length)throw new ConflictException('所选帖子不存在，请刷新');
   const archived=await archivedReviewIds(tx);
   const existing=await tx.semanticReview.findMany({where:{...contactScope,id:{notIn:archived},policyId:id,policyRevision:policy.revision,selectedModel:model.model,reviewStatus:'PENDING',OR:automatic?[{state:{in:['UNANALYSED','UNCONFIGURED']}}]:[{state:{in:['UNANALYSED','UNCONFIGURED','FAILED']}},{state:'PROCESSING',leaseUntil:{lt:new Date()}}],...(automaticIds?{captureId:{in:automaticIds}}:posts.length?{capture:{postId:{in:posts}}}:comments.length?{captureId:{in:comments}}:{})},orderBy:[{createdAt:'asc'},{id:'asc'}],...(automatic?{}:{take:5}),select:{id:true}});
   const reviewIds=existing.map(r=>r.id);
   // Complete-post scope includes earlier confirmed chunks on resume. Failed/uncertain rows never auto-retry.
   // DISTINCT content avoids duplicate copies collected through different searches.
   const candidates=await tx.$queryRaw<{id:string}[]>(Prisma.sql`SELECT DISTINCT ON(c."contentHash") c.id FROM history_display."CapturedComment" c WHERE ${posts.length?Prisma.sql`c."postId" IN (${Prisma.join(posts)})`:Prisma.sql`TRUE`} AND ${automaticIds?Prisma.sql`c.id IN (${Prisma.join(automaticIds)})`:comments.length?Prisma.sql`c.id IN (${Prisma.join(comments)})`:Prisma.sql`TRUE`} AND NOT EXISTS (SELECT 1 FROM "SemanticReview" r WHERE r."policyId"=${id} AND r."policyRevision"=${policy.revision} AND r."selectedModel"=${model.model} AND r."sourceContentHash"=c."contentHash" AND ${reviewOnly?Prisma.sql`r."automaticContactAllowed"=false AND r."runId"=${automaticRunId}`:Prisma.sql`r."automaticContactAllowed"=true`}) ORDER BY c."contentHash",c."createdAt",c.id ${automatic?Prisma.empty:Prisma.sql`LIMIT ${5-reviewIds.length}`}`);
   const rows=await tx.capturedComment.findMany({where:{id:{in:candidates.map(c=>c.id)}}});
   const rules={version:1, target:policy.target, reviewThreshold:0};
   for(const c of rows){const s=c.snapshot as unknown as SemanticSnapshot,hash=semanticHash({policyId:id,revision:policy.revision,content:c.contentHash,model:model.model,...(reviewOnly?{reviewOnlyRunId:automaticRunId}: {})});const row=await tx.semanticReview.create({data:{automaticContactAllowed:!reviewOnly,policyId:id,policyRevision:policy.revision,sourceContentHash:c.contentHash,configId:c.configId,runId:reviewOnly?automaticRunId!:c.runId,revision:policy.revision,captureId:c.id,analysisKey:hash,snapshotHash:hash,selectedModel:model.model,ruleHash:semanticHash(rules),contextVersion:c.contextVersion,platform:(await tx.collectionConfig.findUniqueOrThrow({where:{id:c.configId},select:{platform:true}})).platform,platformUserId:s.userId,snapshot:c.snapshot as Prisma.InputJsonValue,rules,isDemo:c.isDemo,state:'UNANALYSED',reason:'独立评论审核 · 等待逐批确认'}});reviewIds.push(row.id);}
   return {reviewIds,count:reviewIds.length,scope:input.scope,revision:policy.revision};
  });
 }
 async results(actor:Actor,id:string|undefined,offset:number,filters:z.infer<typeof reviewResultFilterSchema>={sort:'newest'}){requireAdmin(actor);const f=reviewResultFilterSchema.parse(filters);const {items,total,hasMore}=await readReviewResults(historyDisplay(this.db),id,offset,f);const availability=await Promise.all(items.map(r=>postAvailability(this.db,r.platform,(r.snapshot as unknown as SemanticSnapshot).postId)));return {items:items.map((r,i)=>({...r,availability:availability[i]??unknownPostAvailability,...(r.state==='FAILED'?{displayReason:displayReviewFailure(r.reason)}:{}),eligibility:{canSend:false,blockers:['独立审核不创建销售线索或授予联系权限','真实发送关闭']}})),total,hasMore};}
}
