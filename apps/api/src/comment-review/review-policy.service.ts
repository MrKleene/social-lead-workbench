import {BadRequestException,ConflictException,Inject,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {reviewPolicySaveSchema,reviewPolicyToggleSchema,reviewPrepareSchema,reviewUseConsent,SemanticSnapshot} from '@crm/contracts';
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
 async overview(actor:Actor){requireAdmin(actor);const [policies,settings,status,capturedComments]=await Promise.all([this.db.commentReviewPolicy.findMany({orderBy:{createdAt:'asc'}}),this.models.resolve(),this.qwen.status(),this.db.capturedComment.count()]);return {policies,...status,modelVersion:settings.configurationVersion,capturedComments};}
 async save(actor:Actor,id:string,input:z.infer<typeof reviewPolicySaveSchema>){
  requireAdmin(actor);input=reviewPolicySaveSchema.parse(input);
  return this.db.$transaction(async tx=>{await lockReview(tx);const old=await tx.commentReviewPolicy.findUnique({where:{id}});
   if((old?.version??0)!==input.version)throw new ConflictException('审核需求已变化，请刷新');
   if(!old&&id!=='workspace')throw new NotFoundException();
   const changed=!old||old.target!==input.target,revision=(old?.revision??0)+(changed?1:0);
   const row=await tx.commentReviewPolicy.upsert({where:{id},create:{id,name:'评论审核',target:input.target,revision,enabled:false},update:{target:input.target,revision,version:{increment:1}}});
   if(changed)await tx.commentReviewPolicyVersion.create({data:{policyId:id,revision,target:input.target}});
   await tx.auditLog.create({data:{actorId:actor.id,action:'COMMENT_REVIEW_POLICY_SAVED',entityId:id,metadata:{revision,version:row.version}}});return row;
  });
 }
 async toggle(actor:Actor,id:string,input:z.infer<typeof reviewPolicyToggleSchema>){
  requireAdmin(actor);input=reviewPolicyToggleSchema.parse(input);
  return this.db.$transaction(async tx=>{await lockReview(tx);const old=await tx.commentReviewPolicy.findUnique({where:{id}});if(!old)throw new NotFoundException();if(old.version!==input.version)throw new ConflictException('审核开关已变化，请刷新');
   if(input.enabled){const model=await this.models.resolve(tx);if(model.status.state!=='READY')throw new ConflictException('请先保存模型设置；未启用审核');
    if(!model.status.authorized){if(input.consent!==reviewUseConsent||input.modelVersion!==model.configurationVersion||input.priceVersion!==qwenModel(model.status.model)?.priceVersion)throw new BadRequestException('首次启用请确认当前模型费用和脱敏数据使用');
     await tx.modelSettings.update({where:{id:MODEL_SETTINGS_ID},data:{consent:true}});
    }
   }
   const row=await tx.commentReviewPolicy.update({where:{id},data:{enabled:input.enabled,version:{increment:1}}});await tx.auditLog.create({data:{actorId:actor.id,action:'COMMENT_REVIEW_TOGGLED',entityId:id,metadata:{enabled:row.enabled,version:row.version}}});return row;
  });
 }
 async posts(actor:Actor,offset:number){requireAdmin(actor);const rows=await this.db.capturedPost.findMany({orderBy:[{lastSeenAt:'desc'},{id:'asc'}],skip:offset,take:21,select:{id:true,snapshot:true,_count:{select:{comments:true}}}});return {items:rows.slice(0,20).map(p=>({id:p.id,title:typeof (p.snapshot as any)?.title==='string'?(p.snapshot as any).title:'未提供标题',comments:p._count.comments})),hasMore:rows.length>20};}
 async prepare(actor:Actor,id:string,input:z.infer<typeof reviewPrepareSchema>){
  requireAdmin(actor);input=reviewPrepareSchema.parse(input);
  return this.db.$transaction(async tx=>{await lockReview(tx);const policy=await tx.commentReviewPolicy.findUnique({where:{id}});if(!policy||policy.version!==input.version)throw new ConflictException('审核需求已变化，请刷新');if(!policy.enabled)throw new ConflictException('审核关闭；原文仍保留');
   const model=(await this.models.resolve(tx)).status;if(model.state!=='READY'||!model.authorized)throw new ConflictException('模型尚未授权，请先确认使用');
   const posts=input.scope.kind==='POSTS'?input.scope.postIds:[];
   if(posts.length&&await tx.capturedPost.count({where:{id:{in:posts}}})!==posts.length)throw new ConflictException('所选帖子不存在，请刷新');
   const existing=await tx.semanticReview.findMany({where:{policyId:id,policyRevision:policy.revision,selectedModel:model.model,reviewStatus:'PENDING',OR:[{state:{in:['UNANALYSED','UNCONFIGURED','FAILED']}},{state:'PROCESSING',leaseUntil:{lt:new Date()}}],...(posts.length?{capture:{postId:{in:posts}}}:{})},orderBy:[{createdAt:'asc'},{id:'asc'}],take:5,select:{id:true}});
   const reviewIds=existing.map(r=>r.id);
   // DISTINCT content avoids duplicate copies collected through different searches.
   const candidates=await tx.$queryRaw<{id:string}[]>(Prisma.sql`SELECT DISTINCT ON(c."contentHash") c.id FROM "CapturedComment" c WHERE ${posts.length?Prisma.sql`c."postId" IN (${Prisma.join(posts)})`:Prisma.sql`TRUE`} AND NOT EXISTS (SELECT 1 FROM "SemanticReview" r WHERE r."policyId"=${id} AND r."policyRevision"=${policy.revision} AND r."selectedModel"=${model.model} AND r."sourceContentHash"=c."contentHash") ORDER BY c."contentHash",c."createdAt",c.id LIMIT ${5-reviewIds.length}`);
   const rows=await tx.capturedComment.findMany({where:{id:{in:candidates.map(c=>c.id)}}});
   const rules={version:1, target:policy.target, reviewThreshold:0};
   for(const c of rows){const s=c.snapshot as unknown as SemanticSnapshot,hash=semanticHash({policyId:id,revision:policy.revision,content:c.contentHash,model:model.model});const row=await tx.semanticReview.create({data:{policyId:id,policyRevision:policy.revision,sourceContentHash:c.contentHash,configId:c.configId,runId:c.runId,revision:policy.revision,captureId:c.id,analysisKey:hash,snapshotHash:hash,selectedModel:model.model,ruleHash:semanticHash(rules),contextVersion:c.contextVersion,platform:(await tx.collectionConfig.findUniqueOrThrow({where:{id:c.configId},select:{platform:true}})).platform,platformUserId:s.userId,snapshot:c.snapshot as Prisma.InputJsonValue,rules,isDemo:c.isDemo,state:'UNANALYSED',reason:'独立评论审核 · 等待逐批确认'}});reviewIds.push(row.id);}
   return {reviewIds,count:reviewIds.length,scope:input.scope,revision:policy.revision};
  });
 }
 async results(actor:Actor,id:string|undefined,offset:number){requireAdmin(actor);const where=id?{policyId:id}:{policyId:null};const [items,total]=await Promise.all([this.db.semanticReview.findMany({where,orderBy:[{createdAt:'desc'},{id:'asc'}],skip:offset,take:20}),this.db.semanticReview.count({where})]);return {items:items.map(r=>({...r,eligibility:{canSend:false,blockers:['独立审核不创建销售线索或授予联系权限','真实发送关闭']}})),total,hasMore:offset+items.length<total};}
}
