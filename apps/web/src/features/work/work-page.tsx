import { ArrowLeft, ArrowRight, Bell, Search } from 'lucide-react';
import { ErrorNotice } from '@/components/feedback';
import { useSpatialWork } from './use-spatial-work';
import { SpaceNavigation } from './space-navigation';
import { SpaceResults } from './space-results';
import { SpaceLeadDetail } from './space-lead-detail';
import { SpaceNotices } from './space-notices';
import { CollectionLauncher } from './collection-launcher';
export function WorkPage() {
 const state=useSpatialWork();
 const expanded=!!state.active;
 return <div className="spatial-work" data-expanded={expanded} data-module={state.active||'overview'} data-detail={!!state.id}>
   <SpaceNavigation state={state}/>
   <button className="space-notice-trigger" onClick={()=>state.openModule('notices')} aria-label={`新增提醒 ${state.unread.length}，异常 ${state.work.exceptions.length}`}><Bell size={18}/>{state.unread.length+state.work.exceptions.length>0&&<span>{state.unread.length+state.work.exceptions.length}</span>}</button>
   {expanded&&<button className="space-back" onClick={state.overview}><ArrowLeft size={15}/>总览<span>/</span>{state.active==='runs'?'采集任务':state.active==='follow'?'销售跟进':state.active==='notices'?'提醒与异常':'匹配线索'}</button>}
   {!expanded&&<><form className="space-search-bar" onSubmit={e=>{e.preventDefault();state.openModule('matches');}}><Search size={22}/><input aria-label="搜索已采集的线索" placeholder="搜索已采集的线索（关键词 / 用户名 / 原文）" value={state.work.search} onChange={e=>state.work.setSearch(e.target.value)}/><button aria-label="查看搜索结果"><ArrowRight size={20}/></button></form><div className="space-overview-feedback"><ErrorNotice error={state.work.configs.error||state.work.mutation.error}/></div></>}
   {expanded&&<div className="space-expanded-workspace">
     {(state.active==='matches'||state.active==='follow')&&<><SpaceResults state={state}/>{state.id?<SpaceLeadDetail key={state.id} id={state.id} admin={state.admin} onClose={state.closeDetail}/>:<section className="space-detail-placeholder glass-panel"><span>保留人的判断</span><h2>从一条原文开始</h2><p>选择中间的评论，在这里查看来源、匹配依据与楼中楼，记录联系和销售跟进。</p><p>专业相关 ≠ 明确需求 ≠ 联系同意</p><small>模拟数据 · 未接入 LLM · 不会发送消息</small></section>}</>}
     {state.active==='runs'&&state.admin&&<div className="space-tool-panel glass-panel"><CollectionLauncher key={state.selectedConfig?.id || 'loading'} configs={state.configs} loading={state.work.configs.isPending} initialId={state.selectedConfig?.id} runsOpen onRuns={()=>state.openModule('matches')}/>{state.work.feedback&&<p role="status">{state.work.feedback}</p>}</div>}
     {state.active==='notices'&&<SpaceNotices state={state}/>}
   </div>}
   <footer className="space-footnote">规则辅助 · 人工判断 · 模拟模式 · 真实采集与发送禁用</footer>
 </div>;
}
