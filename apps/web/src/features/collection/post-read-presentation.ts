import type {PostAvailabilityView} from '@crm/contracts';
import {postAccessLabel} from './post-reading-labels';
export type PostReadEvidence={runId:string|null;scope:'RUN'|'LATEST';observedAt:string|null;timeBasis?:'UNKNOWN'|'SAVED_AT'|'RUN_FINISHED';accessObserved:boolean;coverage:'COMPLETE'|'PARTIAL'|'UNKNOWN';confirmedComments:number|null;declaredComments:number|null;reason:string;report?:unknown;windows?:unknown[]};
export function postReadPresentation(e?:PostReadEvidence,a?:PostAvailabilityView){
 const explicitRisk=!!a&&a.state!=='NORMAL'&&(a.version>0||a.reason!=='NOT_CHECKED');
 const checked=a?.checkedAt?Date.parse(a.checkedAt):0,observed=e?.observedAt?Date.parse(e.observedAt):0;
 const captured=!!e?.accessObserved&&!!observed&&!explicitRisk&&!(a?.state==='NORMAL'&&checked>=observed);
 const missing=['HISTORICAL_MEMBERS_UNAVAILABLE','RECOVERY_EVIDENCE_UNAVAILABLE','EVIDENCE_MISSING'].includes(e?.reason||'');
 return {access:captured?'采集时可访问':postAccessLabel(a?.state||'UNKNOWN'),captured,accessAt:captured?e!.observedAt:a?.checkedAt,
  coverage:e?.coverage==='COMPLETE'?`本轮可见评论已读完 · ${e.confirmedComments} 条`:e?.coverage==='PARTIAL'?'本轮读取范围未尽':missing?'本轮覆盖证据不足':e?.reason==='MEMBERS_MISSING'?'本轮评论记录不齐':'覆盖待确认',
  warning:e?.coverage==='PARTIAL'||e?.reason==='MEMBERS_MISSING',scope:e?.scope==='RUN'?(e.timeBasis==='RUN_FINISHED'?'所选轮次结束':'所选轮次'):'最近读取'};
}
