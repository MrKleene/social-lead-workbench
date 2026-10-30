import {useNavigate} from 'react-router-dom';
import {createPortal} from 'react-dom';
import {Disclosure} from '@/components/disclosure';
import {useAutomationPreferences} from './settings-data';
import {automationIssue} from './automation-validation';
import {useWorkspaceAutomation} from './workspace-automation';
import {useReviewOverview} from '@/features/comment-review/use-comment-review';
import {useQuery} from '@tanstack/react-query';
import {api} from '@/lib/api';
import type {AutoContactOverview} from '@crm/contracts';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FormField } from '@/components/form-field';
import { SelectField, SelectOption } from '@/components/select-field';
import { Checkbox } from '@/components/ui/checkbox';
import {accountOptionName} from '@/features/accounts/account-presentation';
import {useSessionPreflight} from './use-session-preflight';
import {useCollectionTaskSession} from './use-collection-task-session';
import {useEffect,useRef,useState} from 'react';
import {Play,Square,Settings2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {ErrorNotice,Loading} from '@/components/feedback';
import {useMcpReadiness,useWorkspaceMutation} from '@/features/collection/use-collection';
import {runRequest} from '@/features/collection/mode';
import {type Config} from '@/features/collection/types';
import {collectionPreflight} from './collection-preflight';
import {runFinished} from './collection-progress';
import {CollectionProgressFeed} from './collection-progress-feed';
const hints={keywords:'先添加搜索关键词',account:'请登录或恢复一个可用账号',device:'请恢复执行设备连接',paused:'此配置已暂停，请检查设置',backoff:'暂时无法继续，请等待后重试',unavailable:'采集服务未就绪，请检查账号与设置'};
export function CollectionFlow({configs,loading,error,visible,workspaceVisible=visible,initialId,onAccounts,onSettings,onResults,onSelect,onRunSelect,actionsHost}:{actionsHost?:HTMLElement|null;configs:Config[];loading:boolean;error?:unknown;visible:boolean;workspaceVisible?:boolean;initialId?:string;onAccounts:()=>void;onSettings:()=>void;onResults:()=>void;onSelect:(id:string)=>void;onRunSelect?:(id:string)=>void}){
 const preferences=useAutomationPreferences(workspaceVisible),navigate=useNavigate();
 const review=useReviewOverview(workspaceVisible);
 const contact=useQuery({queryKey:['auto-contact'],queryFn:()=>api<AutoContactOverview>('/auto-contact'),enabled:workspaceVisible,retry:false});
 const {openSettings:showSettings}=useWorkspaceAutomation();
 const readiness=useMcpReadiness(),mutation=useWorkspaceMutation<{id:string}>();
 const [confirm,setConfirm]=useState(false),[account,setAccount]=useState(''),[consent,setConsent]=useState(false);
 const submitting=useRef(false),preparing=useRef(false);
 const [uncertain,setUncertain]=useState(false);
 const selected=configs.find(c=>c.id===initialId)||configs.find(c=>c.enabled)||configs[0];
 const nextConfig=configs.find(c=>c.id===preferences.data?.configId);
 const session=useCollectionTaskSession(selected,visible);
 const loginCheck=useSessionPreflight(readiness.data,visible&&!!selected&&selected.enabled&&selected.mode!=='MOCK'&&!session.activeId,selected?.defaultExecutionAccountId);
 const [,tick]=useState(0);
 useEffect(()=>{const delay=Date.parse(selected?.nextAllowedAt||'')-Date.now();if(!visible||!(delay>0))return;const timer=setTimeout(()=>tick(n=>n+1),Math.min(delay+50,2147483647));return()=>clearTimeout(timer);},[selected?.nextAllowedAt,visible]);
 const unavailable=error||session.error||readiness.error;
 const baseStatus=collectionPreflight(selected?{...selected,activeRunId:session.activeId||null}:undefined,unavailable?undefined:readiness.data,loading||readiness.isPending||session.checking);
 useEffect(()=>{preparing.current=false;setConfirm(false);setConsent(false);},[visible,selected?.id,selected?.revision]);
 const status=baseStatus==='ready'&&selected?.mode!=='MOCK'&&loginCheck.supported&&!loginCheck.candidate?.eligible?'account':baseStatus;
 // Persisted configuration is authoritative for new tasks; history keeps its own readPlan.
 const posts=selected?.batchLimit??1;
 const primary=useRef<HTMLButtonElement>(null);
 const active=!!session.activeId;
 const finished=!active&&!!session.currentRun&&runFinished(session.currentRun);
 const accountReady=!!readiness.data?.device?.online&&readiness.data?.accounts?.some(a=>a.id===account&&a.eligible);
 const openSettings=()=>showSettings('collect');
 const validateSetup=()=>{const issue=automationIssue(review.isError?undefined:review.data,contact.isError?undefined:contact.data);if(issue){showSettings(issue.tab,issue);return false;}return true;};
 const submit=()=>{
  if(!validateSetup())return;
  if(submitting.current||uncertain||!selected||baseStatus!=='ready'||unavailable||session.pending||mutation.isPending||(selected.mode!=='MOCK'&&(!consent||!accountReady)))return;
  const visit=session.token();submitting.current=true;
  mutation.mutate({path:`/collection/configs/${selected.id}/runs`,body:{...runRequest(selected,'BASELINE',crypto.randomUUID()),readPlan:{rounds:1,postsPerRound:posts,commentPages:selected.mode==='MOCK'?4:1},...(selected.mode!=='MOCK'?{accountId:account,consent:'account-read-window-v1'}:{})}, onResponse:result=>{if(!result||typeof result.id!=='string'||!result.id.trim()||result.id.length>200){setUncertain(true);setConsent(false);return;}if(session.remember(result.id,visit))onRunSelect?.(result.id);setConsent(false);setConfirm(false);preparing.current=false;}}, {onSettled:()=>{submitting.current=false;}});
 };
 const selectedAccount=readiness.data?.accounts?.find(a=>a.id===account);
 const mayPrepare=status==='ready';
 const begin=(temporary=false)=>{if(!(mayPrepare||temporary&&baseStatus==='ready')||unavailable||session.pending||preparing.current)return;if(!validateSetup())return;if(selected.mode==='MOCK')submit();else{const id=loginCheck.supported?loginCheck.candidate?.id:readiness.data?.accounts?.find(a=>a.eligible)?.id;if(!id&&!temporary)return;preparing.current=true;setAccount(temporary?'':id||'');setConsent(false);setUncertain(false);mutation.reset();setConfirm(true);}};
 const taskActions=<> {loginCheck.working?<p role="status">正在检查账号登录，不会启动采集…</p>:active?<Button variant="outline" disabled={mutation.isPending} onClick={()=>mutation.mutate({path:`/collection/runs/${session.activeId}/pause`})}><Square size={15}/>停止采集</Button>:unavailable||session.pending?<><p role="status">{unavailable?'暂时无法确认任务状态':'正在确认本次任务'}</p><Button variant="outline" onClick={()=>void session.refresh()}>重新读取任务</Button></>:nextConfig&&nextConfig.id!==selected?.id?<Button onClick={()=>navigate('/automation?'+new URLSearchParams({stage:'collect',fresh:'1',config:nextConfig.id}))}>使用已选关键词组开始新一轮 · {nextConfig.name}</Button>:status==='backoff'?<p role="status">请稍候，{new Date(selected.nextAllowedAt!).toLocaleTimeString()} 后可重试。</p>:status==='ready'?<Button ref={primary} variant={finished?'outline':'default'} disabled={mutation.isPending||loginCheck.working} onClick={()=>void begin()}><Play size={16}/>{mutation.isPending?'正在提交…':'开始采集'}</Button>:<><p role="status">{status==='account'&&loginCheck.supported?loginCheck.message:hints[status as keyof typeof hints]||'请检查当前任务状态'}{status==='account'&&loginCheck.retryAt&&<> · {new Date(loginCheck.retryAt).toLocaleTimeString()} 后可重试</>}</p>{status==='account'&&loginCheck.supported&&<><Button onClick={()=>{showSettings('collect',null,true);}}>设置默认执行账号</Button>{baseStatus==='ready'&&<Button ref={primary} variant="outline" onClick={()=>begin(true)}>仅本次选择账号</Button>}</>}<Button variant={status==='account'&&loginCheck.supported?'ghost':'default'} onClick={status==='account'||status==='device'?onAccounts:status==='paused'?onSettings:openSettings}>{status==='account'||status==='device'?'前往账号中心':status==='keywords'?'配置关键词':'检查设置'}</Button></>} </>;
 // Keep an open editor mounted while its save invalidates and refreshes config data.
 if(status==='loading'&&!confirm)return <Loading/>;
 const toolbar=<div className="collection-toolbar" role="group" aria-label="采集操作">{!session.currentRun&&<Button variant="ghost" onClick={openSettings}><Settings2 size={16}/>自动化设置</Button>}<div className="task-actions">{finished&&!unavailable&&!session.pending?<Button variant="outline" onClick={onResults}>查看采集信息</Button>:taskActions}</div>{finished&&!unavailable&&!session.pending&&<Disclosure className="collection-next-run" title="新一轮采集"><div className="task-actions">{taskActions}</div></Disclosure>}</div>;
 return <section className="collection-flow task-room">{actionsHost?createPortal(toolbar,actionsHost):toolbar}
 <ErrorNotice error={unavailable||mutation.error||loginCheck.error}/>

 {selected?<CollectionProgressFeed configId={selected.id} key={selected.id} run={session.currentRun} runs={session.runs} visible={visible} pending={session.pending} error={unavailable} onRefresh={()=>void session.refresh()} onSelectRun={onRunSelect}/>:!unavailable&&<div className="task-feed-empty"><h2>先选择关键词组</h2></div>}
 <Sheet open={confirm} onOpenChange={open=>{if(!mutation.isPending){setConfirm(open);if(!open){setConsent(false);preparing.current=false;}}}}><SheetContent className="task-settings-sheet task-confirm-sheet" onCloseAutoFocus={e=>{e.preventDefault();primary.current?.focus();}}><SheetHeader><SheetTitle>确认本次采集</SheetTitle><SheetDescription>任务启动时先核验登录和账号身份，通过后读取本轮最多 {posts} 篇，不自动续跑。后续匹配与回复仅按各自已授权开关执行。</SheetDescription></SheetHeader><div className="task-settings-body"><p>关键词组：{selected?.name} · 执行账号：{selectedAccount?accountOptionName(selectedAccount):'请选择账号'}</p><FormField>本次执行账号<SelectField aria-label="本次执行账号" disabled={mutation.isPending} value={account} onValueChange={e=>{setAccount(e);setConsent(false);}}><SelectOption value="">请选择本次执行账号</SelectOption>{account&&!readiness.data?.accounts?.some(a=>a.id===account)&&<SelectOption value={account} disabled>原选择账号已不可用</SelectOption>}{readiness.data?.accounts?.map(a=><SelectOption key={a.id} value={a.id} disabled={!a.eligible}>{accountOptionName(a)}{a.eligible?'':' · 需恢复'}</SelectOption>)}</SelectField></FormField><small>这里更换仅用于本次任务，不修改关键词组的默认账号。</small><p>执行设备：{readiness.data?.device?.name||'未批准'} · {readiness.data?.device?.online?'在线且已认证':'离线'}</p><FormField className="check-label"><Checkbox  checked={consent} disabled={mutation.isPending||!accountReady||uncertain} onCheckedChange={e=>setConsent((e === true))}/>仅授权使用所选账号的本机会话执行这一轮只读采集</FormField>{confirm&&!mutation.isPending&&!uncertain&&baseStatus!=='ready'&&<Alert role="alert"><AlertDescription>{baseStatus==='loading'?'正在确认当前状态…':status==='running'?'已有任务正在运行，请查看本轮进度。':'账号、设备或配置状态已变化，请关闭后检查。'}</AlertDescription></Alert>}{uncertain&&<Alert role="alert"><AlertDescription>提交结果尚未确认，请关闭后重新读取任务；不要重复提交。</AlertDescription></Alert>}<ErrorNotice error={mutation.error}/><Button disabled={uncertain||baseStatus!=='ready'||!!unavailable||session.pending||!accountReady||!consent||mutation.isPending} onClick={submit}>{mutation.isPending?'正在提交…':'确认并开始'}</Button></div></SheetContent></Sheet>
 </section>;
}
