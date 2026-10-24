import {it,expect} from 'vitest';
import {coverageProgressSummary} from './coverage-progress-summary';
const exact=(value:number|boolean)=>({state:'EXACT',value}),missing={state:'MISSING',value:null};
function sample(roots:number,replies:number){return {status:'OK',ready:{document:'complete',container:true},total:exact(roots+replies),hasMore:exact(false),cursor:'EMPTY',list:'EXACT',loaded:{roots,replies,uniqueKnown:roots+replies,duplicateIds:0,missingIds:0,invalidNodes:0},groups:[...Array.from({length:roots},(_,i)=>({ordinal:i+1,parent:null,depth:0,declared:exact(i===0?replies:0),loaded:exact(i===0?replies:0)})),...Array.from({length:replies},(_,i)=>({ordinal:roots+i+1,parent:1,depth:1,declared:missing,loaded:missing}))],findings:[]};}
const report=()=>({version:1,state:'UNKNOWN',reason:'BUTTON_NOT_FOUND',rootStop:'ROOT_END',replyStop:'BUTTON_NOT_FOUND',rootActions:2,replyActions:5,excludedRoots:0,elapsedMs:1400,initial:sample(10,9),final:sample(22,20),retained:sample(22,20)});
it('shows one-read 19 to 42 changes separately from insertion and click-success counts',()=>{
 const r=coverageProgressSummary(report());expect(r?.counts).toContain('19 条');expect(r?.counts).toContain('42 条');expect(r?.growth).toContain('增加 12');expect(r?.growth).toContain('增加 11');expect(r?.growth).toContain('不是数据库新增');expect(r?.actions).toContain('未提供成功点击次数');expect(r?.boundary).toContain('20 条回复未提供');expect(r?.boundary).toContain('完整性仍待确认');
});
it('does not equate missing button with exhausted replies when declared gaps or budgets remain',()=>{
 const d=report();d.retained.groups[0].declared=exact(21);expect(coverageProgressSummary(d)?.boundary).toContain('仍有 1 个');
 expect(coverageProgressSummary({...report(),rootStop:'ROOT_PAGE_BUDGET'})?.boundary).toBeUndefined();
 const contradictory=report();contradictory.final.hasMore=exact(true);expect(coverageProgressSummary(contradictory)?.boundary).toBeUndefined();
 expect(coverageProgressSummary({...report(),excludedRoots:1})?.growth).toBeUndefined();
});
it('unknown, invalid or decreasing counts are not fabricated as zero gains',()=>{
 const d=report();expect(coverageProgressSummary({...d,initial:{...d.initial,loaded:undefined}})?.growth).toBeUndefined();
 expect(coverageProgressSummary({...d,initial:sample(30,30)})?.growth).toBeUndefined();
 expect(coverageProgressSummary({...d,initial:{...d.initial,loaded:{...d.initial.loaded,missingIds:1}}})?.growth).toBeUndefined();
 expect(coverageProgressSummary({...d,privateUrl:'must not expose'})).toBeUndefined();
});
it('zero comment and zero actions do not claim a missing-button exhaustion proof',()=>{
 const s=sample(0,0),r=coverageProgressSummary({...report(),rootActions:0,replyActions:0,initial:s,final:s,retained:s});expect(r?.boundary).toBeUndefined();expect(r?.counts).toContain('0 条');expect(r?.actions).toContain('未提供成功点击次数');
});
