import {outputFailureReason,modelOutputFailure} from '@crm/contracts';
import {semanticInputPolicy} from '@crm/contracts';
import { ConflictException, Inject, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SemanticEvaluateRequest, SemanticSnapshot, semanticRulesSchema, semanticEvaluateRequestSchema, semanticBatchConsent } from '@crm/contracts';
import { Db } from '../common/db';
import { Actor, requireAdmin } from '../auth/security';
import { QwenError, QwenSettings, QwenTransport, requestQwen } from './qwen-provider';
import { prepareOutbound, previewHash, validateQwenEvidence } from './semantic-redaction';
import { qwenModel } from '../../../../runtime/qwen-models.cjs';
import { semanticHash } from './capture-archive';
import {ModelSettingsService,MODEL_SETTINGS_ID} from '../model-settings/model-settings.service';
export const QWEN_TEST_OPTIONS=Symbol('QWEN_TEST_OPTIONS');
type Options={settings?:()=>QwenSettings;transport:QwenTransport};
const startOfDay=()=>{const d=new Date();d.setUTCHours(0,0,0,0);return d;};
@Injectable()
export class QwenMatchingService {
 constructor(@Inject(Db) private db:Db,@Optional() @Inject(QWEN_TEST_OPTIONS) private options?:Options,@Optional() @Inject(ModelSettingsService) private modelSettings?:ModelSettingsService){}
 private async settings(db:Db|Prisma.TransactionClient=this.db,includeKey=false,authorization?:typeof semanticBatchConsent){return this.options?.settings?{...this.options.settings(),configurationVersion:0}:await (this.modelSettings??new ModelSettingsService(this.db)).resolve(db,includeKey,authorization);}
 async status(db:Db|Prisma.TransactionClient=this.db,configId?:string,independentControl?:{enabled:boolean;version:number}){
  const status=(await this.settings(db)).status,model=qwenModel(status.model);
  const connection={...status,...(model?{priceVersion:model.priceVersion,priceDescription:model.priceDescription}:{})};
  const [totals,last,unknown,active]=await Promise.all([
   db.semanticModelCall.aggregate({where:{createdAt:{gte:startOfDay()}},_count:{_all:true},_sum:{inputTokens:true,outputTokens:true}}),
   db.semanticModelCall.findFirst({orderBy:{createdAt:'desc'},select:{status:true,createdAt:true}}),
   db.semanticModelCall.count({where:{createdAt:{gte:startOfDay()},inputTokens:null}}),
   db.semanticModelCall.count({where:{status:'RESERVED',reservedUntil:{gt:new Date()}}}),
  ]);
  const control=independentControl??(configId?(await db.semanticControl.findUnique({where:{configId}})||{enabled:false,version:0}):{enabled:false,version:0});
  return {connection,control,usage:{requests:totals._count._all,dailyLimit:connection.dailyLimit,inputTokens:totals._sum.inputTokens||0,outputTokens:totals._sum.outputTokens||0,unknownUsage:unknown,lastStatus:last?.status||null,canCall:control.enabled&&connection.state==='READY'&&(connection.dailyLimit===null||totals._count._all<connection.dailyLimit)&&!active&&(!last||Date.now()-last.createdAt.getTime()>=30000)}};
 }
 private async batch(configId:string,db:Db|Prisma.TransactionClient=this.db,reviewIds?:string[]){
  const config=await db.collectionConfig.findUnique({where:{id:configId}});
  if(!config?.semanticRules||config.archivedAt)throw new ConflictException('语义审核未启用；不会自动改写配置');
  const rules=semanticRulesSchema.parse(config.semanticRules),settings=await this.settings(db);
  const rows=await db.semanticReview.findMany({where:{configId,policyId:null,...(reviewIds?{id:{in:reviewIds}}:{}),AND:[{OR:[{selectedModel:null},{selectedModel:settings.status.model}]},{OR:[{ruleHash:semanticHash(rules)},{ruleHash:null,revision:config.revision}]}],reviewStatus:'PENDING',OR:[{state:{in:['UNANALYSED','UNCONFIGURED','FAILED']}},{state:'PROCESSING',leaseUntil:{lt:new Date()}}]},orderBy:[{createdAt:'asc'},{id:'asc'}],take:5});
  const inputs=rows.map(r=>({id:r.id,snapshot:r.snapshot as unknown as SemanticSnapshot,rules}));
  let payload;try{payload=prepareOutbound(inputs);if(Buffer.byteLength(JSON.stringify(payload))>48000)throw new QwenError('PAYLOAD_LIMIT');}catch{throw new ConflictException('评论为空、输入超限或上下文安全检查未通过，已阻止外发');}
  return {config,rows,inputs,payload,settingsVersion:settings.configurationVersion,model:settings.status.model,hash:previewHash(payload,rows,config.revision,settings.status.model+':'+settings.configurationVersion+':'+qwenModel(settings.status.model)?.priceVersion)};
 }
 async preview(actor:Actor,configId:string,reviewIds?:string[]){requireAdmin(actor);const b=await this.batch(configId,this.db,reviewIds);return {hash:b.hash,revision:b.config.revision,payload:b.payload,count:b.rows.length,...(reviewIds?{reviewIds}:{}),...await this.status(this.db,configId)};}
 async evaluate(actor:Actor,configId:string,input:SemanticEvaluateRequest){
  requireAdmin(actor);input=semanticEvaluateRequestSchema.parse(input);
  const reserved=await this.db.$transaction(async tx=>{
   // Global short transaction serializes budget, cooldown, reservations and idempotency across configurations.
   await tx.$queryRaw`SELECT pg_advisory_xact_lock(63967, 210003)::text`;
   const previous=await tx.semanticModelCall.findUnique({where:{requestKey:input.requestKey}});
   if(previous){if(previous.configId!==configId||previous.actorId!==actor.id||previous.previewHash!==input.previewHash)throw new ConflictException('请求标识已被使用');return {previous};}
   await tx.$queryRaw`SELECT id FROM "CollectionConfig" WHERE id=${configId} FOR UPDATE`;
   const {usage}=await this.status(tx,configId);if(!usage.canCall)throw new ConflictException('LLM开关关闭、模型未就绪、每日次数上限已到、已有请求或处于30秒冷却期；未外发');
   const b=await this.batch(configId,tx,input.reviewIds);
   if(!b.rows.length||b.hash!==input.previewHash)throw new ConflictException('批次或规则已变化，请重新预览');
   if(input.priceVersion!==qwenModel(b.model)?.priceVersion)throw new ConflictException('模型价格已变化，请重新预览并确认价格');
   const until=new Date(Date.now()+60000);
   for(const row of b.rows){const claim=await tx.semanticReview.updateMany({where:{id:row.id,version:row.version,reviewStatus:'PENDING'},data:{state:'PROCESSING',leaseUntil:until,version:{increment:1}}});if(claim.count!==1)throw new ConflictException('批次已变化，请刷新');}
   const call=await tx.semanticModelCall.create({data:{requestKey:input.requestKey,previewHash:input.previewHash,configId,actorId:actor.id,status:'RESERVED',rows:b.rows.length,reservedUntil:until}});
   return {call,b};
  });
  if('previous' in reserved)return {callId:reserved.previous!.id,status:reserved.previous!.status,errorCode:reserved.previous!.errorCode,outputFailure:modelOutputFailure(reserved.previous!.errorCode),reused:true};
  const {call,b}=reserved;
  let outputs:ReturnType<typeof validateQwenEvidence>=[],usage:{inputTokens:number;outputTokens:number}|null=null,errorCode:string|null=null;
  try{
   // Serialize the actual start with replacement/deletion and the per-config switch.
   // The transport starts while the short locks are held; response I/O is awaited outside.
   let flight:Promise<{response?:Awaited<ReturnType<typeof requestQwen>>;error?:unknown}>|undefined;
   await this.db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(63967,210003)::text`;
    await tx.$queryRaw`SELECT id FROM "CollectionConfig" WHERE id=${configId} FOR UPDATE`;
    if(!(await tx.semanticControl.findUnique({where:{configId}}))?.enabled)throw new QwenError('SWITCH_OFF');
    let settings=await this.settings(tx);
    if(settings.configurationVersion!==b.settingsVersion||settings.status.model!==b.model)throw new QwenError('MODEL_SETTINGS_CHANGED');
    const current=await tx.collectionConfig.findUniqueOrThrow({where:{id:configId}});
    if(current.archivedAt||semanticHash(current.semanticRules)!==semanticHash(b.config.semanticRules))throw new QwenError('RULES_CHANGED');
    settings=await this.settings(tx,true,input.consent);
    if(settings.status.state!=='READY'||!settings.key)throw new QwenError('CONFIG_BLOCKED');
    // Persist initial use consent only after validated batch/price consent and all dispatch guards.
    // A saved Key alone never grants this permission. Injected test settings have no persisted record.
    if(!this.options?.settings)await tx.modelSettings.updateMany({where:{id:MODEL_SETTINGS_ID,version:b.settingsVersion},data:{consent:true,consentInputPolicy:semanticInputPolicy}});
    flight=requestQwen(settings,b.payload,this.options?.transport).then(response=>({response}),error=>({error}));
   });
   const outcome=await flight!;if(outcome.error)throw outcome.error;const response=outcome.response!;usage=response.usage;outputs=validateQwenEvidence(response.result,b.payload,b.inputs);
  }catch(error){errorCode=error instanceof QwenError?error.code:'INVALID_RESPONSE';}
  let status=errorCode?'FAILED':'COMPLETED';
  await this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "CollectionConfig" WHERE id=${configId} FOR UPDATE`;
   const current=await tx.collectionConfig.findUniqueOrThrow({where:{id:configId}});
   const stale=semanticHash(current.semanticRules)!==semanticHash(b.config.semanticRules)||!!current.archivedAt;if(stale)status='STALE';
   for(const row of b.rows){const output=outputs.find(o=>o.id===row.id);await tx.semanticReview.updateMany({where:{id:row.id,version:row.version+1,state:'PROCESSING',reviewStatus:'PENDING'},data:{state:!stale&&!errorCode?'EVALUATED':'FAILED',score:!stale&&!errorCode&&output?output.score:null,reason:stale?'规则已变化，保持待审核':errorCode?(outputFailureReason(errorCode)||`评估失败（${errorCode}），并非低匹配；保持待审核`):output?.reason,context:!stale&&!errorCode&&output?output.context:'INSUFFICIENT',result:!stale&&!errorCode&&output?output:Prisma.DbNull,evaluationInput:b.payload,provider:'QWEN',modelVersion:b.model+':semantic-qwen-original-v2',leaseUntil:null,version:{increment:1}}});}
   await tx.semanticModelCall.update({where:{id:call.id},data:{status:stale?'STALE':status,errorCode,finishedAt:new Date(),...usage}});
   await tx.auditLog.create({data:{actorId:actor.id,entityId:configId,action:'SEMANTIC_QWEN_MANUAL',metadata:{callId:call.id,status:stale?'STALE':status,count:b.rows.length,redactionVersion:b.payload.redactionVersion,inputPolicyVersion:b.payload.inputPolicyVersion}}});
  });
  return {callId:call.id,status,processed:b.rows.length,errorCode,outputFailure:modelOutputFailure(errorCode),canSend:false};
 }
}
