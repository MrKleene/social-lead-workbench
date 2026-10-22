import { AccountsPage } from '@/features/accounts/accounts-page';
import { CollectionPage } from '@/features/collection/collection-page';
import { RepliesPage } from '@/features/replies/replies-page';
import { SpacePanel, SoftSwap } from './space-panel';
import { ArrowLeft, Bell } from 'lucide-react';
import { useSpatialWork } from './use-spatial-work';
import { SpaceNavigation } from './space-navigation';
import { SpaceResults } from './space-results';
import { SpaceLeadDetail } from './space-lead-detail';
import { SpaceNotices } from './space-notices';
import { OrbitOverview } from './orbit-overview';
import {CollectionFlow} from './collection-flow';
import {CollectionResults} from '@/features/collection/collection-results';
import { usePanelExpansion } from './use-panel-expansion';

export function WorkPage() {
 const state=useSpatialWork();
 const expanded=!!state.active;
 const expansion=usePanelExpansion(state.active);
 return <div ref={expansion.stage} className="spatial-work" data-expanded={expanded} data-module={state.active||'overview'} data-detail={!!state.id}>
   <OrbitOverview state={state}/>
   <SpaceNavigation state={state}/>
   <button className="space-notice-trigger" onClick={()=>state.openModule('notices')} aria-label={`新增提醒 ${state.unread.length}，异常 ${state.work.exceptions.length}`}><Bell size={18}/>{state.unread.length+state.work.exceptions.length>0&&<span>{state.unread.length+state.work.exceptions.length}</span>}</button>
   {expanded&&<button className="space-back" onClick={state.overview}><ArrowLeft size={15}/>总览<span>/</span>{state.active==='accounts'?'账号中心':state.active==='settings'?'搜索设置':state.active==='templates'?'回复话术':state.active==='archive'?'采集结果':state.active==='runs'?'采集任务':state.active==='follow'?'销售跟进':state.active==='notices'?'提醒与异常':'评论审核'}</button>}
   <div ref={expansion.surface} className="space-expanded-workspace" data-open={expanded} inert={!expanded} aria-hidden={!expanded}>
     <SpacePanel name="leads" active={state.active==='matches'||state.active==='follow'}><SpaceResults state={state}/><SoftSwap identity={state.id||"placeholder"}>{state.id?<SpaceLeadDetail key={state.id} id={state.id} scrollMemory={state.detailScroll} admin={state.admin} onClose={state.closeDetail}/>:<section className="space-detail-placeholder glass-panel"><span>保留人的判断</span><h2>从一条原文开始</h2><p>选择左侧的评论，在这里查看来源、匹配依据与楼中楼，记录联系和销售跟进。</p><p>专业相关 ≠ 明确需求 ≠ 联系同意</p><small>来源与模型状态以记录为准 · 真实发送禁用</small></section>}</SoftSwap></SpacePanel>
     {state.admin&&<SpacePanel name="runs" active={state.active==='runs'}><div className="space-tool-panel glass-panel"><CollectionFlow configs={state.configs} loading={state.work.configs.isPending} initialId={state.selectedConfig?.id} onSelect={state.setConfig} onAccounts={()=>state.openModule('accounts')} onSettings={()=>state.openModule('settings')} onResults={()=>state.openModule('archive')}/>{state.work.feedback&&<p role="status">{state.work.feedback}</p>}</div></SpacePanel>}
     {state.admin&&<SpacePanel name="archive" active={state.active==='archive'}><CollectionResults configs={state.configs} initialId={state.selectedConfig?.id} onSettings={()=>state.openModule('settings')}/></SpacePanel>}
     <SpacePanel name="accounts" active={state.active==='accounts'}><AccountsPage/></SpacePanel>
     <SpacePanel name="notices" active={state.active==='notices'}><SpaceNotices state={state}/></SpacePanel>
     {state.admin&&<><SpacePanel name="settings" active={state.active==='settings'}><section className="space-admin-panel glass-panel"><CollectionPage/></section></SpacePanel><SpacePanel name="templates" active={state.active==='templates'}><section className="space-admin-panel glass-panel"><RepliesPage/></section></SpacePanel></>}
   </div>
   <footer className="space-footnote">规则辅助 · 人工判断 · 手动有限采集 · 真实发送禁用</footer>
 </div>;
}
