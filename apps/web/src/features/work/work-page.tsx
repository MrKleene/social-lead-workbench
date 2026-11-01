import {SalesDashboard} from './work-dashboard';
import {WorkspaceAutomationProvider} from './workspace-automation';
import { AccountsPage } from '@/features/accounts/accounts-page';
import { CollectionPage } from '@/features/collection/collection-page';
import { RepliesPage } from '@/features/replies/replies-page';
import { SpacePanel, SoftSwap } from './space-panel';
import { useSpatialWork } from './use-spatial-work';
import { SpaceResults } from './space-results';
import { SpaceLeadDetail } from './space-lead-detail';
import { SpaceNotices } from './space-notices';
import {ProjectDashboard} from './project-dashboard';

import {CollectionResults} from '@/features/collection/collection-results';
import { usePanelExpansion } from './use-panel-expansion';

export function WorkPage() {
 const state=useSpatialWork();
 const expanded=!!state.active;
 const expansion=usePanelExpansion(state.active);
 return <WorkspaceAutomationProvider configs={state.configs} initialId={state.selectedConfig?.id} loading={state.work.configs.isPending} error={state.work.configs.error} enabled={state.admin}><div ref={expansion.stage} className="spatial-work" data-expanded={expanded} data-module={state.active||'overview'} data-detail={!!state.id}>
   {!state.active&&(state.admin?<ProjectDashboard/>:<SalesDashboard state={state}/>)}
   <div ref={expansion.surface} className="space-expanded-workspace" data-open={expanded} inert={!expanded} aria-hidden={!expanded}>
     <SpacePanel name="leads" active={state.active==='matches'||state.active==='follow'}><SpaceResults state={state}/><SoftSwap identity={state.id||"placeholder"}>{state.id?<SpaceLeadDetail key={state.id} id={state.id} scrollMemory={state.detailScroll} admin={state.admin} onClose={state.closeDetail}/>:<section className="space-detail-placeholder glass-panel"><h2>选择一条线索查看详情</h2></section>}</SoftSwap></SpacePanel>
     {state.admin&&<SpacePanel name="archive" active={state.active==='archive'}><CollectionResults configs={state.configs} initialId={state.selectedConfig?.id} onSettings={()=>state.openModule('settings')}/></SpacePanel>}
     <SpacePanel name="accounts" active={state.active==='accounts'}><AccountsPage/></SpacePanel>
     <SpacePanel name="notices" active={state.active==='notices'}><SpaceNotices state={state}/></SpacePanel>
     {state.admin&&<><SpacePanel name="settings" active={state.active==='settings'}><section className="space-admin-panel glass-panel"><CollectionPage/></section></SpacePanel><SpacePanel name="templates" active={state.active==='templates'}><section className="space-admin-panel glass-panel"><RepliesPage/></section></SpacePanel></>}
   </div>
 </div></WorkspaceAutomationProvider>;
}
