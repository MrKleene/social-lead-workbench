import {useRef,useState} from 'react';
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
export function CollectionFlow({configs,loading,initialId,onAccounts,onSettings,onResults,onSelect}:{configs:Config[];loading:boolean;initialId?:string;onAccounts:()=>void;onSettings:()=>void;onResults:()=>void;onSelect:(id:string)=>void}){
 const readiness=useMcpReadiness(),mutation=useWorkspaceMutation();
 const [choice,setChoice]=useState(initialId||''),[settings,setSettings]=useState(false),[editor,setEditor]=useState<'new'|'edit'|null>(null),[dirty,setDirty]=useState(false);
 const [confirm,setConfirm]=useState(false),[account,setAccount]=useState(''),[consent,setConsent]=useState(false);
 const [plans,setPlans]=useState<Record<string,{posts:number;pages:number;scenario:string}>>({});
 const selected=configs.find(c=>c.id===choice)||configs.find(c=>c.id===initialId)||configs.find(c=>c.enabled)||configs[0];
 const status=collectionPreflight(selected,readiness.data,loading||readiness.isPending);
 const plan=plans[selected?.id||'']||{posts:selected?.batchLimit||1,pages:4,scenario:'BASELINE'};
 const posts=Math.min(plan.posts,selected?.batchLimit||1);
 const updatePlan=(patch:Partial<typeof plan>)=>{if(selected)setPlans(old=>({...old,[selected.id]:{...plan,...patch}}));setConsent(false);};
 const primary=useRef<HTMLButtonElement>(null);
 const active=!!selected?.activeRunId;
 const finished=!active&&!!selected?.runs[0]&&runFinished(selected.runs[0]);
 const accountReady=!!readiness.data?.device?.online&&readiness.data?.accounts?.some(a=>a.id===account&&a.eligible);
 const closeSettings=(open:boolean)=>{if(!open&&dirty&&!window.confirm('关键词修改尚未保存，确定放弃吗？'))return;setSettings(open);if(!open)setEditor(null);};
 const openSettings=()=>{setEditor(status==='keywords'?(selected?'edit':'new'):null);setSettings(true);};
 const submit=()=>{
  if(!selected||status!=='ready'||mutation.isPending||(selected.mode!=='MOCK'&&(!consent||!accountReady)))return;
  mutation.mutate({path:`/collection/configs/${selected.id}/runs`,body:{...runRequest(selected,plan.scenario,crypto.randomUUID()),readPlan:{rounds:1,postsPerRound:posts,commentPages:selected.mode==='MOCK'?plan.pages:1},...(selected.mode!=='MOCK'?{accountId:account,consent:'account-read-window-v1'}:{})}}, {onSuccess:()=>{setConsent(false);setConfirm(false);}});
 };
 const begin=()=>{if(status!=='ready')return;if(selected.mode==='MOCK')submit();else{setAccount(readiness.data?.accounts?.find(a=>a.eligible)?.id||'');setConsent(false);setConfirm(true);}};
 if(status==='loading')return <Loading/>;
 return <section className="collection-flow task-room"><header className="task-heading"><div><h1>自动化采集</h1><p className="task-config-summary">{selected?`${modeLabels[selected.mode]} · 最多 ${posts} 篇 · ${selected.name}`:'还没有搜索关键词'}</p></div><Sheet open={settings} onOpenChange={closeSettings}><SheetTrigger asChild><Button variant="outline" onClick={()=>setEditor(status==='keywords'?(selected?'edit':'new'):null)}><Settings2 size={16}/>采集设置</Button></SheetTrigger><SheetContent className="task-settings-sheet"><SheetHeader><SheetTitle>采集设置</SheetTitle><SheetDescription>复用已保存设置，按需修改。</SheetDescription></SheetHeader><div className="task-settings-body">
 {editor?<ConfigEditor key={editor==='new'?'new':selected?.id} config={editor==='edit'?selected:undefined} availableMode={readiness.data?.enabled?readiness.data.mode:null} onDirty={setDirty} onClose={()=>setEditor(null)} onSaved={c=>{setChoice(c.id);onSelect(c.id);setEditor(null);}}/>:<>
 {configs.length>1&&<label>搜索关键词组<select aria-label="启动搜索关键词组" value={selected?.id||''} onChange={e=>{setChoice(e.target.value);onSelect(e.target.value);setConsent(false);}}>{configs.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
 {selected&&<><h3>{selected.name}</h3><p className="task-keywords">{selected.keywords.join(' / ')||'未配置关键词'}</p><Button variant="ghost" onClick={()=>setEditor('edit')}>编辑关键词与规则</Button><label>本轮最多帖子数<select aria-label="本轮最多帖子数" value={posts} onChange={e=>updatePlan({posts:Number(e.target.value)})}>{Array.from({length:selected.batchLimit},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select></label><small>本轮范围仅在当前页面保留；关键词与默认上限通过编辑保存。</small></>}
 <Button variant="outline" onClick={()=>setEditor('new')}>新增关键词组</Button><details><summary>更多选项与读取范围</summary><p>每次手动运行 1 轮，不自动续跑。1 帖不等于 1 页评论；真实模式仅读取返回窗口，完整分页未验收。模型可关闭，真实发送禁用。</p>{selected?.mode==='MOCK'&&<><label>每条评论流的页数上限<select aria-label="每条评论流的页数上限" value={plan.pages} onChange={e=>updatePlan({pages:Number(e.target.value)})}>{[1,2,3,4].map(n=><option key={n}>{n}</option>)}</select></label><label>模拟场景<select value={plan.scenario} onChange={e=>updatePlan({scenario:e.target.value})}>{Object.entries(scenarios).filter(([k])=>k!=='READ_WINDOW').map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label></>}<Button variant="ghost" onClick={()=>{setSettings(false);onSettings();}}>全部搜索与模型设置</Button></details><Button onClick={()=>closeSettings(false)}>完成设置</Button>
 </>}
 </div></SheetContent></Sheet></header>
 <ErrorNotice error={readiness.error||mutation.error}/>
 <div className="task-actions">{active?<Button variant="outline" disabled={mutation.isPending} onClick={()=>mutation.mutate({path:`/collection/runs/${selected.activeRunId}/pause`})}><Square size={15}/>停止采集</Button>:status==='ready'?<Button ref={primary} variant={finished?'outline':'default'} disabled={mutation.isPending} onClick={begin}><Play size={16}/>{mutation.isPending?'正在提交…':'开始采集'}</Button>:<><p role="status">{hints[status as keyof typeof hints]||'请检查当前任务状态'}</p><Button onClick={status==='account'||status==='device'?onAccounts:status==='paused'||status==='backoff'?onSettings:openSettings}>{status==='account'||status==='device'?'前往账号中心':status==='keywords'?'配置关键词':'检查设置'}</Button></>}<Button variant={finished?'default':'ghost'} onClick={onResults}>{finished?'查看采集结果':'采集结果'}</Button></div>
 {selected?<CollectionProgressFeed key={selected.id} config={selected}/>:<div className="task-feed-empty"><h2>从一组关键词开始</h2><p>保存后可重复使用，不需要配置模型。</p></div>}
 <Sheet open={confirm} onOpenChange={open=>{if(!mutation.isPending){setConfirm(open);if(!open)setConsent(false);}}}><SheetContent className="task-settings-sheet task-confirm-sheet" onCloseAutoFocus={e=>{e.preventDefault();primary.current?.focus();}}><SheetHeader><SheetTitle>确认本次采集</SheetTitle><SheetDescription>仅限本轮最多 {posts} 篇、已读评论窗口；不发送、不自动续跑。</SheetDescription></SheetHeader><div className="task-settings-body"><label>本次执行账号<select aria-label="本次执行账号" value={account} onChange={e=>{setAccount(e.target.value);setConsent(false);}}>{readiness.data?.accounts?.map(a=><option key={a.id} value={a.id} disabled={!a.eligible}>{a.label}{a.eligible?'':' · 需恢复'}</option>)}</select></label><p>执行设备：{readiness.data?.device?.name||'未批准'} · {readiness.data?.device?.online?'在线且已认证':'离线'}</p><label className="check-label"><input type="checkbox" checked={consent} disabled={!accountReady} onChange={e=>setConsent(e.target.checked)}/>仅授权使用所选账号的本机会话执行这一轮只读采集</label>{status!=='ready'&&<p role="alert">账号、设备或配置状态已变化，请关闭后检查。</p>}<ErrorNotice error={mutation.error}/><Button disabled={status!=='ready'||!accountReady||!consent||mutation.isPending} onClick={submit}>{mutation.isPending?'正在提交…':'确认并开始'}</Button></div></SheetContent></Sheet>
 </section>;
}
