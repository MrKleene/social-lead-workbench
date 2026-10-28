import { Button } from '@/components/ui/button';
import { ErrorNotice, Loading } from '@/components/feedback';
import { reasonLabels, runLabels } from '@/features/collection/types';
import type { SpatialState } from './use-spatial-work';
export function SpaceNotices({state:s}:{state:SpatialState}) {
 const notices=s.work.notices,configs=s.work.configs;
 return <section className="space-notices glass-panel">
  <h2>新增提醒 · {notices.isError?'读取失败':notices.isPending?'正在读取':s.unread.length}</h2>
  <ErrorNotice error={notices.error}/>
  {notices.isPending?<Loading/>:notices.isError?<Button variant="outline" onClick={()=>void notices.refetch()}>重试读取提醒</Button>:s.unread.length?s.unread.map(n=><article key={n.id}><button onClick={()=>s.openLead(n.lead.id)}><strong>{n.lead.identity.nickname}</strong><p>{n.title}</p><span>打开来源与处理 →</span></button><Button variant="ghost" size="sm" disabled={s.work.mutation.isPending} onClick={()=>s.work.mutation.mutate({path:`/notices/${n.id}/read`})}>标为已读</Button></article>):<p>暂无未读提醒。首次完整读取建立基线，后续新增才提醒。</p>}
  {s.admin&&<><h3>异常任务 · {configs.isError?'读取失败':configs.isPending?'正在读取':s.work.exceptions.length}</h3><ErrorNotice error={configs.error}/>{configs.isPending?<Loading/>:configs.isError?<Button variant="outline" onClick={()=>void configs.refetch()}>重试读取异常任务</Button>:s.work.exceptions.map(c=><article key={c.id}><strong>{c.name}</strong><p>{reasonLabels[c.pauseReason||c.runs[0]?.reason||'']||runLabels[c.runs[0]?.status]}</p><Button variant="outline" onClick={()=>s.openModule('runs',c.id)}>查看采集进度</Button></article>)}</>}
 </section>;
}
