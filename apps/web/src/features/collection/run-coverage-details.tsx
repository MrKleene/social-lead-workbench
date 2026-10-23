import {safeRunCoverage} from '@crm/contracts';
import {BoundedReadEvidence} from './bounded-read-evidence';
import {reasonLabels} from './types';
/** The task's own immutable evidence; never reads a newer post snapshot. */
export function RunCoverageDetails({value}:{value:unknown}){
 const c=safeRunCoverage(value);if(!c)return null;
 return <section aria-label="本次任务覆盖证据"><p>搜索范围：{c.search==='COMPLETE'?'本轮搜索范围已结束':c.search==='PARTIAL'?'有限搜索结果，未证明穷尽':'未知'}。</p>
 {c.posts.map(p=><details key={p.ordinal}><summary>第 {p.ordinal} 篇 · 已存 {p.roots} 主评／{p.replies} 回复 · {p.complete?'页面已声明范围读尽':reasonLabels[p.reason||'']||'覆盖待确认'}</summary><BoundedReadEvidence value={p.boundedRead}/></details>)}</section>;
}
