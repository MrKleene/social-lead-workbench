import {coverageProgressSummary} from './coverage-progress-summary';
import {coverageReadingSummary} from './coverage-reading-summary';
import {safeBoundedReadReport,boundedReadLabels} from '@crm/contracts';
export function BoundedReadEvidence({value}:{value:unknown}){
 const d=safeBoundedReadReport(value);if(!d)return null;
 const s=d.retained,progress=coverageProgressSummary(d);
 return <details><summary>本轮读取范围</summary><p>{coverageReadingSummary(d)}</p><p>{boundedReadLabels[d.reason]}。不代表平台全部评论。</p>
 {progress?.counts&&<p>{progress.counts}</p>}{progress?.growth&&<p>{progress.growth}</p>}
 <p>{progress?.actions}</p>{progress?.boundary&&<p>{progress.boundary}</p>}
 <p>主评论：{boundedReadLabels[d.rootStop]}；回复：{boundedReadLabels[d.replyStop]}。</p>
 <p>{s.loaded?`本次保留 ${s.loaded.roots} 条主评论、${s.loaded.replies} 条回复`:'保留数量未知'}{d.excludedRoots?`；${d.excludedRoots} 条范围外主评论未纳入`:''}。</p>
 {s.ready.emptyVisible&&<p>页面明确显示空评论提示；未把无效总数转换成零。</p>}
 <details><summary>各层回复范围</summary>{s.groups.map(g=><p key={g.ordinal}>节点 #{g.ordinal}{g.parent!==null?` · 父节点 #${g.parent}`:''}：声明 {g.declared.value??'未知'}，已加载 {g.loaded.value??'未知'}</p>)}</details></details>;
}
