import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { prepareOutbound } from './semantic-redaction';
import { semanticRulesSchema, SemanticSnapshot } from '@crm/contracts';
import { qwenModel } from '../../../../runtime/qwen-models.cjs';
import {readRunPostFeed} from './run-post-feed';
import { Db } from '../common/db';
import { Actor, requireAdmin } from '../auth/security';
import { enqueueCaptured, selectedSemanticModel, semanticHash } from './capture-archive';
@Injectable()
export class CaptureService {
 constructor(@Inject(Db) private db:Db){}
 async runPosts(actor:Actor,configId:string,runId:string){requireAdmin(actor);return readRunPostFeed(this.db,configId,runId);}
 async control(actor:Actor,configId:string){requireAdmin(actor);if(!await this.db.collectionConfig.findUnique({where:{id:configId}}))throw new NotFoundException();return await this.db.semanticControl.findUnique({where:{configId}})||{configId,enabled:false,version:0};}
 async toggle(actor:Actor,configId:string,input:{enabled:boolean;version:number}){
  requireAdmin(actor);return this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "CollectionConfig" WHERE id=${configId} FOR UPDATE`;
   const config=await tx.collectionConfig.findUnique({where:{id:configId}});if(!config||config.archivedAt)throw new NotFoundException();
   const current=await tx.semanticControl.findUnique({where:{configId}});if((current?.version||0)!==input.version)throw new ConflictException('开关已变化，请刷新');
   const row=await tx.semanticControl.upsert({where:{configId},create:{configId,enabled:input.enabled,version:1},update:{enabled:input.enabled,version:{increment:1}}});
   await tx.auditLog.create({data:{actorId:actor.id,entityId:configId,action:'SEMANTIC_SWITCH_CHANGED',metadata:{enabled:row.enabled,version:row.version}}});return row;
  });
 }
 async list(actor:Actor,configId:string,offset=0){
  requireAdmin(actor);const config=await this.db.collectionConfig.findUnique({where:{id:configId}});if(!config)throw new NotFoundException();
  const [items,total,posts,postTotal,missing,control]=await Promise.all([
   this.db.capturedComment.findMany({where:{configId},orderBy:[{lastSeenAt:'desc'},{id:'asc'}],skip:offset,take:50,include:{post:{select:{coverage:true,stopReason:true}},reviews:{orderBy:{createdAt:'desc'},take:20,select:{id:true,state:true,score:true,reason:true,selectedModel:true,revision:true,result:true}}}}),
   this.db.capturedComment.count({where:{configId}}),this.db.capturedPost.findMany({where:{configId},orderBy:{lastSeenAt:'desc'},take:20}),this.db.capturedPost.count({where:{configId}}),
   this.db.$queryRaw<{count:bigint}[]>`SELECT COUNT(DISTINCT o."platformCommentId") AS count FROM "CommentObservation" o JOIN "MonitorPost" p ON p.id=o."monitorId" WHERE p."configId"=${configId} AND NOT EXISTS(SELECT 1 FROM "CapturedComment" c WHERE c."configId"=p."configId" AND c."platformCommentId"=o."platformCommentId")`,this.control(actor,configId)
  ]);return {items,total,offset,hasMore:offset+items.length<total,posts,postTotal,legacyWithoutSnapshot:Number(missing[0]?.count||0),control,model:await selectedSemanticModel(this.db),hasRules:!!config.semanticRules};
 }
 async preview(actor:Actor,configId:string,ids:string[]){
  requireAdmin(actor);const config=await this.db.collectionConfig.findUnique({where:{id:configId}});if(!config?.semanticRules)throw new ConflictException('请先保存自然语言目标');
  const rows=await this.db.capturedComment.findMany({where:{configId,id:{in:ids}},orderBy:{id:'asc'}});if(rows.length!==ids.length)throw new ConflictException('所选原文不存在');
  try{return {payload:prepareOutbound(rows.map(c=>({id:c.id,snapshot:c.snapshot as unknown as SemanticSnapshot,rules:semanticRulesSchema.parse(config.semanticRules)}))),count:rows.length};}catch{throw new ConflictException('文本包含无法可靠处理的身份或联系线索，已阻止外发（DATA_BLOCKED）');}
 }
 async enqueue(actor:Actor,configId:string,ids:string[]){
  requireAdmin(actor);return this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "CollectionConfig" WHERE id=${configId} FOR UPDATE`;
   const config=await tx.collectionConfig.findUnique({where:{id:configId}}),control=await tx.semanticControl.findUnique({where:{configId}});
   if(!config||config.archivedAt||!config.semanticRules)throw new ConflictException('请先保存自然语言目标；不会自动改写原规则');
   if(!control?.enabled)throw new ConflictException('LLM语义匹配开关关闭；不会入队或请求模型');
   const model=await selectedSemanticModel(tx);
   if(!qwenModel(model))throw new ConflictException('当前型号未验证；未入队');
   const rows=await tx.capturedComment.findMany({where:{configId,id:{in:ids}}});if(rows.length!==ids.length)throw new ConflictException('所选原文不存在或不属于当前配置');
   let added=0;const reviewIds:string[]=[];
   for(const c of rows){added+=await enqueueCaptured(tx,c,config,model);const review=await tx.semanticReview.findFirst({where:{captureId:c.id,selectedModel:model,ruleHash:semanticHash(config.semanticRules)},orderBy:{createdAt:'desc'}});if(review)reviewIds.push(review.id);}
   return {added,reused:rows.length-added,reviewIds,canSend:false};
  });
 }
}
