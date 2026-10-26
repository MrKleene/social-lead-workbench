import { ArrowUpRight, ArrowRight, ScanLine, Database, UsersRound, ShieldCheck, Search } from 'lucide-react';
import SpotlightCard from '@/vendor/react-bits/SpotlightCard';
import { ErrorNotice } from '@/components/feedback';
import {useNavigate} from 'react-router-dom';
import { useAuroraReduced } from './aurora-motion';
import type { SpatialState } from './use-spatial-work';
import type { ReactNode } from 'react';
function Panel({children,className,color}:{children:ReactNode;className:string;color:string}) {
 const reduced=useAuroraReduced();
 return reduced?<div className={`aurora-card ${className}`}>{children}</div>:<SpotlightCard className={`aurora-card ${className}`} spotlightColor={color} ambient={false} intensity={.10} borderGlow={.45} flare={false} smoothing={.3}>{children}</SpotlightCard>;
}
export function AuroraOverview({state:s}:{state:SpatialState}) {
 const navigate=useNavigate();
 const pending=s.work.leads.isPending;
 return <section className="aurora-overview" aria-label="工作舱总览" inert={!!s.active} aria-hidden={!!s.active}>
  <header className="aurora-intro"><div><span className="aurora-eyebrow">LEAD INTELLIGENCE / WORKSPACE</span><h1>让每一次联系，<br/><em>从理解开始。</em></h1></div><p>发现需求 · 读懂上下文 · 保留人的判断<br/><span>所有操作沿用当前工作空间与权限</span></p></header>
  <div className="aurora-panels">
   <Panel className="aurora-discover-card" color="#b9f36d"><div className="aurora-card-top"><span className="aurora-card-index">01 / DISCOVER</span><Database size={20}/></div><h2>采集与发现</h2><p className="aurora-subtitle">留住原文，也留住每一次读取的边界。</p><div className="aurora-count">{s.work.configs.isPending?'—':s.configs.length}<span>搜索配置</span></div><div className="aurora-config-preview"><span className="aurora-dot"/> {s.selectedConfig?.name||'尚未选择搜索配置'}<small>{s.configs.some(c=>c.activeRunId)?'有任务运行中 · 查看实时状态':'任务按需启动'}</small></div><p className="aurora-note">覆盖率与停止原因保存在运行记录中，部分读取不会标记为全部完成。</p><button className="aurora-card-link" disabled={!s.admin} onClick={()=>s.openModule('runs')}>{s.admin?'查看任务与原文归档':'采集配置由管理员管理'}<ArrowUpRight size={18}/></button></Panel>
   <Panel className="aurora-review-card" color="#a88be8"><div className="aurora-card-top"><span className="aurora-card-index">02 / UNDERSTAND</span><ScanLine size={22}/></div><div className="aurora-review-title"><h2>评论审核</h2><span className="aurora-pill">原文优先</span></div><p className="aurora-subtitle">把评论放回语境，让需求变得清晰。</p><div className="aurora-count">按需<span>独立审核</span></div><div className="aurora-evidence-preview"><span>只判断已保存的评论</span><p>填写审核需求，选择全部评论或所选帖子。无需再次采集，也不要求评论包含搜索词。</p><small>结果保留版本与证据，由你人工确认</small></div><button className="aurora-primary core-start" disabled={!s.admin} onClick={()=>navigate('/comment-review')}>{s.admin?'展开审核工作区':'审核由管理员管理'}<ArrowRight size={19}/></button><div className="aurora-review-meta"><ShieldCheck size={14}/> 真实发送禁用 · 保留人工审核</div></Panel>
   <Panel className="aurora-handoff-card" color="#88c6b9"><div className="aurora-card-top"><span className="aurora-card-index">03 / CONNECT</span><UsersRound size={20}/></div><h2>线索与交接</h2><p className="aurora-subtitle">上下文随线索同行，每一步都有记录。</p><div className="aurora-count">{pending?'—':s.work.follow.length}<span>跟进队列</span></div><ol className="aurora-handoff-steps"><li><span>1</span><div>确认联系阶段<small>区分匹配、待联系与意向</small></div></li><li><span>2</span><div>分配销售负责人<small>沿用角色权限与分配记录</small></div></li><li><span>3</span><div>持续记录进展<small>保留来源与判断依据</small></div></li></ol><button className="aurora-card-link" onClick={()=>s.openModule('follow')}>进入销售跟进<ArrowUpRight size={18}/></button></Panel>
  </div>
  <form className="aurora-search" onSubmit={e=>{e.preventDefault();s.openModule('matches');}}><Search size={18}/><input aria-label="搜索已采集的线索" placeholder="在已保存的线索中搜索原文、需求或昵称" value={s.work.search} onChange={e=>s.work.setSearch(e.target.value)}/><button aria-label="查看搜索结果"><ArrowRight size={18}/></button></form>
  <div className="aurora-overview-feedback"><ErrorNotice error={s.work.configs.error||s.work.leads.error||s.work.mutation.error}/></div>
 </section>;
}
