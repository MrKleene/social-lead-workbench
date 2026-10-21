import { ConflictException, Inject, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SemanticEvaluateRequest, SemanticSnapshot, semanticRulesSchema, semanticEvaluateRequestSchema } from '@crm/contracts';
import { Db } from '../common/db';
import { Actor, requireAdmin } from '../auth/security';
import { QwenError, QwenSettings, QwenTransport, qwenSettings, requestQwen } from './qwen-provider';
import { prepareOutbound, previewHash, validateQwenEvidence } from './semantic-redaction';
import { QWEN_PRICE_VERSION } from '../../../../runtime/qwen-models.cjs';
export const QWEN_TEST_OPTIONS=Symbol('QWEN_TEST_OPTIONS');
type Options={settings:()=>QwenSettings;transport:QwenTransport};
const startOfDay=()=>{const d=new Date();d.setUTCHours(0,0,0,0);return d;};
@Injectable()
export class QwenMatchingService {
 constructor(@Inject(Db) private db:Db,@Optional() @Inject(QWEN_TEST_OPTIONS) private options?:Options){}
 private settings(){return this.options?.settings()??qwenSettings(process.env);}
 async status(db:Db|Prisma.TransactionClient=this.db){
  const connection=this.settings().status;
  const [totals,last,unknown,active]=await Promise.all([
   db.semanticModelCall.aggregate({where:{createdAt:{gte:startOfDay()}},_count:{_all:true},_sum:{inputTokens:true,outputTokens:true}}),
   db.semanticModelCall.findFirst({orderBy:{createdAt:'desc'},select:{status:true,createdAt:true}}),
   db.semanticModelCall.count({where:{createdAt:{gte:startOfDay()},inputTokens:null}}),
   db.semanticModelCall.count({where:{status:'RESERVED',reservedUntil:{gt:new Date()}}}),
  ]);
  return {connection,usage:{requests:totals._count._all,dailyLimit:connection.dailyLimit,inputTokens:totals._sum.inputTokens||0,outputTokens:totals._sum.outputTokens||0,unknownUsage:unknown,lastStatus:last?.status||null,canCall:connection.state==='READY'&&totals._count._all<connection.dailyLimit&&!active&&(!last||Date.now()-last.createdAt.getTime()>=30000)}};
 }
 private async batch(configId:string,db:Db|Prisma.TransactionClient=this.db){
  const config=await db.collectionConfig.findUnique({where:{id:configId}});
  if(!config?.semanticRules||!config.enabled||config.archivedAt)throw new ConflictException('语义审核未启用；不会自动改写配置');
  const rules=semanticRulesSchema.parse(config.semanticRules);
  const rows=await db.semanticReview.findMany({where:{configId,revision:config.revision,reviewStatus:'PENDING',OR:[{state:{in:['UNCONFIGURED','FAILED']}},{state:'PROCESSING',leaseUntil:{lt:new Date()}}]},orderBy:[{createdAt:'asc'},{id:'asc'}],take:5});
  const inputs=rows.map(r=>({id:r.id,snapshot:r.snapshot as unknown as SemanticSnapshot,rules}));
  let payload;try{payload=prepareOutbound(inputs);}catch{throw new ConflictException('文本包含无法可靠处理的身份/联系线索，已阻止外发（DATA_BLOCKED）');}
  return {config,rows,inputs,payload,hash:previewHash(payload,rows,config.revision,this.settings().status.model+':'+QWEN_PRICE_VERSION)};
 }
 async preview(actor:Actor,configId:string){requireAdmin(actor);const b=await this.batch(configId);return {hash:b.hash,revision:b.config.revision,payload:b.payload,count:b.rows.length,...await this.status()};}
 async evaluate(actor:Actor,configId:string,input:SemanticEvaluateRequest){
  requireAdmin(actor);input=semanticEvaluateRequestSchema.parse(input);
  const settings=this.settings();
  const reserved=await this.db.$transaction(async tx=>{
   // Global short transaction serializes budget, cooldown, reservations and idempotency across configurations.
   await tx.$queryRaw`SELECT pg_advisory_xact_lock(63967, 210003)::text`;
   const previous=await tx.semanticModelCall.findUnique({where:{requestKey:input.requestKey}});
   if(previous){if(previous.configId!==configId||previous.actorId!==actor.id||previous.previewHash!==input.previewHash)throw new ConflictException('请求标识已被使用');return {previous};}
   const {usage}=await this.status(tx);if(!usage.canCall)throw new ConflictException('模型未就绪、每日预算耗尽、已有请求或处于30秒冷却期；未外发');
   await tx.$queryRaw`SELECT id FROM "CollectionConfig" WHERE id=${configId} FOR UPDATE`;
   const b=await this.batch(configId,tx);
   if(!b.rows.length||b.hash!==input.previewHash)throw new ConflictException('批次或规则已变化，请重新预览');
   const until=new Date(Date.now()+60000);
   for(const row of b.rows){const claim=await tx.semanticReview.updateMany({where:{id:row.id,version:row.version,reviewStatus:'PENDING'},data:{state:'PROCESSING',leaseUntil:until,version:{increment:1}}});if(claim.count!==1)throw new ConflictException('批次已变化，请刷新');}
   const call=await tx.semanticModelCall.create({data:{requestKey:input.requestKey,previewHash:input.previewHash,configId,actorId:actor.id,status:'RESERVED',rows:b.rows.length,reservedUntil:until}});
   return {call,b};
  });
  if('previous' in reserved)return {callId:reserved.previous!.id,status:reserved.previous!.status,reused:true};
  const {call,b}=reserved;
  let outputs:ReturnType<typeof validateQwenEvidence>=[],usage:{inputTokens:number;outputTokens:number}|null=null,errorCode:string|null=null;
  try{const response=await requestQwen(settings,b.payload,this.options?.transport);usage=response.usage;outputs=validateQwenEvidence(response.result,b.payload,b.inputs);}catch(error){errorCode=error instanceof QwenError?error.code:'INVALID_RESPONSE';}
  let status=errorCode?'FAILED':'COMPLETED';
  await this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "CollectionConfig" WHERE id=${configId} FOR UPDATE`;
   const current=await tx.collectionConfig.findUniqueOrThrow({where:{id:configId}});
   const stale=current.revision!==b.config.revision||!current.enabled||!!current.archivedAt;if(stale)status='STALE';
   for(const row of b.rows){const output=outputs.find(o=>o.id===row.id);await tx.semanticReview.updateMany({where:{id:row.id,version:row.version+1,state:'PROCESSING',reviewStatus:'PENDING'},data:{state:!stale&&!errorCode?'EVALUATED':'FAILED',score:!stale&&!errorCode&&output?output.score:null,reason:stale?'规则已变化，保持待审核':errorCode?`评估失败（${errorCode}），并非低匹配；保持待审核`:output?.reason,context:!stale&&!errorCode&&output?output.context:'INSUFFICIENT',result:!stale&&!errorCode&&output?output:Prisma.DbNull,evaluationInput:b.payload,provider:'QWEN',modelVersion:settings.status.model+':semantic-qwen-v1',leaseUntil:null,version:{increment:1}}});}
   await tx.semanticModelCall.update({where:{id:call.id},data:{status:stale?'STALE':status,errorCode,finishedAt:new Date(),...usage}});
   await tx.auditLog.create({data:{actorId:actor.id,entityId:configId,action:'SEMANTIC_QWEN_MANUAL',metadata:{callId:call.id,status:stale?'STALE':status,count:b.rows.length,redactionVersion:b.payload.redactionVersion}}});
  });
  return {callId:call.id,status,processed:b.rows.length,errorCode,canSend:false};
 }
}
