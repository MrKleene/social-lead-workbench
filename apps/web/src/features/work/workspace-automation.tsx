import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {useLocation,useNavigate,useNavigationType,useSearchParams} from 'react-router-dom';
import {AutomationSettings} from './automation-settings';
import {CollectionSettings} from './collection-settings';
import type {AutomationTab,SetupIssue} from './automation-validation';
import {useMcpReadiness} from '@/features/collection/use-collection';
import type {Config} from '@/features/collection/types';
import {ErrorNotice,Loading} from '@/components/feedback';
type Plan={posts:number;pages:number;scenario:string};
type SettingsContext={openSettings:(tab?:AutomationTab,issue?:SetupIssue|null,edit?:boolean)=>void;plans:Record<string,Plan>};
const Context=createContext<SettingsContext|null>(null);
export function useWorkspaceAutomation(){const value=useContext(Context);if(!value)throw new Error('Workspace automation provider missing');return value;}
/** Settings are a sibling of the page surfaces; opening them never changes the active page. */
export function WorkspaceAutomationProvider({configs,initialId,loading,error,enabled,children}:{configs:Config[];initialId?:string;loading:boolean;error?:unknown;enabled:boolean;children:ReactNode}){
 const readiness=useMcpReadiness(enabled),location=useLocation(),navigationType=useNavigationType(),navigate=useNavigate(),[params]=useSearchParams();
 const [settings,setSettings]=useState(false),[settingsTab,setSettingsTab]=useState<AutomationTab>('collect'),[setupIssue,setSetupIssue]=useState<SetupIssue|null>(null);
 const [dirty,setDirty]=useState(false),[collectionBusy,setCollectionBusy]=useState(false),[configId,setConfigId]=useState<string>();
 const [plans,setPlans]=useState<Record<string,Plan>>({});
 const trigger=useRef<HTMLElement|null>(null),origin=useRef('');
 const selected=configs.find(c=>c.id===(configId||initialId))||configs.find(c=>c.enabled)||configs[0];
 const openSettings=(tab:AutomationTab='collect',issue:SetupIssue|null=null,_edit=false)=>{
  if(!enabled)return;
  trigger.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
  origin.current=location.pathname+location.search+location.hash;
  setConfigId(initialId);setSettingsTab(tab);setSetupIssue(issue);setDirty(false);setCollectionBusy(false);
  setSettings(true);
 };
 useEffect(()=>{
  if(!enabled)return;
  if(['collection-settings','automation-settings'].includes(params.get('panel')||'')){
   if(loading)return;
   const tab=params.get('settingsTab');openSettings(tab==='review'||tab==='contact'?tab:'collect');
   const next=new URLSearchParams(params);next.delete('panel');next.delete('settingsTab');
   origin.current=location.pathname+(next.size?'?'+next:'')+location.hash;
   navigate({pathname:location.pathname,search:next.toString(),hash:location.hash},{replace:true});
  }else if(settings&&origin.current!==location.pathname+location.search+location.hash){
   // A legacy task link may acquire its restored run through a replace after data loads.
   // That normalization is not a user departure and must not dismiss the requested settings.
   const before=new URL(origin.current,window.location.origin),after=new URL(location.pathname+location.search+location.hash,window.location.origin);
   const restoring=navigationType==='REPLACE'&&before.searchParams.get('module')==='runs'&&!before.searchParams.has('run')&&before.searchParams.get('fresh')!=='1'&&after.searchParams.has('run');
   if(restoring){after.searchParams.delete('run');if(!before.searchParams.has('config'))after.searchParams.delete('config');}
   if(restoring&&before.href===after.href)origin.current=location.pathname+location.search+location.hash;
   else {setSettings(false);setSetupIssue(null);}
  }
 },[location.pathname,location.search,location.hash,loading,enabled]);
 return <Context.Provider value={{openSettings,plans}}>{children}{enabled&&<AutomationSettings open={settings} onClose={()=>{setSettings(false);setSetupIssue(null);}} tab={settingsTab} onTab={setSettingsTab} collectionDirty={dirty} collectionBusy={collectionBusy} collectionReady={!error&&!!selected?.keywords.length&&(selected.mode==='MOCK'||!!readiness.data?.accounts?.some(a=>a.eligible))} issue={setupIssue} onReturnFocus={()=>{if(trigger.current?.isConnected)trigger.current.focus({preventScroll:true});}}>
 <ErrorNotice error={error||readiness.error}/>{loading&&!selected?<Loading/>:''}
<div className="task-settings-body">{settings&&!loading&&<CollectionSettings configs={configs} initialId={configId||initialId} onDirty={setDirty} onBusy={setCollectionBusy} onSaved={c=>{setConfigId(c.id);setPlans(old=>({...old,[c.id]:{posts:c.batchLimit,pages:4,scenario:'BASELINE'}}));}}/>}</div>
 </AutomationSettings>}</Context.Provider>;
}
