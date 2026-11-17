import {safeRunCoverage,type RunCoverage} from '@crm/contracts';
import type {ReadResult} from './collector';
export function runCoverage(result:ReadResult):RunCoverage|undefined{
 const reasons=new Set<string>();
 const search=result.searchIncomplete===undefined?'UNKNOWN':result.searchIncomplete?'PARTIAL':'COMPLETE';
 if(search==='PARTIAL')reasons.add('SEARCH_PARTIAL');
 const posts=result.posts.map((p,i)=>{
  const rows=[...new Map(p.comments.map(c=>[c.id,c])).values()],roots=rows.filter(c=>!c.parentId).length;
  const reason=p.stopReason||(p.complete?undefined:'MCP_WINDOW_ONLY');
  if(reason&&!p.complete)reasons.add(reason);
  return {...(p.chunk?{recovery:{confirmedTotal:p.chunk.checkpoint.marks.length,remainingAnchors:p.chunk.remainingAnchors,sequence:p.chunk.checkpoint.sequence}}:{}),...(/^[A-Za-z0-9_-]{1,200}$/.test(p.post.id)?{postRef:p.post.id}:{}),ordinal:i+1,saved:rows.length,roots,replies:rows.length-roots,complete:p.complete,...(reason?{reason}:{}),...(p.post.boundedRead?{boundedRead:p.post.boundedRead}:{}),...(p.post.boundedReadWindows?{boundedReadWindows:p.post.boundedReadWindows}:{})};
 });
 if(result.searchExhausted)reasons.add('SEARCH_EXHAUSTED');
 return safeRunCoverage({version:1,...(result.selection?{selection:result.selection}:{}),search,reasons:[...reasons],...(result.searchPlanUsage?.length?{searchPlan:result.searchPlanUsage}:{}),posts});
}
/** Keep specific post limits ahead of uncertainty/search range; never last-write wins. */
export function summarizePartial(result:ReadResult){
 if(result.status==='FAILED'||result.status==='PAUSED'||result.reason==='BUDGET')return;
 const evidence=runCoverage(result);if(!evidence)return;
 const limits=['POST_TIME_BUDGET','ROUND_TIME_BUDGET','ROOT_PAGING_DISABLED','ROOT_PAGE_BUDGET','ROOT_LIMIT','COMMENT_LIMIT','RESPONSE_LIMIT','REPLY_CLICK_BUDGET','REPLY_THRESHOLD','NO_PROGRESS','CLICK_FAILED','DOM_SCOPE_UNKNOWN','PAGE_NOT_READY'];
 const reasons=evidence.reasons;
 // SEARCH_PARTIAL 只表示搜索只读了首页：限定批次已采满、帖子都读完时，本轮仍是 COMPLETE。
 const reason=limits.find(r=>reasons.includes(r as any))||reasons.find(r=>r!=='SEARCH_PARTIAL');
 if(reason){result.status='PARTIAL';result.reason=reason;}
}
