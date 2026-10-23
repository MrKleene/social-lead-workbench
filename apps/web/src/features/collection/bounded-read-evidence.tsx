import {safeBoundedReadReport,boundedReadLabels} from '@crm/contracts';
export function BoundedReadEvidence({value}:{value:unknown}){
 const d=safeBoundedReadReport(value);if(!d)return null;
 const s=d.retained;
 return <details><summary>本轮读取范围</summary><p>{boundedReadLabels[d.reason]}。不代表平台全部评论。</p>
 <p>主评论滚动尝试 {d.rootActions} 次；回复展开尝试 {d.replyActions} 次。</p>
 <p>主评论：{boundedReadLabels[d.rootStop]}；回复：{boundedReadLabels[d.replyStop]}。</p>
 <p>{s.loaded?`本次保留 ${s.loaded.roots} 条主评论、${s.loaded.replies} 条回复`:'保留数量未知'}{d.excludedRoots?`；${d.excludedRoots} 条范围外主评论未纳入`:''}。</p>
 <details><summary>各层回复范围</summary>{s.groups.map(g=><p key={g.ordinal}>节点 #{g.ordinal}{g.parent!==null?` · 父节点 #${g.parent}`:''}：声明 {g.declared.value??'未知'}，已加载 {g.loaded.value??'未知'}</p>)}</details></details>;
}
