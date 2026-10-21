import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { semanticOutputSchema, semanticRulesSchema, SemanticSnapshot } from '@crm/contracts';
import { Db } from '../common/db';
import { Actor, requireAdmin } from '../auth/security';
import { evaluateSemanticBatch, SemanticModelAdapter, sendEligibility, SEMANTIC_PROMPT_VERSION } from './semantic-evaluator';
export const SEMANTIC_MODEL=Symbol('SEMANTIC_MODEL');
@Injectable()
export class SemanticService {
 constructor(@Inject(Db) private db:Db,@Optional() @Inject(SEMANTIC_MODEL) private adapter?:SemanticModelAdapter){}
 async list(actor:Actor,configId:string,offset=0){
  requireAdmin(actor);
  const config=await this.db.collectionConfig.findUnique({where:{id:configId}});if(!config)throw new NotFoundException();
  const [rows,total]=await Promise.all([this.db.semanticReview.findMany({where:{configId},orderBy:[{score:{sort:'desc',nulls:'last'}},{createdAt:'desc'},{id:'asc'}],skip:offset,take:50}),this.db.semanticReview.count({where:{configId}})]);
  const identities=await this.db.platformIdentity.findMany({where:{platform:config.platform,platformUserId:{in:rows.map(r=>r.platformUserId)}},include:{lead:true,contactLedger:true}});
  const duplicates=await this.db.semanticReview.groupBy({by:['platformUserId'],where:{platform:config.platform,platformUserId:{in:rows.map(r=>r.platformUserId)}},_count:{_all:true}});
  return {configured:false as const,provider:'NONE' as const,total,offset,hasMore:offset+rows.length<total,items:rows.map(row=>{
   const identity=identities.find(i=>i.platformUserId===row.platformUserId),rules=semanticRulesSchema.parse(row.rules);
   return {...row,eligibility:sendEligibility({state:row.state,score:row.score,context:row.context,reviewStatus:row.reviewStatus,threshold:rules.reviewThreshold,stale:row.revision!==config.revision||!config.enabled||!!config.archivedAt,duplicate:(duplicates.find(d=>d.platformUserId===row.platformUserId)?._count._all||0)>1,contacted:!!identity?.contactLedger||!!identity?.lead?.contactedAt||['CONTACTED','INTERESTED'].includes(identity?.lead?.contactStage||''),doNotContact:!!identity?.lead?.doNotContact,platformReady:false,isDemo:row.isDemo})};
  })};
 }
 async evaluate(actor:Actor,configId:string){
  requireAdmin(actor);
  // No external adapter or configuration/secret lookup in this release.
  if(!this.adapter)return {configured:false,processed:0,reason:'模型未配置；未请求外部服务'};
  if(this.adapter.kind!=='LOCAL_TEST')throw new BadRequestException('尚未授权外部模型与数据范围');
  const config=await this.db.collectionConfig.findUnique({where:{id:configId}});
  if(!config?.semanticRules||!config.enabled||config.archivedAt)throw new ConflictException('语义审核未启用');
  const rules=semanticRulesSchema.parse(config.semanticRules);
  const candidates=await this.db.semanticReview.findMany({where:{configId,revision:config.revision,isDemo:true,reviewStatus:'PENDING',OR:[{state:{in:['UNCONFIGURED','FAILED']}},{state:'PROCESSING',leaseUntil:{lt:new Date()}}]},orderBy:{createdAt:'asc'},take:10});
  const claimed=[];
  for(const row of candidates){const claim=await this.db.semanticReview.updateMany({where:{id:row.id,version:row.version,reviewStatus:'PENDING'},data:{state:'PROCESSING',leaseUntil:new Date(Date.now()+30000),version:{increment:1}}});if(claim.count)claimed.push(row);}
  if(!claimed.length)return {configured:false,processed:0};
  const outcome=await evaluateSemanticBatch(claimed.map(r=>({id:r.id,snapshot:r.snapshot as unknown as SemanticSnapshot,rules})),this.adapter);
  let processed=0;
  for(const row of claimed){const output=outcome.outputs.find(x=>x.id===row.id);
   await this.db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "CollectionConfig" WHERE id=${configId} FOR UPDATE`;
    const current=await tx.collectionConfig.findUniqueOrThrow({where:{id:configId}});
    const stale=current.revision!==row.revision||!current.enabled||!!current.archivedAt;
    const saved=await tx.semanticReview.updateMany({where:{id:row.id,version:row.version+1,state:'PROCESSING',reviewStatus:'PENDING'},data:{state:stale?'FAILED':outcome.state,score:!stale&&output?output.score:null,reason:stale?'规则已变化，请核查新版本':output?.reason||outcome.reason,context:!stale&&output?output.context:'INSUFFICIENT',result:!stale&&output?output:Prisma.DbNull,provider:'LOCAL_TEST',modelVersion:SEMANTIC_PROMPT_VERSION+':'+this.adapter!.name+':'+this.adapter!.version,leaseUntil:null,version:{increment:1}}});
    if(saved.count){processed++;await tx.auditLog.create({data:{actorId:actor.id,entityId:row.id,action:'SEMANTIC_EVALUATED_LOCAL_TEST',metadata:{state:outcome.state,promptVersion:SEMANTIC_PROMPT_VERSION}}});}
   });
  }
  return {configured:false,processed,localTestOnly:true};
 }
 async review(actor:Actor,id:string,input:{version:number;decision:'APPROVED'|'REJECTED';note:string}){
  requireAdmin(actor);
  return this.db.$transaction(async tx=>{
   const row=await tx.semanticReview.findUnique({where:{id}});if(!row)throw new NotFoundException();
   await tx.$queryRaw`SELECT id FROM "CollectionConfig" WHERE id=${row.configId} FOR UPDATE`;
   const config=await tx.collectionConfig.findUniqueOrThrow({where:{id:row.configId}});
   if(input.decision==='APPROVED'&&(row.state!=='EVALUATED'||row.context!=='SUFFICIENT'||!semanticOutputSchema.safeParse(row.result).success||config.revision!==row.revision||!config.enabled||!!config.archivedAt))throw new ConflictException('缺少有效评估、上下文或当前规则；保持待审核');
   const changed=await tx.semanticReview.updateMany({where:{id,version:input.version,reviewStatus:'PENDING'},data:{reviewStatus:input.decision,reviewNote:input.note,reviewedBy:actor.id,reviewedAt:new Date(),version:{increment:1}}});
   if(!changed.count)throw new ConflictException('审核记录已变化，请刷新');
   await tx.auditLog.create({data:{actorId:actor.id,entityId:id,action:'SEMANTIC_REVIEWED',metadata:{decision:input.decision,revision:row.revision}}});
   return {id,reviewStatus:input.decision,canSend:false};
  });
 }
}
