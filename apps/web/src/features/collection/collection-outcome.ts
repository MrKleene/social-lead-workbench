import {observedReadCounts,safeBoundedReadReport,safeRunCoverage,safeCollectionDiagnostic,type BoundedReadReport} from '@crm/contracts';
import {reasonLabels,type Run} from './types';

// Execution interruptions are distinct from missing coverage evidence. Never mutate persisted statuses.
const interruptions=new Set(['TIMEOUT','BUDGET','ROOT_PAGE_BUDGET','REPLY_CLICK_BUDGET','REPLAY_BUDGET','RESPONSE_LIMIT','ROOT_LIMIT','COMMENT_LIMIT','REPLY_THRESHOLD','LEDGER_LIMIT','DEPTH_LIMIT','ROOT_PAGING_DISABLED','REPLY_EXPANSION_DISABLED','NO_PROGRESS','PAGE_NOT_READY','CLICK_FAILED','DOM_SCOPE_UNKNOWN','READ_FAILED','INVALID_RESPONSE','INVALID_DATA','IDENTITY_CONFLICT','REPLAY_ANCHOR_MISSING','PLATFORM_LIMIT','RESTRICTED','RATE_LIMITED','LOGIN_EXPIRED','SOURCE_UNAVAILABLE','CANCELLED','AUTHORIZATION_ENDED','DEVICE_UNAVAILABLE','ACCOUNT_CHANGED','IDENTITY_MISMATCH','QUEUE_UNAVAILABLE','REAL_DISABLED','ENDPOINT_INVALID','PROFILE_MISMATCH','MCP_PROTOCOL','MCP_TOOLS_MISSING','MCP_SESSION_EXPIRED']);
export const readingInterruption=(reason?:string|null)=>!!reason&&interruptions.has(reason);
function visibleExhausted(d:BoundedReadReport,saved?:number|null){
 if(!['BUTTON_NOT_FOUND','DECLARED_TREE_EXHAUSTED'].includes(d.reason)||d.excludedRoots||d.rootStop!=='ROOT_END'||!['BUTTON_NOT_FOUND','DECLARED_REPLIES_LOADED'].includes(d.replyStop))return false;
 const n=d.retained.loaded;if(!n||saved==null||n.uniqueKnown!==saved)return false;
 return [d.final,d.retained].every(s=>{
  const count=s.loaded,roots=s.groups.filter(g=>g.depth===0);
  return s.status==='OK'&&s.list==='EXACT'&&s.findings.length===0&&s.ready.document==='complete'&&s.ready.container&&s.ready.rootScopeExact===true&&s.ready.rootEndVisible===true&&s.ready.replyControls===0&&s.hasMore.state==='EXACT'&&s.hasMore.value===false&&!!count&&!count.missingIds&&!count.duplicateIds&&!count.invalidNodes&&count.uniqueKnown===saved&&count.roots===n.roots&&count.replies===n.replies&&(saved>0||s.ready.emptyVisible===true)&&roots.length===count.roots&&roots.every(g=>g.declared.state==='EXACT'&&g.loaded.state==='EXACT'&&g.declared.value===g.loaded.value);
 });
}
export function commentCoverage(value:unknown,reason?:string|null,saved?:number|null){
 const report=safeBoundedReadReport(value),reasons=[reason,report?.reason,report?.rootStop,report?.replyStop];
 const issue=reasons.find(readingInterruption);
 const replyGap=!!report&&[report.final,report.retained].some(s=>s.groups.some(g=>g.declared.state==='EXACT'&&g.loaded.state==='EXACT'&&g.declared.value! > g.loaded.value!));
 const warning=!!issue||!!report?.excludedRoots||replyGap;
 const visible=!!report&&!warning&&visibleExhausted(report,saved);
 const declared=report?.final.total.state==='EXACT'?report.final.total.value:null;
 return {label:warning?'读取范围未尽':visible?'已采集当前可见评论':'覆盖待确认',warning,visible,issue:issue?reasonLabels[issue]||issue:replyGap?'声明的回复尚未读尽':warning?'有评论未保留':undefined,declared,difference:declared!=null&&saved!=null?Math.abs(declared-saved):null};
}
export function collectionOutcome(run:Run){
 const c=safeRunCoverage(run.metrics?.coverage),postViews=c?.posts.map(p=>commentCoverage(p.boundedRead,p.reason,observedReadCounts(p).count))||[];
 const issue=[run.reason,...(c?.reasons||[])].find(readingInterruption);
 const diagnostic=safeCollectionDiagnostic(run.metrics?.diagnostic);
 const interrupted=!!issue||!!diagnostic||postViews.some(p=>p.warning),terminal=['COMPLETE','PARTIAL'].includes(run.status);
 const visible=terminal&&!interrupted&&postViews.length>0&&postViews.length===run.capturedPosts&&c?.posts.reduce((n,p)=>n+p.saved,0)===run.capturedCommentsCount&&postViews.every(p=>p.visible)&&c?.posts.every(p=>!p.recovery?.remainingAnchors);
 const label=run.status==='QUEUED'?'排队中':run.status==='RUNNING'?'读取中':run.status==='FAILED'?'采集失败':run.status==='PAUSED'?'已暂停':terminal?interrupted?'采集已停止':'采集已结束':'状态待确认';
 const warning=['FAILED','PAUSED'].includes(run.status)||(!terminal&&!['QUEUED','RUNNING'].includes(run.status))||terminal&&interrupted;
 return {label,warning,coverage:interrupted?'读取范围未尽':visible?'已采集当前可见评论':'覆盖待确认',visible,issue:issue?reasonLabels[issue]||issue:postViews.find(p=>p.warning)?.issue||(diagnostic?'读取存在异常，请查看诊断详情':undefined)};
}
