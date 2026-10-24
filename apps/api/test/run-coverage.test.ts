import 'reflect-metadata';
import {describe,it,expect,vi} from 'vitest';
import {safeBoundedReadReport,safeRunCoverage} from '@crm/contracts';
import {runCoverage,summarizePartial} from '../src/collection/run-coverage';
import {finishCapture} from '../src/collection/capture-archive';
import {commitRead} from '../src/collection/ingestion';
import type {ReadResult} from '../src/collection/collector';
const exact=(value:number)=>({state:'EXACT',value});
const sample=(n=0)=>({status:'OK',ready:{document:'complete',container:true},total:exact(n),hasMore:{state:'EXACT',value:false},list:'EXACT',cursor:'EMPTY',loaded:{roots:n,replies:0,uniqueKnown:n,missingIds:0,duplicateIds:0,invalidNodes:0},groups:Array.from({length:n},(_,ordinal)=>({ordinal:ordinal+1,parent:null,depth:0,declared:exact(0),loaded:exact(0)})),findings:[]});
const proof=(s:any=sample())=>({version:1,state:'COMPLETE',reason:'DECLARED_TREE_EXHAUSTED',rootStop:'ROOT_END',replyStop:'DECLARED_REPLIES_LOADED',rootActions:1,replyActions:1,excludedRoots:0,elapsedMs:500,initial:s,final:s,retained:s});
const post=(reason:string,complete=false)=>({post:{id:'synthetic',title:'synthetic'},comments:[{id:'r',userId:'u',text:'synthetic',nickname:'',hasReplies:true},{id:'c',parentId:'r',userId:'v',text:'reply',nickname:'',hasReplies:false}],deletedIds:[],complete,stopReason:reason});
describe('immutable run coverage, synthetic only',()=>{
 it('requires explicit end, total, every descendant and trustworthy identity evidence',()=>{
  expect(safeBoundedReadReport(proof())).toBeDefined();
  expect(safeBoundedReadReport(proof({...sample(),ready:{...sample().ready,emptyVisible:true},total:{state:'INVALID',value:null}}))).toBeDefined();
  expect(safeBoundedReadReport(proof(sample(1)))).toBeDefined();
  for(const s of [ {...sample(),total:{state:'INVALID',value:null}}, {...sample(1),hasMore:{state:'EXACT',value:true}}, {...sample(1),groups:[{ordinal:1,parent:null,depth:0,declared:{state:'MISSING',value:null},loaded:exact(0)}]}, {...sample(1),loaded:{...sample(1).loaded,missingIds:1}} ]) expect(safeBoundedReadReport(proof(s))).toBeUndefined();
 });
 it('retains first specific limitation when the last post returns unknown zero; never changes fatal or budget',()=>{
  const r:ReadResult={status:'PARTIAL',reason:'VISIBLE_WINDOW_READ',requests:4,searchIncomplete:true,posts:[post('ROOT_PAGE_BUDGET'),{...post('EMPTY_UNCONFIRMED'),comments:[]}]};
  summarizePartial(r);expect(r.reason).toBe('ROOT_PAGE_BUDGET');
  expect(runCoverage(r)).toMatchObject({search:'PARTIAL',reasons:['SEARCH_PARTIAL','ROOT_PAGE_BUDGET','EMPTY_UNCONFIRMED'],posts:[{postRef:'synthetic',ordinal:1,saved:2,roots:1,replies:1},{ordinal:2,saved:0}]});
  for(const [status,reason] of [['FAILED','TIMEOUT'],['PAUSED','PAUSED'],['PARTIAL','BUDGET']]){r.status=status;r.reason=reason;summarizePartial(r);expect(r.reason).toBe(reason);}
 });
 it('deduplicates counts and isolates each saved run from later mutable post snapshots',()=>{
  const p=post('ROOT_PAGE_BUDGET');p.comments.push(p.comments[0]);
  const r:ReadResult={status:'PARTIAL',requests:3,posts:[p]};const first=runCoverage(r)!;
  expect(first.posts[0].saved).toBe(2);p.comments.push({id:'later',userId:'x',text:'later',nickname:'',hasReplies:false});p.stopReason='BUTTON_NOT_FOUND';
  expect(first.posts[0]).toMatchObject({saved:2,reason:'ROOT_PAGE_BUDGET'});expect(runCoverage(r)?.posts[0].saved).toBe(3);
  expect(safeRunCoverage({...first,url:'private'})).toBeUndefined();
  for(const postRef of ['https://example.invalid/post?access=synthetic','id?token=synthetic','身份\n内容'])expect(safeRunCoverage({...first,posts:[{...first.posts[0],postRef}]})).toBeUndefined();
  expect(safeRunCoverage({...first,posts:[{...first.posts[0],identity:'private'}]})).toBeUndefined();
 });
 it('keeps proven post completeness distinct from partial task/search coverage',async()=>{
  const updateMany=vi.fn();const r:any={status:'PARTIAL',reason:'SEARCH_PARTIAL',posts:[post('DECLARED_TREE_EXHAUSTED',true),{...post('ROOT_PAGE_BUDGET'),post:{id:'second'}}]};
  await finishCapture({capturedPost:{updateMany}} as any,{id:'run',configId:'cfg'} as any,r);
  expect(updateMany.mock.calls[0][0].data).toEqual({coverage:'COMPLETE',stopReason:'DECLARED_TREE_EXHAUSTED'});
  expect(updateMany.mock.calls[1][0].data).toEqual({coverage:'PARTIAL',stopReason:'ROOT_PAGE_BUDGET'});
 });
 it('preserves checkpoint coverage in final failure/discard metrics and safe audit without re-ingesting',async()=>{
  const coverage=runCoverage({posts:[post('ROOT_PAGE_BUDGET')],requests:3,status:'PARTIAL'})!;
  const config={id:'cfg',enabled:true,revision:1,failureCount:0};const update=vi.fn(async x=>x.data),audit=vi.fn();
  const tx:any={$queryRaw:async()=>[config],collectionRun:{findUniqueOrThrow:async()=>({status:'RUNNING',metrics:{coverage}}),update},collectionConfig:{update:vi.fn()},auditLog:{create:audit}};
  await commitRead({$transaction:async(fn:any)=>fn(tx)} as any,{id:'run',configId:'cfg',revision:1,snapshot:{}} as any,{status:'FAILED',reason:'TIMEOUT',requests:4,posts:[],discarded:true});
  expect(update.mock.calls[0][0].data.metrics.coverage).toEqual(coverage);
  expect(audit.mock.calls[0][0].data.metadata.coverage).toEqual(coverage);
 });
});
