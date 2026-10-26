import {InfoSection} from '../../components/information-section';
import {coverageProgressSummary} from './coverage-progress-summary';
import {coverageReadingSummary} from './coverage-reading-summary';
import {safeBoundedReadReport,boundedReadLabels} from '@crm/contracts';
export function BoundedReadEvidence({value}:{value:unknown}){
 const d=safeBoundedReadReport(value);if(!d)return null;
 const s=d.retained,progress=coverageProgressSummary(d);
 return <InfoSection  title={<>本轮读取范围</>}>{d.window&&<p>读取窗口 {d.window}</p>}<p>{coverageReadingSummary(d)}</p><p>{boundedReadLabels[d.reason]}。不代表平台全部评论。</p>
 {progress?.counts&&<p>{progress.counts}</p>}{progress?.growth&&<p>{progress.growth}</p>}
 <p>{progress?.actions}</p>{progress?.boundary&&<p>{progress.boundary}</p>}
 <p>主评论：{boundedReadLabels[d.rootStop]}；回复：{boundedReadLabels[d.replyStop]}。</p>
 <p>{d.chunkSummary?`本次页面已加载 ${d.chunkSummary.roots} 条主评论、${d.chunkSummary.replies} 条回复` : s.loaded?`本次保留 ${s.loaded.roots} 条主评论、${s.loaded.replies} 条回复`:'保留数量未知'}{d.excludedRoots?`；${d.excludedRoots} 条范围外主评论未纳入`:''}。</p>
 {s.ready.emptyVisible&&<p>页面明确显示空评论提示；未把无效总数转换成零。</p>}
 {s.relations&&<InfoSection  title={<>回复目标字段检查</>}><p>仅检查来源字段与已加载节点的对应关系，不推定直接回复对象。</p><p>检查 {s.relations.scanned} 个节点，{s.relations.fields.length} 项结构记录{s.relations.limited?'（已到诊断上限）':''}。</p>{s.relations.fields.map((f,i)=><p key={i}>节点 #{f.ordinal} · {f.path} · {f.shape}{f.commentOrdinals.length?` · 对应评论节点 ${f.commentOrdinals.map(x=>'#'+x).join('、')}`:''}{f.userMatches?` · 对应 ${f.userMatches} 个已加载作者记录`:''}</p>)}</InfoSection>}
 <InfoSection  title={<>各层回复范围</>}>{s.groups.map(g=><p key={g.ordinal}>节点 #{g.ordinal}{g.parent!==null?` · 父节点 #${g.parent}`:''}：声明 {g.declared.value??'未知'}，已加载 {g.loaded.value??'未知'}</p>)}</InfoSection></InfoSection>;
}

export function BoundedReadWindows({values}:{values:unknown}){
 if(!Array.isArray(values)||values.length<2||values.length>8)return null;
 const reports=values.map(safeBoundedReadReport);if(reports.some(r=>!r))return null;
 return <InfoSection  title={<>分窗读取记录（{reports.length} 次）</>}>{reports.map((r,i)=><BoundedReadEvidence key={i} value={r}/>)}</InfoSection>;
}
