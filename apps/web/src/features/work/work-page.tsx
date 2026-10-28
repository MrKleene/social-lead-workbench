import { AccountsPage } from '@/features/accounts/accounts-page';
import { CollectionPage } from '@/features/collection/collection-page';
import { RepliesPage } from '@/features/replies/replies-page';
import { SpacePanel, SoftSwap } from './space-panel';
import { useSpatialWork } from './use-spatial-work';
import { SpaceResults } from './space-results';
import { SpaceLeadDetail } from './space-lead-detail';
import { SpaceNotices } from './space-notices';
import { OrbitOverview } from './orbit-overview';
import {TaskWorkspace} from './task-workspace';
import {CollectionResults} from '@/features/collection/collection-results';
import { usePanelExpansion } from './use-panel-expansion';

export function WorkPage() {
 const state=useSpatialWork();
 const expanded=!!state.active;
 const expansion=usePanelExpansion(state.active);
 return <div ref={expansion.stage} className="spatial-work" data-expanded={expanded} data-module={state.active||'overview'} data-detail={!!state.id}>
   <OrbitOverview state={state}/>
   <div ref={expansion.surface} className="space-expanded-workspace" data-open={expanded} inert={!expanded} aria-hidden={!expanded}>
     <SpacePanel name="leads" active={state.active==='matches'||state.active==='follow'}><SpaceResults state={state}/><SoftSwap identity={state.id||"placeholder"}>{state.id?<SpaceLeadDetail key={state.id} id={state.id} scrollMemory={state.detailScroll} admin={state.admin} onClose={state.closeDetail}/>:<section className="space-detail-placeholder glass-panel"><span>保留人的判断</span><h2>从一条原文开始</h2><p>选择左侧的评论，在这里查看来源、匹配依据与楼中楼，记录联系和销售跟进。</p><p>专业相关 ≠ 明确需求 ≠ 联系同意</p><small>来源与模型状态以记录为准 · 真实发送禁用</small></section>}</SoftSwap></SpacePanel>
     {state.admin&&<SpacePanel name="runs" active={state.active==='runs'}><div className="space-tool-panel glass-panel"><TaskWorkspace configs={state.configs} loading={state.work.configs.isPending} error={state.work.configs.error} visible={state.active==='runs'} initialId={state.selectedConfig?.id} onSelect={state.setConfig} onAccounts={()=>state.openModule('accounts')} onSettings={()=>state.openModule('settings')} onResults={()=>state.openModule('archive')}/>{state.work.feedback&&<p role="status">{state.work.feedback}</p>}</div></SpacePanel>}
     {state.admin&&<SpacePanel name="archive" active={state.active==='archive'}><CollectionResults configs={state.configs} initialId={state.selectedConfig?.id} onSettings={()=>state.openModule('settings')}/></SpacePanel>}
     <SpacePanel name="accounts" active={state.active==='accounts'}><AccountsPage/></SpacePanel>
     <SpacePanel name="notices" active={state.active==='notices'}><SpaceNotices state={state}/></SpacePanel>
     {state.admin&&<><SpacePanel name="settings" active={state.active==='settings'}><section className="space-admin-panel glass-panel"><CollectionPage/></section></SpacePanel><SpacePanel name="templates" active={state.active==='templates'}><section className="space-admin-panel glass-panel"><RepliesPage/></section></SpacePanel></>}
   </div>
 </div>;
}
