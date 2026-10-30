import {useWorkspaceAutomation} from './workspace-automation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FormField } from '@/components/form-field';
import { SelectField, SelectOption } from '@/components/select-field';
import { Button } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowRight} from 'lucide-react';
import {CommentReviewPage} from '@/features/comment-review/comment-review-page';
import {AutoContactPage} from '@/features/auto-contact/auto-contact-page';
import type {Config} from '@/features/collection/types';
import {ErrorNotice} from '@/components/feedback';
import {CollectionFlow} from './collection-flow';
import {journeyStages, type JourneyStage} from './journey-model';
import {useJourney} from './use-journey';

type Props = {configs:Config[]; loading:boolean; error?:unknown; visible:boolean; initialId?:string;
  onSelect:(id:string)=>void; onAccounts:()=>void; onSettings:()=>void; onResults:()=>void};
export function TaskWorkspace(props:Props) {
  const {openSettings}=useWorkspaceAutomation();
  const config = props.configs.find(c => c.id === props.initialId) ?? props.configs[0];
  const s = useJourney(config, props.visible);
  const [actionsHost,setActionsHost]=useState<HTMLDivElement|null>(null);
  const [visited, setVisited] = useState<Set<JourneyStage>>(new Set());
  useEffect(()=>{setVisited(v=>v.has(s.stage)?v:new Set([...v,s.stage]));},[s.stage]);
  const visit = (stage:JourneyStage) => {setVisited(v => new Set([...v, s.stage, stage])); s.changeStage(stage);};
  const scope = s.run ? {runId:s.run.id, configId:config!.id,policyRevision:s.policyRevision} : undefined;
  return <section className="journey-workspace" aria-label="本轮工作">
    <header className="journey-heading"><div><p className="eyebrow">本轮工作 {s.run ? ` / ${new Date(s.run.createdAt).toLocaleString()}` : ''}</p><h1>{s.stage === 'collect' ? '自动化采集' : journeyStages.find(x => x.id === s.stage)!.label}</h1></div>
      <div className="journey-heading-tools"><FormField className="journey-run-picker"><span>查看任务</span><SelectField aria-label="查看任务" value={s.run?.id ?? ''} onValueChange={e=>s.selectRun(e)}><SelectOption value="">新一轮 / 当前任务</SelectOption>{s.runs.map(r=><SelectOption value={r.id} key={r.id}>{new Date(r.createdAt).toLocaleString()} · {r.snapshot?.name || config?.name}</SelectOption>)}</SelectField></FormField><div className="journey-collection-actions" ref={setActionsHost} hidden={s.stage!=='collect'}/></div>
    </header>
    <nav className="journey-steps" aria-label="任务步骤">{journeyStages.map((step,i)=><Button variant="ghost" size="content" key={step.id} aria-current={s.stage===step.id?'step':undefined} onClick={()=>visit(step.id)}><span className="journey-number">0{i+1}</span><span><strong>{step.label}</strong><small>{s.statuses[i]}</small></span><span className="journey-dot"/></Button>)}</nav>
    {s.run&&<p className="journey-conclusion" role="status">{s.conclusion}</p>}<ErrorNotice error={s.detail.error||s.summary.error}/>
    {s.requested&&!s.run&&!s.detail.isPending&&<Alert role="alert" className="journey-notice"><AlertDescription>任务记录尚未找到，请重新选择任务；不会用其他任务的数据代替。</AlertDescription></Alert>}
    <div className="journey-stage" hidden={s.stage!=='collect'}><CollectionFlow {...props} actionsHost={actionsHost} workspaceVisible={props.visible} visible={props.visible&&s.stage==='collect'} onRunSelect={s.selectRun}/></div>
    {(s.stage==='review'||visited.has('review'))&&<div className="journey-stage" hidden={s.stage!=='review'}>
      {scope?<><p className="journey-scope">本轮新增原文的审核记录 · 保留各次目标版本。复用原文的历史判断可在<Link to="/comment-review">全部评论审核</Link>查看。</p><FormField className="journey-version">审核目标版本<SelectField aria-label="审核目标版本" value={s.policyRevision||''} onValueChange={e=>s.selectVersion(e)}><SelectOption value="">全部历史版本</SelectOption>{Array.from({length:Math.min(s.policy?.revision||0,100)},(_,i)=>i+1).reverse().map(v=><SelectOption key={v} value={v}>版本 {v}{v===s.policy?.revision?' · 当前':''}</SelectOption>)}</SelectField></FormField><CommentReviewPage scope={scope} onSettings={()=>openSettings("review")}/></>:<Empty className="journey-empty"><h2>先选择一次采集</h2><p>已保存的内容也可以直接进入评论审核。</p><Link to="/comment-review">查看全部评论审核 <ArrowRight size={16}/></Link></Empty>}
    </div>}
    {(s.stage==='contact'||visited.has('contact'))&&<div className="journey-stage" hidden={s.stage!=='contact'}>
      {scope?<><p className="journey-scope">任务队列关联本轮来源审核。账号额度与授权规则为全局状态；单条测试统一保留在<Link to="/reply-history">回复记录</Link>。</p><AutoContactPage scope={scope} onSettings={()=>openSettings("contact")}/></>:<Empty className="journey-empty"><h2>选择任务，查看自动回复进展</h2><p>查看步骤不会开启发送。</p><Link to="/reply-history">查看已有回复记录 <ArrowRight size={16}/></Link></Empty>}
    </div>}
  </section>;
}
