import {ConflictException} from '@nestjs/common';
import {z} from 'zod';
import type {Db} from '../common/db';
import {requireAdmin,type Actor} from '../auth/security';
export const automationPreferenceInput=z.object({version:z.number().int().nonnegative(),configId:z.string().min(1).max(200).optional(),policyId:z.string().min(1).max(200).optional()}).strict();
export async function readAutomationPreferences(db:Db,actor:Actor){requireAdmin(actor);return await db.automationPreferences.findUnique({where:{id:'workspace'}})??{id:'workspace',version:0,configId:null,policyId:null};}
export async function saveAutomationPreferences(db:Db,actor:Actor,input:z.infer<typeof automationPreferenceInput>){
 requireAdmin(actor);return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(63967,210003)::text`;
  const old=await tx.automationPreferences.findUnique({where:{id:'workspace'}});
  if((old?.version??0)!==input.version)throw new ConflictException('当前选用方案已变化，请刷新');
  if(input.configId&&!await tx.collectionConfig.findFirst({where:{id:input.configId,archivedAt:null}}))throw new ConflictException('关键词组已不存在');
  if(input.policyId&&!await tx.commentReviewPolicy.findUnique({where:{id:input.policyId}}))throw new ConflictException('匹配方案已不存在');
  if(input.policyId&&input.policyId!==old?.policyId){
   const previous=await tx.commentReviewPolicy.findMany({where:{autoEnabled:true,id:{not:input.policyId}},select:{id:true}});
   await tx.commentReviewPolicy.updateMany({where:{id:{in:previous.map(p=>p.id)}},data:{autoEnabled:false,autoActorId:null,autoModelVersion:null,version:{increment:1}}});
   await tx.autoReviewJob.updateMany({where:{policyId:{in:previous.map(p=>p.id)},status:{in:['PENDING','PROCESSING']}},data:{status:'CANCELLED',reason:'选用匹配方案已变化'}});
  }
  const {version,...patch}=input;
  const row=await tx.automationPreferences.upsert({where:{id:'workspace'},create:{id:'workspace',...patch},update:{...patch,version:{increment:1}}});
  await tx.auditLog.create({data:{actorId:actor.id,entityId:'workspace',action:'AUTOMATION_SELECTION_SAVED',metadata:{...patch,version:row.version}}});return row;
 });
}
