import 'reflect-metadata';
import {beforeAll,afterAll,beforeEach,describe,it,expect,vi} from 'vitest';
import {Test} from '@nestjs/testing';
import type {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {mkdtempSync,mkdirSync,realpathSync,rmSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID,randomBytes} from 'node:crypto';
import {AppModule} from '../src/app';
import {Db} from '../src/common/db';
import {configure} from '../src/bootstrap';
import {digest,Actor} from '../src/auth/security';
import {ModelSettingsService,MODEL_SETTINGS_ID} from '../src/model-settings/model-settings.service';
import {QwenMatchingService} from '../src/collection/qwen-matching.service';
import {semanticBatchConsent} from '@crm/contracts';
import {QWEN_PRICE_VERSION} from '../../../runtime/qwen-models.cjs';
import {vaultPath,initialize} from '../../../runtime/model-vault.cjs';
const url=process.env.TEST_DATABASE_URL;
if(!url||new URL(url).pathname!=='/crm_test')throw Error('Only isolated crm_test');
const db=new Db({datasources:{db:{url}}});
const home=realpathSync(mkdtempSync(join(tmpdir(),'crm-model-settings-pg-')));mkdirSync(join(home,'Library','Application Support'),{recursive:true});
const file=vaultPath(randomUUID(),home);initialize(file);
const store=new ModelSettingsService(db,{file});
const fake='FAKE-TEST-ONLY-KEY-0123456789',other='FAKE-REPLACEMENT-ONLY-9876543210';
const origin='http://127.0.0.1:5173';
let app:INestApplication,actor:Actor,sales:Actor;
const auth={admin:{cookie:'',csrf:''},sales:{cookie:'',csrf:''}};
const api=()=>request(app.getHttpServer());
const put=(body:object,who:'admin'|'sales'='admin')=>api().put('/api/model-settings').set('Cookie',auth[who].cookie).set('Origin',origin).set('x-csrf-token',auth[who].csrf).send(body);
const payload=(version=0,key:string|undefined=fake)=>({version,model:'qwen3.8-flash',endpoint:'beijing-standard' as const,dailyLimit:2,note:'虚构测试用途',...(key?{key}:{}),priceVersion:QWEN_PRICE_VERSION,confirmPricing:true as const,consent:true as const});
const rules={version:1 as const,target:'寻找请求毕业论文选题帮助的学生',reviewThreshold:70};
async function batch(){
 const c=await db.collectionConfig.create({data:{name:'虚构密钥生命周期测试',platform:'XHS',mode:'MOCK',keywords:['虚构'],excludeWords:[],semanticRules:rules}});
 const run=await db.collectionRun.create({data:{configId:c.id,requestKey:randomUUID(),status:'COMPLETED',scenario:'BASELINE',revision:1,snapshot:{}}});
 await db.semanticControl.create({data:{configId:c.id,enabled:true}});
 await db.semanticReview.create({data:{configId:c.id,runId:run.id,revision:1,platform:'XHS',platformUserId:'fictional-user',snapshotHash:randomUUID(),rules,isDemo:true,selectedModel:'qwen3.8-flash',snapshot:{postId:'fictional-post',commentId:'fictional-comment',userId:'fictional-user',title:'虚构论文讨论',body:'讨论毕业选题',comment:'护理专业如何选题',parentId:null,parent:null,coverage:'PARTIAL',isDemo:true}}});return c;
}
const answer=(init:RequestInit)=>{const p=JSON.parse(JSON.parse(init.body as string).messages[1].content);return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({items:p.items.map((x:any)=>({id:x.id,score:85,decision:'MATCH',reason:'请求选题帮助',context:'SUFFICIENT',evidence:[{source:'COMMENT',quote:'护理专业如何选题'}]}))})}}],usage:{prompt_tokens:100,completion_tokens:50}}));};
const evaluate=(q:QwenMatchingService,id:string,hash:string)=>q.evaluate(actor,id,{requestKey:randomUUID(),previewHash:hash,priceVersion:'beijing-2026-10-21',consent:'send-original-comments-priced-batch-v3'});
async function clear(){await db.modelSettings.deleteMany();await db.semanticModelCall.deleteMany();await db.semanticReview.deleteMany();await db.collectionRun.deleteMany({where:{config:{name:'虚构密钥生命周期测试'}}});await db.collectionConfig.deleteMany({where:{name:'虚构密钥生命周期测试'}});}
beforeAll(async()=>{
 actor=await db.user.create({data:{email:randomUUID()+'@example.invalid',name:'虚构管理员',role:'ADMIN',passwordHash:'unused'}});
 sales=await db.user.create({data:{email:randomUUID()+'@example.invalid',name:'虚构销售',role:'SALES',passwordHash:'unused'}});
 for(const [who,user] of [['admin',actor],['sales',sales]] as const){const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');await db.session.create({data:{id:digest(token),userId:user.id,csrfToken:csrf,expiresAt:new Date(Date.now()+600000)}});auth[who]={cookie:'crm_session='+token,csrf};}
 const mod=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(Db).useValue(db).overrideProvider(ModelSettingsService).useValue(store).compile();app=mod.createNestApplication({bodyParser:false});configure(app);await app.init();
},30000);
beforeEach(clear);
afterAll(async()=>{await clear();await db.auditLog.deleteMany({where:{actorId:{in:[actor.id,sales.id]}}});await db.session.deleteMany({where:{userId:{in:[actor.id,sales.id]}}});await db.user.deleteMany({where:{id:{in:[actor.id,sales.id]}}});await app?.close();await db.$disconnect();rmSync(home,{recursive:true,force:true});});
describe('administrator credential API, isolated DB, fake Key and mock HTTP only',()=>{
 it('encrypted persistence, new service read after restart, safe response/audit and save never calls provider',async()=>{
  const external=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('unexpected external request'));
  try{const r=await put(payload());expect(r.status).toBe(200);expect(r.body).toMatchObject({configured:true,note:'虚构测试用途',version:1,model:'qwen3.8-flash',automaticTest:false});expect(r.headers['cache-control']).toBe('no-store');expect(JSON.stringify(r.body)).not.toMatch(/FAKE-TEST|encryptedKey|"kid"|"ct"|"tag"/);
   const row=await db.modelSettings.findUniqueOrThrow({where:{id:MODEL_SETTINGS_ID}});expect(JSON.stringify(row)).not.toContain(fake);expect(row.encryptedKey).toMatchObject({v:1});expect(row.consent).toBe(false);const restarted=new ModelSettingsService(db,{file});expect((await restarted.resolve(db,true,semanticBatchConsent)).key).toBe(fake);expect((await restarted.resolve()).key).toBeUndefined();expect(JSON.stringify(await db.auditLog.findMany())).not.toContain(fake);expect(await db.semanticModelCall.count()).toBe(0);expect(external).not.toHaveBeenCalled();
  }finally{external.mockRestore();}
 });
 it('anonymous/sales/CSRF/Origin/transport/allowlist rejected and malformed JSON never exposes or logs Key',async()=>{
  expect((await api().get('/api/model-settings')).status).toBe(401);
  expect((await api().get('/api/model-settings').set('Cookie',auth.sales.cookie)).status).toBe(403);expect((await put(payload(),'sales')).status).toBe(403);
  expect((await api().delete('/api/model-settings').set('Cookie',auth.sales.cookie).set('Origin',origin).set('x-csrf-token',auth.sales.csrf).send({version:0,confirmation:'DELETE_MODEL_KEY'})).status).toBe(403);
  expect((await api().put('/api/model-settings').set('Cookie',auth.admin.cookie).set('Origin',origin).send(payload())).status).toBe(403);
  expect((await api().put('/api/model-settings').set('Cookie',auth.admin.cookie).set('Origin','http://attacker.invalid').set('x-csrf-token',auth.admin.csrf).send(payload())).status).toBe(403);
  expect((await put(payload()).set('X-Forwarded-For','192.0.2.1')).status).toBe(403);
  for(const change of [{model:'unverified'},{endpoint:'https://attacker.invalid'},{dailyLimit:0},{priceVersion:'stale'},{note:fake}]){const r=await put({...payload(),...change});expect(r.status).toBe(400);expect(r.text).not.toContain(fake);}
  const logs=vi.spyOn(console,'error').mockImplementation(()=>{});try{const r=await api().put('/API/model-settings/').set('Content-Type','application/json').send('{"key":"'+fake+'",bad}');expect(r.status).toBe(400);expect(r.text).not.toContain(fake);expect(JSON.stringify(logs.mock.calls)).not.toContain(fake);}finally{logs.mockRestore();}expect(await db.modelSettings.count()).toBe(0);
 });
 it('atomic replacement, stale edits and simultaneous delete/save permit only one winner; no plaintext or old-env fallback',async()=>{
  await store.save(actor,payload());const replaced=await store.save(actor,payload(1,other));expect(replaced.version).toBe(2);expect((await store.resolve(db,true,semanticBatchConsent)).key).toBe(other);await expect(store.save(actor,payload(1))).rejects.toThrow();expect((await store.resolve(db,true,semanticBatchConsent)).key).toBe(other);
  const race=await Promise.allSettled([store.save(actor,payload(2)),store.remove(actor,2,'DELETE_MODEL_KEY')]);expect(race.filter(x=>x.status==='fulfilled')).toHaveLength(1);expect(race.filter(x=>x.status==='rejected')).toHaveLength(1);
  const now=await store.status(actor);if(now.configured)await store.remove(actor,now.version,'DELETE_MODEL_KEY');
  vi.stubEnv('QWEN_API_KEY',fake);vi.stubEnv('QWEN_MATCH_ENABLED','1');try{expect((await store.resolve(db,true,semanticBatchConsent))).toMatchObject({status:{state:'UNCONFIGURED'}});expect((await store.resolve(db,true,semanticBatchConsent)).key).toBeUndefined();}finally{vi.unstubAllEnvs();}
  expect((await db.modelSettings.findUniqueOrThrow({where:{id:MODEL_SETTINGS_ID}})).encryptedKey).toBeNull();expect(JSON.stringify(await db.auditLog.findMany())).not.toContain(other);
 });
 it('missing and changed masters fail closed, failed replacement preserves old ciphertext, delete remains available for recovery',async()=>{
  await store.save(actor,payload());const old=await db.modelSettings.findUniqueOrThrow({where:{id:MODEL_SETTINGS_ID}});renameSync(file,file+'.test-backup');try{expect((await store.resolve(db,true,semanticBatchConsent)).status.state).toBe('INVALID_CONFIG');await expect(store.save(actor,payload(1,other))).rejects.toThrow();expect((await store.status(actor)).vault.state).toBe('MASTER_MISSING');}finally{renameSync(file+'.test-backup',file);}
  const master=readFileSync(file);try{writeFileSync(file,randomBytes(32));expect((await store.resolve(db,true,semanticBatchConsent)).status.state).toBe('INVALID_CONFIG');await expect(store.save(actor,payload(1,other))).rejects.toThrow();expect((await db.modelSettings.findUniqueOrThrow({where:{id:MODEL_SETTINGS_ID}})).encryptedKey).toEqual(old.encryptedKey);await expect(store.remove(actor,1,'NO')).rejects.toThrow();expect((await store.remove(actor,1,'DELETE_MODEL_KEY')).configured).toBe(false);}finally{writeFileSync(file,master);master.fill(0);}
 });
 it('persistent settings participate in preview, switch and cap gates; replacing/deleting invalidates stale preview without HTTP',async()=>{
  const c=await batch();await store.save(actor,payload());const transport=vi.fn(async(_u:string,i:RequestInit)=>answer(i)),q=new QwenMatchingService(db,{transport},store);const p=await q.preview(actor,c.id);await store.save(actor,payload(1,other));await expect(evaluate(q,c.id,p.hash)).rejects.toThrow();expect(transport).not.toHaveBeenCalled();
  const fresh=await q.preview(actor,c.id);await db.semanticControl.update({where:{configId:c.id},data:{enabled:false}});await expect(evaluate(q,c.id,fresh.hash)).rejects.toThrow();await db.semanticControl.update({where:{configId:c.id},data:{enabled:true}});await store.remove(actor,2,'DELETE_MODEL_KEY');await expect(evaluate(q,c.id,fresh.hash)).rejects.toThrow();expect(transport).not.toHaveBeenCalled();expect(await db.semanticModelCall.count()).toBe(0);
 });
 it('delete after reservation but before dispatch blocks new HTTP using same global lock',async()=>{
  const c=await batch();await store.save(actor,payload());const transport=vi.fn(async(_u:string,i:RequestInit)=>answer(i)),q=new QwenMatchingService(db,{transport},store);const p=await q.preview(actor,c.id);const original=db.$transaction.bind(db);let calls=0;
  const spy=vi.spyOn(db,'$transaction').mockImplementation((async(...args:any[])=>{const result=await (original as any)(...args);if(++calls===1)await store.remove(actor,1,'DELETE_MODEL_KEY');return result;}) as any);
  try{expect(await evaluate(q,c.id,p.hash)).toMatchObject({status:'FAILED',errorCode:'MODEL_SETTINGS_CHANGED'});expect(transport).not.toHaveBeenCalled();expect((await db.semanticReview.findFirstOrThrow({where:{configId:c.id}})).score).toBeNull();}finally{spy.mockRestore();}
 });
 it('in-flight mock can finish after deletion; history survives, new requests blocked and no cached Key',async()=>{
  const c=await batch();await store.save(actor,{...payload(),dailyLimit:1});let release!:()=>void,started!:()=>void;const begun=new Promise<void>(r=>started=r),gate=new Promise<void>(r=>release=r);
  const transport=vi.fn(async(u:string,i:RequestInit)=>{expect(u).toBe('https://cn-beijing.maas.qianwenaiapi.com/compatible-mode/v1/chat/completions');expect((i.headers as Record<string,string>).Authorization).toBe('Bearer '+fake);started();await gate;return answer(i);});
  const q=new QwenMatchingService(db,{transport},store),p=await q.preview(actor,c.id);const flight=evaluate(q,c.id,p.hash);await begun;
  try{expect((await store.remove(actor,1,'DELETE_MODEL_KEY')).configured).toBe(false);}finally{release();}
  expect(await flight).toMatchObject({status:'COMPLETED'});expect((await db.semanticReview.findFirstOrThrow({where:{configId:c.id}})).state).toBe('EVALUATED');expect((await q.status(db,c.id)).usage.canCall).toBe(false);await expect(evaluate(q,c.id,p.hash)).rejects.toThrow();expect(transport).toHaveBeenCalledTimes(1);expect(await db.contactAttempt.count()).toBe(0);
 });
 it('three-field storage needs no authorization or budget, defaults to real unlimited and keeps LLM off',async()=>{
  const {dailyLimit,confirmPricing,consent,...three}=payload();
  const external=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('unexpected external request'));
  try{const result=await put(three);expect(result.status).toBe(200);expect(result.body.dailyLimit).toBeNull();
   const row=await db.modelSettings.findUniqueOrThrow({where:{id:MODEL_SETTINGS_ID}});expect(row).toMatchObject({dailyLimit:null,consent:false,note:three.note});
   expect((await store.resolve(db,true))).toMatchObject({status:{state:'UNAUTHORIZED'}});
   expect((await store.resolve()).key).toBeUndefined();expect(await db.semanticControl.count({where:{enabled:true}})).toBe(0);expect(await db.semanticModelCall.count()).toBe(0);expect(external).not.toHaveBeenCalled();
  }finally{external.mockRestore();}
 });
 it('omitting the limit preserves an existing finite limit; null requires explicit unlimited selection',async()=>{
  await store.save(actor,payload());const {dailyLimit,...edit}=payload(1,undefined);expect((await store.save(actor,edit)).dailyLimit).toBe(2);
  await expect(store.save(actor,{...edit,version:2,dailyLimit:null})).rejects.toThrow('明确选择');
  expect((await store.status(actor)).dailyLimit).toBe(2);
  expect((await store.save(actor,{...edit,version:2,dailyLimit:null,confirmUnlimited:true})).dailyLimit).toBeNull();
 });
 it('first-use authorization requires reviewed current prices; no Key access or request for old consent, stale price, or switch off',async()=>{
  const c=await batch(),{dailyLimit,confirmPricing,consent,...three}=payload();await store.save(actor,three);
  const transport=vi.fn(async(_u:string,i:RequestInit)=>answer(i)),q=new QwenMatchingService(db,{transport},store),p=await q.preview(actor,c.id);
  expect(p.connection).toMatchObject({authorized:false,dailyLimit:null,priceVersion:QWEN_PRICE_VERSION});
  const spy=vi.spyOn(store,'resolve');
  const good={requestKey:randomUUID(),previewHash:p.hash,priceVersion:QWEN_PRICE_VERSION,consent:semanticBatchConsent};
  await expect(q.evaluate(actor,c.id,{...good,consent:'send-reviewed-redacted-batch-v1'} as any)).rejects.toThrow();
  await expect(q.evaluate(actor,c.id,{...good,priceVersion:'stale'})).rejects.toThrow();
  await db.semanticControl.update({where:{configId:c.id},data:{enabled:false}});await expect(q.evaluate(actor,c.id,good)).rejects.toThrow();
  expect(spy.mock.calls.some(call=>call[1]===true)).toBe(false);expect(transport).not.toHaveBeenCalled();expect(await db.semanticModelCall.count()).toBe(0);expect((await store.status(actor)).configured).toBe(true);
  expect((await db.modelSettings.findUniqueOrThrow({where:{id:MODEL_SETTINGS_ID}})).consent).toBe(false);
  await db.semanticControl.update({where:{configId:c.id},data:{enabled:true}});expect(await q.evaluate(actor,c.id,good)).toMatchObject({status:'COMPLETED'});
  expect((await q.status(db,c.id)).connection.authorized).toBe(true);expect(transport).toHaveBeenCalledTimes(1);expect(await db.contactAttempt.count()).toBe(0);spy.mockRestore();
 });

});

it('legacy manual batch also confirms and sends original comment text, then freezes its input policy',async()=>{
 await store.save(actor,payload());const c=await batch(),row=await db.semanticReview.findFirstOrThrow({where:{configId:c.id}});
 const comment='护理专业如何选题 Biology 2026 test@example.invalid +1 202-555-0100 微信：synthetic_wx\n👩🏽‍💻 [笑哭R] [已脱敏]';
 await db.semanticReview.update({where:{id:row.id},data:{snapshot:{...(row.snapshot as any),comment}}});
 const transport=vi.fn(async(_u:string,init:RequestInit)=>{const p=JSON.parse(JSON.parse(init.body as string).messages[1].content);expect(p.inputPolicyVersion).toBe('comment-original-context-redacted-v2');expect(p.items[0].comment).toBe(comment);expect(JSON.stringify(p)).not.toContain('fictional-user');return answer(init);});
 const q=new QwenMatchingService(db,{transport},store),preview=await q.preview(actor,c.id);expect(preview.payload.items[0].comment).toBe(comment);
 await expect(q.evaluate(actor,c.id,{requestKey:randomUUID(),previewHash:preview.hash,priceVersion:'beijing-2026-10-21',consent:'send-reviewed-priced-batch-v2'} as any)).rejects.toThrow();expect(transport).not.toHaveBeenCalled();
 expect(await evaluate(q,c.id,preview.hash)).toMatchObject({status:'COMPLETED'});expect(transport).toHaveBeenCalledTimes(1);
 expect((await db.semanticReview.findUniqueOrThrow({where:{id:row.id}})).evaluationInput).toEqual(preview.payload);
 expect((await db.modelSettings.findUniqueOrThrow({where:{id:MODEL_SETTINGS_ID}})).consentInputPolicy).toBe('comment-original-context-redacted-v2');
});
