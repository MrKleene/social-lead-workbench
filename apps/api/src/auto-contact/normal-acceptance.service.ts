import {ConflictException,Inject,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {Db} from '../common/db';
import {parse} from '../common/validation';
import {requireAdmin,type Actor} from '../auth/security';
import {lockSinglePost,assertNoSinglePost} from '../collection/single-post-lock';
import {lockReview} from '../comment-review/review-policy.service';
import {contactLock} from './contact-lock';
import {ruleHash} from './contact-policy';
import {savedReadTarget} from '../collection/saved-post-read';
import {qwenModel} from '../../../../runtime/qwen-models.cjs';
import {activeAcceptance,normalAcceptanceInput,normalAcceptanceScope,acceptanceConflict} from './normal-acceptance';
/** Administrative finite envelope around normal endpoints and workers, never a sender. */
@Injectable()
export class NormalAcceptanceService {
 constructor(@Inject(Db) private db:Db){}
 async status(actor:Actor){requireAdmin(actor);return this.db.normalAutomationAcceptance.findMany({orderBy:{createdAt:'desc'},take:20});}
 async arm(actor:Actor,raw:unknown){
  requireAdmin(actor);const input=parse(normalAcceptanceInput,raw);
  return this.db.$transaction(async tx=>{
   // Same order as collection -> provider -> contact. No outbound IO under these locks.
   await lockSinglePost(tx);await assertNoSinglePost(tx);await lockReview(tx);await contactLock(tx);
   if(await activeAcceptance(tx)||await tx.normalAutomationAcceptance.findUnique({where:{id:input.id}}))throw new ConflictException('已有验收或授权标识已使用，不能重置次数');
   const [config,rule,model,user]=await Promise.all([tx.collectionConfig.findUnique({where:{id:input.configId}}),tx.autoContactRule.findUnique({where:{id:input.ruleId}}),tx.modelSettings.findFirst(),tx.user.findUnique({where:{id:actor.id}})]);
   if(!config||!rule||!model||!user?.active||user.role!=='ADMIN')acceptanceConflict();
   const policy=await tx.commentReviewPolicy.findUnique({where:{id:rule.policyId}}),catalog=qwenModel(model.model);
   const expiry=Date.parse(input.expiresAt)-Date.now();
   if(expiry<=0||expiry>1800000||config.archivedAt||!config.enabled||config.legacyMatchingEnabled||config.revision!==input.configRevision||rule.version!==input.ruleVersion||rule.enabled||rule.platform!=='XHS'||rule.channel!=='COMMENT'||rule.channels.length!==1||rule.accountIds.length!==1||!rule.content.trim()||policy?.version!==input.policyVersion||policy.autoEnabled||policy.revision!==rule.policyRevision||model.version!==input.modelVersion||model.model!==rule.model||catalog?.priceVersion!==input.priceVersion||model.priceVersion!==input.priceVersion)acceptanceConflict();
   if((rule.mode==='REAL'&&(config.mode!=='XHS_MCP'||!input.readAccountId))||(rule.mode==='SIMULATION'&&(config.mode!=='MOCK'||input.readAccountId)))acceptanceConflict();
   if(input.selection==='CONFIG_SEARCH'?(!!input.savedPostId||!!input.targets||rule.threshold!==100):(!input.savedPostId||!input.targets))acceptanceConflict();
   const target=input.savedPostId?await savedReadTarget(tx,config.id,input.savedPostId,config.mode as 'MOCK'|'XHS_MCP'):null;
   if(rule.mode==='REAL'&&target&&(!/^[a-f0-9]{24}$/.test(target.id)||input.targets!.some(t=>!(/^[a-f0-9]{24}$/.test(t.commentId)&&/^[a-f0-9]{24}$/.test(t.recipientId)))))acceptanceConflict();
   if(await tx.collectionRun.count({where:{status:{in:['QUEUED','RUNNING']}}})||await tx.collectionRun.findUnique({where:{requestKey:input.requestKey}})||await tx.autoContactRule.count({where:{enabled:true}})||await tx.commentReviewPolicy.count({where:{autoEnabled:true}})||await tx.autoContactJob.count({where:{status:{in:['RESERVED','ATTEMPTED']}}})||await tx.autoReviewJob.count({where:{status:'PROCESSING'}})||await tx.semanticModelCall.count({where:{status:'RESERVED'}})||await tx.deviceExecutionLease.count())throw new ConflictException('请先核查并结束其他活动任务、规则和租约；未自动取消或重放旧任务');
   const {consent,...bound}=input;
   const scope=normalAcceptanceScope.parse({...bound,ruleVersion:rule.version+1,policyVersion:policy.version+1,platformPostId:target?.id,replyAccountId:rule.accountIds[0],ruleHash:ruleHash({...rule,version:rule.version+1}),policyId:policy.id,policyRevision:policy.revision,model:model.model,mode:rule.mode});
   const row=await tx.normalAutomationAcceptance.create({data:{id:input.id,actorId:actor.id,scope:scope as Prisma.InputJsonValue}});
   await tx.auditLog.create({data:{actorId:actor.id,entityId:row.id,action:'NORMAL_ACCEPTANCE_ARMED',metadata:{consent,scope:scope as Prisma.InputJsonValue,maximumModelCalls:1,maximumSubmissions:1,billingHardCap:false}}});return row;
  });
 }
 async close(actor:Actor,id:string){
  requireAdmin(actor);return this.db.$transaction(async tx=>{await lockReview(tx);await contactLock(tx);
   const row=await tx.normalAutomationAcceptance.findUnique({where:{id}});if(!row)throw new NotFoundException();if(row.state==='CLOSED')return row;
   const s=normalAcceptanceScope.parse(row.scope);
   await tx.autoContactRule.updateMany({where:{id:s.ruleId},data:{enabled:false}});
   await tx.commentReviewPolicy.updateMany({where:{id:s.policyId},data:{autoEnabled:false}});
   if(row.runId){await tx.collectionRun.updateMany({where:{id:row.runId,status:{in:['QUEUED','RUNNING']}},data:{cancelRequested:true}});await tx.autoReviewJob.updateMany({where:{runId:row.runId,status:'PENDING'},data:{status:'CANCELLED',reason:'限定验收已结束'}});}
   await tx.auditLog.create({data:{actorId:actor.id,action:'NORMAL_ACCEPTANCE_CLOSED',entityId:id,metadata:{consumedModel:!!row.modelCallId,consumedSend:!!row.sendJobId}}});
   return tx.normalAutomationAcceptance.update({where:{id},data:{state:'CLOSED',closedAt:new Date()}});
  });
 }
}
