import {Link} from 'react-router-dom';
import {ArrowRight,RefreshCw,FileText,ScanLine,Send,Clock3} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {Badge} from '@/components/ui/badge';
import {Empty} from '@/components/ui/empty';
import {Skeleton} from '@/components/ui/skeleton';
import {ErrorNotice} from '@/components/feedback';
import {collectionOutcome} from '@/features/collection/collection-outcome';
import type {SpatialState} from './use-spatial-work';
import {useWorkDashboard} from './use-work-dashboard';
import {collecting,taskHref} from './dashboard-model';
export function WorkDashboard({state}:{state:SpatialState}){return state.admin?<AutomationDashboard state={state}/>:<SalesDashboard state={state}/>;}
function AutomationDashboard({state}:{state:SpatialState}){
 const s=useWorkDashboard(),{run,counts:c}=s;
 const error=s.history.error;
 const stages=run?[collectionOutcome(run).label,s.summary.isError||s.review.isError?'状态读取失败':s.progress?.review||'正在读取',s.summary.isError||s.contact.isError?'状态读取失败':s.progress?.contact||'正在读取']:[];
 const refresh=()=>void Promise.all([s.history.refetch(),...(run?[s.summary.refetch()]:[]),s.review.refetch(),s.contact.refetch()]);
 return <section className="work-dashboard" aria-label="数据工作台">
  <header className="dashboard-heading"><div><p className="eyebrow">过程与结果</p><h1>工作台</h1><p>从一次真实任务，看采集、判断和发送的进展。</p></div><Button variant="outline" disabled={s.history.isFetching||s.summary.isFetching} onClick={refresh}><RefreshCw size={15}/>刷新数据</Button></header>
  <ErrorNotice error={error}/>
  {s.history.isPending?<div className="dashboard-loading" aria-label="正在读取任务"><Skeleton className="h-48"/><Skeleton className="h-32"/></div>:error?<Empty><h2>任务读取失败</h2><p>暂时无法确认任务和统计，请重新读取。</p></Empty>:!run?<Empty className="dashboard-empty"><Clock3/><h2>还没有自动化任务</h2><p>从首页选择已有配置，开始第一轮采集。结果会在这里保留。</p><Button asChild><Link to="/home">去首页开始 <ArrowRight size={16}/></Link></Button></Empty>:<>
   <Card className="dashboard-current"><div className="dashboard-current-title"><div><p className="eyebrow">{collecting(run)?'当前任务':'最近任务'}{s.activeCount>1?` · ${s.activeCount} 个采集任务处理中`:''}</p><h2>{run.configName}</h2><p className="dashboard-time">{new Date(run.createdAt).toLocaleString()} · {run.mode==='MOCK'?'模拟任务':run.mode==='XHS_FIXTURE'?'离线验收任务':'真实采集任务'}</p></div><Badge variant="secondary" className={collecting(run)?'dashboard-live':''}>{collectionOutcome(run).label}</Badge></div>
    <nav className="dashboard-steps" aria-label="查看本轮阶段">{['采集','LLM 评论匹配','自动回复'].map((label,i)=><Link key={label} to={taskHref(run,['collect','review','contact'][i])}><span>0{i+1}</span><div><strong>{label}</strong><small>{stages[i]}</small></div><ArrowRight size={16}/></Link>)}</nav>
    <p className="dashboard-conclusion">{collecting(run)?'采集正在处理中。已保存的数据会持续显示，各阶段状态分别核对。':collectionOutcome(run).warning?'采集存在中断或异常，请查看任务详情；已有结果仍保留。':s.progress?.conclusion||'本轮进度尚未读取完整，不能判断是否结束。'}</p>
    <div className="dashboard-current-footer"><span>以下指标仅属于这次任务</span><Button asChild variant="outline"><Link to={taskHref(run)}>查看任务详情 <ArrowRight size={16}/></Link></Button></div>
   </Card>
   <ErrorNotice error={s.summary.error||s.review.error||s.contact.error}/>
   <div className="dashboard-metrics" aria-label="本轮数据">
    <Card className="dashboard-metric"><div className="dashboard-metric-title"><FileText size={18}/><h2>采集原文</h2><Link to={taskHref(run)}>查看 <ArrowRight size={14}/></Link></div><div className="dashboard-stat-pair"><Stat label="已保存帖子" value={run.capturedPosts}/><Stat label="已保存评论" value={run.capturedCommentsCount}/></div><p>本轮归档计数，不能代表平台全部评论。</p></Card>
    <Card className="dashboard-metric"><div className="dashboard-metric-title"><ScanLine size={18}/><h2>评论匹配</h2><Link to={taskHref(run,'review')}>查看 <ArrowRight size={14}/></Link></div><div className="dashboard-stat-pair"><Stat label="已评分记录" value={c?.reviewed}/><Stat label="高相关度记录" value={c?.high}/></div><p>本轮全部审核版本；高相关度为评分 &gt;90。重审记作独立记录。</p></Card>
    <Card className="dashboard-metric"><div className="dashboard-metric-title"><Send size={18}/><h2>发送结果</h2><Link to={taskHref(run,'contact')}>查看 <ArrowRight size={14}/></Link></div><div className="dashboard-stat-pair"><Stat label="平台已确认" value={c?.confirmed}/><Stat label="待处理" value={c?.pending}/></div><div className="dashboard-outcomes"><span>失败 <b>{c?.failed??'—'}</b></span><span data-warning={!!c?.unknown}>未知 <b>{c?.unknown??'—'}</b></span>{!!c?.blocked&&<span>帖子受阻 {c.blocked}</span>}{!!c?.simulated&&<span>模拟成功 {c.simulated}</span>}{!!c?.skipped&&<span>跳过/取消 {c.skipped}</span>}{!!c?.other&&<span>其他待核查 {c.other}</span>}</div><p>仅本轮发送记录。未知结果仍保留额度与去重锁。</p></Card>
   </div>
   <section className="dashboard-history"><header><div><h2>近期任务</h2><p>按采集时间排序，点击回看原始任务。</p></div><Link to="/work?module=runs">查看任务 <ArrowRight size={15}/></Link></header><div>{s.runs.slice(0,6).map(r=><Link className="dashboard-history-row" key={r.id} to={taskHref(r)}><div><strong>{r.configName}</strong><small>{new Date(r.createdAt).toLocaleString()}</small></div><span>{r.capturedPosts??'—'} 帖 · {r.capturedCommentsCount??'—'} 评论</span><Badge variant="secondary">{collectionOutcome(r).label}</Badge><ArrowRight size={16}/></Link>)}</div></section>
  </>}
  <footer className="dashboard-links"><Link to="/work?module=archive">采集信息 <ArrowRight size={15}/></Link><Link to="/reply-history">全部回复记录 <ArrowRight size={15}/></Link><Link to="/work?module=follow&view=follow">后续跟进 <ArrowRight size={15}/></Link></footer>
 </section>;
}
function Stat({label,value}:{label:string;value?:number}){return <div className="dashboard-stat"><strong>{value??'—'}</strong><span>{label}</span></div>;}
function SalesDashboard({state:s}:{state:SpatialState}){return <section className="work-dashboard" aria-label="销售工作台"><header className="dashboard-heading"><div><p className="eyebrow">跟进与处理</p><h1>工作台</h1><p>查看分配给你的线索与待办。</p></div></header><ErrorNotice error={s.work.leads.error||s.work.tasks.error}/><div className="dashboard-metrics"><Card className="dashboard-metric"><Stat label="待办任务" value={s.work.tasks.data?s.work.pendingTasks.length:undefined}/><Link to="/tasks">查看任务</Link></Card><Card className="dashboard-metric"><Stat label="待跟进线索" value={s.work.leads.data?s.work.follow.length:undefined}/><Link to="/work?module=follow&view=follow">查看跟进</Link></Card></div></section>;}
