import {accountOptionName} from '@/features/accounts/account-presentation';
import {useSessionPreflight} from './use-session-preflight';
import {InfoSection} from '@/components/information-panel';
import {useSearchParams} from 'react-router-dom';
import {useCollectionTaskSession} from './use-collection-task-session';
import {useEffect,useRef,useState} from 'react';
import {Play,Square,Settings2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription,SheetTrigger} from '@/components/ui/sheet';
import {ErrorNotice,Loading} from '@/components/feedback';
import {ConfigEditor} from '@/features/collection/config-editor';
import {useMcpReadiness,useWorkspaceMutation} from '@/features/collection/use-collection';
import {modeLabels,runRequest} from '@/features/collection/mode';
import {scenarios,type Config} from '@/features/collection/types';
import {collectionPreflight} from './collection-preflight';
import {runFinished} from './collection-progress';
import {CollectionProgressFeed} from './collection-progress-feed';
const hints={keywords:'先添加搜索关键词',account:'请登录或恢复一个可用账号',device:'请恢复执行设备连接',paused:'此配置已暂停，请检查设置',backoff:'暂时无法继续，请等待后重试',unavailable:'采集服务未就绪，请检查账号与设置'};
export function CollectionFlow({configs,loading,error,visible,initialId,onAccounts,onSettings,onResults,onSelect,onRunSelect}:{configs:Config[];loading:boolean;error?:unknown;visible:boolean;initialId?:string;onAccounts:()=>void;onSettings:()=>void;onResults:()=>void;onSelect:(id:string)=>void;onRunSelect?:(id:string)=>void}){
 const readiness=useMcpReadiness(),mutation=useWorkspaceMutation<{id:string}>();
 const [params,setParams]=useSearchParams();
 const [settings,setSettings]=useState(false),[editor,setEditor]=useState<'new'|'edit'|null>(null),[dirty,setDirty]=useState(false);
 const [confirm,setConfirm]=useState(false),[account,setAccount]=useState(''),[consent,setConsent]=useState(false);
 const submitting=useRef(false),preparing=useRef(false);
 const [uncertain,setUncertain]=useState(false);
 const [plans,setPlans]=useState<Record<string,{posts:number;pages:number;scenario:string}>>({});
 const selected=configs.find(c=>c.id===initialId)||configs.find(c=>c.enabled)||configs[0];
 const session=useCollectionTaskSession(selected,visible);
 const loginCheck=useSessionPreflight(readiness.data,visible&&!!selected&&selected.enabled&&selected.mode!=='MOCK'&&!session.activeId,selected?.defaultExecutionAccountId);
 const [,tick]=useState(0);
 useEffect(()=>{const delay=Date.parse(selected?.nextAllowedAt||'')-Date.now();if(!visible||!(delay>0))return;const timer=setTimeout(()=>tick(n=>n+1),Math.min(delay+50,2147483647));return()=>clearTimeout(timer);},[selected?.nextAllowedAt,visible]);
 const unavailable=error||session.error||readiness.error;
 const baseStatus=collectionPreflight(selected?{...selected,activeRunId:session.activeId||null}:undefined,unavailable?undefined:readiness.data,loading||readiness.isPending||session.checking);
 useEffect(()=>{preparing.current=false;setConfirm(false);setConsent(false);},[visible,selected?.id,selected?.revision]);
 const status=baseStatus==='ready'&&selected?.mode!=='MOCK'&&loginCheck.supported&&!loginCheck.candidate?.eligible?'account':baseStatus;
 useEffect(()=>{if(visible&&params.get('panel')==='collection-settings'&&status!=='loading'){setEditor(status==='keywords'?(selected?'edit':'new'):null);setSettings(true);setParams(p=>{p.delete('panel');return p;},{replace:true});}},[visible,params,status,selected,setParams]);
 const plan=plans[selected?.id||'']||{posts:selected?.batchLimit||1,pages:4,scenario:'BASELINE'};
 const posts=Math.min(plan.posts,selected?.batchLimit||1);
 const updatePlan=(patch:Partial<typeof plan>)=>{if(selected)setPlans(old=>({...old,[selected.id]:{...plan,...patch}}));setConsent(false);};
 const primary=useRef<HTMLButtonElement>(null);
 const active=!!session.activeId;
 const finished=!active&&!!session.currentRun&&runFinished(session.currentRun);
 const accountReady=!!readiness.data?.device?.online&&readiness.data?.accounts?.some(a=>a.id===account&&a.eligible);
 const closeSettings=(open:boolean)=>{if(!open&&dirty&&!window.confirm('关键词修改尚未保存，确定放弃吗？'))return;setSettings(open);if(!open)setEditor(null);};
 const openSettings=()=>{setEditor(status==='keywords'?(selected?'edit':'new'):null);setSettings(true);};
 const submit=()=>{
  if(submitting.current||uncertain||!selected||baseStatus!=='ready'||unavailable||session.pending||mutation.isPending||(selected.mode!=='MOCK'&&(!consent||!accountReady)))return;
  const visit=session.token();submitting.current=true;
  mutation.mutate({path:`/collection/configs/${selected.id}/runs`,body:{...runRequest(selected,plan.scenario,crypto.randomUUID()),readPlan:{rounds:1,postsPerRound:posts,commentPages:selected.mode==='MOCK'?plan.pages:1},...(selected.mode!=='MOCK'?{accountId:account,consent:'account-read-window-v1'}:{})}, onResponse:result=>{if(!result||typeof result.id!=='string'||!result.id.trim()||result.id.length>200){setUncertain(true);setConsent(false);return;}if(session.remember(result.id,visit))onRunSelect?.(result.id);setConsent(false);setConfirm(false);preparing.current=false;}}, {onSettled:()=>{submitting.current=false;}});
 };
 const selectedAccount=readiness.data?.accounts?.find(a=>a.id===account);
 const mayPrepare=status==='ready';
 const begin=(temporary=false)=>{if(!(mayPrepare||temporary&&baseStatus==='ready')||unavailable||session.pending||preparing.current)return;if(selected.mode==='MOCK')submit();else{const id=loginCheck.supported?loginCheck.candidate?.id:readiness.data?.accounts?.find(a=>a.eligible)?.id;if(!id&&!temporary)return;preparing.current=true;setAccount(temporary?'':id||'');setConsent(false);setUncertain(false);mutation.reset();setConfirm(true);}};
 // Keep an open editor mounted while its save invalidates and refreshes config data.
 if(status==='loading'&&!settings&&!confirm)return <Loading/>;
 return <section className="collection-flow task-room"><header className="task-heading"><div><h1>自动化采集</h1><p className="task-config-summary">{selected?`${modeLabels[selected.mode]} · 最多 ${posts} 篇 · ${selected.name}`:'还没有搜索关键词'}</p></div><Sheet open={settings} onOpenChange={closeSettings}><SheetTrigger asChild><Button variant="outline" onClick={()=>setEditor(status==='keywords'?(selected?'edit':'new'):null)}><Settings2 size={16}/>采集设置</Button></SheetTrigger><SheetContent className="task-settings-sheet"><SheetHeader><SheetTitle>采集设置</SheetTitle><SheetDescription>复用已保存设置，按需修改。</SheetDescription></SheetHeader><div className="task-settings-body">
 {editor?<ConfigEditor key={editor==='new'?'new':selected?.id} config={editor==='edit'?selected:undefined} availableMode={readiness.data?.enabled?readiness.data.mode:null} onDirty={setDirty} onClose={()=>setEditor(null)} onSaved={c=>{onSelect(c.id);setEditor(null);}}/>:<>
 {configs.length>1&&<label>搜索关键词组<select aria-label="启动搜索关键词组" value={selected?.id||''} onChange={e=>{onSelect(e.target.value);setConsent(false);}}>{configs.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
 {selected&&<><h3>{selected.name}</h3><p className="task-keywords">{selected.keywords.join(' / ')||'未配置关键词'}</p><Button variant="ghost" onClick={()=>setEditor('edit')}>编辑采集配置</Button><label>本轮最多帖子数<select aria-label="本轮最多帖子数" value={posts} onChange={e=>updatePlan({posts:Number(e.target.value)})}>{Array.from({length:selected.batchLimit},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select></label><small>本轮范围仅在当前页面保留；关键词、默认账号与默认上限通过编辑保存。</small></>}
 <Button variant="outline" onClick={()=>setEditor('new')}>新增关键词组</Button><InfoSection  title={<>更多选项与读取范围</>}><p>每次手动运行 1 轮，不自动续跑。1 帖不等于 1 页评论；真实模式在服务端上限内翻页并展开回复；停止时保留已读内容，未读尽会标明。模型可关闭，真实发送禁用。</p>{selected?.mode==='MOCK'&&<><label>每条评论流的页数上限<select aria-label="每条评论流的页数上限" value={plan.pages} onChange={e=>updatePlan({pages:Number(e.target.value)})}>{[1,2,3,4].map(n=><option key={n}>{n}</option>)}</select></label><label>模拟场景<select value={plan.scenario} onChange={e=>updatePlan({scenario:e.target.value})}>{Object.entries(scenarios).filter(([k])=>k!=='READ_WINDOW').map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label></>}<Button variant="ghost" onClick={()=>{setSettings(false);onSettings();}}>全部搜索与模型设置</Button></InfoSection><Button onClick={()=>closeSettings(false)}>完成设置</Button>
 </>}
 </div></SheetContent></Sheet></header>
 <ErrorNotice error={unavailable||mutation.error||loginCheck.error}/>

 <div className="task-actions">{loginCheck.working?<p role="status">正在检查账号登录，不会启动采集…</p>:active?<Button variant="outline" disabled={mutation.isPending} onClick={()=>mutation.mutate({path:`/collection/runs/${session.activeId}/pause`})}><Square size={15}/>停止采集</Button>:unavailable||session.pending?<><p role="status">{unavailable?'暂时无法确认任务状态':'正在确认本次任务'}</p><Button variant="outline" onClick={()=>void session.refresh()}>重新读取任务</Button></>:status==='backoff'?<p role="status">请稍候，{new Date(selected.nextAllowedAt!).toLocaleTimeString()} 后可重试。</p>:status==='ready'?<Button ref={primary} variant={finished?'outline':'default'} disabled={mutation.isPending||loginCheck.working} onClick={()=>void begin()}><Play size={16}/>{mutation.isPending?'正在提交…':'开始采集'}</Button>:<><p role="status">{status==='account'&&loginCheck.supported?loginCheck.message:hints[status as keyof typeof hints]||'请检查当前任务状态'}{status==='account'&&loginCheck.retryAt&&<> · {new Date(loginCheck.retryAt).toLocaleTimeString()} 后可重试</>}</p>{status==='account'&&loginCheck.supported&&<><Button onClick={()=>{setEditor('edit');setSettings(true);}}>设置默认执行账号</Button>{baseStatus==='ready'&&<Button ref={primary} variant="outline" onClick={()=>begin(true)}>仅本次选择账号</Button>}</>}<Button variant={status==='account'&&loginCheck.supported?'ghost':'default'} onClick={status==='account'||status==='device'?onAccounts:status==='paused'?onSettings:openSettings}>{status==='account'||status==='device'?'前往账号中心':status==='keywords'?'配置关键词':'检查设置'}</Button></>}<Button variant={finished?'default':'ghost'} onClick={onResults}>{finished?'查看采集信息':'采集信息'}</Button></div>
 {selected?<CollectionProgressFeed configId={selected.id} key={selected.id} run={session.currentRun} runs={session.runs} visible={visible} pending={session.pending} error={unavailable} onRefresh={()=>void session.refresh()} onSelectRun={onRunSelect}/>:!unavailable&&<div className="task-feed-empty"><h2>从一组关键词开始</h2><p>保存后可重复使用，不需要配置模型。</p></div>}
 <Sheet open={confirm} onOpenChange={open=>{if(!mutation.isPending){setConfirm(open);if(!open){setConsent(false);preparing.current=false;}}}}><SheetContent className="task-settings-sheet task-confirm-sheet" onCloseAutoFocus={e=>{e.preventDefault();primary.current?.focus();}}><SheetHeader><SheetTitle>确认本次采集</SheetTitle><SheetDescription>任务启动时先核验登录和账号身份，通过后读取本轮最多 {posts} 篇；不发送、不自动续跑。</SheetDescription></SheetHeader><div className="task-settings-body"><p>关键词组：{selected?.name} · 执行账号：{selectedAccount?accountOptionName(selectedAccount):'请选择账号'}</p><label>本次执行账号<select aria-label="本次执行账号" disabled={mutation.isPending} value={account} onChange={e=>{setAccount(e.target.value);setConsent(false);}}><option value="">请选择本次执行账号</option>{account&&!readiness.data?.accounts?.some(a=>a.id===account)&&<option value={account} disabled>原选择账号已不可用</option>}{readiness.data?.accounts?.map(a=><option key={a.id} value={a.id} disabled={!a.eligible}>{accountOptionName(a)}{a.eligible?'':' · 需恢复'}</option>)}</select></label><small>这里更换仅用于本次任务，不修改关键词组的默认账号。</small><p>执行设备：{readiness.data?.device?.name||'未批准'} · {readiness.data?.device?.online?'在线且已认证':'离线'}</p><label className="check-label"><input type="checkbox" checked={consent} disabled={mutation.isPending||!accountReady||uncertain} onChange={e=>setConsent(e.target.checked)}/>仅授权使用所选账号的本机会话执行这一轮只读采集</label>{confirm&&!mutation.isPending&&!uncertain&&baseStatus!=='ready'&&<p role="alert">{baseStatus==='loading'?'正在确认当前状态…':status==='running'?'已有任务正在运行，请查看本轮进度。':'账号、设备或配置状态已变化，请关闭后检查。'}</p>}{uncertain&&<p role="alert">提交结果尚未确认，请关闭后重新读取任务；不要重复提交。</p>}<ErrorNotice error={mutation.error}/><Button disabled={uncertain||baseStatus!=='ready'||!!unavailable||session.pending||!accountReady||!consent||mutation.isPending} onClick={submit}>{mutation.isPending?'正在提交…':'确认并开始'}</Button></div></SheetContent></Sheet>
 </section>;
}
