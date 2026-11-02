import {returnRunLabel} from './use-run-history';
import {RunHistoryDialog} from './run-history-dialog';
import {useWorkspaceAutomation} from './workspace-automation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowRight} from 'lucide-react';
import {RunReviewPanel} from '@/features/comment-review/run-review-panel';
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
  const scope = s.run ? {runId:s.run.id, configId:config!.id,platform:config!.platform} : undefined;
  return <section className="journey-workspace" aria-label="本轮工作">
    <header className="journey-heading"><div><h1>自动化任务</h1></div>
      <div className="journey-heading-tools journey-start-tools"><div className="journey-collection-actions" ref={setActionsHost} hidden={s.stage!=='collect'}/><Button variant="outline" onClick={()=>openSettings('collect')}>采集设置</Button></div>
    </header>
    <div className="journey-run-context" aria-label="查看轮次"><div><strong>{s.history?'历史任务 · 只读':s.historyQuery.data?.activePhase?'当前任务':'最近一轮'}</strong>{s.run?<time dateTime={s.run.createdAt}>{new Date(s.run.createdAt).toLocaleString()}</time>:<span>{s.historyQuery.isPending?'正在读取任务…':s.missing?'任务不存在':s.historyQuery.isError?'轮次读取失败':'尚未开始'}</span>}{s.history&&s.current&&<Button size="sm" variant="outline" onClick={s.returnCurrent}>{returnRunLabel(s.historyQuery.data?.activePhase)}</Button>}</div><RunHistoryDialog key={config?.id} configId={config?.id} selectedId={s.run?.id} onSelect={s.selectRun}/></div>
    <nav className="journey-steps" aria-label="任务步骤">{journeyStages.map((step,i)=><Button variant="ghost" size="content" key={step.id} aria-current={s.stage===step.id?'step':undefined} onClick={()=>visit(step.id)}><span className="journey-number">0{i+1}</span><span><strong>{step.label}</strong><small>{s.statuses[i]}</small></span><span className="journey-dot"/></Button>)}</nav>
    <ErrorNotice error={s.historyQuery.error||s.detail.error||s.summary.error}/>
    {s.missing&&<Alert role="alert" className="journey-notice"><AlertDescription>未找到任务，请重新选择。</AlertDescription></Alert>}
    <div className="journey-stage" hidden={s.stage!=='collect'}>{s.stage==='collect'&&s.notice&&<p className="journey-conclusion" role="status">{s.notice}</p>}<CollectionFlow {...props} view={{id:s.requested||s.run?.id||'',run:s.run,pending:s.historyQuery.isPending||!!s.requested&&!s.run&&!s.missing&&!s.historyQuery.isError,error:s.historyQuery.error}} actionsHost={actionsHost} workspaceVisible={props.visible} visible={props.visible&&s.stage==='collect'} onRunSelect={s.selectRun}/></div>
    {(s.stage==='review'||visited.has('review'))&&<div className="journey-stage" hidden={s.stage!=='review'}>{s.stage==='review'&&s.notice&&<p className="journey-conclusion" role="status">{s.notice}</p>}
      {scope?<><RunReviewPanel key={`${scope.runId}:${s.policy?.id}`} runId={scope.runId} configId={scope.configId} policyId={s.history?undefined:s.policy?.id} history={s.history}/></>:<Empty className="journey-empty"><h2>先选择一次采集</h2><Link to="/comment-review">查看全部评论审核 <ArrowRight size={16}/></Link></Empty>}
    </div>}
    {(s.stage==='contact'||visited.has('contact'))&&<div className="journey-stage" hidden={s.stage!=='contact'}>{s.stage==='contact'&&s.notice&&<p className="journey-conclusion" role="status">{s.notice}</p>}
      {scope?<><AutoContactPage key={scope.runId} readOnly={s.history} scope={scope} onSettings={()=>openSettings("contact")}/></>:<Empty className="journey-empty"><h2>选择任务，查看自动回复进展</h2><Link to="/reply-history">查看已有回复记录 <ArrowRight size={16}/></Link></Empty>}
    </div>}
  </section>;
}
