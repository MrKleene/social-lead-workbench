import {semanticInputPolicy,wholePostRequestPolicy} from '@crm/contracts';
import {previewHash} from '../src/collection/semantic-redaction';
import {ManualReviewService} from '../src/comment-review/manual-review.service';
import {manualPostConsent} from '@crm/contracts';
import 'reflect-metadata';
import {beforeAll,beforeEach,afterAll,describe,it,expect,vi} from 'vitest';
import {Test} from '@nestjs/testing';
import type {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {mkdtempSync,mkdirSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
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
const transport=vi.fn(async(_url:string,init:RequestInit)=>{const body=JSON.parse(init.body as string),payload=JSON.parse(body.messages[1].content);expect(body.model).toBe('qwen3.8-flash');expect(body.enable_thinking).toBe(false);expect(body.messages[0].content).toContain('Post and parent text are optional');expect(JSON.stringify(payload)).not.toMatch(/奇异搜索甲|完全不同的搜索乙/);return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({items:payload.items.map((p:any)=>({id:p.id,score:90,decision:'MATCH',reason:'评论明确出现学科名称',context:'SUFFICIENT',evidence:[{source:'COMMENT',quote:p.comment}]}))})}}],usage:{prompt_tokens:40,completion_tokens:20}}));});
const evaluation=new ReviewEvaluationService(db,policies,{transport}),automatic=new AutoReviewService(db,policies,evaluation),manual=new ManualReviewService(db,policies,evaluation);
let actor:Actor,sales:Actor,app:INestApplication,collection:CollectionService;const auth={admin:{cookie:'',csrf:''},sales:{cookie:'',csrf:''}},origin='http://127.0.0.1:5173';
const api=()=>request(app.getHttpServer());const write=(method:'put'|'post'|'patch',path:string,body:object,who:'admin'|'sales'='admin')=>api()[method]('/api/comment-review'+path).set('Cookie',auth[who].cookie).set('Origin',origin).set('x-csrf-token',auth[who].csrf).send(body);
async function clear(){await db.semanticModelCall.deleteMany();await db.semanticReview.deleteMany();await db.commentReviewPolicyVersion.deleteMany();await db.commentReviewPolicy.deleteMany();await db.modelSettings.deleteMany();await db.noticeRead.deleteMany();await db.collectionNotice.deleteMany();await db.sourceMatch.deleteMany();await db.commentObservation.deleteMany();await db.monitorPost.deleteMany();await db.collectionRun.deleteMany();await db.collectionConfig.deleteMany();await db.sourceComment.deleteMany();await db.sourcePost.deleteMany();await db.lead.deleteMany();await db.platformIdentity.deleteMany();await db.auditLog.deleteMany();}
async function saved(){await store.save(actor,{version:0,model:'qwen3.8-flash',endpoint:'beijing-standard',note:'FAKE TEST ONLY',key:'FAKE-INDEPENDENT-KEY-0123456789',priceVersion:'beijing-2026-10-21'});return policies.save(actor,'workspace',{version:0,target});}
async function enabled(){const p=await saved();return policies.toggle(actor,p.id,{version:p.version,enabled:true,consent:reviewUseConsent,modelVersion:1,priceVersion:'beijing-2026-10-21'});}
async function source(word='奇异搜索甲',comment='护理学',sharedHash?:string){const c=await db.collectionConfig.create({data:{name:'独立审核合成来源',platform:'XHS',mode:'MOCK',keywords:[word],excludeWords:[comment],batchLimit:1}}),run=await db.collectionRun.create({data:{configId:c.id,revision:1,snapshot:{},requestKey:randomUUID(),scenario:'BASELINE',status:'COMPLETE'}}),p=await db.capturedPost.create({data:{configId:c.id,runId:run.id,lastRunId:run.id,platformPostId:randomUUID(),contentHash:randomUUID(),snapshot:{title:'',body:''},coverage:'PARTIAL'}});const snap={postId:p.platformPostId,commentId:randomUUID(),userId:randomUUID(),title:'',body:'',comment,parentId:'missing-parent',parent:null,coverage:'PARTIAL',isDemo:true};const capture=await db.capturedComment.create({data:{configId:c.id,runId:run.id,lastRunId:run.id,postId:p.id,platformCommentId:snap.commentId,contentHash:sharedHash||semanticHash(snap),contextVersion:'captured-context-v1',snapshot:snap,isDemo:true}});return {c,p,capture};}
const input=(p:any)=>({requestKey:randomUUID(),previewHash:p.hash,reviewIds:p.reviewIds,priceVersion:p.connection.priceVersion,consent:semanticBatchConsent});
async function batch(version:number,postIds?:string[]){const b=await policies.prepare(actor,'workspace',{version,scope:postIds?{kind:'POSTS',postIds}:{kind:'ALL'}});return evaluation.preview(actor,'workspace',b.reviewIds);}
beforeAll(async()=>{actor=await db.user.create({data:{email:randomUUID()+'@example.invalid',name:'合成管理员',role:'ADMIN',passwordHash:'unused'}});sales=await db.user.create({data:{email:randomUUID()+'@example.invalid',name:'合成销售',role:'SALES',passwordHash:'unused'}});for(const [who,u] of [['admin',actor],['sales',sales]] as const){const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');await db.session.create({data:{id:digest(token),userId:u.id,csrfToken:csrf,expiresAt:new Date(Date.now()+600000)}});auth[who]={cookie:'crm_session='+token,csrf};}const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(Db).useValue(db).overrideProvider(ModelSettingsService).useValue(store).overrideProvider(ReviewPolicyService).useValue(policies).overrideProvider(ReviewEvaluationService).useValue(evaluation).overrideProvider(CollectionQueue).useValue({enqueue:vi.fn()}).compile();app=module.createNestApplication({bodyParser:false});configure(app);await app.init();collection=app.get(CollectionService);},30000);
beforeEach(async()=>{await clear();transport.mockClear();});
afterAll(async()=>{await clear();await db.session.deleteMany({where:{userId:{in:[actor.id,sales.id]}}});await db.user.deleteMany({where:{id:{in:[actor.id,sales.id]}}});await app?.close();await db.$disconnect();rmSync(home,{recursive:true,force:true});});
describe('independent comment review: disposable database and mocked provider only',()=>{
 it('pure capture defaults to no rules, no keyword fallback, no leads and no review work even if old control is enabled',async()=>{
  const c=await collection.create(actor,{name:'合成纯采集',platform:'XHS',mode:'MOCK',keywords:['奇异搜索甲'],excludeWords:['护理'],commentRules:thesisRulePreset,semanticRules:{version:1,target,reviewThreshold:70},batchLimit:1,enabled:true});await db.semanticControl.create({data:{configId:c.id,enabled:true}});expect(c.legacyMatchingEnabled).toBe(false);
  const adapter=new MockAdapter('XHS','BASELINE');adapter.search=async()=>({items:[{id:'demo-collect-decouple-post',title:'无关标题'}],complete:true});adapter.post=async p=>p;adapter.comments=async()=>({items:[{id:'demo-collect-decouple-comment',userId:'demo-collect-decouple-user',nickname:'虚构',text:'护理',hasReplies:false},{id:'demo-collect-decouple-comment2',userId:'demo-collect-decouple-user2',nickname:'虚构',text:'奇异搜索甲',hasReplies:false}],complete:true});
  const failingReview=vi.spyOn(db.semanticReview,'createMany').mockRejectedValue(new Error('review storage unavailable'));
  try{const run=await collection.start(actor,c.id,'BASELINE',randomUUID());await collection.execute(run.id,adapter);expect(await db.capturedComment.count()).toBe(2);expect(await db.capturedPost.count()).toBe(1);expect(await db.lead.count()).toBe(0);expect(await db.semanticReview.count()).toBe(0);expect(await db.semanticModelCall.count()).toBe(0);expect(failingReview).not.toHaveBeenCalled();expect(await db.collectionRun.findUnique({where:{id:run.id}})).toMatchObject({status:'COMPLETE',matched:0,added:0});}finally{failingReview.mockRestore();}
 });
 it('policy storage is independent, remains disabled, preserves source rules and cannot authorize by saving',async()=>{const s=await source(),before=await db.collectionConfig.findUnique({where:{id:s.c.id}});const p=await saved();expect(p.enabled).toBe(false);expect(await db.collectionConfig.findUnique({where:{id:s.c.id}})).toEqual(before);expect((await store.resolve()).status.authorized).toBe(false);await expect(policies.toggle(actor,p.id,{enabled:true,version:p.version})).rejects.toThrow();await expect(policies.prepare(actor,p.id,{version:p.version,scope:{kind:'ALL'}})).rejects.toThrow();expect(transport).not.toHaveBeenCalled();expect(await db.semanticModelCall.count()).toBe(0);});
 it('comments without search words or post context match independently across search groups; selected scope makes no collection request',async()=>{
  const p=await enabled(),a=await source(),b=await source('完全不同的搜索乙','会计学'),runs=await db.collectionRun.count(),preview=await batch(p.version,[a.p.id]);expect(preview.count).toBe(1);expect(preview.payload.items[0]).toMatchObject({comment:'护理学',title:'',missingParent:true});
  expect(await evaluation.evaluate(actor,p.id,input(preview))).toMatchObject({status:'COMPLETED'});const row=await db.semanticReview.findFirstOrThrow();expect(row).toMatchObject({policyId:p.id,policyRevision:1,context:'SUFFICIENT',reviewStatus:'PENDING',score:90});expect((row.result as any).decision).toBe('MATCH');expect(await db.collectionRun.count()).toBe(runs);expect(await db.lead.count()).toBe(0);expect(await db.contactAttempt.count()).toBe(0);const next=await policies.prepare(actor,p.id,{version:p.version,scope:{kind:'ALL'}});expect(next.count).toBe(1);expect(await db.semanticReview.findUnique({where:{id:next.reviewIds[0]}})).toMatchObject({captureId:b.capture.id});
 });
 it('search changes and source archival do not invalidate an independent preview or historical approval',async()=>{
  const p=await enabled(),s=await source(),preview=await batch(p.version);await db.collectionConfig.update({where:{id:s.c.id},data:{keywords:['完全不同的搜索乙'],enabled:false,revision:{increment:1},archivedAt:new Date()}});expect(await evaluation.evaluate(actor,p.id,input(preview))).toMatchObject({status:'COMPLETED'});const row=await db.semanticReview.findFirstOrThrow();expect(await new SemanticService(db).review(actor,row.id,{version:row.version,decision:'APPROVED',note:'人工确认合成样本'})).toMatchObject({canSend:false});
 });
 it('versions preserve old results and snapshots, reject old previews, and deduplicate equal content from different searches',async()=>{
  const p=await enabled(),a=await source();await source('完全不同的搜索乙','护理学',a.capture.contentHash);const first=await batch(p.version);expect(first.count).toBe(1);await evaluation.evaluate(actor,p.id,input(first));const old=await db.semanticReview.findFirstOrThrow();expect((await policies.prepare(actor,p.id,{version:p.version,scope:{kind:'ALL'}})).count).toBe(0);
  const changed=await policies.save(actor,p.id,{version:p.version,target:target+'，排除明确提供服务的人'});expect(changed.revision).toBe(2);expect(await db.semanticReview.findUnique({where:{id:old.id}})).toEqual(old);expect(await db.commentReviewPolicyVersion.count()).toBe(2);await expect(evaluation.evaluate(actor,p.id,{...input(first),requestKey:randomUUID()})).rejects.toThrow();const next=await batch(changed.version);expect(next.count).toBe(1);expect(next.revision).toBe(2);expect(next.payload.target).toBe(changed.target.normalize('NFKC'));const restarted=new ReviewPolicyService(db,new ModelSettingsService(db,{file}),qwen);expect((await restarted.overview(actor)).policies[0]).toMatchObject({revision:2,target:changed.target});
 });
 it('concurrency and idempotency permit one request; switch-off and replacement block before credential access',async()=>{
  const p=await enabled();await source();const preview=await batch(p.version),request=input(preview);await Promise.all([evaluation.evaluate(actor,p.id,request),evaluation.evaluate(actor,p.id,request)]);expect(transport).toHaveBeenCalledTimes(1);expect(await db.semanticModelCall.count()).toBe(1);
  await source('奇异搜索甲','法学');const next=await batch(p.version);const disabled=await policies.toggle(actor,p.id,{enabled:false,version:p.version});const keyRead=vi.spyOn(store,'resolve');await expect(evaluation.evaluate(actor,p.id,input(next))).rejects.toThrow();expect(keyRead.mock.calls.some(c=>c[1]===true)).toBe(false);keyRead.mockRestore();expect(disabled.enabled).toBe(false);
 });
 it('expired processing is recoverable only through a fresh preview, without automatic retry',async()=>{const p=await enabled();await source();const first=await batch(p.version);await db.semanticReview.updateMany({data:{state:'PROCESSING',leaseUntil:new Date(Date.now()+60000),version:{increment:1}}});expect((await policies.prepare(actor,p.id,{version:p.version,scope:{kind:'ALL'}})).count).toBe(0);expect(transport).not.toHaveBeenCalled();await db.semanticReview.updateMany({data:{leaseUntil:new Date(Date.now()-1000)}});const recovered=await batch(p.version);expect(recovered.reviewIds).toEqual(first.reviewIds);expect(recovered.hash).not.toBe(first.hash);expect(transport).not.toHaveBeenCalled();expect(await evaluation.evaluate(actor,p.id,input(recovered))).toMatchObject({status:'COMPLETED'});expect(transport).toHaveBeenCalledTimes(1);});
 it('replacing a model key invalidates consent and blocks the old preview before credential access',async()=>{const p=await enabled();await source();const preview=await batch(p.version);await store.save(actor,{version:1,model:'qwen3.8-flash',endpoint:'beijing-standard',note:'FAKE REPLACEMENT',key:'FAKE-REPLACED-KEY-0123456789',priceVersion:'beijing-2026-10-21'});const read=vi.spyOn(store,'resolve');try{await expect(evaluation.evaluate(actor,p.id,input(preview))).rejects.toThrow();expect(read.mock.calls.some(c=>c[1]===true)).toBe(false);expect(transport).not.toHaveBeenCalled();expect(await db.semanticModelCall.count()).toBe(0);}finally{read.mockRestore();}});
 it('provider failure keeps source intact and pending, creates no leads, and never retries automatically',async()=>{const p=await enabled();await source();const preview=await batch(p.version);transport.mockImplementationOnce(async()=>new Response('rate limit',{status:429}));expect(await evaluation.evaluate(actor,p.id,input(preview))).toMatchObject({status:'FAILED',errorCode:'RATE_LIMIT'});expect(transport).toHaveBeenCalledTimes(1);expect(await db.capturedComment.count()).toBe(1);expect(await db.semanticReview.findFirst()).toMatchObject({state:'FAILED',score:null,reviewStatus:'PENDING'});expect(await db.lead.count()).toBe(0);});
 it('policy change or disable during in-flight evaluation retains the result under its original revision',async()=>{const p=await enabled();await source();const preview=await batch(p.version),normal=transport.getMockImplementation()!;transport.mockImplementationOnce(async(u,i)=>{await policies.save(actor,p.id,{version:p.version,target:target+'，只标记明确表达'});return normal(u,i);});await evaluation.evaluate(actor,p.id,input(preview));expect(await db.semanticReview.findFirst()).toMatchObject({state:'EVALUATED',policyRevision:1});expect(await db.commentReviewPolicy.findUnique({where:{id:p.id}})).toMatchObject({revision:2});});
 it('HTTP validation, administrator/CSRF boundaries and explicit first use are enforced',async()=>{
  expect((await api().get('/api/comment-review')).status).toBe(401);expect((await api().get('/api/comment-review').set('Cookie',auth.sales.cookie)).status).toBe(403);expect((await write('put','/policies/workspace',{version:0,target},'sales')).status).toBe(403);expect((await api().put('/api/comment-review/policies/workspace').set('Cookie',auth.admin.cookie).set('Origin',origin).send({version:0,target})).status).toBe(403);expect((await write('put','/policies/workspace',{version:0,target:'短'})).status).toBe(400);
  const p=await saved();expect((await write('patch','/policies/workspace/control',{version:p.version,enabled:true})).status).toBe(400);expect((await write('post','/policies/workspace/prepare',{version:p.version,scope:{kind:'ALL'},keywords:['forged']})).status).toBe(400);expect(transport).not.toHaveBeenCalled();
 });
 it('manual provider consent and selected comments work while BOTH switches remain off',async()=>{
  const p=await saved(),a=await source(),b=await source('搜索乙','会计学');
  await policies.authorize(actor,{consent:reviewUseConsent,modelVersion:1,priceVersion:'beijing-2026-10-21'});
  const list=await policies.comments(actor,a.p.id,0);expect(list.items.map(c=>c.id)).toEqual([a.capture.id]);
  const selection=await policies.prepare(actor,p.id,{version:p.version,scope:{kind:'COMMENTS',commentIds:[b.capture.id]}});
  const preview=await evaluation.preview(actor,p.id,selection.reviewIds);expect(preview.usage.canCall).toBe(true);expect(preview.payload.items[0].comment).toBe('会计学');
  const attempts=await Promise.allSettled([evaluation.evaluate(actor,p.id,input(preview)),evaluation.evaluate(actor,p.id,input(preview))]);expect(attempts.filter(a=>a.status==='fulfilled')).toHaveLength(1);
  expect(transport).toHaveBeenCalledTimes(1);expect(await db.commentReviewPolicy.findUnique({where:{id:p.id}})).toMatchObject({enabled:false,autoEnabled:false});
 });
 it('automatic consent is distinct even for already authorized legacy users; no missing target/key or forged scope',async()=>{
  const p=await enabled();await expect(policies.automatic(actor,p.id,{version:p.version,enabled:true})).rejects.toThrow();
  await expect(policies.automatic(sales,p.id,{version:p.version,enabled:false})).rejects.toThrow();
  expect((await write('patch','/policies/workspace/automatic',{version:p.version,enabled:true},'sales')).status).toBe(403);
  expect((await write('post','/authorize',{consent:reviewUseConsent,modelVersion:1,priceVersion:'beijing-2026-10-21'},'sales')).status).toBe(403);
  expect((await api().get('/api/comment-review/posts/any/comments').set('Cookie',auth.sales.cookie)).status).toBe(403);
  expect((await write('post','/policies/workspace/prepare',{version:p.version,scope:{kind:'COMMENTS',commentIds:['fake','fake']}})).status).toBe(400);
  await expect(policies.prepare(actor,p.id,{version:p.version,scope:{kind:'COMMENTS',commentIds:['missing']}})).rejects.toThrow();
  await expect(policies.prepare(actor,'missing',{version:1,scope:{kind:'ALL'}})).rejects.toThrow();
  await db.modelSettings.deleteMany();await expect(policies.automatic(actor,p.id,{version:p.version,enabled:true,consent:reviewAutoConsent,modelVersion:1,priceVersion:'beijing-2026-10-21'})).rejects.toThrow();expect(transport).not.toHaveBeenCalled();
 });
 async function autoEnabled(){const p=await saved();return policies.automatic(actor,p.id,{version:p.version,enabled:true,consent:reviewAutoConsent,modelVersion:1,priceVersion:'beijing-2026-10-21'});}
 async function finishedSource(complete=true){const s=await source();await db.capturedPost.update({where:{id:s.p.id},data:{coverage:complete?'COMPLETE':'PARTIAL'}});const run=await db.collectionRun.findUniqueOrThrow({where:{id:s.capture.runId}});await automatic.postFinished(run,{post:{id:s.p.platformPostId,title:''},comments:[],deletedIds:[],complete,windowRead:true,stopReason:complete?undefined:'COMMENT_LIMIT'});return s;}
 it('per-post callback schedules only complete coverage; repeated completion and concurrent ticks charge once',async()=>{
  await autoEnabled();const complete=await finishedSource(),partial=await finishedSource(false);
  const run=await db.collectionRun.findUniqueOrThrow({where:{id:complete.capture.runId}});await automatic.postFinished(run,{post:{id:complete.p.platformPostId,title:''},comments:[],deletedIds:[],complete:true,windowRead:true});
  expect(await db.autoReviewJob.count()).toBe(2);expect(await db.autoReviewJob.findFirst({where:{postId:partial.p.id}})).toMatchObject({status:'SKIPPED',reason:'覆盖未通过：COMMENT_LIMIT'});
  await Promise.all([automatic.tick(),automatic.tick()]);expect(transport).toHaveBeenCalledTimes(1);expect(await db.semanticModelCall.count()).toBe(1);
  await db.semanticModelCall.updateMany({data:{createdAt:new Date(Date.now()-31000)}});await automatic.tick();expect(transport).toHaveBeenCalledTimes(1);expect(await db.autoReviewJob.findFirst({where:{postId:complete.p.id}})).toMatchObject({status:'COMPLETED',processed:1});
 });
 it('collector complete hook enqueues automatically and saves still never dispatch',async()=>{
  await autoEnabled();const c=await collection.create(actor,{name:'合成自动覆盖',platform:'XHS',mode:'MOCK',keywords:['护理'],excludeWords:[],batchLimit:1,enabled:true});
  const adapter=new MockAdapter('XHS','BASELINE');adapter.search=async()=>({items:[{id:'demo-collect-auto-post',title:'选题'}],complete:true});adapter.post=async p=>p;adapter.comments=async()=>({items:[{id:'demo-collect-auto-comment',userId:'demo-collect-auto-user',nickname:'虚构',text:'护理学',hasReplies:false}],complete:true});
  const run=await collection.start(actor,c.id,'BASELINE',randomUUID());await collection.execute(run.id,adapter);expect(await db.autoReviewJob.findFirst({where:{runId:run.id}})).toMatchObject({status:'PENDING'});expect(transport).not.toHaveBeenCalled();await automatic.tick();expect(transport).toHaveBeenCalledTimes(1);
 });
 it.each(['cancel','failed','coverage','model','off','target'])('automatic rechecks %s before any credential access',async reason=>{
  const p=await autoEnabled(),s=await finishedSource();
  if(reason==='cancel')await db.collectionRun.update({where:{id:s.capture.runId},data:{cancelRequested:true}});
  if(reason==='failed')await db.collectionRun.update({where:{id:s.capture.runId},data:{status:'FAILED'}});
  if(reason==='coverage')await db.capturedPost.update({where:{id:s.p.id},data:{coverage:'PARTIAL'}});
  if(reason==='model')await db.modelSettings.updateMany({data:{version:{increment:1}}});
  if(reason==='off')await policies.automatic(actor,p.id,{version:p.version,enabled:false});
  if(reason==='target')await policies.save(actor,p.id,{version:p.version,target:target+'，排除服务广告'});
  const read=vi.spyOn(store,'resolve');try{await automatic.tick();expect(transport).not.toHaveBeenCalled();expect(read.mock.calls.some(c=>c[1]===true)).toBe(false);expect(await db.autoReviewJob.findFirst()).toMatchObject({status:'CANCELLED'});}finally{read.mockRestore();}
 });
 it('turn-off between automatic reservation and dispatch prevents the transport',async()=>{
  const p=await autoEnabled(),s=await finishedSource(),job=await db.autoReviewJob.findFirstOrThrow();await db.autoReviewJob.update({where:{id:job.id},data:{status:'PROCESSING'}});
  const prepared=await policies.prepare(actor,p.id,{version:p.version,scope:{kind:'POSTS',postIds:[s.p.id]}},true),preview=await evaluation.preview(actor,p.id,prepared.reviewIds,false,true);
  const original=db.$transaction.bind(db);let calls=0;const spy=vi.spyOn(db,'$transaction').mockImplementation((async(...args:any[])=>{const result=await (original as any)(...args);if(++calls===1)await policies.automatic(actor,p.id,{version:p.version,enabled:false});return result;}) as any);
  try{expect(await evaluation.evaluate(actor,p.id,input(preview),job.id)).toMatchObject({status:'FAILED'});expect(transport).not.toHaveBeenCalled();}finally{spy.mockRestore();}
 });
 it('automatic failed/uncertain calls are never retried; manual recovery stays possible',async()=>{
  const p=await autoEnabled();await finishedSource();transport.mockImplementationOnce(async()=>new Response('rate limit',{status:429}));await automatic.tick();expect(await db.autoReviewJob.findFirst()).toMatchObject({status:'FAILED'});await db.semanticModelCall.updateMany({data:{createdAt:new Date(Date.now()-31000)}});await automatic.tick();expect(transport).toHaveBeenCalledTimes(1);
  const off=await policies.automatic(actor,p.id,{version:p.version,enabled:false});const preview=await batch(off.version);expect(await evaluation.evaluate(actor,p.id,input(preview))).toMatchObject({status:'COMPLETED'});
  const s=await source('新搜索','药学');await db.autoReviewJob.create({data:{policyId:p.id,policyVersion:off.version,postId:s.p.id,runId:s.capture.runId,status:'PROCESSING',updatedAt:new Date(Date.now()-430000)}});await automatic.tick();expect(transport).toHaveBeenCalledTimes(2);expect(await db.autoReviewJob.findFirst({where:{postId:s.p.id}})).toMatchObject({status:'FAILED'});
 });

 it('automatic whole posts honor one request and global daily budget',async()=>{
  await autoEnabled();const s=await finishedSource();
  for(let i=0;i<5;i++)await db.capturedComment.create({data:{configId:s.c.id,runId:s.capture.runId,lastRunId:s.capture.runId,postId:s.p.id,platformCommentId:randomUUID(),contentHash:randomUUID(),contextVersion:'captured-context-v1',snapshot:{...(s.capture.snapshot as object),comment:['法学','医学','会计学','社会学','药学'][i]},isDemo:true}});
  await db.modelSettings.updateMany({data:{dailyLimit:1}});await automatic.tick();expect(await db.semanticModelCall.findFirst()).toMatchObject({rows:6,trigger:'AUTOMATIC',configurationVersion:1});await automatic.tick();expect(transport).toHaveBeenCalledTimes(1);
  await db.semanticModelCall.updateMany({data:{createdAt:new Date(Date.now()-31000)}});await automatic.tick();expect(transport).toHaveBeenCalledTimes(1);expect(await db.autoReviewJob.findFirst()).toMatchObject({status:'COMPLETED',processed:6});
  await db.modelSettings.updateMany({data:{dailyLimit:2}});await automatic.tick();expect(transport).toHaveBeenCalledTimes(1);expect(await db.semanticReview.count({where:{state:'EVALUATED'}})).toBe(6);
 });
 it('real-source COMPLETE label alone is insufficient without bounded coverage evidence',async()=>{
  await autoEnabled();const s=await finishedSource();await db.collectionRun.update({where:{id:s.capture.runId},data:{snapshot:{mode:'XHS_MCP'}}});await automatic.tick();expect(transport).not.toHaveBeenCalled();expect(await db.autoReviewJob.findFirst()).toMatchObject({status:'CANCELLED',reason:'缺少完整覆盖证据'});
 });
 it('model changes stop automatic jobs and require renewed consent, preserving historical policy',async()=>{
  const p=await autoEnabled();await finishedSource();await store.save(actor,{version:1,model:'qwen3.8-flash',endpoint:'beijing-standard',note:'FAKE TEST ONLY',priceVersion:'beijing-2026-10-21'});
  expect(await db.commentReviewPolicy.findUnique({where:{id:p.id}})).toMatchObject({autoEnabled:false,revision:1,autoModelVersion:null});expect(await db.autoReviewJob.findFirst()).toMatchObject({status:'CANCELLED'});await automatic.tick();expect(transport).not.toHaveBeenCalled();expect(await db.commentReviewPolicyVersion.count()).toBe(1);
 });

 it('completed resumed posts include earlier saved chunks and a never-dispatched manual preview',async()=>{
  const p=await autoEnabled(),s=await source();await db.capturedComment.update({where:{id:s.capture.id},data:{lastRunId:'earlier-confirmed-chunk'}});
  const preview=await batch(p.version,[s.p.id]);expect(preview.count).toBe(1);expect(transport).not.toHaveBeenCalled();
  await db.capturedPost.update({where:{id:s.p.id},data:{coverage:'COMPLETE'}});const run=await db.collectionRun.findUniqueOrThrow({where:{id:s.capture.runId}});
  await automatic.postFinished(run,{post:{id:s.p.platformPostId,title:''},comments:[],deletedIds:[],complete:true,windowRead:true});await automatic.tick();expect(transport).toHaveBeenCalledTimes(1);expect(await db.semanticReview.findFirst()).toMatchObject({state:'EVALUATED'});
 });

});

const wholeInput=(j:any)=>({hash:j.scopeHash,requestKey:randomUUID(),consent:manualPostConsent,providerConsent:reviewUseConsent});
async function wholeSource(n=56){const s=await source();for(let i=1;i<n;i++){const snapshot={...(s.capture.snapshot as any),comment:'护理学专业'+String.fromCodePoint(0x4e00+i),commentId:randomUUID(),parentId:i%3?s.capture.platformCommentId:'nested-parent',parent:'护理学专业'};await db.capturedComment.create({data:{configId:s.c.id,runId:s.capture.runId,lastRunId:s.capture.runId,postId:s.p.id,platformCommentId:snapshot.commentId,contentHash:semanticHash(snapshot),contextVersion:'captured-context-v1',snapshot,isDemo:true}});}return s;}
async function nextManual(){await db.semanticModelCall.updateMany({data:{createdAt:new Date(Date.now()-31000)}});await manual.tick();}
describe('whole saved post manual tasks and relevance results (mock transport)',()=>{
 it('56 saved comments including nested replies survive preview pagination in ONE call, with auto OFF and idempotency',async()=>{
  const p=await saved(),s=await wholeSource();const [a,b]=await Promise.all([manual.prepare(actor,p.id,{revision:p.revision,postId:s.p.id}),manual.prepare(actor,p.id,{revision:p.revision,postId:s.p.id})]);expect(a.id).toBe(b.id);expect(a).toMatchObject({total:56,pending:56,skipped:0,maxCalls:1,coverage:'PARTIAL'});expect(transport).not.toHaveBeenCalled();
  const pages=await Promise.all([0,20,40].map(n=>manual.previewPage(actor,a.id,n)));expect(pages.map(p=>p.items.length)).toEqual([20,20,16]);expect(pages[2].hasMore).toBe(false);expect(pages.flatMap(p=>p.items).filter(p=>p.parent==='护理学专业')).toHaveLength(55);
  const input=wholeInput(a);await Promise.all([manual.confirm(actor,a.id,input),manual.confirm(actor,a.id,input)]);await Promise.all([nextManual(),manual.tick()]);const [job]=await manual.list(actor,p.id);expect(job).toMatchObject({status:'COMPLETED',total:56,success:56,pending:0,failed:0,skipped:0});expect(transport).toHaveBeenCalledTimes(1);expect((await db.semanticModelCall.findMany()).map(c=>c.rows).sort((a,b)=>a-b)).toEqual([56]);expect(await db.commentReviewPolicy.findUnique({where:{id:p.id}})).toMatchObject({autoEnabled:false,enabled:false});
  await nextManual();expect((await manual.prepare(actor,p.id,{revision:1,postId:s.p.id})).id).toBe(a.id);expect(transport).toHaveBeenCalledTimes(1);expect(await db.lead.count()).toBe(0);expect(await db.contactAttempt.count()).toBe(0);
  const results=await policies.results(actor,p.id,40,{sort:'score-desc',postId:s.p.id,minScore:80,maxScore:100});expect(results.total).toBe(56);expect(results.items).toHaveLength(16);expect(results.items.every(r=>r.reviewStatus==='PENDING'&&r.score===90)).toBe(true);
 });
 it('source/target/model change invalidates confirmation; no Key or target blocks preparing',async()=>{
  const p=await saved(),s=await wholeSource(2),j=await manual.prepare(actor,p.id,{revision:1,postId:s.p.id});await db.capturedComment.update({where:{id:s.capture.id},data:{snapshot:{...(s.capture.snapshot as any),comment:'法学专业'}}});await expect(manual.confirm(actor,j.id,wholeInput(j))).rejects.toThrow('变化');
  const k=await manual.prepare(actor,p.id,{revision:1,postId:s.p.id});await policies.save(actor,p.id,{version:p.version,target:target+'，排除服务广告'});await expect(manual.confirm(actor,k.id,wholeInput(k))).rejects.toThrow();await expect(manual.prepare(actor,'missing',{revision:1,postId:s.p.id})).rejects.toThrow();await db.modelSettings.deleteMany();await expect(manual.prepare(actor,p.id,{revision:2,postId:s.p.id})).rejects.toThrow('Key');expect(transport).not.toHaveBeenCalled();
 });
 it.each(['cancel','target','model','permission'])('stops queued whole-post work on %s before credential access',async reason=>{
  const p=await saved(),s=await wholeSource(7),j=await manual.prepare(actor,p.id,{revision:1,postId:s.p.id});await manual.confirm(actor,j.id,wholeInput(j));
  if(reason==='cancel')await manual.cancel(actor,j.id);if(reason==='target')await policies.save(actor,p.id,{version:p.version,target:target+'，排除服务广告'});if(reason==='model')await db.modelSettings.updateMany({data:{version:{increment:1}}});if(reason==='permission')await db.user.update({where:{id:actor.id},data:{role:'SALES'}});
  const read=vi.spyOn(store,'resolve');try{await manual.tick();expect(transport).not.toHaveBeenCalled();expect(read.mock.calls.some(c=>c[1]===true)).toBe(false);expect((await manual.list(actor,p.id))[0]).toMatchObject({status:reason==='cancel'?'CANCELLED':'INVALIDATED',pending:7});}finally{read.mockRestore();await db.user.update({where:{id:actor.id},data:{role:'ADMIN'}});}
 });
 it('respects cumulative daily budget and interval; duplicate workers, cancellation in flight and automatic toggle cannot charge another batch',async()=>{
  const p=await saved(),s=await wholeSource(11);await db.modelSettings.updateMany({data:{dailyLimit:1}});const j=await manual.prepare(actor,p.id,{revision:1,postId:s.p.id});await manual.confirm(actor,j.id,wholeInput(j));await Promise.all([manual.tick(),manual.tick()]);await manual.tick();await nextManual();expect(transport).toHaveBeenCalledTimes(1);expect((await manual.list(actor,p.id))[0]).toMatchObject({status:'COMPLETED',success:11,pending:0});await manual.cancel(actor,j.id);await nextManual();expect(transport).toHaveBeenCalledTimes(1);
 });
 it('one confirm stays valid across automatic OFF, but cancels future batches during an in-flight request',async()=>{
  const p=await saved(),s=await wholeSource(7),j=await manual.prepare(actor,p.id,{revision:1,postId:s.p.id});await manual.confirm(actor,j.id,wholeInput(j));await policies.automatic(actor,p.id,{version:p.version,enabled:false});const normal=transport.getMockImplementation()!;transport.mockImplementationOnce(async(u,i)=>{await manual.cancel(actor,j.id);return normal(u,i);});await manual.tick();await nextManual();expect(transport).toHaveBeenCalledTimes(1);expect((await manual.list(actor,p.id))[0]).toMatchObject({status:'CANCELLED',success:7,pending:0});
 });
 it('provider failure and stale worker interruption are terminal, preserve pending counts and never auto-retry',async()=>{
  const p=await saved(),s=await wholeSource(7),j=await manual.prepare(actor,p.id,{revision:1,postId:s.p.id});await manual.confirm(actor,j.id,wholeInput(j));transport.mockImplementationOnce(async()=>new Response('failure',{status:429}));await manual.tick();await nextManual();expect(transport).toHaveBeenCalledTimes(1);expect((await manual.list(actor,p.id))[0]).toMatchObject({status:'FAILED',failed:7,pending:0});
  const remaining=await manual.prepare(actor,p.id,{revision:1,postId:s.p.id});expect(remaining).toMatchObject({status:'PREVIEW',total:7,pending:7,skipped:0,retrying:7,maxCalls:1});expect(transport).toHaveBeenCalledTimes(1);
  const other=await source('另一个搜索','法学专业'),k=await manual.prepare(actor,p.id,{revision:1,postId:other.p.id});await manual.confirm(actor,k.id,wholeInput(k));const raw=await db.manualReviewJob.findUniqueOrThrow({where:{id:k.id}});await db.manualReviewJob.update({where:{id:k.id},data:{status:'PROCESSING',batchIds:(raw.items as any[]).map(i=>i.reviewId),updatedAt:new Date(Date.now()-421000)}});await nextManual();expect((await manual.list(actor,p.id)).find(t=>t.id===k.id)).toMatchObject({status:'FAILED',failed:1,pending:0});expect(transport).toHaveBeenCalledTimes(1);
 });
 it('duplicates and prior completed or attempted reviews are skipped without duplicate payment',async()=>{
  const p=await enabled(),s=await source(),preview=await batch(p.version);await evaluation.evaluate(actor,p.id,input(preview));const copy=await source('第二搜索','护理学',s.capture.contentHash),j=await manual.prepare(actor,p.id,{revision:1,postId:copy.p.id});expect(j).toMatchObject({total:1,pending:0,skipped:1,maxCalls:0});await manual.confirm(actor,j.id,wholeInput(j));await nextManual();expect(transport).toHaveBeenCalledTimes(1);expect((await policies.results(actor,p.id,0,{sort:'newest',postId:copy.p.id})).total).toBe(1);
 });
 it('API admin/CSRF/schema limits protect whole-job endpoints and full preview; search paging is independent of execution',async()=>{
  const p=await saved(),s=await wholeSource(2);for(let i=0;i<22;i++)await db.capturedPost.create({data:{configId:s.c.id,runId:s.p.runId,lastRunId:s.p.runId,platformPostId:randomUUID(),contentHash:randomUUID(),snapshot:{title:'合成分页帖子'+i},coverage:'PARTIAL'}});
  const posts=await policies.posts(actor,0,'合成分页帖子');expect(posts.items).toHaveLength(20);expect(posts.hasMore).toBe(true);expect((await policies.posts(actor,20,'合成分页帖子')).items).toHaveLength(2);expect((await policies.posts(actor,0,'不匹配')).items).toHaveLength(0);
  expect((await write('post','/policies/workspace/manual-post',{postId:s.p.id,revision:1},'sales')).status).toBe(403);expect((await api().post('/api/comment-review/policies/workspace/manual-post').set('Cookie',auth.admin.cookie).send({postId:s.p.id,revision:1})).status).toBe(403);expect((await write('post','/policies/workspace/manual-post',{postId:s.p.id,revision:1,limit:5})).status).toBe(400);
  const prepared=await write('post','/policies/workspace/manual-post',{postId:s.p.id,revision:1});expect(prepared.status).toBe(201);const j=prepared.body;expect((await api().get('/api/comment-review/manual-jobs/'+j.id+'/preview').set('Cookie',auth.sales.cookie)).status).toBe(403);expect((await write('post','/manual-jobs/'+j.id+'/confirm',{hash:j.scopeHash,requestKey:randomUUID(),consent:semanticBatchConsent})).status).toBe(400);expect((await write('post','/manual-jobs/'+j.id+'/confirm',wholeInput(j))).status).toBe(201);expect(transport).not.toHaveBeenCalled();
 });
 it('result sorting, inclusive score boundaries, nulls, manual states, post/search and stable pagination preserve history',async()=>{
  const p=await saved(),s=await wholeSource(23);await manual.prepare(actor,p.id,{revision:1,postId:s.p.id});const rows=await db.semanticReview.findMany({orderBy:{id:'asc'}});for(let i=0;i<rows.length;i++)await db.semanticReview.update({where:{id:rows[i].id},data:{score:i===0?null:i,state:i===0?'FAILED':'EVALUATED',reviewStatus:i===22?'REJECTED':'PENDING'}});
  const desc=await policies.results(actor,p.id,0,{sort:'score-desc'}),tail=await policies.results(actor,p.id,20,{sort:'score-desc'});expect(desc.items[0].score).toBe(22);expect(tail.items.at(-1)?.score).toBeNull();expect(new Set([...desc.items,...tail.items].map(r=>r.id)).size).toBe(23);
  const filtered=await policies.results(actor,p.id,0,{sort:'score-asc',minScore:20,maxScore:22,status:'PENDING',postId:s.p.id,search:'护理学'});expect(filtered.items.map(r=>r.score)).toEqual([20,21]);expect((await policies.results(actor,p.id,0,{sort:'newest',state:'FAILED'})).total).toBe(1);expect((await policies.results(actor,p.id,0,{sort:'newest',status:'REJECTED'})).total).toBe(1);
  expect((await api().get('/api/comment-review/policies/workspace/results?minScore=90&maxScore=10').set('Cookie',auth.admin.cookie)).status).toBe(400);expect((await api().get('/api/comment-review/policies/workspace/results?sort=score-desc&minScore=20').set('Cookie',auth.admin.cookie)).body.total).toBe(3);expect(transport).not.toHaveBeenCalled();
 });
 it('frozen scope excludes later saved comments and survives worker reconstruction',async()=>{
  const p=await saved(),s=await wholeSource(7),j=await manual.prepare(actor,p.id,{revision:1,postId:s.p.id});await manual.confirm(actor,j.id,wholeInput(j));const snapshot={...(s.capture.snapshot as any),comment:'后来保存的法学',commentId:randomUUID()};await db.capturedComment.create({data:{configId:s.c.id,runId:s.capture.runId,lastRunId:s.capture.runId,postId:s.p.id,platformCommentId:snapshot.commentId,contentHash:semanticHash(snapshot),contextVersion:'captured-context-v1',snapshot,isDemo:true}});
  await new ManualReviewService(db,policies,evaluation).tick();await nextManual();expect((await manual.list(actor,p.id))[0]).toMatchObject({total:7,success:7,status:'COMPLETED'});expect(await db.capturedComment.count()).toBe(8);expect(transport).toHaveBeenCalledTimes(1);expect((await manual.prepare(actor,p.id,{revision:1,postId:s.p.id}))).toMatchObject({total:8,pending:1,skipped:7});
 });
 it.each(['cancel','text','input-policy','automatic'])('dispatch boundary rechecks %s after batch preview',async reason=>{
  const p=await saved(),s=await wholeSource(2),j=await manual.prepare(actor,p.id,{revision:1,postId:s.p.id});await manual.confirm(actor,j.id,wholeInput(j));const original=evaluation.preview.bind(evaluation),spy=vi.spyOn(evaluation,'preview').mockImplementationOnce(async(...args)=>{const value=await original(...args);if(reason==='cancel')await manual.cancel(actor,j.id);if(reason==='text'){const job=await db.manualReviewJob.findUniqueOrThrow({where:{id:j.id}}),payload=job.preview as any;payload.items[0].comment='变化的脱敏文本';await db.manualReviewJob.update({where:{id:j.id},data:{preview:payload}});}if(reason==='input-policy'){const job=await db.manualReviewJob.findUniqueOrThrow({where:{id:j.id}}),payload=job.preview as any;delete payload.inputPolicyVersion;await db.manualReviewJob.update({where:{id:j.id},data:{preview:payload}});}if(reason==='automatic')await policies.automatic(actor,p.id,{version:p.version,enabled:false});return value;});
  const read=vi.spyOn(store,'resolve');try{await manual.tick();expect(transport).toHaveBeenCalledTimes(reason==='automatic'?1:0);if(reason!=='automatic'){expect(read.mock.calls.some(c=>c[1]===true)).toBe(false);expect(await db.semanticModelCall.count()).toBe(0);}}finally{spy.mockRestore();read.mockRestore();}
 });
 it('expired confirmation and replaced model require a fresh task preview',async()=>{
  const p=await saved(),s=await source(),j=await manual.prepare(actor,p.id,{revision:1,postId:s.p.id});await db.manualReviewJob.update({where:{id:j.id},data:{createdAt:new Date(Date.now()-901000)}});await expect(manual.confirm(actor,j.id,wholeInput(j))).rejects.toThrow();const fresh=await manual.prepare(actor,p.id,{revision:1,postId:s.p.id});expect(fresh.id).not.toBe(j.id);await db.modelSettings.updateMany({data:{version:{increment:1}}});await expect(manual.confirm(actor,fresh.id,wholeInput(fresh))).rejects.toThrow();expect(transport).not.toHaveBeenCalled();
 });

});

describe('original input authorization and historical preservation (mock provider)',()=>{
 const synthetic='Biology 2026 １２３ test@example.invalid +1 202-555-0100 微信：synthetic_wx\n👩🏽‍💻 [笑哭R] [已脱敏]';
 it.each(['whole','batch','auto'])('sends exact saved body through %s, no independent identity fields',async mode=>{
  let p=await saved();const s=await source('合成搜索',synthetic);
  if(mode==='whole'){const j=await manual.prepare(actor,p.id,{revision:1,postId:s.p.id});expect((await manual.previewPage(actor,j.id,0)).items[0].comment).toBe(synthetic);await manual.confirm(actor,j.id,wholeInput(j));await manual.tick();}
  if(mode==='batch'){await policies.authorize(actor,{consent:reviewUseConsent,modelVersion:1,priceVersion:'beijing-2026-10-21'});const preview=await batch(p.version);expect(preview.payload.items[0].comment).toBe(synthetic);await evaluation.evaluate(actor,p.id,input(preview));}
  if(mode==='auto'){p=await policies.automatic(actor,p.id,{version:p.version,enabled:true,consent:reviewAutoConsent,modelVersion:1,priceVersion:'beijing-2026-10-21'});await db.capturedPost.update({where:{id:s.p.id},data:{coverage:'COMPLETE'}});const run=await db.collectionRun.findUniqueOrThrow({where:{id:s.capture.runId}});await automatic.postFinished(run,{post:{id:s.p.platformPostId,title:''},comments:[],deletedIds:[],complete:true,windowRead:true});await automatic.tick();}
  expect(transport).toHaveBeenCalledTimes(1);const payload=JSON.parse(JSON.parse(transport.mock.calls[0][1].body as string).messages[1].content);expect(payload.inputPolicyVersion).toBe(semanticInputPolicy);expect(payload.items[0].comment).toBe(synthetic);expect(Object.keys(payload.items[0]).sort()).toEqual(['body','comment','id','missingParent','parent','partial','title','truncated']);
  const row=await db.semanticReview.findFirstOrThrow();expect(row.state).toBe('EVALUATED');expect((row.evaluationInput as any).items[0].comment).toBe(synthetic);expect((row.result as any).evidence[0].quote).toBe(synthetic);expect(await db.contactAttempt.count()).toBe(0);
 });
 it('legacy provider consent does not grant original permission; old batch hash fails even with new consent',async()=>{
  const p=await enabled();await source('合成搜索',synthetic);await db.modelSettings.updateMany({data:{consent:true,consentInputPolicy:null}});expect((await store.resolve()).status.authorized).toBe(false);await expect(batch(p.version)).rejects.toThrow();
  await policies.authorize(actor,{consent:reviewUseConsent,modelVersion:1,priceVersion:'beijing-2026-10-21'});const preview=await batch(p.version),rows=await db.semanticReview.findMany();const old={...preview.payload};delete old.inputPolicyVersion;old.items=old.items.map(i=>({...i,comment:'[已脱敏]'}));
  const hash=previewHash(old,rows,1,`workspace:${p.version}:qwen3.8-flash:1:beijing-2026-10-21`);await expect(evaluation.evaluate(actor,p.id,{...input(preview),previewHash:hash})).rejects.toThrow('变化');expect(transport).not.toHaveBeenCalled();expect(await db.semanticModelCall.count()).toBe(0);
 });
 it.each(['PREVIEW','PENDING'])('old whole-post %s cannot be promoted to original input',async status=>{
  const p=await saved(),s=await source(),j=await manual.prepare(actor,p.id,{revision:1,postId:s.p.id});if(status==='PENDING')await manual.confirm(actor,j.id,wholeInput(j));const stored=await db.manualReviewJob.findUniqueOrThrow({where:{id:j.id}}),payload=stored.preview as any;delete payload.inputPolicyVersion;await db.manualReviewJob.update({where:{id:j.id},data:{preview:payload,status}});
  if(status==='PREVIEW')await expect(manual.confirm(actor,j.id,wholeInput(j))).rejects.toThrow('输入策略');else{await manual.tick();expect((await manual.list(actor,p.id))[0].status).toBe('INVALIDATED');}expect(transport).not.toHaveBeenCalled();
 });
 it('old automatic queue defaults to legacy policy and is cancelled before dispatch',async()=>{
  const p=await saved(),on=await policies.automatic(actor,p.id,{version:p.version,enabled:true,consent:reviewAutoConsent,modelVersion:1,priceVersion:'beijing-2026-10-21'}),s=await source();await db.autoReviewJob.create({data:{policyId:p.id,policyVersion:on.version,runId:s.capture.runId,postId:s.p.id}});await automatic.tick();expect(await db.autoReviewJob.findFirst()).toMatchObject({status:'CANCELLED',inputPolicyVersion:'contact-redaction-v1'});expect(transport).not.toHaveBeenCalled();
 });
 it('historical completed redacted input remains unchanged and is never silently recharged',async()=>{
  const p=await saved(),s=await source('合成搜索',synthetic),j=await manual.prepare(actor,p.id,{revision:1,postId:s.p.id}),row=await db.semanticReview.findFirstOrThrow();const historical={redactionVersion:'contact-redaction-v1',target,items:[{id:'item1',title:'',body:'',comment:'[已脱敏]',parent:null,missingParent:true,partial:true,truncated:false}]};await db.semanticReview.update({where:{id:row.id},data:{state:'EVALUATED',score:70,evaluationInput:historical,modelVersion:'qwen3.8-flash:comment-first-v1'}});await manual.cancel(actor,j.id);const fresh=await manual.prepare(actor,p.id,{revision:1,postId:s.p.id});expect(fresh).toMatchObject({pending:0,skipped:1});expect((await db.semanticReview.findUniqueOrThrow({where:{id:row.id}})).evaluationInput).toEqual(historical);expect(transport).not.toHaveBeenCalled();
 });
 it.each(['whole','auto'])('%s large raw texts use one request and retain every character',async mode=>{
  const p=await saved(),s=await wholeSource(5),captures=await db.capturedComment.findMany({where:{postId:s.p.id}});
  for(let n=0;n<captures.length;n++){const c=captures[n],snapshot={...(c.snapshot as any),comment:'护理学'+n+'字'.repeat(6000)};await db.capturedComment.update({where:{id:c.id},data:{snapshot,contentHash:semanticHash(snapshot)}});}
  if(mode==='whole'){const j=await manual.prepare(actor,p.id,{revision:1,postId:s.p.id});expect(j.maxCalls).toBe(1);await manual.confirm(actor,j.id,wholeInput(j));}else{await policies.automatic(actor,p.id,{version:p.version,enabled:true,consent:reviewAutoConsent,modelVersion:1,priceVersion:'beijing-2026-10-21'});await db.capturedPost.update({where:{id:s.p.id},data:{coverage:'COMPLETE'}});const run=await db.collectionRun.findUniqueOrThrow({where:{id:s.capture.runId}});await automatic.postFinished(run,{post:{id:s.p.platformPostId,title:''},comments:[],deletedIds:[],complete:true,windowRead:true});}
  const normal=transport.getMockImplementation()!;transport.mockImplementation(async(u,i)=>{const p=JSON.parse(JSON.parse(i.body as string).messages[1].content);expect(p.items).toHaveLength(5);expect(Buffer.byteLength(JSON.stringify(p))).toBeGreaterThan(48000);const response=await normal(u,i),data:any=await response.json();const result=JSON.parse(data.choices[0].message.content);result.items.forEach((r:any)=>r.evidence[0].quote=r.evidence[0].quote.slice(0,30));data.choices[0].message.content=JSON.stringify(result);return new Response(JSON.stringify(data));});
  try{for(let i=0;i<4;i++){await db.semanticModelCall.updateMany({data:{createdAt:new Date(Date.now()-31000)}});if(mode==='whole')await manual.tick();else await automatic.tick();}if(mode==='whole')expect((await manual.list(actor,p.id))[0]).toMatchObject({success:5,status:'COMPLETED'});else expect(await db.autoReviewJob.findFirst()).toMatchObject({processed:5,status:'COMPLETED'});expect(transport).toHaveBeenCalledTimes(1);expect((await db.semanticReview.findMany()).every(r=>(r.evaluationInput as any).items.every((i:any)=>i.comment.length===6004))).toBe(true);}finally{transport.mockImplementation(normal);}
 });
});

describe('single-request whole-post retry eligibility and frozen history (mock only)',()=>{
 it('5 failed + 1 pending become 6 pending in ONE explicit request; old preview, failures and call history remain',async()=>{
  const p=await saved(),s=await wholeSource(6),old=await manual.prepare(actor,p.id,{revision:1,postId:s.p.id});
  await policies.authorize(actor,{consent:reviewUseConsent,modelVersion:1,priceVersion:'beijing-2026-10-21'});
  const ids=(await db.semanticReview.findMany({orderBy:{id:'asc'}})).slice(0,5).map(r=>r.id),v=await evaluation.preview(actor,p.id,ids);
  transport.mockImplementationOnce(async()=>new Response('synthetic failure',{status:429}));await evaluation.evaluate(actor,p.id,input(v));
  const before=JSON.parse(JSON.stringify(await db.semanticReview.findMany({where:{state:'FAILED'},orderBy:{id:'asc'}}))),oldStored=await db.manualReviewJob.findUniqueOrThrow({where:{id:old.id}});
  await expect(manual.confirm(actor,old.id,wholeInput(old))).rejects.toThrow('状态已变化');
  const [j,k]=await Promise.all([manual.prepare(actor,p.id,{revision:1,postId:s.p.id}),manual.prepare(actor,p.id,{revision:1,postId:s.p.id})]);expect(j.id).toBe(k.id);expect(j.id).not.toBe(old.id);expect(j).toMatchObject({total:6,pending:6,retrying:5,skipped:0,maxCalls:1});
  expect(await db.manualReviewJob.findUniqueOrThrow({where:{id:old.id}})).toEqual(oldStored);
  const request=wholeInput(j);await Promise.all([manual.confirm(actor,j.id,request),manual.confirm(actor,j.id,request)]);await expect(manual.confirm(actor,j.id,wholeInput(j))).rejects.toThrow();
  await nextManual();await nextManual();expect(transport).toHaveBeenCalledTimes(2);expect(JSON.parse(JSON.parse(transport.mock.calls[1][1].body as string).messages[1].content).items).toHaveLength(6);
  expect((await manual.list(actor,p.id)).find(row=>row.id===j.id)).toMatchObject({success:6,pending:0,status:'COMPLETED'});
  const history=(await db.manualReviewJob.findUniqueOrThrow({where:{id:j.id}})).items as any[];
  expect(history.filter(i=>i.previousAttempt).map(i=>i.previousAttempt).sort((a,b)=>a.id.localeCompare(b.id))).toEqual(before);
  expect(await db.semanticModelCall.count({where:{status:'FAILED'}})).toBe(1);expect(await db.semanticModelCall.count()).toBe(2);expect(await db.semanticReview.count({where:{state:'EVALUATED'}})).toBe(6);
 });
 it('failed single request stops; a new preview is required, exhausted budget waits and cancellation never resends',async()=>{
  const p=await saved(),s=await wholeSource(6),j=await manual.prepare(actor,p.id,{revision:1,postId:s.p.id});await db.modelSettings.updateMany({data:{dailyLimit:1}});await manual.confirm(actor,j.id,wholeInput(j));transport.mockImplementationOnce(async()=>new Response('synthetic',{status:429}));await manual.tick();await nextManual();expect(transport).toHaveBeenCalledTimes(1);
  const failed=await db.manualReviewJob.findUniqueOrThrow({where:{id:j.id}}),fresh=await manual.prepare(actor,p.id,{revision:1,postId:s.p.id});expect(fresh).toMatchObject({pending:6,retrying:6,maxCalls:1});await nextManual();expect(transport).toHaveBeenCalledTimes(1);await manual.confirm(actor,fresh.id,wholeInput(fresh));await nextManual();expect(transport).toHaveBeenCalledTimes(1);expect((await manual.list(actor,p.id))[0].reason).toContain('预算');await manual.cancel(actor,fresh.id);await nextManual();expect(transport).toHaveBeenCalledTimes(1);expect(await db.manualReviewJob.findUniqueOrThrow({where:{id:j.id}})).toEqual(failed);
 });
 it('success, human disposition and in-flight rows remain excluded; failed unreviewed rows are eligible',async()=>{
  const p=await saved(),s=await wholeSource(6),old=await manual.prepare(actor,p.id,{revision:1,postId:s.p.id});await manual.cancel(actor,old.id);const rows=await db.semanticReview.findMany({orderBy:{id:'asc'}});
  for(const [i,data] of [{state:'EVALUATED',score:90},{state:'FAILED',reviewStatus:'REJECTED'},{state:'FAILED',reviewStatus:'APPROVED'},{state:'PROCESSING',leaseUntil:new Date(Date.now()+360000)},{state:'FAILED'},{}].entries())await db.semanticReview.update({where:{id:rows[i].id},data:{...data,version:{increment:1}}});
  expect(await manual.prepare(actor,p.id,{revision:1,postId:s.p.id})).toMatchObject({total:6,pending:2,retrying:1,skipped:4,maxCalls:1});expect(transport).not.toHaveBeenCalled();
 });
 it.each(['PREVIEW','PENDING'])('old five-item %s never silently expands; reading preserves it',async status=>{
  const p=await saved(),s=await wholeSource(6),j=await manual.prepare(actor,p.id,{revision:1,postId:s.p.id});if(status==='PENDING')await manual.confirm(actor,j.id,wholeInput(j));const old=await db.manualReviewJob.findUniqueOrThrow({where:{id:j.id}}),payload=old.preview as any;delete payload.requestPolicy;payload.items=payload.items.slice(0,1);await db.manualReviewJob.update({where:{id:j.id},data:{preview:payload}});
  expect((await manual.previewPage(actor,j.id,0)).items).toHaveLength(1);if(status==='PREVIEW')await expect(manual.confirm(actor,j.id,wholeInput(j))).rejects.toThrow('策略');else{await manual.tick();expect((await manual.list(actor,p.id))[0].status).toBe('INVALIDATED');}expect((await manual.previewPage(actor,j.id,0)).items).toHaveLength(1);expect(transport).not.toHaveBeenCalled();
 });
 it.each([6,68])('%i comments and replies all reach provider once',async n=>{
  const p=await saved(),s=await wholeSource(n),j=await manual.prepare(actor,p.id,{revision:1,postId:s.p.id});expect(j).toMatchObject({pending:n,maxCalls:1});await manual.confirm(actor,j.id,wholeInput(j));await Promise.all([manual.tick(),manual.tick()]);await nextManual();expect(transport).toHaveBeenCalledTimes(1);const body=JSON.parse(transport.mock.calls[0][1].body as string);expect(JSON.parse(body.messages[1].content).items).toHaveLength(n);expect(body.max_tokens).toBeGreaterThan(2500);expect((await manual.list(actor,p.id))[0]).toMatchObject({success:n,status:'COMPLETED'});
 });
 it('capacity overflow rolls back prepare without partial selection, previews or model calls',async()=>{
  const p=await saved(),s=await wholeSource(200);await expect(manual.prepare(actor,p.id,{revision:1,postId:s.p.id})).rejects.toThrow('单次');expect(await db.semanticReview.count()).toBe(0);expect(await db.manualReviewJob.count()).toBe(0);expect(transport).not.toHaveBeenCalled();
 });
 it('automatic whole post sends once, never retries failures; old automatic consent cannot expand',async()=>{
  const p=await saved(),s=await wholeSource(56),on=await policies.automatic(actor,p.id,{version:p.version,enabled:true,consent:reviewAutoConsent,modelVersion:1,priceVersion:'beijing-2026-10-21'});await db.capturedPost.update({where:{id:s.p.id},data:{coverage:'COMPLETE'}});const run=await db.collectionRun.findUniqueOrThrow({where:{id:s.capture.runId}});
  await automatic.postFinished(run,{post:{id:s.p.platformPostId,title:''},comments:[],deletedIds:[],complete:true,windowRead:true});transport.mockImplementationOnce(async()=>new Response('synthetic',{status:429}));await automatic.tick();await automatic.tick();expect(transport).toHaveBeenCalledTimes(1);expect(JSON.parse(JSON.parse(transport.mock.calls[0][1].body as string).messages[1].content).items).toHaveLength(56);expect(await db.autoReviewJob.findFirst()).toMatchObject({status:'FAILED'});
  await db.auditLog.updateMany({where:{action:'COMMENT_REVIEW_AUTO_CONSENT'},data:{metadata:{policyVersion:on.version}}});const other=await source();await db.capturedPost.update({where:{id:other.p.id},data:{coverage:'COMPLETE'}});const run2=await db.collectionRun.findUniqueOrThrow({where:{id:other.capture.runId}});await automatic.postFinished(run2,{post:{id:other.p.platformPostId,title:''},comments:[],deletedIds:[],complete:true,windowRead:true});await automatic.tick();expect(transport).toHaveBeenCalledTimes(1);expect(await db.autoReviewJob.findFirst({where:{postId:other.p.id}})).toMatchObject({status:'CANCELLED'});
 });
});
