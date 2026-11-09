import { Alert, AlertDescription } from '@/components/ui/alert';
import {safeBoundedReadReport,boundedReadLabels} from '@crm/contracts';
import {BoundedReadEvidence} from './bounded-read-evidence';
export function BoundedCheckResult({value}:{value:unknown}){
 const d=safeBoundedReadReport(value);if(!d)return <Alert role="alert"><AlertDescription>未取得有效展开诊断，不能确认展开结果。</AlertDescription></Alert>;
 const s=d.retained,gaps=s.groups.filter(g=>g.declared.value!==null&&g.loaded.value!==null&&g.declared.value>g.loaded.value);
 return <div aria-label="回复展开结果"><p>{boundedReadLabels[d.reason]}</p>
 <p>回复展开尝试 {d.replyActions} 次 · 平台声明 {d.final.total.value??'未知'} 条 · 本次读取 {s.loaded?.uniqueKnown??'未知'} 条唯一评论/回复。</p>
 <p>{gaps.length?`${gaps.length} 个节点的声明回复数大于已加载数`:'未发现明确回复数量缺口；缺失统计或平台不可见内容仍无法确认'}。</p>
 <BoundedReadEvidence value={d}/></div>;
}
