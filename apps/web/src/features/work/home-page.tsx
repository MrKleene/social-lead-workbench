import {useSpatialWork} from './use-spatial-work';
import {WorkspaceAutomationProvider} from './workspace-automation';
import {OrbitOverview} from './orbit-overview';
export function HomePage(){
 const state=useSpatialWork();
 return <WorkspaceAutomationProvider configs={state.configs} initialId={state.selectedConfig?.id} loading={state.work.configs.isPending} error={state.work.configs.error} enabled={state.admin}><div className="spatial-work" data-expanded="false" data-module="home"><OrbitOverview state={state}/></div></WorkspaceAutomationProvider>;
}
