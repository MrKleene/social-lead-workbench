import {ArrowUpRight, Search, ContactRound, Archive, Play, LoaderCircle} from 'lucide-react';
import SpotlightCard from '@/vendor/react-bits/SpotlightCard';
import {ErrorNotice} from '@/components/feedback';
import {useMcpReadiness} from '@/features/collection/use-collection';
import {collectionPreflight,preflightText} from './collection-preflight';
import type {SpatialState} from './use-spatial-work';
export function OrbitOverview({state:s}:{state:SpatialState}) {
 const readiness=useMcpReadiness(s.admin);
 const status=collectionPreflight(s.selectedConfig,readiness.data,s.work.configs.isPending||readiness.isPending);
 const eligible=readiness.data?.accounts?.filter(a=>a.eligible)||[];
 return <section className="orbit-overview aurora-overview" aria-label="引力场采集工作台" inert={!!s.active} aria-hidden={!!s.active}>
  <div className="orbit-satellite orbit-search aurora-discover-card"><SpotlightCard spotlightColor="#a998e8" intensity={.1} ambient={false}><Search size={22}/><div><span>关键词组</span><strong>{s.selectedConfig?.name||'添加自定义关键词'}</strong><p>{s.selectedConfig?.keywords.join(' / ')||'保存一次，后续复用'}</p></div><button aria-label="配置搜索关键词" disabled={!s.admin} onClick={()=>s.openModule('settings')}><ArrowUpRight size={18}/></button></SpotlightCard></div>
  <div className="orbit-satellite orbit-account"><SpotlightCard spotlightColor="#91d7c8" intensity={.1} ambient={false}><ContactRound size={22}/><div><span>账号与设备</span><strong>{eligible.length?`${eligible.length} 个当前已核验账号`:'检查账号可用性'}</strong><p>{readiness.data?.device?.online?'执行设备在线':'登录、设备与会话状态'}</p></div><button aria-label="打开账号中心" onClick={()=>s.openModule('accounts')}><ArrowUpRight size={18}/></button></SpotlightCard></div>
  <div className="orbit-main aurora-review-card"><div className="orbit-core-space" aria-hidden="true"><div className="orbit-static-core"/></div><h1>从这里，找到下一条线索。</h1><button className="orbit-collect core-start" disabled={s.admin&&s.work.configs.isPending} onClick={()=>s.openModule(s.admin?'runs':'matches')}>{s.work.configs.isPending&&s.admin?<LoaderCircle size={21}/>:<Play size={21}/>} {s.admin?'自动化采集':'进入我的线索'}</button><p className="orbit-readiness" role="status">{s.admin?preflightText[status]:'采集由管理员执行；你的线索与销售跟进保持可用。'}</p><small>手动有限批次 · LLM 可关闭 · 真实发送禁用</small></div>
  <button className="orbit-archive-satellite aurora-handoff-card" onClick={()=>s.openModule(s.admin?'archive':'follow')}><Archive size={23}/><span><strong>{s.admin?'采集信息':'销售跟进'}</strong><small>{s.admin?'帖子、评论与回复独立归档':'分配、交接与跟进记录'}</small></span><ArrowUpRight size={18}/></button>
  <div className="orbit-errors"><ErrorNotice error={s.work.configs.error||readiness.error}/></div>
 </section>;
}
