import {autoReviewInputPolicy} from '@crm/contracts';
import 'reflect-metadata';
import {describe,it,expect,vi} from 'vitest';
import {semanticBatchConsent,semanticInputPolicy,wholePostRequestPolicy,modelOutputFailure,outputFailureReason,displayReviewFailure,isBatchOutputFailure} from '@crm/contracts';
import {parseQwenResult,QwenError,requestQwen,qwenSettings,QWEN_MODEL} from '../src/collection/qwen-provider';
import {prepareOutbound,validateQwenEvidence} from '../src/collection/semantic-redaction';
import {ReviewEvaluationService} from '../src/comment-review/review-evaluation.service';
import {QwenMatchingService} from '../src/collection/qwen-matching.service';
import {ReviewPolicyService} from '../src/comment-review/review-policy.service';
import type {SemanticInput} from '../src/collection/semantic-evaluator';
const rules={version:1 as const,target:'识别明确写出学科专业名称的评论内容',reviewThreshold:0};
const source=(n=1):SemanticInput=>({id:'review-'+n,rules,snapshot:{postId:'post',commentId:'comment-'+n,userId:'synthetic-user',title:'合成专业讨论',body:'',comment:'Biology 2026 👩🏽‍💻 [笑哭R] [已脱敏]\n微信：synthetic_wx test@example.invalid +1 202-555-0100',parentId:null,parent:null,coverage:'COMPLETE',isDemo:true}});
const inputs=[source(),source(2)],payload=prepareOutbound(inputs);
const item=(n=1)=>({id:'item'+n,score:80,decision:'MATCH',reason:'Biology 2026 是专业名称',context:'SUFFICIENT',evidence:[{source:'COMMENT',quote:'Biology 2026'}]});
const output=(patch:Record<string,unknown>={})=>({items:[item(),{...item(2),...patch}]});
const env={QWEN_MATCH_ENABLED:'1',QWEN_MATCH_CONSENT:'beijing-original-comments-v2',QWEN_MATCH_DAILY_LIMIT:'20',QWEN_MATCH_PRICE_ACK:QWEN_MODEL+':beijing-2026-10-21',QWEN_API_KEY:'SYNTHETIC-KEY-NOT-REAL'};
const envelope=(result:unknown)=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}],usage:{prompt_tokens:30,completion_tokens:20}}));
describe('bounded plain-text reasons and exact grounded evidence (synthetic only)',()=>{
 it.each(['Biology 2026 专业','我是护理学专业的学生','👩🏽‍💻👨‍👩‍👧‍👦 [笑哭R]','字面 [已脱敏] 保留','微信：synthetic_wx test@example.invalid +1 202-555-0100','第一行\nSecond line 42\r\n末行','e\u0301 ＡＢＣ\u200d','<img src=x onerror="alert(1)"> is quoted text'])('accepts bounded reason without redaction or normalization (%#)',reason=>{
  expect(validateQwenEvidence(output({reason}),payload,inputs,true)[1].reason).toBe(reason);
 });
 it.each([
  ['OUTPUT_STRUCTURE_INVALID',null],['OUTPUT_STRUCTURE_INVALID',{items:[item()],extra:'no'}],
  ['OUTPUT_COUNT_INVALID',{items:[]}],['OUTPUT_COUNT_INVALID',{items:[item()]}],
  ['OUTPUT_ID_DUPLICATE_ITEM_2',output({id:'item1'})],['OUTPUT_ID_UNKNOWN_ITEM_2',output({id:'invented-id'})],['OUTPUT_ID_INVALID_ITEM_2',output({id:42})],
  ['OUTPUT_REASON_INVALID_ITEM_2',output({reason:42})],['OUTPUT_REASON_INVALID_ITEM_2',output({reason:''})],['OUTPUT_REASON_INVALID_ITEM_2',output({reason:'  \n\t'})],['OUTPUT_REASON_INVALID_ITEM_2',output({reason:'合'.repeat(1001)})],
  ['OUTPUT_STRUCTURE_INVALID_ITEM_2',output({score:101})],['OUTPUT_STRUCTURE_INVALID_ITEM_2',output({decision:'SEND'})],
  ['OUTPUT_EVIDENCE_INVALID_ITEM_2',output({evidence:[]})],['OUTPUT_EVIDENCE_SOURCE_INVALID_ITEM_2',output({evidence:[{source:'USER_PROFILE',quote:'Biology'}]})],
  ['OUTPUT_EVIDENCE_QUOTE_INVALID_ITEM_2',output({evidence:[{source:'COMMENT',quote:'字'.repeat(501)}]})],
  ['OUTPUT_COMMENT_EVIDENCE_MISSING_ITEM_2',output({evidence:[{source:'POST_TITLE',quote:'合成专业讨论'}]})],
  ['OUTPUT_EVIDENCE_NOT_EXACT_ITEM_2',output({evidence:[{source:'COMMENT',quote:'biology 2026'}]})],
  ['OUTPUT_EVIDENCE_NOT_EXACT_ITEM_2',output({evidence:[{source:'COMMENT',quote:'凭空引用'}]})],
  ['OUTPUT_EVIDENCE_NOT_EXACT_ITEM_2',output({evidence:[{source:'COMMENT',quote:'Biology'}, {source:'POST_BODY',quote:'Biology'}]})],
 ])('rejects %s with no model content in diagnostic', (code,raw)=>{
  try{validateQwenEvidence(raw,payload,inputs,true);throw Error('must reject');}catch(e){expect(e).toBeInstanceOf(QwenError);expect((e as QwenError).code).toBe(code);expect((e as Error).message).toBe(code);expect((e as Error).message).not.toContain('synthetic_wx');}
 });
 it('literal original markers and ZWJ quotes remain exact; context markers never become evidence',()=>{
  expect(validateQwenEvidence(output({evidence:[{source:'COMMENT',quote:'👩🏽‍💻 [笑哭R] [已脱敏]'}]}),payload,inputs,true)).toHaveLength(2);
  expect(()=>validateQwenEvidence(output({evidence:[{source:'COMMENT',quote:'👩🏽💻'}]}),payload,inputs,true)).toThrow('OUTPUT_EVIDENCE_NOT_EXACT_ITEM_2');
  const p=structuredClone(payload);p.items[1].body='[已脱敏]';expect(()=>validateQwenEvidence(output({evidence:[{source:'COMMENT',quote:'Biology'},{source:'POST_BODY',quote:'[已脱敏]'}]}),p,inputs,true)).toThrow('OUTPUT_CONTEXT_REDACTION_MARKER_ITEM_2');
 });
 it('item index means model return position, with ID-based reordering retained',()=>{
  const raw={items:[item(2),item()]};expect(validateQwenEvidence(raw,payload,inputs,true).map(r=>r.id)).toEqual(inputs.map(r=>r.id));raw.items[0].evidence[0].quote='forged';expect(()=>validateQwenEvidence(raw,payload,inputs,true)).toThrow('OUTPUT_EVIDENCE_NOT_EXACT_ITEM_1');
 });
 it('provider parsing retains safe structure subcodes, never raw JSON or reason; no retries',async()=>{
  const transport=vi.fn(async()=>envelope(output({reason:'synthetic_private_contact '.repeat(100)})));
  await expect(requestQwen(qwenSettings(env),payload,transport)).rejects.toThrow('OUTPUT_REASON_INVALID_ITEM_2');expect(transport).toHaveBeenCalledTimes(1);
  expect(()=>parseQwenResult(output({evidence:[{source:'COMMENT',quote:null}]}))).toThrow('OUTPUT_EVIDENCE_QUOTE_INVALID_ITEM_2');
 });
 it('safe descriptions distinguish old unknown failure and reject arbitrary code injection',()=>{
  expect(modelOutputFailure('OUTPUT_REASON_INVALID_ITEM_2')).toMatchObject({code:'OUTPUT_REASON_INVALID',itemIndex:2});
  expect(outputFailureReason('OUTPUT_EVIDENCE_NOT_EXACT_ITEM_2')).toContain('模型返回第 2 条');
  expect(outputFailureReason('OUTPUT_EVIDENCE_NOT_EXACT_ITEM_2')).toContain('不代表每条评论均独立校验失败');
  expect(outputFailureReason('OUTPUT_PRIVATE_REASON_ITEM_2')).toBeNull();expect(modelOutputFailure('OUTPUT_REASON_INVALID_ITEM_99')).toMatchObject({itemIndex:99});expect(modelOutputFailure('OUTPUT_REASON_INVALID_ITEM_2\n')).toBeNull();
  const old='评估失败（INVALID_EVIDENCE），原文保留';expect(displayReviewFailure(old)).toContain('旧记录未保存具体原因');expect(old).toBe('评估失败（INVALID_EVIDENCE），原文保留');
  expect(isBatchOutputFailure(old)).toBe(true);expect(isBatchOutputFailure(outputFailureReason('OUTPUT_REASON_INVALID_ITEM_2'))).toBe(true);
 });
});

// In-memory transaction doubles exercise real dispatch/evidence/guard code without Docker or production DB.
function harness(bad:boolean){
 const rows=inputs.map((input,i)=>({...input,captureId:'capture-'+i,version:1,state:'UNANALYSED',reviewStatus:'PENDING',id:input.id,createdAt:new Date(i)}));
 const policy={id:'workspace',version:1,revision:1,autoEnabled:true,autoModelVersion:1};
 const config={id:'config',semanticRules:rules,revision:1,archivedAt:null,enabled:true};
 let call:any=null;
 const db:any={
  normalAutomationAcceptance:{findFirst:async()=>null,findUnique:async()=>null},
  $queryRaw:vi.fn(async()=>[]),$transaction:async(fn:any)=>fn(db),
  commentReviewPolicy:{findUnique:async()=>policy,findUniqueOrThrow:async()=>policy},
  collectionConfig:{findUnique:async()=>config,findUniqueOrThrow:async()=>config},semanticControl:{findUnique:async()=>({enabled:true,version:1})},
  semanticReview:{findMany:async()=>rows,updateMany:vi.fn(async()=>({count:1})),count:async()=>rows.length},
  semanticModelCall:{findUnique:async()=>call,aggregate:async()=>({_count:{_all:0},_sum:{}}),findFirst:async()=>null,count:async()=>0,create:vi.fn(async({data}:any)=>{call={id:'call',...data};return call;}),update:vi.fn(async({data}:any)=>Object.assign(call,data))},
  auditLog:{findFirst:async()=>({metadata:{requestPolicy:wholePostRequestPolicy}}),create:vi.fn(async()=>({}))},user:{findUnique:async()=>({role:'ADMIN'})},
  autoReviewJob:{findUnique:async()=>({id:'auto',policyId:'workspace',policyVersion:1,status:'PROCESSING',inputPolicyVersion:autoReviewInputPolicy,postId:'post',runId:'run'})},
  capturedComment:{findMany:async()=>rows.map(r=>({id:r.captureId,configId:'config',postId:'post',lastRunId:'run',snapshot:r.snapshot,post:{id:'post',configId:'config',lastRunId:'run',snapshot:{}}}))},commentReadCheckpoint:{findMany:async()=>[]},
  collectionRun:{findMany:async()=>[],findUnique:async()=>({id:'run',configId:'config',status:'COMPLETE',revision:1,config,cancelRequested:false,finishedAt:new Date(),snapshot:{mode:'MOCK',strictStages:{version:1,policies:[{id:'workspace',version:1,revision:1,modelVersion:1}]}}})},
  capturedPost:{findUnique:async()=>({id:'post',configId:'config',coverage:'COMPLETE',lastRunId:'run',snapshot:{}})},
  manualReviewJob:{findUnique:async()=>({id:'manual',status:'PROCESSING',policy,policyRevision:1,modelVersion:1,actorId:'admin',batchIds:rows.map(r=>r.id),items:rows.map(r=>({reviewId:r.id,reviewVersion:r.version})),preview:{...payload,requestPolicy:wholePostRequestPolicy,items:payload.items.map((item,i)=>({...item,id:rows[i].id}))}})},
 };
 const settings={...qwenSettings(env),status:{...qwenSettings(env).status,authorized:true},configurationVersion:1};
 const policies:any={models:{resolve:async()=>settings},qwen:{status:async()=>({usage:{canCall:true},connection:{priceVersion:env.QWEN_MATCH_PRICE_ACK.split(':')[1]}})}};
 const transport=vi.fn(async()=>envelope(bad?output({evidence:[{source:'COMMENT',quote:'invented quote'}]}):output()));
 return {db,policies,transport};
}
describe('all paid entry points share output validation without a real provider',()=>{
 for(const mode of ['manual-post','manual-batch','automatic','legacy'] as const)for(const bad of [false,true])it(`${mode}: ${bad?'batch rejection preserves safe code, index, null scores and idempotency':'normal English reason accepted'}`,async()=>{
  const {db,policies,transport}=harness(bad),actor={id:'admin',name:'Synthetic admin',email:'admin@example.invalid',role:'ADMIN' as const};
  const service=mode==='legacy'?new QwenMatchingService(db,{settings:()=>qwenSettings(env),transport}):new ReviewEvaluationService(db,policies,{transport});
  const id=mode==='legacy'?'config':'workspace';
  const preview=mode==='legacy'?await (service as QwenMatchingService).preview(actor,id):await (service as ReviewEvaluationService).preview(actor,id,inputs.map(r=>r.id),mode==='manual-post',mode==='manual-post'||mode==='automatic');
  if(mode==='manual-post'){const original=db.manualReviewJob.findUnique;db.manualReviewJob.findUnique=async()=>({...await original(),preview:{...preview.payload,items:preview.payload.items.map((item,i)=>({...item,id:inputs[i].id}))}});}
  const request={requestKey:'00000000-0000-4000-8000-000000000001',previewHash:preview.hash,reviewIds:inputs.map(r=>r.id),priceVersion:'beijing-2026-10-21',consent:semanticBatchConsent};
  const run=()=>mode==='legacy'?(service as QwenMatchingService).evaluate(actor,id,request):(service as ReviewEvaluationService).evaluate(actor,id,request,mode==='automatic'?'auto':undefined,mode==='manual-post'?'manual':undefined);
  const result=await run();expect(result.status).toBe(bad?'FAILED':'COMPLETED');expect(transport).toHaveBeenCalledTimes(1);
  const finalWrites=db.semanticReview.updateMany.mock.calls.map(([arg]:any)=>arg.data).filter((data:any)=>['FAILED','EVALUATED'].includes(data.state));expect(finalWrites).toHaveLength(2);
  if(bad){expect(result).toMatchObject({errorCode:'OUTPUT_EVIDENCE_NOT_EXACT_ITEM_2',outputFailure:{itemIndex:2}});for(const data of finalWrites){expect(data.score).toBeNull();expect(data.reason).toContain('本批整体未采纳');expect(data.reason).not.toContain('invented quote');}expect(JSON.stringify(db.auditLog.create.mock.calls)).not.toContain('Biology');}
  else for(const data of finalWrites)expect(data.reason).toBe('Biology 2026 是专业名称');
  expect(await run()).toMatchObject({reused:true,status:bad?'FAILED':'COMPLETED'});expect(transport).toHaveBeenCalledTimes(1);
 });
 it('API projects historical explanation without writing historical records',async()=>{
  const {db,policies}=harness(false);(db as any).postAvailability={findUnique:vi.fn(async()=>null)};const stored={...source(),state:'FAILED',reason:'评估失败（INVALID_EVIDENCE）'};db.semanticReview.findMany=async()=>[stored];db.$queryRaw=vi.fn(async(q:any)=>q.sql.includes('count(*)')?[{total:1n}]:[{id:stored.id,publishedAt:null}]) as any;
  const service=new ReviewPolicyService(db,policies.models,policies.qwen);const result=await service.results({id:'admin',name:'Synthetic admin',email:'admin@example.invalid',role:'ADMIN'},'workspace',0);
  expect(result.items[0].displayReason).toContain('旧记录未保存具体原因');expect(result.items[0].reason).toBe(stored.reason);expect(db.semanticReview.updateMany).not.toHaveBeenCalled();
 });
});
