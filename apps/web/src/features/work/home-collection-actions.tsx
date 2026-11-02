import {useNavigate} from 'react-router-dom';
import {useConfigs} from '@/features/collection/use-collection';
import {useAutomationPreferences} from './settings-data';
import {WorkspaceAutomationProvider} from './workspace-automation';
import {CollectionFlow} from './collection-flow';
/** Reuse the same explicit-click start path; rendering the introduction only reads local metadata. */
export function HomeCollectionActions(){
 const query=useConfigs(true),preferences=useAutomationPreferences(),navigate=useNavigate();
 const configs=query.data||[],selected=configs.find(c=>c.id===preferences.data?.configId)||configs.find(c=>c.enabled)||configs[0];
 return <WorkspaceAutomationProvider configs={configs} initialId={selected?.id} loading={query.isPending||preferences.isPending} error={query.error||preferences.error} enabled>
 <CollectionFlow configs={configs} initialId={selected?.id} loading={query.isPending||preferences.isPending} error={query.error||preferences.error} visible actionsOnly onSelect={()=>{}} onAccounts={()=>navigate('/work?module=accounts')} onSettings={()=>navigate('/work?module=settings')} onResults={()=>navigate('/work?module=archive')} onRunSelect={runId=>navigate('/automation?'+new URLSearchParams({stage:'collect',config:selected!.id,run:runId}))}/>
 </WorkspaceAutomationProvider>;
}
