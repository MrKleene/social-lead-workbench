import {BadRequestException,ConflictException,Inject,Injectable,Optional} from '@nestjs/common';
import {semanticBatchConsent} from '@crm/contracts';
import {Prisma} from '@prisma/client';
import {Db} from '../common/db';
import {Actor,requireAdmin} from '../auth/security';
import {DEFAULT_QWEN_MODEL,QWEN_PRICE_VERSION,qwenModel,qwenModelChoices} from '../../../../runtime/qwen-models.cjs';
import {encrypt,decrypt,probe,VaultError} from '../../../../runtime/model-vault.cjs';
import type {QwenSettings} from '../collection/qwen-provider';
export const MODEL_SETTINGS_ID='qwen-comment-matching';
export const MODEL_VAULT_OPTIONS=Symbol('MODEL_VAULT_OPTIONS');
type Database=Db|Prisma.TransactionClient;
export type ModelSave={version:number;model:string;endpoint:'beijing-standard';dailyLimit?:number|null;confirmUnlimited?:boolean;note:string;key?:string;priceVersion:string;confirmPricing?:boolean;consent?:boolean};
export const vaultMessages:Record<string,string>={READY:'本机密钥库就绪',MASTER_MISSING:'本机主密钥尚未初始化或已丢失；请恢复原主密钥，首次使用需单独初始化',MASTER_UNSAFE:'主密钥文件路径或权限不安全；已阻断，未自动修复',MASTER_UNAVAILABLE:'无法访问本机主密钥；已阻断',MASTER_MISMATCH:'主密钥与数据库密文不匹配或密文损坏；请恢复配套备份，切勿覆盖主密钥'};
@Injectable()
export class ModelSettingsService {
 constructor(@Inject(Db) private db:Db,@Optional() @Inject(MODEL_VAULT_OPTIONS) private options?:{file:string}){}
 private file(){return this.options?.file??process.env.CRM_MODEL_VAULT_FILE;}
 async resolve(db:Database=this.db,includeKey=false,authorization?:typeof semanticBatchConsent):Promise<QwenSettings&{configurationVersion:number}>{
  const row=await db.modelSettings.findUnique({where:{id:MODEL_SETTINGS_ID}}),model=row?.model??DEFAULT_QWEN_MODEL;
  const status:QwenSettings['status']={state:'UNCONFIGURED',message:'尚未在管理员模型设置中保存Key；不会读取或回退环境变量Key',model,region:'cn-beijing',authorized:row?.consent===true,dailyLimit:row?.dailyLimit??null,batchLimit:5,automaticRetries:0,timeoutSeconds:20};
  const version=row?.version??0;
  if(!row?.encryptedKey)return {status,configurationVersion:version};
  if(row.endpoint!=='beijing-standard'||!qwenModel(model)||row.priceVersion!==qwenModel(model)?.priceVersion||(row.dailyLimit!==null&&(!Number.isInteger(row.dailyLimit)||row.dailyLimit<1||row.dailyLimit>100)))return {status:{...status,state:'INVALID_CONFIG',message:'型号、北京端点、价目版本或次数上限失效；请管理员核查'},configurationVersion:version};
  if(includeKey&&authorization!==semanticBatchConsent)return {status:{...status,state:'UNAUTHORIZED',message:'实际调用前须逐批确认价格与数据外发'},configurationVersion:version};
  try{const key=includeKey?decrypt(this.file(),MODEL_SETTINGS_ID,row.encryptedKey):undefined;return {status:{...status,state:'READY',message:'Key已配置（不显示）；实际连通性和质量未验收。仅逐批确认后调用。'+qwenModel(model)!.priceDescription},endpoint:'https://cn-beijing.maas.qianwenaiapi.com/compatible-mode/v1/chat/completions',...(includeKey?{key}:{}),configurationVersion:version};}
  catch(e){const code=e instanceof VaultError?e.code:'MASTER_UNAVAILABLE';return {status:{...status,state:'INVALID_CONFIG',message:vaultMessages[code]||vaultMessages.MASTER_UNAVAILABLE},configurationVersion:version};}
 }
 async status(actor:Actor){
  requireAdmin(actor);const row=await this.db.modelSettings.findUnique({where:{id:MODEL_SETTINGS_ID}});const vault=probe(this.file());
  return {configured:!!row?.encryptedKey,note:row?.note||'',updatedAt:row?.updatedAt??null,version:row?.version??0,model:row?.model??DEFAULT_QWEN_MODEL,endpoint:'beijing-standard',dailyLimit:row?.dailyLimit??null,vault:{state:vault,message:vaultMessages[vault]||vaultMessages.MASTER_UNAVAILABLE},priceVersion:qwenModel(row?.model??DEFAULT_QWEN_MODEL)?.priceVersion??QWEN_PRICE_VERSION,models:qwenModelChoices(row?.model),automaticTest:false};
 }
 async save(actor:Actor,input:ModelSave){
  requireAdmin(actor);
  if(!qwenModel(input.model)||input.endpoint!=='beijing-standard'||input.priceVersion!==qwenModel(input.model)?.priceVersion||(input.dailyLimit!=null&&(!Number.isInteger(input.dailyLimit)||input.dailyLimit<1||input.dailyLimit>100)))throw new BadRequestException('请检查受控型号、北京端点、价目版本和可选次数上限');
  if(input.key!==undefined&&!/^[\x21-\x7e]{16,512}$/.test(input.key))throw new BadRequestException('Key格式无效；未保存');
  if(input.key&&input.note.includes(input.key)||/sk-[a-z0-9_-]{8,}|(?:api[_ -]?key|密钥)\s*[:=]/i.test(input.note))throw new BadRequestException('描述不能包含密钥，请仅描述用途');
  try{await this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT pg_advisory_xact_lock(63967,210003)::text`;
   const current=await tx.modelSettings.findUnique({where:{id:MODEL_SETTINGS_ID}});
   if((current?.version??0)!==input.version)throw new ConflictException('模型设置已变化，请刷新后重试');
   const dailyLimit=input.dailyLimit===undefined?(current?.dailyLimit??null):input.dailyLimit;
   if(current?.dailyLimit!=null&&dailyLimit===null&&input.confirmUnlimited!==true)throw new BadRequestException('请明确选择不限制累计调用次数；原次数上限已保留');
   if(current?.encryptedKey){const old=decrypt(this.file(),MODEL_SETTINGS_ID,current.encryptedKey);if(input.note.includes(old))throw new BadRequestException('描述不能包含密钥，请仅描述用途');}
   if(!current?.encryptedKey&&!input.key)throw new BadRequestException('请输入新的Key');
   const state=probe(this.file());if(state!=='READY')throw new VaultError(state);
   const encryptedKey=input.key?encrypt(this.file(),MODEL_SETTINGS_ID,input.key):current!.encryptedKey as Prisma.InputJsonValue;
   if(current?.encryptedKey&&(current.encryptedKey as {kid?:string}).kid!==(encryptedKey as {kid?:string}).kid)throw new VaultError('MASTER_MISMATCH');
   decrypt(this.file(),MODEL_SETTINGS_ID,encryptedKey);
   const data={model:input.model,endpoint:input.endpoint,dailyLimit,priceVersion:input.priceVersion,consent:!input.key&&current?.model===input.model&&current.priceVersion===input.priceVersion?(current.consent??false):false,note:input.note,encryptedKey};
   await tx.modelSettings.upsert({where:{id:MODEL_SETTINGS_ID},create:{id:MODEL_SETTINGS_ID,version:1,...data},update:{...data,version:{increment:1}}});
   await tx.commentReviewPolicy.updateMany({where:{autoEnabled:true},data:{autoEnabled:false,autoModelVersion:null,autoActorId:null,version:{increment:1}}});
   await tx.autoReviewJob.updateMany({where:{status:{in:['PENDING','PROCESSING']}},data:{status:'CANCELLED',reason:'模型设置已变化，请重新确认自动识别'}});
   await tx.auditLog.create({data:{actorId:actor.id,action:input.key?'MODEL_KEY_REPLACED':'MODEL_SETTINGS_UPDATED',entityId:MODEL_SETTINGS_ID,metadata:{model:input.model,version:input.version+1}}});
  });}catch(e){if(e instanceof ConflictException||e instanceof BadRequestException)throw e;throw new ConflictException(e instanceof VaultError?(vaultMessages[e.code]||vaultMessages.MASTER_UNAVAILABLE):'保存失败；原配置保留，未发起模型请求');}
  return this.status(actor);
 }
 async remove(actor:Actor,version:number,confirmation:string){
  requireAdmin(actor);if(confirmation!=='DELETE_MODEL_KEY')throw new BadRequestException('请再次确认删除本机Key');
  await this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT pg_advisory_xact_lock(63967,210003)::text`;
   const row=await tx.modelSettings.findUnique({where:{id:MODEL_SETTINGS_ID}});if(!row||row.version!==version)throw new ConflictException('模型设置已变化，请刷新');
   await tx.modelSettings.update({where:{id:row.id},data:{encryptedKey:Prisma.DbNull,note:'',consent:false,version:{increment:1}}});
   await tx.commentReviewPolicy.updateMany({where:{autoEnabled:true},data:{autoEnabled:false,autoModelVersion:null,autoActorId:null,version:{increment:1}}});
   await tx.autoReviewJob.updateMany({where:{status:{in:['PENDING','PROCESSING']}},data:{status:'CANCELLED',reason:'模型设置已变化，请重新确认自动识别'}});
   await tx.auditLog.create({data:{actorId:actor.id,action:'MODEL_KEY_REMOVED',entityId:row.id,metadata:{version:version+1}}});
  });return this.status(actor);
 }
}
