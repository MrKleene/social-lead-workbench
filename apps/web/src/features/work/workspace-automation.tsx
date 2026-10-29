import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {useLocation,useNavigate,useNavigationType,useSearchParams} from 'react-router-dom';
import {AutomationSettings} from './automation-settings';
import type {AutomationTab,SetupIssue} from './automation-validation';
import {useMcpReadiness} from '@/features/collection/use-collection';
import {ConfigEditor} from '@/features/collection/config-editor';
import {scenarios,type Config} from '@/features/collection/types';
import {FormField} from '@/components/form-field';
import {SelectField,SelectOption} from '@/components/select-field';
import {Button} from '@/components/ui/button';
import {InfoSection} from '@/components/information-panel';
import {ErrorNotice,Loading} from '@/components/feedback';
import {accountOptionName} from '@/features/accounts/account-presentation';
type Plan={posts:number;pages:number;scenario:string};
type SettingsContext={openSettings:(tab?:AutomationTab,issue?:SetupIssue|null,edit?:boolean)=>void;plans:Record<string,Plan>};
const Context=createContext<SettingsContext|null>(null);
export function useWorkspaceAutomation(){const value=useContext(Context);if(!value)throw new Error('Workspace automation provider missing');return value;}
/** Settings are a sibling of the page surfaces; opening them never changes the active page. */
export function WorkspaceAutomationProvider({configs,initialId,loading,error,enabled,children}:{configs:Config[];initialId?:string;loading:boolean;error?:unknown;enabled:boolean;children:ReactNode}){
 const readiness=useMcpReadiness(enabled),location=useLocation(),navigationType=useNavigationType(),navigate=useNavigate(),[params]=useSearchParams();
 const [settings,setSettings]=useState(false),[settingsTab,setSettingsTab]=useState<AutomationTab>('collect'),[setupIssue,setSetupIssue]=useState<SetupIssue|null>(null);
 const [editor,setEditor]=useState<'new'|'edit'|null>(null),[dirty,setDirty]=useState(false),[collectionBusy,setCollectionBusy]=useState(false),[configId,setConfigId]=useState<string>();
 const [plans,setPlans]=useState<Record<string,Plan>>({});
 const trigger=useRef<HTMLElement|null>(null),origin=useRef('');
 const selected=configs.find(c=>c.id===(configId||initialId))||configs.find(c=>c.enabled)||configs[0];
 const openSettings=(tab:AutomationTab='collect',issue:SetupIssue|null=null,edit=false)=>{
  if(!enabled)return;
  trigger.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
  origin.current=location.pathname+location.search+location.hash;
  setConfigId(initialId);setSettingsTab(tab);setSetupIssue(issue);setDirty(false);setCollectionBusy(false);
  const current=configs.find(c=>c.id===initialId)||configs.find(c=>c.enabled)||configs[0];
  setEditor(edit||!current?.keywords.length?(current?'edit':'new'):null);setSettings(true);
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
 const plan=plans[selected?.id||'']||{posts:selected?.batchLimit||1,pages:4,scenario:'BASELINE'};
 const posts=Math.min(plan.posts,selected?.batchLimit||1);
 const updatePlan=(patch:Partial<Plan>)=>{if(selected)setPlans(old=>({...old,[selected.id]:{...plan,...patch}}));};
 const defaultAccount=readiness.data?.accounts?.find(a=>a.id===selected?.defaultExecutionAccountId);
 return <Context.Provider value={{openSettings,plans}}>{children}{enabled&&<AutomationSettings open={settings} onClose={()=>{setSettings(false);setSetupIssue(null);}} tab={settingsTab} onTab={setSettingsTab} collectionDirty={dirty} collectionBusy={collectionBusy} collectionReady={!error&&!!selected?.keywords.length&&(selected.mode==='MOCK'||!!readiness.data?.accounts?.some(a=>a.eligible))} issue={setupIssue} onReturnFocus={()=>{if(trigger.current?.isConnected)trigger.current.focus({preventScroll:true});}}>
 <ErrorNotice error={error||readiness.error}/>{loading&&!selected?<Loading/>:''}
<div className="task-settings-body">
 {editor?<ConfigEditor key={editor==='new'?'new':selected?.id} config={editor==='edit'?selected:undefined} availableMode={readiness.data?.enabled?readiness.data.mode:null} onDirty={setDirty} onBusy={setCollectionBusy} onReviewSettings={()=>setSettingsTab("review")} onClose={()=>setEditor(null)} onSaved={c=>{setConfigId(c.id);setEditor(null);}}/>:<>
 {configs.length>1&&<FormField>编辑的关键词组<SelectField aria-label="编辑的关键词组" value={selected?.id||''} onValueChange={e=>{setConfigId(e);}}>{configs.map(c=><SelectOption key={c.id} value={c.id}>{c.name}</SelectOption>)}</SelectField></FormField>}
 {selected&&<><h3>01 · 采集 · {selected.name}</h3><p>在此切换仅选择编辑对象，不切换底下的任务。关键词必填；真实采集开始前需要可用账号。采集账号与发送账号分开核验，可使用同一个账号。</p><p>默认采集账号：{defaultAccount?accountOptionName(defaultAccount):'未设置，开始前选择'}</p><p className="task-keywords">{selected.keywords.join(' / ')||'未配置关键词'}</p><Button variant="ghost" size="content" onClick={()=>setEditor('edit')}>编辑采集配置</Button><FormField>本轮最多帖子数<SelectField aria-label="本轮最多帖子数" value={posts} onValueChange={e=>updatePlan({posts:Number(e)})}>{Array.from({length:selected.batchLimit},(_,i)=><SelectOption key={i+1} value={i+1}>{i+1}</SelectOption>)}</SelectField></FormField><small>本轮范围仅在当前页面保留；关键词、默认账号与默认上限通过编辑保存。</small></>}
 <Button variant="outline" onClick={()=>setEditor('new')}>新增关键词组</Button><InfoSection  title={<>更多选项与读取范围</>}><p>每次手动运行 1 轮，不自动续跑。1 帖不等于 1 页评论；真实模式在服务端上限内翻页并展开回复；停止时保留已读内容，未读尽会标明。模型与发送分别授权，保存采集配置不会开启它们。</p>{selected?.mode==='MOCK'&&<><FormField>每条评论流的页数上限<SelectField aria-label="每条评论流的页数上限" value={plan.pages} onValueChange={e=>updatePlan({pages:Number(e)})}>{[1,2,3,4].map(n=><SelectOption key={n}>{n}</SelectOption>)}</SelectField></FormField><FormField>模拟场景<SelectField value={plan.scenario} onValueChange={e=>updatePlan({scenario:e})}>{Object.entries(scenarios).filter(([k])=>k!=='READ_WINDOW').map(([k,v])=><SelectOption key={k} value={k}>{v}</SelectOption>)}</SelectField></FormField></>}</InfoSection>
 </>}
 </div>
 </AutomationSettings>}</Context.Provider>;
}
