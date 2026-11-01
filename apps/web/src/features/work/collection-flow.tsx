import {useNavigate} from 'react-router-dom';
import {createPortal} from 'react-dom';
import {useAutomationPreferences} from './settings-data';
import {automationIssue} from './automation-validation';
import {useWorkspaceAutomation} from './workspace-automation';
import {useQueryClient} from '@tanstack/react-query';
import {api} from '@/lib/api';
import type {AutoContactOverview,ReviewOverview} from '@crm/contracts';
import type {Preferences} from './settings-data';
import {useSessionPreflight} from './use-session-preflight';
import {useCollectionTaskSession} from './use-collection-task-session';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Play,Square,Settings2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {ErrorNotice,Loading} from '@/components/feedback';
import {useMcpReadiness,useWorkspaceMutation} from '@/features/collection/use-collection';
import {collectionStartRequest,sameCollectionSetup} from './collection-start-request';
import {type Config,type McpReadiness,type Run} from '@/features/collection/types';
import {collectionPreflight,preflightText} from './collection-preflight';
import {CollectionProgressFeed} from './collection-progress-feed';
const hints={keywords:'先添加搜索关键词',account:'请登录或恢复一个可用账号',device:'请恢复执行设备连接',paused:'此配置已暂停，请检查设置',backoff:'暂时无法继续，请等待后重试',unavailable:'采集服务未就绪，请检查账号与设置'};
export function CollectionFlow({configs,loading,error,visible,workspaceVisible=visible,initialId,onAccounts,onSettings,onResults,onSelect,onRunSelect,actionsHost,view}:{view?:{id:string;run?:Run;pending:boolean;error:unknown};actionsHost?:HTMLElement|null;configs:Config[];loading:boolean;error?:unknown;visible:boolean;workspaceVisible?:boolean;initialId?:string;onAccounts:()=>void;onSettings:()=>void;onResults:()=>void;onSelect:(id:string)=>void;onRunSelect?:(id:string)=>void}){
 const preferences=useAutomationPreferences(workspaceVisible),navigate=useNavigate();
 const client=useQueryClient();
 const {openSettings:showSettings}=useWorkspaceAutomation();
 const readiness=useMcpReadiness(),mutation=useWorkspaceMutation<{id:string}>();
 const [starting,setStarting]=useState(false),[launchError,setLaunchError]=useState<Error|null>(null);
 const submitting=useRef(false),scope=useRef({}),retry=useRef<{signature:string;key:string}|null>(null);
 const [uncertain,setUncertain]=useState(false);
 const selected=configs.find(c=>c.id===initialId)||configs.find(c=>c.enabled)||configs[0];
 const nextConfig=configs.find(c=>c.id===preferences.data?.configId);
 const session=useCollectionTaskSession(selected,visible,view);
 const loginCheck=useSessionPreflight(readiness.data,visible&&!!selected&&selected.enabled&&selected.mode!=='MOCK'&&!session.activeId,selected?.defaultExecutionAccountId);
 const [,tick]=useState(0);
 useEffect(()=>{const delay=Date.parse(selected?.nextAllowedAt||'')-Date.now();if(!visible||!(delay>0))return;const timer=setTimeout(()=>tick(n=>n+1),Math.min(delay+50,2147483647));return()=>clearTimeout(timer);},[selected?.nextAllowedAt,visible]);
 const unavailable=error||session.error||readiness.error;
 const baseStatus=collectionPreflight(selected?{...selected,activeRunId:session.activeId||null}:undefined,unavailable?undefined:readiness.data,loading||readiness.isPending||session.checking);
 useLayoutEffect(()=>{scope.current={};return()=>{scope.current={};};},[visible,selected?.id,selected?.revision]);
 useEffect(()=>{setLaunchError(null);setUncertain(false);},[visible,selected?.id]);
 const status=baseStatus==='ready'&&selected?.mode!=='MOCK'&&loginCheck.supported&&!loginCheck.candidate?.eligible?'account':baseStatus;
 // Persisted configuration is authoritative for new tasks; history keeps its own readPlan.
 const active=!!session.activeId;
 const openSettings=()=>showSettings('collect');
 // Only an explicit click authorizes one bounded run. No mount/effect starts work.
 const begin=async()=>{
  if(submitting.current||uncertain||!visible||status!=='ready'||!selected||unavailable||session.pending||mutation.isPending)return;
  submitting.current=true;setStarting(true);setLaunchError(null);mutation.reset();
  const token=scope.current,visit=session.token(),current=()=>scope.current===token;
  try{
   // Read local metadata again so an older tab cannot silently use stale settings.
   const options={signal:AbortSignal.timeout(15000)};
   const [config,ready,prefs,review,contact]=await Promise.all([
    api<Config>(`/collection/configs/${selected.id}`,options),api<McpReadiness>('/collection/mcp/readiness',options),
    api<Preferences>('/auto-contact/preferences',options),api<ReviewOverview>('/comment-review',options),api<AutoContactOverview>('/auto-contact',options)
   ]);
   if(!current())return;
   client.setQueryData(['mcp-readiness'],ready);client.setQueryData(['automation-preferences'],prefs);
   client.setQueryData<Config[]>(['collection'],old=>old?.map(c=>c.id===config.id?{...c,...config}:c));
   if(prefs.configId&&prefs.configId!==selected.id||!sameCollectionSetup(selected,config))throw new Error('采集设置已更新，请按最新显示的账号和范围开始。');
   const check=collectionPreflight(config,ready);
   if(check!=='ready'){
    if(check==='account'||check==='keywords')showSettings('collect',{tab:'collect',message:preflightText[check]});
    throw new Error(preflightText[check]);
   }
   const issue=automationIssue(review,contact);if(issue){showSettings(issue.tab,issue);return;}
   const signature=JSON.stringify([config.id,config.revision,config.mode,config.defaultExecutionAccountId,config.batchLimit]);
   // A manual retry after a lost response reuses the same idempotency key.
   if(retry.current?.signature!==signature)retry.current={signature,key:crypto.randomUUID()};
   const request=collectionStartRequest(config,ready,retry.current.key);
   if(!request||!current())return;
   await mutation.mutateAsync({...request,onResponse:result=>{
    if(!current())return;
    if(!result||typeof result.id!=='string'||!result.id.trim()||result.id.length>200){setUncertain(true);return;}
    retry.current=null;
    if(session.remember(result.id,visit))onRunSelect?.(result.id);
   }});
  }catch(error){if(current())setLaunchError(error instanceof Error?error:new Error('启动失败，请检查后重试。'));}
  finally{submitting.current=false;setStarting(false);}
 };
 const taskActions=<> {loginCheck.working?<p role="status">正在检查账号登录，不会启动采集…</p>:active?<Button variant="outline" disabled={mutation.isPending} onClick={()=>mutation.mutate({path:`/collection/runs/${session.activeId}/pause`})}><Square size={15}/>停止当前采集</Button>:unavailable||session.pending||uncertain?<><p role="status">{uncertain?'提交结果尚未确认，请重新读取任务':unavailable?'暂时无法确认任务状态':'正在确认本次任务'}</p><Button variant="outline" onClick={()=>void session.refresh().then(()=>setUncertain(false))}>重新读取任务</Button></>:nextConfig&&nextConfig.id!==selected?.id?<Button onClick={()=>navigate('/automation?'+new URLSearchParams({stage:'collect',fresh:'1',config:nextConfig.id}))}>使用已选关键词组开始新一轮 · {nextConfig.name}</Button>:status==='backoff'?<p role="status">请稍候，{new Date(selected.nextAllowedAt!).toLocaleTimeString()} 后可重试。</p>:status==='ready'?<><Button disabled={starting||mutation.isPending||loginCheck.working} onClick={()=>void begin()}><Play size={16}/>{starting||mutation.isPending?'正在提交…':'开始采集'}</Button></>:<><p role="status">{status==='account'&&loginCheck.supported?loginCheck.message:hints[status as keyof typeof hints]||'请检查当前任务状态'}{status==='account'&&loginCheck.retryAt&&<> · {new Date(loginCheck.retryAt).toLocaleTimeString()} 后可重试</>}</p>{status==='account'&&<Button onClick={openSettings}>设置采集账号</Button>}<Button variant={status==='account'&&loginCheck.supported?'ghost':'default'} onClick={status==='account'||status==='device'?onAccounts:status==='paused'?onSettings:openSettings}>{status==='account'||status==='device'?'前往账号中心':status==='keywords'?'配置关键词':'检查设置'}</Button></>} </>;
 if(status==='loading'&&!starting)return <Loading/>;
 const toolbar=<div className="collection-toolbar" role="group" aria-label="采集操作"><div className="task-actions">{taskActions}</div>{!actionsHost&&<Button variant="outline" onClick={openSettings}><Settings2 size={16}/>采集设置</Button>}</div>;
 return <section className="collection-flow task-room">{actionsHost?createPortal(toolbar,actionsHost):toolbar}
 <ErrorNotice error={unavailable||launchError||mutation.error||loginCheck.error}/>

 {selected?<CollectionProgressFeed configId={selected.id} key={selected.id} run={session.currentRun} visible={visible} pending={session.pending} error={unavailable} onRefresh={()=>void session.refresh()}/>:!unavailable&&<div className="task-feed-empty"><h2>先选择关键词组</h2></div>}
 </section>;
}
