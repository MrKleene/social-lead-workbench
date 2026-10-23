import {safeCoverageDiagnostic,type CoverageDiagnostic} from '@crm/contracts';
type Count=CoverageDiagnostic['samples'][number]['total'];
const missing={MISSING:'未返回',NULL:'空值',INVALID:'格式不支持'};
function amount(c:Count){return c.state==='EXACT'?String(c.value):missing[c.state];}
const findings={INVALID_NODES:'存在非对象条目',MISSING_IDS:'存在缺少有效 ID 的条目',DUPLICATE_IDS:'存在重复 ID',DECLARED_GT_LOADED:'部分回复声明数大于已加载数',DECLARED_LT_LOADED:'部分回复声明数小于已加载数',TOTAL_LT_LOADED:'平台声明数小于当前加载数，口径待核实'};
export function CoverageDiagnostics({value}:{value:unknown}){
 const d=safeCoverageDiagnostic(value);
 if(!d)return <p>此响应未提供可用的评论覆盖诊断。</p>;
 const s=d.samples[d.returnedSample];
 return <details><summary>评论覆盖诊断</summary>
 <p>平台声明评论数：{amount(s.total)}（是否包含回复尚未确认）</p>
 <p>返回快照：{s.loaded?`${s.loaded.roots} 条主评论、${s.loaded.replies} 条回复；有效 ID 去重后 ${s.loaded.uniqueKnown} 条`:'评论列表未取得有效统计'}。</p>
 <p>还有下一页：{s.hasMore.state==='EXACT'?(s.hasMore.value?'是':'否'):missing[s.hasMore.state]}；游标：{{MISSING:'未返回',NULL:'空值',EMPTY:'为空',NONEMPTY:'存在',INVALID:'格式不支持'}[s.cursor]}。</p>
 <p>同页观察 {d.samples.length} 次，间隔共 {d.elapsedMs} 毫秒：{{COUNTS_UNCHANGED:'计数与结构暂未变化',CHANGED:'计数或结构发生变化',UNAVAILABLE:'不足以判断稳定性'}[d.observation]}。未滚动或展开；计数相同不代表完整采集。</p>
 {s.findings.length>0&&<ul>{s.findings.map(f=><li key={f}>{findings[f]}</li>)}</ul>}
 <details><summary>查看各层回复计数与观察记录</summary>
 {s.groups.map(g=><p key={g.ordinal}>{g.depth===0?'主评论':'回复'} #{g.ordinal}{g.parent===null?'':`（父节点 #${g.parent}）`}：回复声明 {amount(g.declared)}，本层已加载 {amount(g.loaded)}</p>)}
 {d.samples.map((x,i)=><p key={i}>观察 {i+1}：{x.ready.document==='complete'?'文档加载完成':'文档尚未就绪或未知'}，{x.ready.container?'帖子容器存在':'未发现帖子容器'}；{x.status==='OK'?'统计可读':x.status==='LIMIT'?'达到诊断上限，统计不完整':'统计不可用'}；{x.loaded?`${x.loaded.roots} 主评 / ${x.loaded.replies} 回复`:'数量未知'}。</p>)}
 </details></details>;
}
