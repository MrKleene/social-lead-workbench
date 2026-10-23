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
  return {ordinal:i+1,saved:rows.length,roots,replies:rows.length-roots,complete:p.complete,...(reason?{reason}:{}),...(p.post.boundedRead?{boundedRead:p.post.boundedRead}:{})};
 });
 return safeRunCoverage({version:1,search,reasons:[...reasons],posts});
}
/** Keep specific post limits ahead of uncertainty/search range; never last-write wins. */
export function summarizePartial(result:ReadResult){
 if(result.status==='FAILED'||result.status==='PAUSED'||result.reason==='BUDGET')return;
 const evidence=runCoverage(result);if(!evidence)return;
 const limits=['ROOT_PAGING_DISABLED','ROOT_PAGE_BUDGET','ROOT_LIMIT','COMMENT_LIMIT','RESPONSE_LIMIT','REPLY_CLICK_BUDGET','REPLY_THRESHOLD','NO_PROGRESS','CLICK_FAILED','DOM_SCOPE_UNKNOWN','PAGE_NOT_READY'];
 const reasons=evidence.reasons;
 const reason=limits.find(r=>reasons.includes(r as any))||reasons.find(r=>r!=='SEARCH_PARTIAL')||reasons[0];
 if(reason){result.status='PARTIAL';result.reason=reason;}
}
