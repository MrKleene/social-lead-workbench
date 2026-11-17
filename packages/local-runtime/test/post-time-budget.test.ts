import {describe,it,expect} from 'vitest';
import {collect,postTimeBudgetMs} from '@crm/domain/collection/collector';
import {limits,type Comment} from '@crm/domain/collection/contract';
const missing=()=>({state:'MISSING' as const,value:null});
const sample=()=>({status:'OK',list:'EXACT',ready:{document:'complete',container:true,rootEndVisible:false,rootScopeExact:false},total:missing(),hasMore:missing(),cursor:'NONEMPTY',loaded:{roots:1,replies:0,uniqueKnown:1,duplicateIds:0,missingIds:0,invalidNodes:0},groups:[{ordinal:1,parent:null,depth:0,declared:missing(),loaded:missing()}],findings:[]} as any);
const report=()=>({version:1,state:'UNKNOWN',reason:'CHUNK_READY',rootStop:'NOT_RUN',replyStop:'NOT_RUN',rootActions:0,replyActions:0,excludedRoots:0,elapsedMs:5,initial:sample(),final:sample(),retained:sample()} as any);
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
function adapter(toMs=5,marks?:number[]){let n=0;return {platform:'XHS',mode:'XHS_MCP',async search(){return {items:[{id:'p1',title:'合成'}],complete:true};},async post(p:any){return {...p,boundedRead:report()};},receivedComments:()=>[{id:'c'+(n++),userId:'u',nickname:'合成',text:'合成',hasReplies:false}] as Comment[],canContinuePost:()=>true,async continuePost(p:any){marks?.push(Date.now());await pause(toMs);return {...p,boundedRead:report()};}};}
describe('per-post exception deadline',()=>{
 it('scales one post deadline with the platform-declared comment count, capped and floored',()=>{
  expect(postTimeBudgetMs(242)).toBe(350400);
  expect(postTimeBudgetMs(14)).toBe(90000);
  expect(postTimeBudgetMs(1638)).toBe(2025600);
  expect(postTimeBudgetMs(3300)).toBe(2400000);
  expect(postTimeBudgetMs(undefined)).toBe(300000);
 });
 it('stops one post at its deadline, keeps what was read and keeps the round partial',async()=>{
  const result=await collect(adapter() as any,{mode:'XHS_MCP',platform:'XHS',keywords:['合成'],batchLimit:1} as any,async()=>false,{...limits,requests:10240,comments:800,runMs:10000,postBudget:{baseMs:0,perCommentMs:0,minMs:20,maxMs:30,defaultMs:20}});
  expect(result.status,JSON.stringify(result)).toBe('PARTIAL');
  expect(result.reason).toBe('POST_TIME_BUDGET');
  expect(result.posts[0].stopReason).toBe('POST_TIME_BUDGET');
  expect(result.posts[0].complete).toBe(false);
  expect(result.posts[0].comments.length).toBeGreaterThan(0);
 });
 it('stops the round when its own ceiling is spent, without blaming the post',async()=>{
  const result=await collect(adapter(1) as any,{mode:'XHS_MCP',platform:'XHS',keywords:['合成'],batchLimit:1} as any,async()=>false,{...limits,requests:10240,comments:800,runMs:40,postBudget:{baseMs:60000,perCommentMs:0,minMs:60000,maxMs:60000,defaultMs:60000}});
  expect(result.status,JSON.stringify(result)).toBe('PARTIAL');
  expect(result.reason).toBe('ROUND_TIME_BUDGET');
  expect(result.posts[0].stopReason).toBe('ROUND_TIME_BUDGET');
  expect(result.posts[0].complete).toBe(false);
  expect(result.posts[0].comments.length).toBeGreaterThan(0);
 });
 it('takes one longer reading pause on a long continuous read',async()=>{
  const marks:number[]=[];
  const result=await collect(adapter(1,marks) as any,{mode:'XHS_MCP',platform:'XHS',keywords:['合成'],batchLimit:1} as any,async()=>false,{...limits,requests:10240,comments:800,runMs:60000,postBudget:{baseMs:200,perCommentMs:0,minMs:200,maxMs:200,defaultMs:200},pacing:{everyMs:10,minMs:40,maxMs:40}});
  expect(result.posts[0].stopReason).toBe('POST_TIME_BUDGET');
  const gaps=marks.slice(1).map((m,i)=>m-marks[i]);
  expect(Math.max(...gaps)).toBeGreaterThanOrEqual(40);
 });
});
