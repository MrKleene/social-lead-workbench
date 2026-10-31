import {NormalAcceptanceService} from '../src/auto-contact/normal-acceptance.service';
import {ContactSettingsService} from '../src/auto-contact/contact-settings.service';
import {AutoContactService} from '../src/auto-contact/auto-contact.service';
import {CONTACT_SENDER} from '../src/auto-contact/contact-sender';
import {autoContactConsent} from '@crm/contracts';
import {readRunPostFeed} from '../src/collection/run-post-feed';
import {commentDigest} from '../src/collection/comment-checkpoint';
import {reviewObservationPolicy} from '@crm/contracts';
import {semanticInputPolicy,wholePostRequestPolicy} from '@crm/contracts';
import {previewHash} from '../src/collection/semantic-redaction';
import {ManualReviewService} from '../src/comment-review/manual-review.service';
import {manualPostConsent} from '@crm/contracts';
import 'reflect-metadata';
import {beforeAll,beforeEach,afterAll,describe,it,expect,vi} from 'vitest';
import {Test} from '@nestjs/testing';
import type {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {mkdtempSync,mkdirSync,realpathSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID,randomBytes} from 'node:crypto';
import {reviewAutoConsent,reviewUseConsent,semanticBatchConsent,thesisRulePreset} from '@crm/contracts';
import {AppModule} from '../src/app';
import {Db} from '../src/common/db';
import {configure} from '../src/bootstrap';
import {Actor,digest} from '../src/auth/security';
import {ModelSettingsService} from '../src/model-settings/model-settings.service';
import {ReviewPolicyService} from '../src/comment-review/review-policy.service';
import {AutoReviewService} from '../src/comment-review/auto-review.service';
import {ReviewEvaluationService} from '../src/comment-review/review-evaluation.service';
import {QwenMatchingService} from '../src/collection/qwen-matching.service';
import {CollectionService} from '../src/collection/service';
import {CollectionQueue} from '../src/collection/queue';
import {SemanticService} from '../src/collection/semantic.service';
import {MockAdapter} from '../src/collection/adapters/mock';
import {semanticHash} from '../src/collection/capture-archive';
import {vaultPath,initialize} from '../../../runtime/model-vault.cjs';
const url=process.env.TEST_DATABASE_URL;if(!url||new URL(url).pathname!=='/crm_test')throw Error('Only isolated crm_test');
const db=new Db({datasources:{db:{url}}}),home=realpathSync(mkdtempSync(join(tmpdir(),'crm-independent-review-')));mkdirSync(join(home,'Library','Application Support'),{recursive:true});const file=vaultPath(randomUUID(),home);initialize(file);
const store=new ModelSettingsService(db,{file}),qwen=new QwenMatchingService(db,undefined,store),policies=new ReviewPolicyService(db,store,qwen);
const target='识别当前评论是否明确写出一个学科或专业名称';
let modelScore=90;
const transport=vi.fn(async(_url:string,init:RequestInit)=>{const body=JSON.parse(init.body as string),payload=JSON.parse(body.messages[1].content);expect(body.model).toBe('qwen3.8-flash');expect(body.enable_thinking).toBe(false);expect(body.messages[0].content).toContain('Post and parent text are optional');expect(JSON.stringify(payload)).not.toMatch(/奇异搜索甲|完全不同的搜索乙/);return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({items:payload.items.map((p:any)=>({id:p.id,score:modelScore,decision:'MATCH',reason:'评论明确出现学科名称',context:'SUFFICIENT',evidence:[{source:'COMMENT',quote:p.comment}]}))})}}],usage:{prompt_tokens:40,completion_tokens:20}}));});
const send=vi.fn(async(_request:import('../src/auto-contact/contact-sender').SendRequest):Promise<import('../src/auto-contact/contact-sender').SendResult>=>({kind:'CONFIRMED',receipt:'synthetic-only'}));
const sender={mode:'SIMULATION' as const,capability:()=>true,healthy:async()=>true,send};
const evaluation=new ReviewEvaluationService(db,policies,{transport}),automatic=new AutoReviewService(db,policies,evaluation),manual=new ManualReviewService(db,policies,evaluation);
let actor:Actor,sales:Actor,app:INestApplication,collection:CollectionService;const auth={admin:{cookie:'',csrf:''},sales:{cookie:'',csrf:''}},origin='http://127.0.0.1:5173';
const api=()=>request(app.getHttpServer());const write=(method:'put'|'post'|'patch',path:string,body:object,who:'admin'|'sales'='admin')=>api()[method]('/api/comment-review'+path).set('Cookie',auth[who].cookie).set('Origin',origin).set('x-csrf-token',auth[who].csrf).send(body);
async function clear(){await db.normalAcceptancePost.deleteMany();await db.normalAutomationAcceptance.deleteMany();await db.autoContactJob.deleteMany();await db.contactAttempt.deleteMany();await db.contactLedger.deleteMany();await db.accountDay.deleteMany();await db.autoContactRule.deleteMany();await db.autoContactControl.deleteMany();await db.platformAccount.deleteMany();await db.semanticModelCall.deleteMany();await db.semanticReview.deleteMany();await db.commentReviewPolicyVersion.deleteMany();await db.commentReviewPolicy.deleteMany();await db.modelSettings.deleteMany();await db.noticeRead.deleteMany();await db.collectionNotice.deleteMany();await db.sourceMatch.deleteMany();await db.commentObservation.deleteMany();await db.monitorPost.deleteMany();await db.semanticReview.deleteMany();await db.capturedComment.deleteMany();await db.capturedPost.deleteMany();await db.collectionRun.deleteMany();await db.collectionConfig.deleteMany();await db.sourceComment.deleteMany();await db.sourcePost.deleteMany();await db.lead.deleteMany();await db.platformIdentity.deleteMany();await db.auditLog.deleteMany();}
async function saved(){await store.save(actor,{version:0,model:'qwen3.8-flash',endpoint:'beijing-standard',note:'FAKE TEST ONLY',key:'FAKE-INDEPENDENT-KEY-0123456789',priceVersion:'beijing-2026-10-21'});return policies.save(actor,'workspace',{version:0,target});}
async function enabled(){const p=await saved();return policies.toggle(actor,p.id,{version:p.version,enabled:true,consent:reviewUseConsent,modelVersion:1,priceVersion:'beijing-2026-10-21'});}
async function source(word='奇异搜索甲',comment='护理学',sharedHash?:string){const c=await db.collectionConfig.create({data:{name:'独立审核合成来源',platform:'XHS',mode:'MOCK',keywords:[word],excludeWords:[comment],batchLimit:1}}),run=await db.collectionRun.create({data:{configId:c.id,revision:1,snapshot:{},requestKey:randomUUID(),scenario:'BASELINE',status:'COMPLETE'}}),p=await db.capturedPost.create({data:{configId:c.id,runId:run.id,lastRunId:run.id,platformPostId:randomUUID(),contentHash:randomUUID(),snapshot:{title:'',body:''},coverage:'PARTIAL'}});const snap={postId:p.platformPostId,commentId:randomUUID(),userId:randomUUID(),title:'',body:'',comment,parentId:'missing-parent',parent:null,coverage:'PARTIAL',isDemo:true};const capture=await db.capturedComment.create({data:{configId:c.id,runId:run.id,lastRunId:run.id,postId:p.id,platformCommentId:snap.commentId,contentHash:sharedHash||semanticHash(snap),contextVersion:'captured-context-v1',snapshot:snap,isDemo:true}});return {c,p,capture};}
const input=(p:any)=>({requestKey:randomUUID(),previewHash:p.hash,reviewIds:p.reviewIds,priceVersion:p.connection.priceVersion,consent:semanticBatchConsent});
async function batch(version:number,postIds?:string[]){const b=await policies.prepare(actor,'workspace',{version,scope:postIds?{kind:'POSTS',postIds}:{kind:'ALL'}});return evaluation.preview(actor,'workspace',b.reviewIds);}
beforeAll(async()=>{actor=await db.user.create({data:{email:randomUUID()+'@example.invalid',name:'合成管理员',role:'ADMIN',passwordHash:'unused'}});sales=await db.user.create({data:{email:randomUUID()+'@example.invalid',name:'合成销售',role:'SALES',passwordHash:'unused'}});for(const [who,u] of [['admin',actor],['sales',sales]] as const){const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');await db.session.create({data:{id:digest(token),userId:u.id,csrfToken:csrf,expiresAt:new Date(Date.now()+600000)}});auth[who]={cookie:'crm_session='+token,csrf};}const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(Db).useValue(db).overrideProvider(CONTACT_SENDER).useValue(sender).overrideProvider(ModelSettingsService).useValue(store).overrideProvider(ReviewPolicyService).useValue(policies).overrideProvider(ReviewEvaluationService).useValue(evaluation).overrideProvider(CollectionQueue).useValue({enqueue:vi.fn()}).compile();app=module.createNestApplication({bodyParser:false});configure(app);await app.init();collection=app.get(CollectionService);},30000);
beforeEach(async()=>{await clear();modelScore=90;transport.mockClear();send.mockReset().mockResolvedValue({kind:"CONFIRMED",receipt:"synthetic-only"});});
afterAll(async()=>{await clear();await db.session.deleteMany({where:{userId:{in:[actor.id,sales.id]}}});await db.user.deleteMany({where:{id:{in:[actor.id,sales.id]}}});await app?.close();await db.$disconnect();rmSync(home,{recursive:true,force:true});});

const normalPost=(path:string,body:object)=>api().post('/api'+path).set('Cookie',auth.admin.cookie).set('Origin',origin).set('x-csrf-token',auth.admin.csrf).send(body);
async function finite(overrides:Record<string,unknown>={}){
 const policy=await saved();
 const c=await collection.create(actor,{name:'Finite normal fixture',platform:'XHS',mode:'MOCK',keywords:['synthetic'],excludeWords:[],batchLimit:Number(overrides.maxPosts??1),enabled:true});
 const oldRun=await db.collectionRun.create({data:{configId:c.id,revision:c.revision,snapshot:{},requestKey:randomUUID(),scenario:'BASELINE',status:'COMPLETE'}});
 const p=await db.capturedPost.create({data:{configId:c.id,runId:oldRun.id,lastRunId:oldRun.id,platformPostId:'demo-collect-acceptance-post',snapshot:{title:'Synthetic'},contentHash:randomUUID(),coverage:'PARTIAL'}});
 const account=await db.platformAccount.create({data:{platform:'XHS',label:'Finite synthetic',isDemo:true,version:1,dailyLimit:5}});
 const settings=app.get(ContactSettingsService),rule=await settings.save(actor,'normal',{version:0,platform:'XHS',policyId:policy.id,policyRevision:policy.revision,threshold:overrides.selection==='CONFIG_SEARCH'?100:90,channel:'COMMENT',content:'Synthetic finite reply',accounts:[{id:account.id,version:1,dailyLimit:5}]});
 const scope={id:randomUUID(),consent:'normal-automation-acceptance-once-v1',requestKey:randomUUID(),configId:c.id,configRevision:c.revision,savedPostId:p.id,ruleId:rule.id,ruleVersion:rule.version,policyVersion:policy.version,modelVersion:1,priceVersion:'beijing-2026-10-21',targets:[0,1].map(i=>({commentId:'demo-collect-finite-comment-'+i,recipientId:'demo-collect-finite-user-'+i})),maxInputTokens:100000,maxOutputTokens:20000,maxEstimatedMicros:100000,expiresAt:new Date(Date.now()+1200000).toISOString(),...overrides};
 const armed=await normalPost('/auto-contact/acceptance',scope);expect(armed.status,JSON.stringify(armed.body)).toBe(201);
 expect((await write('patch','/policies/'+policy.id+'/automatic',{version:policy.version,enabled:true,consent:reviewAutoConsent,modelVersion:1,priceVersion:'beijing-2026-10-21'})).status).toBe(200);
 const view=await settings.overview(actor),hash=view.rules.find(r=>r.id===rule.id)!.hash;
 expect((await normalPost('/auto-contact/rules/'+rule.id+'/enabled',{version:rule.version,enabled:true,hash,consent:autoContactConsent})).status).toBe(201);
 const plan={rounds:1,postsPerRound:Number(overrides.maxPosts??1),commentPages:1,...(overrides.selection==='CONFIG_SEARCH'?{freshPostsOnly:true as const}:{savedPostId:p.id})};
 const start=()=>normalPost('/collection/configs/'+c.id+'/runs',{scenario:'BASELINE',mode:'MOCK',requestKey:scope.requestKey,readPlan:plan});
 const adapter=new MockAdapter('XHS','BASELINE');adapter.search=vi.fn(async()=>{throw Error('no search fallback allowed');});adapter.post=async p=>p;adapter.comments=async()=>({items:Array.from({length:6},(_,i)=>({id:'demo-collect-finite-comment-'+i,userId:'demo-collect-finite-user-'+i,nickname:'Synthetic',text:'护理学',hasReplies:false})),complete:true});
 const collect=async()=>{const started=await start();expect(started.status,JSON.stringify(started.body)).toBe(201);await collection.execute(started.body.id,adapter);expect(await db.collectionRun.findUnique({where:{id:started.body.id}})).toMatchObject({status:'COMPLETE'});return started.body.id as string;};
 return {scope,c,p,account,rule,policy,plan,start,collect,adapter,contacts:app.get(AutoContactService),settings};
}
it.each(['CONFIRMED','FAILED','UNKNOWN','RISK'] as const)('ordinary HTTP collection/model/send envelope consumes once for %s and never resets with quota or day',async kind=>{
 const f=await finite();send.mockResolvedValue(kind==='CONFIRMED'?{kind,receipt:'synthetic'}:kind==='RISK'?{kind,reason:'RATE_LIMITED'}:{kind,reason:'synthetic'});
 const runId=await f.collect();expect(await f.start()).toMatchObject({status:201});expect(f.adapter.search).not.toHaveBeenCalled();
 // A stale unrelated pending job is held while the specified run is processed.
 await db.autoReviewJob.create({data:{policyId:f.policy.id,policyVersion:f.policy.version+1,postId:f.p.id,runId:'unrelated-historical-run'}});
 await Promise.all([automatic.tick(),automatic.tick()]);expect(transport).toHaveBeenCalledTimes(1);expect(await db.semanticModelCall.findFirst()).toMatchObject({rows:6,trigger:'AUTOMATIC'});
 const reviews=await db.semanticReview.findMany();expect(reviews).toHaveLength(6);
 // A separate evaluated history row which happens to satisfy time/score is not scanned.
 const old=reviews[0];await db.semanticReview.create({data:{configId:f.c.id,runId:f.p.runId,revision:1,policyId:f.policy.id,policyRevision:1,selectedModel:'qwen3.8-flash',snapshotHash:randomUUID(),platform:'XHS',platformUserId:'demo-collect-history-user',snapshot:{},rules:{},state:'EVALUATED',score:99,context:'SUFFICIENT',isDemo:true}});
 await Promise.all([f.contacts.tick(),f.contacts.tick(),f.contacts.tick()]);expect(send).toHaveBeenCalledTimes(1);
 const envelope=await db.normalAutomationAcceptance.findUniqueOrThrow({where:{id:f.scope.id}});expect(envelope.runId).toBe(runId);expect(envelope.modelCallId).toBeTruthy();expect(envelope.sendJobId).toBeTruthy();expect(envelope.reviewIds).toHaveLength(6);
 expect(await db.autoContactJob.count({where:{reviewId:{notIn:reviews.map(r=>r.id)}}})).toBe(0);
 expect(f.scope.targets).toContainEqual({recipientId:send.mock.calls[0][0].recipientId,commentId:send.mock.calls[0][0].commentId});
 if(kind==='FAILED')expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(0);
 // Simulate exhausted/refunded ordinary daily budget and a next-day worker clock. The total claim remains.
 await db.accountDay.updateMany({data:{occupied:0}});const restarted=new AutoContactService(db,sender);vi.spyOn(restarted,'now').mockResolvedValue(new Date(Date.now()+86400000));await restarted.tick();await automatic.tick();expect(send).toHaveBeenCalledTimes(1);expect(transport).toHaveBeenCalledTimes(1);
 const history=await api().get('/api/auto-contact/attempts').set('Cookie',auth.admin.cookie);expect(history.body.items).toHaveLength(1);
 expect(await db.auditLog.count({where:{action:'SINGLE_REPLY_TEST_AUTHORIZED_RESERVED'}})).toBe(0);
 expect((await normalPost('/auto-contact/acceptance/'+f.scope.id+'/close',{})).status).toBe(201);
 expect((await db.normalAutomationAcceptance.findUniqueOrThrow({where:{id:f.scope.id}})).sendJobId).toBe(envelope.sendJobId);
 expect((await normalPost('/auto-contact/acceptance',f.scope)).status).toBe(409);
});
it.each(['maxInputTokens','maxOutputTokens','maxEstimatedMicros'])('blocks %s before reserving or calling the model; no splitting',async field=>{
 const f=await finite({[field]:1});await f.collect();await automatic.tick();await automatic.tick();expect(transport).not.toHaveBeenCalled();expect(send).not.toHaveBeenCalled();expect(await db.semanticModelCall.count()).toBe(0);expect(await db.semanticReview.count()).toBe(6);
});
it('model failure, repeated jobs and a restarted worker cannot consume a second call',async()=>{
 const f=await finite();transport.mockImplementationOnce(async()=>new Response('synthetic failure',{status:503}));await f.collect();await automatic.tick();expect(transport).toHaveBeenCalledTimes(1);
 await db.autoReviewJob.updateMany({data:{status:'PENDING'}});await db.semanticModelCall.updateMany({data:{createdAt:new Date(Date.now()-86400000)}});await new AutoReviewService(db,policies,evaluation).tick();await f.contacts.tick();expect(transport).toHaveBeenCalledTimes(1);expect(send).not.toHaveBeenCalled();
});
it('rejects wrong request/run/post, manual model bypass, expiry and unrelated control activation',async()=>{
 const f=await finite();expect((await normalPost('/collection/configs/'+f.c.id+'/runs',{scenario:'BASELINE',mode:'MOCK',requestKey:randomUUID(),readPlan:f.plan})).status).toBe(409);
 expect((await normalPost('/collection/configs/'+f.c.id+'/runs',{scenario:'BASELINE',mode:'MOCK',requestKey:f.scope.requestKey})).status).toBe(409);
 expect((await write('patch','/policies/'+f.policy.id+'/automatic',{version:f.policy.version+1,enabled:true,consent:reviewAutoConsent,modelVersion:1,priceVersion:'beijing-2026-10-21'})).status).toBe(409);
 const run=await f.collect(),policy=await db.commentReviewPolicy.findUniqueOrThrow({where:{id:f.policy.id}}),prepared=await policies.prepare(actor,f.policy.id,{version:policy.version,scope:{kind:'POSTS',postIds:[(await db.normalAutomationAcceptance.findUniqueOrThrow({where:{id:f.scope.id}})).capturedPostId!]}},true);
 const preview=await evaluation.preview(actor,f.policy.id,prepared.reviewIds.slice(0,1));
 await expect(evaluation.evaluate(actor,f.policy.id,input(preview))).rejects.toThrow();expect(transport).not.toHaveBeenCalled();
 const row=await db.normalAutomationAcceptance.findUniqueOrThrow({where:{id:f.scope.id}});await db.normalAutomationAcceptance.update({where:{id:row.id},data:{scope:{...(row.scope as object),expiresAt:new Date(0).toISOString()}}});
 await automatic.tick();await f.contacts.tick();expect(send).not.toHaveBeenCalled();expect(transport).not.toHaveBeenCalled();
 // Expiry does not unlock the world. New normal requests stay blocked until explicit close.
 expect((await normalPost('/collection/configs/'+f.c.id+'/runs',{scenario:'BASELINE',mode:'MOCK',requestKey:randomUUID(),readPlan:f.plan})).status).toBe(409);
 expect(await db.normalAutomationAcceptance.findUnique({where:{runId:run}})).toMatchObject({state:'STOPPED'});
 await normalPost('/auto-contact/acceptance/'+f.scope.id+'/close',{});await expect(evaluation.evaluate(actor,f.policy.id,input(preview))).rejects.toThrow();
 expect((await normalPost('/collection/configs/'+f.c.id+'/runs',{scenario:'BASELINE',mode:'MOCK',requestKey:randomUUID(),readPlan:f.plan})).status).toBe(201);expect(transport).not.toHaveBeenCalled();
});
it('authorization endpoints require administrator and CSRF; strict payloads cannot raise the fixed totals',async()=>{
 expect((await api().get('/api/auto-contact/acceptance').set('Cookie',auth.sales.cookie)).status).toBe(403);
 expect((await api().post('/api/auto-contact/acceptance').set('Cookie',auth.admin.cookie).set('Origin',origin).send({})).status).toBe(403);
 const f=await finite();expect((await normalPost('/auto-contact/acceptance',{...f.scope,id:randomUUID(),maximumSubmissions:5})).status).not.toBe(201);expect(transport).not.toHaveBeenCalled();expect(send).not.toHaveBeenCalled();
});

it('a changed envelope after durable model reservation blocks HTTP and keeps the single call consumed',async()=>{
 const f=await finite();await f.collect();const original=store.resolve.bind(store);let invalidated=false;
 const probe=vi.spyOn(store,'resolve').mockImplementation(async(...args)=>{
  const result=await original(...args),row=await db.normalAutomationAcceptance.findUnique({where:{id:f.scope.id}});
  if(row?.modelCallId&&!invalidated&&!args[1]){invalidated=true;await db.normalAutomationAcceptance.update({where:{id:row.id},data:{scope:{...(row.scope as object),expiresAt:new Date(0).toISOString()}}});}
  return result;
 });
 try{await automatic.tick();expect(invalidated).toBe(true);expect(transport).not.toHaveBeenCalled();expect(await db.normalAutomationAcceptance.findUnique({where:{id:f.scope.id}})).toMatchObject({modelCallId:expect.any(String)});expect(await db.semanticModelCall.findFirst()).toMatchObject({status:'FAILED'});}finally{probe.mockRestore();}
});
it('concurrent arm is singular; active external work is rejected without cancelling it',async()=>{
 const f=await finite();await normalPost('/auto-contact/acceptance/'+f.scope.id+'/close',{});
 const r=await db.autoContactRule.findUniqueOrThrow({where:{id:f.rule.id}}),p=await db.commentReviewPolicy.findUniqueOrThrow({where:{id:f.policy.id}});
 const next={...f.scope,id:randomUUID(),requestKey:randomUUID(),ruleVersion:r.version,policyVersion:p.version};
 const pending=await db.collectionRun.create({data:{configId:f.c.id,revision:f.c.revision,snapshot:{},requestKey:randomUUID(),scenario:'BASELINE'}});
 expect((await normalPost('/auto-contact/acceptance',next)).status).toBe(409);expect(await db.collectionRun.findUnique({where:{id:pending.id}})).toMatchObject({status:'QUEUED'});
 await db.collectionRun.update({where:{id:pending.id},data:{status:'COMPLETE'}});
 const responses=await Promise.all([normalPost('/auto-contact/acceptance',next),normalPost('/auto-contact/acceptance',{...next,id:randomUUID()})]);expect(responses.map(r=>r.status).sort()).toEqual([201,409]);
});

async function freshFinite(){
 const f=await finite({selection:'CONFIG_SEARCH',savedPostId:undefined,targets:undefined});
 const freshId='demo-collect-new-selected';
 f.adapter.search=vi.fn(async()=>({items:[{id:f.p.platformPostId,title:'Already saved'},{id:freshId,title:'New selected'},{id:'demo-collect-never-read',title:'Not selected'}],complete:true}));
 f.adapter.post=vi.fn(async p=>p);
 return {...f,freshId};
}
it('new search binds exactly one fresh post and one 100% uncontacted recipient through ordinary endpoints',async()=>{
 const f=await freshFinite();modelScore=100;
 // UNKNOWN retains its recipient lock even though another score-100 author is available.
 const identity=await db.platformIdentity.create({data:{platform:'XHS',platformUserId:'demo-collect-finite-user-0',nickname:'Synthetic'}});
 const ledger=await db.contactLedger.create({data:{identityId:identity.id,mode:'SIMULATION',accountId:f.account.id}});
 await db.contactAttempt.create({data:{ledgerId:ledger.id,requestKey:randomUUID(),kind:'FIRST',mode:'SIMULATION',outcome:'UNKNOWN',day:'historical',actorId:actor.id}});
 const runId=await f.collect();await automatic.tick();await f.contacts.tick();
 expect(f.adapter.search).toHaveBeenCalledTimes(1);expect(f.adapter.post).toHaveBeenCalledTimes(1);expect(transport).toHaveBeenCalledTimes(1);expect(send).toHaveBeenCalledTimes(1);
 expect(send.mock.calls[0][0].postId).toBe(f.freshId);expect(send.mock.calls[0][0].recipientId).not.toBe('demo-collect-finite-user-0');
 const envelope=await db.normalAutomationAcceptance.findUniqueOrThrow({where:{id:f.scope.id}});
 expect(envelope).toMatchObject({state:'STOPPED',runId,modelCallId:expect.any(String),sendJobId:expect.any(String)});
 expect((await db.capturedPost.findUniqueOrThrow({where:{id:envelope.capturedPostId!}})).platformPostId).toBe(f.freshId);
 expect((await db.autoContactRule.findUniqueOrThrow({where:{id:f.rule.id}})).enabled).toBe(false);
 expect((await db.commentReviewPolicy.findUniqueOrThrow({where:{id:f.policy.id}})).autoEnabled).toBe(false);
 expect((await f.start()).status).toBe(409);await automatic.tick();await f.contacts.tick();expect(send).toHaveBeenCalledTimes(1);
});
it('a new post with only 99% results sends nothing and stops both switches without another model call',async()=>{
 const f=await freshFinite();modelScore=99;await f.collect();await automatic.tick();await f.contacts.tick();
 expect(transport).toHaveBeenCalledTimes(1);expect(send).not.toHaveBeenCalled();
 expect(await db.normalAutomationAcceptance.findUnique({where:{id:f.scope.id}})).toMatchObject({state:'STOPPED',sendJobId:null});
 expect(await db.autoContactRule.findUnique({where:{id:f.rule.id}})).toMatchObject({enabled:false});expect(await db.commentReviewPolicy.findUnique({where:{id:f.policy.id}})).toMatchObject({autoEnabled:false});
 await automatic.tick();await f.contacts.tick();expect(transport).toHaveBeenCalledTimes(1);
});
it('fresh search returning only historical posts never rereads, calls the model or leaves switches on',async()=>{
 const f=await freshFinite();f.adapter.search=vi.fn(async()=>({items:[{id:f.p.platformPostId,title:'History'}],complete:true}));
 await f.collect();await automatic.tick();await f.contacts.tick();expect(f.adapter.post).not.toHaveBeenCalled();expect(transport).not.toHaveBeenCalled();expect(send).not.toHaveBeenCalled();
 expect(await db.normalAutomationAcceptance.findUnique({where:{id:f.scope.id}})).toMatchObject({state:'STOPPED'});
});
it('fresh selection rejects saved-post substitution, expanded limits and changed frozen configuration before IO',async()=>{
 const f=await freshFinite();
 for(const readPlan of [{...f.plan,freshPostsOnly:undefined,savedPostId:f.p.id},{...f.plan,postsPerRound:2},{...f.plan,freshPostsOnly:undefined}])expect((await normalPost('/collection/configs/'+f.c.id+'/runs',{scenario:'BASELINE',mode:'MOCK',requestKey:f.scope.requestKey,readPlan})).status).not.toBe(201);
 const started=await f.start();expect(started.status).toBe(201);
 await db.collectionConfig.update({where:{id:f.c.id},data:{revision:{increment:1}}});await collection.execute(started.body.id,f.adapter);await f.contacts.tick();
 expect(f.adapter.search).not.toHaveBeenCalled();expect(transport).not.toHaveBeenCalled();expect(send).not.toHaveBeenCalled();
});
it('a fresh 100% post with a failed submit consumes the total opportunity and automatically disables the rule',async()=>{
 const f=await freshFinite();modelScore=100;send.mockResolvedValue({kind:'FAILED',reason:'synthetic failure'});await f.collect();await automatic.tick();await f.contacts.tick();
 expect(send).toHaveBeenCalledTimes(1);expect((await db.accountDay.findFirstOrThrow()).occupied).toBe(0);
 await new AutoContactService(db,sender).tick();expect(send).toHaveBeenCalledTimes(1);expect(await db.autoContactRule.findUnique({where:{id:f.rule.id}})).toMatchObject({enabled:false});
});

async function multiFinite(maxEstimatedMicros=1050000){
 const f=await finite({selection:'CONFIG_SEARCH',savedPostId:undefined,targets:undefined,maxPosts:3,maxEstimatedMicros});
 f.adapter.search=vi.fn(async()=>({items:[{id:f.p.platformPostId,title:'History'},...[0,1,2,3].map(i=>({id:'demo-collect-multi-post-'+i,title:'New '+i}))],complete:true}));
 f.adapter.post=vi.fn(async p=>p);
 f.adapter.comments=async p=>({items:Array.from({length:6},(_,i)=>({id:p.id+'-comment-'+i,userId:p.id+'-user-'+i,nickname:'Synthetic',text:'护理学',hasReplies:false})),complete:true});
 return f;
}
async function nextModelTick(){await db.semanticModelCall.updateMany({data:{createdAt:new Date(Date.now()-60000)}});await automatic.tick();}
it('three fresh posts each get one whole-post call, then share one atomic send across concurrent workers',async()=>{
 const f=await multiFinite();modelScore=100;await f.collect();expect(f.adapter.post).toHaveBeenCalledTimes(3);
 await Promise.all([automatic.tick(),automatic.tick(),automatic.tick()]);expect(transport).toHaveBeenCalledTimes(1);
 await f.contacts.tick();expect(send).not.toHaveBeenCalled();expect(await db.autoContactJob.count()).toBe(0);
 await nextModelTick();await f.contacts.tick();expect(transport).toHaveBeenCalledTimes(2);expect(send).not.toHaveBeenCalled();
 await nextModelTick();await Promise.all([f.contacts.tick(),f.contacts.tick(),f.contacts.tick()]);expect(transport).toHaveBeenCalledTimes(3);expect(send).toHaveBeenCalledTimes(1);
 const posts=await db.normalAcceptancePost.findMany({where:{acceptanceId:f.scope.id}});expect(posts).toHaveLength(3);expect(new Set(posts.map(p=>p.modelCallId)).size).toBe(3);expect(posts.every(p=>p.reviewIds.length===6)).toBe(true);
 expect(await db.normalAutomationAcceptance.findUnique({where:{id:f.scope.id}})).toMatchObject({state:'STOPPED',batchPlanned:true,sendJobId:expect.any(String)});
 await nextModelTick();await new AutoContactService(db,sender).tick();expect(transport).toHaveBeenCalledTimes(3);expect(send).toHaveBeenCalledTimes(1);
});
it('three individually affordable posts exceeding the shared estimate stop before ANY payable call',async()=>{
 const f=await multiFinite(40000);await f.collect();await automatic.tick();await f.contacts.tick();
 expect(transport).not.toHaveBeenCalled();expect(send).not.toHaveBeenCalled();expect(await db.semanticModelCall.count()).toBe(0);
 expect(await db.normalAutomationAcceptance.findUnique({where:{id:f.scope.id}})).toMatchObject({state:'STOPPED',batchPlanned:false});
 expect(await db.semanticReview.count()).toBe(18);
});
it('a failure on the second post never retries that post or calls the third, nor sends the first match',async()=>{
 const f=await multiFinite();modelScore=100;await f.collect();await automatic.tick();expect(transport).toHaveBeenCalledTimes(1);
 transport.mockImplementationOnce(async()=>new Response('synthetic',{status:503}));await nextModelTick();await f.contacts.tick();
 expect(transport).toHaveBeenCalledTimes(2);expect(send).not.toHaveBeenCalled();await nextModelTick();await f.contacts.tick();expect(transport).toHaveBeenCalledTimes(2);
 expect(await db.normalAutomationAcceptance.findUnique({where:{id:f.scope.id}})).toMatchObject({state:'STOPPED'});
});
async function partialRound(){
 const f=await multiFinite();modelScore=100;const original=f.adapter.comments;f.adapter.comments=async(...args)=>({...await original(...args),complete:!args[0].id.endsWith('-2')});
 const started=await f.start();await collection.execute(started.body.id,f.adapter);return {...f,runId:started.body.id};
}
it('an incomplete third post stays skipped while two complete posts share one atomic send',async()=>{
 const f=await partialRound();await f.contacts.tick();expect(await db.normalAutomationAcceptance.findUnique({where:{id:f.scope.id}})).toMatchObject({state:'ACTIVE'});
 await Promise.all([automatic.tick(),automatic.tick()]);await f.contacts.tick();expect(transport).toHaveBeenCalledTimes(1);expect(send).not.toHaveBeenCalled();
 await nextModelTick();await Promise.all([f.contacts.tick(),f.contacts.tick(),f.contacts.tick()]);expect(transport).toHaveBeenCalledTimes(2);expect(send).toHaveBeenCalledTimes(1);
 const skipped=await db.autoReviewJob.findFirstOrThrow({where:{runId:f.runId,status:'SKIPPED'}});expect(await db.normalAcceptancePost.findUnique({where:{acceptanceId_postId:{acceptanceId:f.scope.id,postId:skipped.postId}}})).toMatchObject({modelCallId:null,estimatedMicros:0,reviewIds:[]});
 expect(await db.capturedPost.findUnique({where:{id:skipped.postId}})).toMatchObject({coverage:'PARTIAL'});await nextModelTick();await f.contacts.tick();expect(transport).toHaveBeenCalledTimes(2);expect(send).toHaveBeenCalledTimes(1);
});
it('explicit continuation preserves the original run and zero-use ledger, and never extends expiry',async()=>{
 const f=await partialRound(),service=app.get(NormalAcceptanceService);
 await db.autoReviewJob.updateMany({where:{runId:f.runId,status:'PENDING'},data:{status:'FAILED',reason:'本轮全部帖子容量、总费用估算或冻结版本未通过；未调用模型、不拆批'}});
 await service.close(actor,f.scope.id);await collection.change(actor,f.c.id,{batchLimit:1},f.c.revision,true);const before=await db.normalAutomationAcceptance.findUniqueOrThrow({where:{id:f.scope.id}});
 await expect(service.resumeUnspent(actor,f.scope.id,new Date(Date.parse(f.scope.expiresAt as string)+1).toISOString())).rejects.toThrow();
 await expect(service.resumeUnspent(actor,f.scope.id,new Date(0).toISOString())).rejects.toThrow();
 const resumed=await service.resumeUnspent(actor,f.scope.id,f.scope.expiresAt as string),scope=resumed.scope as any;
 expect(resumed).toMatchObject({id:before.id,runId:before.runId,modelCallId:null,sendJobId:null,reviewIds:[],closedAt:before.closedAt});
 const policy=await db.commentReviewPolicy.findUniqueOrThrow({where:{id:f.policy.id}});await policies.automatic(actor,policy.id,{version:policy.version,enabled:true,consent:reviewAutoConsent,modelVersion:1,priceVersion:'beijing-2026-10-21'});
 const rule=await db.autoContactRule.findUniqueOrThrow({where:{id:f.rule.id}}),view=await f.settings.overview(actor);await f.settings.toggle(actor,rule.id,{version:rule.version,enabled:true,hash:view.rules.find(r=>r.id===rule.id)!.hash,consent:autoContactConsent});
 expect(scope.maxEstimatedMicros).toBe(f.scope.maxEstimatedMicros);await automatic.tick();await nextModelTick();await f.contacts.tick();expect(transport,JSON.stringify({jobs:await db.autoReviewJob.findMany(),scope:await db.normalAutomationAcceptance.findUnique({where:{id:f.scope.id}}),calls:await db.semanticModelCall.findMany()})).toHaveBeenCalledTimes(2);expect(send).toHaveBeenCalledTimes(1);
 await service.close(actor,f.scope.id);await expect(service.resumeUnspent(actor,f.scope.id,f.scope.expiresAt as string)).rejects.toThrow();expect(await db.collectionRun.count({where:{configId:f.c.id}})).toBe(2);
});
it('changed payload after all-post cost planning stops the next call without re-estimating into the budget',async()=>{
 const f=await multiFinite();await f.collect();await automatic.tick();expect(transport).toHaveBeenCalledTimes(1);
 const next=await db.autoReviewJob.findFirstOrThrow({where:{status:'PENDING'},orderBy:{createdAt:'asc'}});const pending=await db.normalAcceptancePost.findUniqueOrThrow({where:{acceptanceId_postId:{acceptanceId:f.scope.id,postId:next.postId}}});
 await db.semanticReview.updateMany({where:{id:{in:pending.reviewIds}},data:{version:{increment:1},snapshot:{comment:'changed after plan'}}});await nextModelTick();await f.contacts.tick();
 expect(transport).toHaveBeenCalledTimes(1);
 await nextModelTick();await f.contacts.tick();expect(transport).toHaveBeenCalledTimes(1);expect(send).not.toHaveBeenCalled();
});
