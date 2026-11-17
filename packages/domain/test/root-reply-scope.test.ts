import {describe,it,expect} from 'vitest';
import {safeBoundedReadReport} from '@crm/contracts';
import {rootScopedRepliesConsistent,rootScopedRepliesExhausted} from '@crm/contracts';
const exact=(value:any)=>({state:'EXACT' as const,value}),missing=()=>({state:'MISSING' as const,value:null});
function sample(){return {status:'OK',list:'EXACT',ready:{document:'complete',container:true,rootEndVisible:true,rootScopeExact:true,replyControls:0},total:exact(6),hasMore:exact(false),cursor:'NONEMPTY',loaded:{roots:3,replies:3,uniqueKnown:6,missingIds:0,duplicateIds:0,invalidNodes:0},groups:Array.from({length:3},(_,i)=>[{ordinal:i*2+1,parent:null,depth:0,declared:exact(1),loaded:exact(1)},{ordinal:i*2+2,parent:i*2+1,depth:1,declared:missing(),loaded:missing()}]).flat(),findings:[]} as any;}
function report(s=sample()){return {version:1,state:'COMPLETE',reason:'DECLARED_TREE_EXHAUSTED',rootStop:'ROOT_END',replyStop:'DECLARED_REPLIES_LOADED',rootActions:0,replyActions:1,excludedRoots:0,elapsedMs:9,initial:s,final:s,retained:s} as any;}
describe('root-scoped flat replies, synthetic closure evidence',()=>{
 it('accepts three closed roots without inventing leaf zero counters',()=>{const s=sample(),before=JSON.stringify(s);expect(rootScopedRepliesExhausted(s)).toBe(true);expect(safeBoundedReadReport(report(s))?.state).toBe('COMPLETE');expect(JSON.stringify(s)).toBe(before);});
 it('accepts a closed tree when the platform total lags',()=>{const s=sample();s.total=exact(7);expect(rootScopedRepliesExhausted(s)).toBe(false);expect(rootScopedRepliesConsistent(s)).toBe(true);});
 it('accepts chunk evidence whose platform total exceeds loaded comments',()=>{const s=sample();s.total=exact(7);const d=report(s);d.chunkSummary={roots:3,replies:3,unique:6,declared:exact(7),hasMore:exact(false),unknownReplyGroups:3,rootScopedLeafGroups:3,replyDeficit:0,replyExcess:0,rootEndVisible:true,replyControls:0,scopeExact:true,emptyVisible:false};expect(safeBoundedReadReport(d)?.state).toBe('COMPLETE');});
 it.each([
  ['observed sample without end',(s:any)=>s.ready.rootEndVisible=false],
  ['unknown root',(s:any)=>s.groups[0].declared=missing()],
  ['null leaf',(s:any)=>s.groups[1].declared={state:'NULL',value:null}],
  ['invalid leaf',(s:any)=>s.groups[1].declared={state:'INVALID',value:null}],
  ['null child list',(s:any)=>s.groups[1].loaded={state:'NULL',value:null}],
  ['root deficit',(s:any)=>s.groups[0].declared=exact(2)],
  ['root excess',(s:any)=>s.groups[0].declared=exact(0)],
  ['total mismatch',(s:any)=>s.total=exact(7)],
  ['total unknown',(s:any)=>s.total=missing()],
  ['more roots',(s:any)=>s.hasMore=exact(true)],
  ['unknown has more',(s:any)=>s.hasMore=missing()],
  ['cursor invalid',(s:any)=>s.cursor='INVALID'],
  ['cursor missing',(s:any)=>s.cursor='MISSING'],
  ['scope unknown',(s:any)=>s.ready.rootScopeExact=false],
  ['unexpanded button',(s:any)=>s.ready.replyControls=1],
  ['page loading',(s:any)=>s.ready.document='loading'],
  ['identity duplicate',(s:any)=>{s.loaded.uniqueKnown=5;s.loaded.duplicateIds=1;}],
  ['nested reply',(s:any)=>{s.groups[3].parent=2;s.groups[3].depth=2;}],
 ])('blocks %s',(_name,mutate)=>{const s=sample();mutate(s);expect(rootScopedRepliesExhausted(s)).toBe(false);expect(safeBoundedReadReport(report(s))).toBeUndefined();});
 it('preserves old UNKNOWN history, even when it has new sufficient evidence',()=>{const d={...report(),state:'UNKNOWN',reason:'BUTTON_NOT_FOUND',replyStop:'BUTTON_NOT_FOUND'};expect(safeBoundedReadReport(d)?.state).toBe('UNKNOWN');});
 it.each(['RESPONSE_LIMIT','ROOT_PAGE_BUDGET','REPLY_CLICK_BUDGET','COMMENT_LIMIT','CANCELLED','TIMEOUT','CLICK_FAILED','REPLY_THRESHOLD'])('never upgrades interruption %s',reason=>{const d={...report(),state:'PARTIAL',reason,replyStop:reason};expect(safeBoundedReadReport(d)?.state).toBe('PARTIAL');expect(safeBoundedReadReport({...d,state:'COMPLETE'})).toBeUndefined();});
 it('requires optional aggregate root-scope evidence to agree with actual sample',()=>{const s=sample(),d=report(s);d.chunkSummary={roots:3,replies:3,unique:6,declared:exact(6),hasMore:exact(false),unknownReplyGroups:3,rootScopedLeafGroups:3,replyDeficit:0,replyExcess:0,rootEndVisible:true,replyControls:0,scopeExact:true,emptyVisible:false};expect(safeBoundedReadReport(d)).toBeDefined();s.ready.rootEndVisible=false;expect(safeBoundedReadReport(d)).toBeUndefined();d.chunkSummary.rootScopedLeafGroups=4;expect(safeBoundedReadReport(d)).toBeUndefined();});
});
