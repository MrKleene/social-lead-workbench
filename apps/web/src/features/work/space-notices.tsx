import { Button } from '@/components/ui/button';
import { ErrorNotice } from '@/components/feedback';
import { reasonLabels, runLabels } from '@/features/collection/types';
import type { SpatialState } from './use-spatial-work';
export function SpaceNotices({state:s}:{state:SpatialState}) {
 return <section className="space-notices glass-panel"><h2>新增提醒 · {s.unread.length}</h2><ErrorNotice error={s.work.notices.error}/>{s.unread.length?s.unread.map(n=><article key={n.id}><button onClick={()=>s.openLead(n.lead.id)}><strong>{n.lead.identity.nickname}</strong><p>{n.title}</p><span>打开来源与处理 →</span></button><Button variant="ghost" size="sm" disabled={s.work.mutation.isPending} onClick={()=>s.work.mutation.mutate({path:`/notices/${n.id}/read`})}>标为已读</Button></article>):<p>暂无未读提醒。首次完整读取建立基线，后续新增才提醒。</p>}{s.admin&&<><h3>异常任务 · {s.work.exceptions.length}</h3>{s.work.exceptions.map(c=><article key={c.id}><strong>{c.name}</strong><p>{reasonLabels[c.pauseReason||c.runs[0]?.reason||'']||runLabels[c.runs[0]?.status]}</p><Button variant="outline" onClick={()=>{s.openModule('runs', c.id);}}>查看采集进度</Button></article>)}</>}</section>;
}
