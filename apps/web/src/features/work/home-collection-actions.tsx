import {Link} from 'react-router-dom';
import {ArrowRight,Settings2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {useConfigs} from '@/features/collection/use-collection';
import {useAutomationPreferences} from './settings-data';
import {WorkspaceAutomationProvider,useWorkspaceAutomation} from './workspace-automation';
/** The introduction navigates to collection; only the task page can start a run. */
export function HomeCollectionActions(){
 const query=useConfigs(true),preferences=useAutomationPreferences();
 const configs=query.data||[],selected=configs.find(c=>c.id===preferences.data?.configId)||configs.find(c=>c.enabled)||configs[0];
 return <WorkspaceAutomationProvider configs={configs} initialId={selected?.id} loading={query.isPending||preferences.isPending} error={query.error||preferences.error} enabled><HomeCollectionLinks/></WorkspaceAutomationProvider>;
}
function HomeCollectionLinks(){
 const {openSettings}=useWorkspaceAutomation();
 return <div className="home-collection-actions"><div className="home-collection-buttons"><Button asChild><Link to="/automation?stage=collect"><ArrowRight data-icon="inline-start"/>进入采集</Link></Button><Button variant="outline" onClick={()=>openSettings('collect')}><Settings2 data-icon="inline-start"/>采集设置</Button></div></div>;
}
