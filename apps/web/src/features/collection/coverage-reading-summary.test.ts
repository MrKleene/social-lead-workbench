import {it,expect} from 'vitest';
import {coverageReadingSummary} from './coverage-reading-summary';
const exact=(value:number|boolean)=>({state:'EXACT',value});
const snapshot=(total=3)=>({status:'OK',ready:{document:'complete',container:true},total:exact(total),hasMore:exact(false),cursor:'EMPTY',list:'EXACT',loaded:{roots:1,replies:1,uniqueKnown:2,duplicateIds:0,missingIds:0,invalidNodes:0},groups:[{ordinal:1,parent:null,depth:0,declared:exact(1),loaded:exact(1)},{ordinal:2,parent:1,depth:1,declared:{state:'MISSING',value:null},loaded:exact(0)}],findings:[]});
const report=(s=snapshot())=>({version:1,state:'UNKNOWN',reason:'BUTTON_NOT_FOUND',rootStop:'ROOT_END',replyStop:'BUTTON_NOT_FOUND',rootActions:2,replyActions:3,excludedRoots:0,elapsedMs:500,initial:s,final:s,retained:s});
it('separates visible root/reply end from platform gap and unknown nested evidence',()=>{
 const gap=coverageReadingSummary(report());expect(gap).toContain('差额 1 条原因未确认');expect(gap).toContain('不能认定');
 expect(coverageReadingSummary(report(snapshot(2)))).toContain('仍缺少全部层级');
 expect(coverageReadingSummary({...report(),rootStop:'ROOT_PAGE_BUDGET'})).toContain('尚未证明');
 const missing=snapshot();missing.groups[0].loaded=exact(0);expect(coverageReadingSummary(report(missing))).toContain('尚未证明');
 expect(coverageReadingSummary({...report(),replyStop:'REPLY_CLICK_BUDGET'})).toContain('尚未证明');
 expect(coverageReadingSummary({...report(),state:'COMPLETE'})).toBeUndefined();
});
it('invalid total plus zero never becomes true empty without visible empty evidence',()=>{
 const empty={...snapshot(),total:{state:'INVALID',value:null},groups:[],loaded:{roots:0,replies:0,uniqueKnown:0,duplicateIds:0,missingIds:0,invalidNodes:0}};
 expect(coverageReadingSummary(report(empty as any))).toContain('不能判定确实没有评论');
 expect(coverageReadingSummary(report({...empty,ready:{...empty.ready,emptyVisible:true}} as any))).toContain('页面显示空评论提示');
});
it('requires scoped visible end and no controls to state visible exhaustion, never explains a platform discrepancy',()=>{
 const s={...snapshot(),ready:{...snapshot().ready,rootEndVisible:true,replyControls:0,rootScopeExact:true}};
 expect(coverageReadingSummary(report(s))).toContain('本次可见评论区已到末尾');
 expect(coverageReadingSummary(report(s))).toContain('不能断言属于删除、隐藏或漏读');
 for(const ready of [{...s.ready,rootEndVisible:false},{...s.ready,replyControls:1},{...s.ready,rootScopeExact:false}])expect(coverageReadingSummary(report({...s,ready}))).not.toContain('本次可见评论区已到末尾');
});
