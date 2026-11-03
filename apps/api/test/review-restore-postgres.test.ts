import 'reflect-metadata';
import {randomUUID} from 'node:crypto';
import {beforeEach,afterAll,it,expect} from 'vitest';
import {semanticInputPolicy,wholePostRequestPolicy,autoReviewInputPolicy} from '@crm/contracts';
import {Db} from '../src/common/db';
import {captureReviewRestore,restoreReviewAuthorization} from '../src/comment-review/review-authorization-restore';
import {prepareReviewRecovery,missingConsentReason} from '../src/comment-review/review-recovery';
import {assertAutoReview} from '../src/comment-review/auto-review.guard';
import {lockReview} from '../src/comment-review/review-policy.service';
import type {Actor} from '../src/auth/security';
const url=process.env.TEST_DATABASE_URL;if(!url||new URL(url).pathname!=='/crm_test')throw Error('Only isolated crm_test');
const db=new Db({datasources:{db:{url}}});let actor:Actor,restoreId:string;
beforeEach(async()=>{
 await db.$executeRawUnsafe('TRUNCATE "User","CollectionConfig","CommentReviewPolicy","ModelSettings","NormalAutomationAcceptance","AuditLog","AutoContactRule","PlatformAccount","HistoryArchiveBatch" CASCADE');
 actor=await db.user.create({data:{email:randomUUID()+'@example.invalid',name:'Fixture admin',role:'ADMIN',passwordHash:'unused'}});
 await db.modelSettings.create({data:{id:'workspace',model:'qwen3.8-flash',version:2,priceVersion:'beijing-2026-10-21',consent:true,consentInputPolicy:semanticInputPolicy}});
 await db.commentReviewPolicy.create({data:{id:'workspace',name:'Fixture',target:'识别评论是否明确描述学科专业需求',version:15,revision:1,autoEnabled:true,autoModelVersion:2,autoActorId:actor.id}});
 await db.auditLog.create({data:{actorId:actor.id,entityId:'workspace',action:'COMMENT_REVIEW_AUTO_CONSENT',metadata:{enabled:true,modelVersion:2,policyVersion:15,requestPolicy:wholePostRequestPolicy}}});
 await db.commentReviewPolicyVersion.create({data:{policyId:'workspace',revision:1,target:'识别评论是否明确描述学科专业需求'}});
 restoreId=randomUUID();const snap=await db.$transaction(tx=>captureReviewRestore(tx,'workspace'));
 await db.auditLog.create({data:{actorId:actor.id,entityId:restoreId,action:'FINITE_DM_ACCEPTANCE_PREPARED',metadata:{reviewRestore:snap}}});
 await db.normalAutomationAcceptance.create({data:{id:restoreId,actorId:actor.id,state:'CLOSED',scope:{policyId:'workspace',policyRevision:1,policyVersion:17,modelVersion:2}}});
 await db.commentReviewPolicy.update({where:{id:'workspace'},data:{version:17,autoEnabled:false}});
});
afterAll(()=>db.$disconnect());
const restore=()=>db.$transaction(async tx=>{await lockReview(tx);return restoreReviewAuthorization(tx,actor,restoreId,17);});
async function source(){
 const config=await db.collectionConfig.create({data:{name:'Fixture',platform:'XHS',mode:'MOCK',keywords:['fixture'],batchLimit:3}});
 const run=await db.collectionRun.create({data:{configId:config.id,revision:config.revision,snapshot:{mode:'MOCK'},requestKey:randomUUID(),scenario:'BASELINE',status:'COMPLETE',capturedPosts:3,capturedCommentsCount:26}});
 const jobs=[];for(const n of [14,2,10]){const post=await db.capturedPost.create({data:{configId:config.id,runId:run.id,lastRunId:run.id,platformPostId:randomUUID(),contentHash:randomUUID(),snapshot:{title:'Fixture',body:''},coverage:'COMPLETE'}});
 for(let i=0;i<n;i++){const id=randomUUID();await db.capturedComment.create({data:{configId:config.id,runId:run.id,lastRunId:run.id,postId:post.id,platformCommentId:id,contentHash:randomUUID(),contextVersion:'captured-context-v1',snapshot:{postId:post.platformPostId,commentId:id,userId:randomUUID(),title:'Fixture',body:'',comment:'护理学',parentId:null,parent:null,coverage:'COMPLETE',isDemo:true},isDemo:true}});}
 jobs.push(await db.autoReviewJob.create({data:{runId:run.id,policyId:'workspace',policyVersion:17,postId:post.id,status:'CANCELLED',reason:missingConsentReason,inputPolicyVersion:autoReviewInputPolicy}}));}
 return {run,jobs,input:{requestId:randomUUID(),runId:run.id,policyId:'workspace',policyVersion:18,modelVersion:2,jobIds:jobs.map(j=>j.id),expectedComments:26}};
}
it('atomically restores the version and consent lineage; exact-version guard accepts it',async()=>{
 const p=await restore();expect(p).toMatchObject({version:18,autoEnabled:true,autoModelVersion:2});const consent=await db.auditLog.findFirstOrThrow({where:{entityId:p.id,action:'COMMENT_REVIEW_AUTO_CONSENT',metadata:{path:['policyVersion'],equals:18}}});expect(consent.metadata).toMatchObject({enabled:true,restoredFromPolicyVersion:15,restorationId:restoreId,requestPolicy:wholePostRequestPolicy});
 const s=await source();await db.autoReviewJob.update({where:{id:s.jobs[0].id},data:{status:'PROCESSING',policyVersion:18}});await expect(assertAutoReview(db,s.jobs[0].id,2)).resolves.toBeDefined();
 await expect(restore()).rejects.toThrow();expect(await db.semanticModelCall.count()).toBe(0);
});
it.each(['missing receipt','changed model','changed target','changed revision','stale version','inactive actor','open acceptance','bad consent'] as const)('refuses %s without changing settings',async kind=>{
 if(kind==='missing receipt')await db.auditLog.deleteMany({where:{action:'FINITE_DM_ACCEPTANCE_PREPARED'}});
 if(kind==='changed model')await db.modelSettings.update({where:{id:'workspace'},data:{version:3}});
 if(kind==='changed target')await db.commentReviewPolicy.update({where:{id:'workspace'},data:{target:'其他'}});
 if(kind==='changed revision')await db.commentReviewPolicy.update({where:{id:'workspace'},data:{revision:2}});
 if(kind==='stale version')await db.commentReviewPolicy.update({where:{id:'workspace'},data:{version:18}});
 if(kind==='inactive actor')await db.user.update({where:{id:actor.id},data:{active:false}});
 if(kind==='open acceptance')await db.normalAutomationAcceptance.update({where:{id:restoreId},data:{state:'ACTIVE'}});
 if(kind==='bad consent')await db.auditLog.updateMany({where:{action:'COMMENT_REVIEW_AUTO_CONSENT'},data:{metadata:{policyVersion:15,enabled:true,modelVersion:2}}});
 const before=await db.commentReviewPolicy.findUniqueOrThrow({where:{id:'workspace'}});await expect(restore()).rejects.toThrow();expect(await db.commentReviewPolicy.findUnique({where:{id:'workspace'}})).toEqual(before);
});
it('rolls authorization and version back together if the surrounding restore fails',async()=>{await expect(db.$transaction(async tx=>{await lockReview(tx);await restoreReviewAuthorization(tx,actor,restoreId,17);throw Error('synthetic failure');})).rejects.toThrow();expect(await db.commentReviewPolicy.findUnique({where:{id:'workspace'}})).toMatchObject({version:17,autoEnabled:false});expect(await db.auditLog.count({where:{metadata:{path:['policyVersion'],equals:18}}})).toBe(0);});
it('prepares only 26 exact targets and preserves old evaluations; consumed intent cannot repeat',async()=>{
 await restore();const s=await source();const c=await db.capturedComment.findFirstOrThrow();const old=await db.semanticReview.create({data:{policyId:'workspace',policyRevision:1,sourceContentHash:c.contentHash,configId:c.configId,runId:c.runId,revision:1,captureId:c.id,analysisKey:randomUUID(),snapshotHash:'old',selectedModel:'qwen3.8-flash',ruleHash:'old',contextVersion:c.contextVersion,platform:'XHS',platformUserId:'fixture',snapshot:c.snapshot as any,rules:{},isDemo:true,state:'EVALUATED',score:0}});
 const result=await prepareReviewRecovery(db,actor,s.input);expect(result.plans.map(p=>p.count)).toEqual([14,2,10]);expect(new Set(result.plans.flatMap(p=>p.reviewIds)).size).toBe(26);expect(await db.semanticReview.findUnique({where:{id:old.id}})).toEqual(old);expect(await db.autoContactJob.count()).toBe(0);expect(await db.semanticModelCall.count()).toBe(0);
 const audit=await db.auditLog.findFirstOrThrow({where:{entityId:s.input.requestId}});expect(audit.metadata).toMatchObject({modelOnly:true,originalJobs:expect.arrayContaining([expect.objectContaining({status:'CANCELLED',reason:missingConsentReason})])});
 await expect(prepareReviewRecovery(db,actor,s.input)).rejects.toThrow();
 for(const plan of result.plans)await expect(assertAutoReview(db,plan.jobId,2,await db.semanticReview.findMany({where:{id:{in:plan.reviewIds}}}))).resolves.toBeDefined();
});
it.each(['wrong count','wrong jobs','already processed','different reason','sending enabled','sales'] as const)('recovery refuses %s without a model call or new reviews',async kind=>{
 await restore();const s=await source();
 if(kind==='wrong count')s.input.expectedComments=25;
 if(kind==='wrong jobs')s.input.jobIds[0]=randomUUID();
 if(kind==='already processed')await db.autoReviewJob.update({where:{id:s.jobs[0].id},data:{processed:1}});
 if(kind==='different reason')await db.autoReviewJob.update({where:{id:s.jobs[0].id},data:{reason:'UNKNOWN'}});
 if(kind==='sending enabled')await db.autoContactRule.create({data:{id:'fixture',platform:'XHS',policyId:'workspace',policyRevision:1,enabled:true}});
 await expect(prepareReviewRecovery(db,kind==='sales'?{...actor,role:'SALES'}:actor,s.input)).rejects.toThrow();expect(await db.semanticReview.count()).toBe(0);expect(await db.semanticModelCall.count()).toBe(0);
});

it('evaluates all three recovery plans once with a fake model; disabled reply rules produce zero jobs',async()=>{
 await restore();const s=await source(),prepared=await prepareReviewRecovery(db,actor,s.input);
 const {ReviewPolicyService}=await import('../src/comment-review/review-policy.service'),{ReviewEvaluationService}=await import('../src/comment-review/review-evaluation.service'),{QwenMatchingService}=await import('../src/collection/qwen-matching.service'),{AutoContactService}=await import('../src/auto-contact/auto-contact.service');
 const {semanticBatchConsent}=await import('@crm/contracts');let calls=0,sends=0;
 const models:any={resolve:async()=>({configurationVersion:2,status:{state:'READY',authorized:true,model:'qwen3.8-flash',dailyLimit:null},endpoint:'https://example.invalid',key:'FAKE-ONLY'})};
 const policies=new ReviewPolicyService(db,models,new QwenMatchingService(db,undefined,models));
 const evaluation=new ReviewEvaluationService(db,policies,{transport:async(_u,init)=>{calls++;const p=JSON.parse(JSON.parse(init.body as string).messages[1].content);return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({items:p.items.map((i:any)=>({id:i.id,score:100,decision:'MATCH',reason:'明确学科',context:'SUFFICIENT',evidence:[{source:'COMMENT',quote:i.comment}]}))})}}],usage:{prompt_tokens:20,completion_tokens:20}}));}});
 await db.autoContactRule.create({data:{id:'fixture-off',platform:'XHS',policyId:'workspace',policyRevision:1,enabled:false,mode:'SIMULATION'}});
 const contact=new AutoContactService(db,{mode:'SIMULATION',capability:()=>true,healthy:async()=>true,send:async()=>{sends++;throw Error('must never send');}} as any);
 for(const p of prepared.plans){const preview=await evaluation.preview(actor,'workspace',p.reviewIds,false,true);const result=await evaluation.evaluate(actor,'workspace',{requestKey:randomUUID(),previewHash:preview.hash,reviewIds:p.reviewIds,priceVersion:preview.connection.priceVersion!,consent:semanticBatchConsent},p.jobId);expect(result.status).toBe('COMPLETED');await db.autoReviewJob.update({where:{id:p.jobId},data:{status:'COMPLETED',processed:p.count}});await db.semanticModelCall.updateMany({data:{createdAt:new Date(Date.now()-31000)}});await contact.tick();}
 expect(calls).toBe(3);expect(sends).toBe(0);expect(await db.semanticReview.count({where:{runId:s.run.id,state:'EVALUATED',score:100}})).toBe(26);expect(await db.autoContactJob.count()).toBe(0);expect(await db.contactAttempt.count()).toBe(0);
});
