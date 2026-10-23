import {describe,it,expect,vi} from 'vitest';
import {safeSearchObservation,safeSearchAttempts,searchAttemptLabel,type SearchObservation} from '@crm/contracts';
import {XhsMcpAdapter} from '../src/collection/adapters/xhs-mcp';
import {collect} from '../src/collection/collector';
import {limits} from '../src/collection/contract';
import {commitRead} from '../src/collection/ingestion';
const observation:SearchObservation={version:1,state:'EMPTY_UNCONFIRMED',stop:'DEADLINE',initialState:true,searchState:true,documentReady:true,routeMatches:true,valueType:'ARRAY',rawValueType:'MISSING',selected:'VALUE',rawCount:0,noteCount:0,knownOtherCount:0,unknownCount:0,malformedCount:0,acceptedCount:0,observations:41,waitedMs:8000,firstRawCount:0,completionSignal:'UNSUPPORTED'};
const config={name:'Synthetic',platform:'XHS' as const,mode:'XHS_MCP' as const,keywords:['合成甲','合成乙','合成丙'],excludeWords:[],batchLimit:1,enabled:true};
const envelope=(v:unknown,error=false)=>({isError:error,content:[{type:'text',text:JSON.stringify(v)}]});
async function read(searches:unknown[]){let n=0;const call=vi.fn(async(name:string)=>name==='check_login_status'?{content:[{type:'text',text:'✅ 已登录'}]}:name==='search_feeds'?searches[n++]:envelope({data:{note:{noteId:'synthetic',title:'合成'},comments:{list:[]}}}));const result=await collect(new XhsMcpAdapter({call},true),config,async()=>false,{...limits,callMs:1000});return {result,call};}
describe('search success/empty observation chain (synthetic, no network)',()=>{
 it('records all three empty searches without claiming real zero or completion',async()=>{
  const {result,call}=await read(Array(3).fill(envelope({feeds:[],searchObservation:observation})));
  expect(result).toMatchObject({status:'PARTIAL',reason:'SEARCH_PARTIAL',requests:4,posts:[]});expect(result.searchAttempts?.map(a=>[a.keywordOrdinal,a.requestStep,a.returnedCount])).toEqual([[1,2,0],[2,3,0],[3,4,0]]);
  expect(call.mock.calls.map(c=>c[0])).toEqual(['check_login_status','search_feeds','search_feeds','search_feeds']);expect(result.diagnostic).toBeUndefined();expect(searchAttemptLabel(result.searchAttempts![0])).toContain('尚未确认');
 });
 it('preserves successful notes and delayed first-empty evidence without claiming all search results',async()=>{
  const d={...observation,state:'NOTES_AVAILABLE',stop:'NOTES_AVAILABLE',rawCount:2,noteCount:1,knownOtherCount:1,acceptedCount:1,observations:3,waitedMs:400};
  const {result,call}=await read([envelope({feeds:[{id:'synthetic',xsecToken:'SYNTHETIC_SECRET',noteCard:{displayTitle:'合成'}}],searchObservation:d})]);
  expect(result.posts).toHaveLength(1);expect(result.searchAttempts?.[0].observation).toMatchObject({firstRawCount:0,noteCount:1,knownOtherCount:1,acceptedCount:1});expect(result.status).toBe('PARTIAL');expect(call.mock.calls.filter(c=>c[0]==='search_feeds')).toHaveLength(1);expect(JSON.stringify(result.searchAttempts)).not.toContain('SYNTHETIC_SECRET');
 });
 it.each(['FILTERED_NON_NOTES','UNKNOWN_ITEM_TYPES','AMBIGUOUS_FIELDS','FEEDS_MISSING','STATE_MISSING','PAGE_LOADING','UNSUPPORTED_SHAPE'])('retains specific %s instead of a guessed empty success',async state=>{
  const d=['FILTERED_NON_NOTES','UNKNOWN_ITEM_TYPES'].includes(state)?{...observation,state,rawCount:1,knownOtherCount:state==='FILTERED_NON_NOTES'?1:0,unknownCount:state==='UNKNOWN_ITEM_TYPES'?1:0}:{...observation,state,rawCount:null,noteCount:null,knownOtherCount:null,unknownCount:null,malformedCount:null,selected:'NONE'};
  const {result}=await read(Array(3).fill(envelope({feeds:[],searchObservation:d})));expect(result.searchAttempts?.[0].observation?.state).toBe(state);expect(result.status).toBe('PARTIAL');
 });
 it.each(['PAGE_REPORTED_ERROR','RESTRICTED','TIMEOUT','DESERIALIZATION_FAILED'])('preserves failed-stage observation and stops after %s without retry',async reason=>{
  const d={...observation,state:'ACCESS_BLOCKED',stop:'BLOCKED'};
  const {result,call}=await read([envelope({crmSearchFailure:{version:1,reason},searchObservation:d},true)]);expect(result.diagnostic?.searchReason).toBe(reason);expect(result.searchAttempts?.[0].observation).toEqual(d);expect(result.status).toBe('FAILED');if(reason==='PAGE_REPORTED_ERROR')expect(result.reason).toBe('INVALID_DATA');expect(call).toHaveBeenCalledTimes(2);
 });
 it.each([undefined,null,{...observation,url:'SYNTHETIC_PRIVATE'}, {...observation,rawCount:1},{...observation,state:'SYNTHETIC_PRIVATE'},{...observation,completionSignal:'VERIFIED_EMPTY'}])('old/unsafe/inconsistent diagnostic never enters metrics (%#)',async d=>{
  const {result}=await read(Array(3).fill(envelope({feeds:[],...(d===undefined?{}:{searchObservation:d})})));expect(result.searchAttempts?.[0].observation).toBeUndefined();expect(result.searchAttempts?.[0].evidence).toBe(d===undefined?'LEGACY_UNAVAILABLE':'INVALID_DIAGNOSTIC');expect(JSON.stringify(result)).not.toContain('SYNTHETIC_PRIVATE');expect(result.status).toBe('PARTIAL');
 });
 it('does not accept dishonest returned counts',async()=>{const d={...observation,acceptedCount:1};expect(safeSearchObservation(d)).toBeUndefined();expect(safeSearchAttempts([{keywordOrdinal:1,requestStep:2,evidence:'AVAILABLE',returnedCount:1,observation}])).toBeUndefined();});
 it('writes the exact validated search evidence to both metrics and audit in the commit path',async()=>{
  const {result}=await read(Array(3).fill(envelope({feeds:[],searchObservation:observation})));
  const cfg={...config,id:'test-config',revision:1,failureCount:0,archivedAt:null};const run={id:'test-run',configId:cfg.id,snapshot:config,revision:1,status:'RUNNING',cancelRequested:false};
  const tx={$queryRaw:vi.fn().mockResolvedValue([cfg]),collectionConfig:{update:vi.fn()},collectionRun:{findUniqueOrThrow:vi.fn().mockResolvedValue(run),update:vi.fn().mockImplementation(async({data})=>({...run,...data}))},auditLog:{create:vi.fn()}};
  const db={$transaction:async(fn:(v:unknown)=>unknown)=>fn(tx)};
  await commitRead(db as never,run as never,result);
  expect(tx.collectionRun.update.mock.calls[0][0].data.metrics.searchAttempts).toEqual(result.searchAttempts);
  expect(tx.auditLog.create.mock.calls[0][0].data.metadata.searchAttempts).toEqual(result.searchAttempts);
  expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain('合成甲');
 });
});
