import {Collapsible,CollapsibleTrigger,CollapsibleContent} from '@/components/ui/collapsible';
import './project-dashboard.css';
import {Link} from 'react-router-dom';
import {ArrowRight,RefreshCw,Archive,ScanLine,Send,UsersRound} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {Badge} from '@/components/ui/badge';
import {Skeleton} from '@/components/ui/skeleton';
import {ErrorNotice} from '@/components/feedback';
import {useProjectOverview} from './use-project-overview';
import type {ProjectOverview} from '@crm/contracts';
const time=(at:string)=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(at));
const statuses:Record<string,string>={CONFIRMED:'平台已确认',UNKNOWN:'结果未知',FAILED:'失败',CANCELLED:'已取消',RESERVED:'已预占',ATTEMPTED:'待确认',COMPLETE:'采集结束',PARTIAL:'采集窗口结束',RUNNING:'采集中',QUEUED:'等待采集',PAUSED:'已暂停',STOPPED:'已停止'};
export function ProjectDashboard(){
 const q=useProjectOverview(),d=q.data;
 return <section className="work-dashboard project-dashboard" aria-label="项目数据概览"><header className="dashboard-heading"><div><h1>工作台</h1></div>{q.isError&&<Button variant="outline" disabled={q.isFetching} onClick={()=>void q.refetch()}><RefreshCw size={15}/>重试读取</Button>}</header>
 <ErrorNotice error={q.error}/>{q.isPending?<div aria-label="正在读取项目数据" className="dashboard-loading"><Skeleton className="h-48"/><Skeleton className="h-32"/></div>:q.isError?<Card className="dashboard-empty"><h2>项目数据暂时无法读取</h2><p>请重试。</p></Card>:d&&<ProjectData data={d}/>}
 </section>;
}
function ProjectData({data:d}:{data:ProjectOverview}){
 const a=d.archive,s=d.sends,c=d.accounts;
 return <><p className="project-scope">当前可见记录 <span>更新于 {time(d.asOf)} · 北京时间</span></p>
 <div className="project-metrics">
  <Metric title="采集归档" icon={Archive} href="/work?module=archive"><Pair a={[a.posts,'去重帖子']} b={[a.comments,'去重评论']}/></Metric>
  <Metric title="评论评分覆盖" icon={ScanLine} href="/comment-review"><Pair a={[a.scored,'已评分评论']} b={[a.unscored,'尚未评分']}/></Metric>
  <Metric title="回复发送" icon={Send} href="/reply-history"><Pair a={[s.confirmed,'确认发送次数']} b={[s.pending,'待处理']}/><div className="dashboard-outcomes"><span data-warning={s.unknown>0}>未知 <b>{s.unknown}</b></span><span>失败 <b>{s.failed}</b></span>{s.cancelled>0&&<span>取消 {s.cancelled}</span>}</div></Metric>
  <Metric title="账号与额度" icon={UsersRound} href="/work?module=accounts"><Pair a={[c.total,'真实账号']} b={[c.paused,'需处理']}/><div className="dashboard-outcomes"><span>受限 {c.restricted}</span><span>无已知阻止 {c.notPaused}</span></div><p>今日占用 <b>{c.occupied}</b> / 配置额度 <b>{c.dailyLimit}</b></p><small>{d.day} · 北京时间</small></Metric>
 </div>
 {!a.posts&&!a.comments&&!d.activity.length&&<Card className="project-no-history"><h2>暂无可见业务记录</h2><Button asChild variant="outline"><Link to="/home">去首页 <ArrowRight size={15}/></Link></Button></Card>}
 <div className="project-lower"><section className="project-health"><h2>运行与关注</h2><Link to="/automation"><span>自动化任务</span><strong>{d.tasks.running} 采集中 · {d.tasks.queued} 待采集</strong><ArrowRight size={16}/></Link><Link to="/comment-review"><span>自动匹配作业</span><strong>{d.tasks.reviewPending} 待处理</strong><ArrowRight size={16}/></Link><Link to="/reply-history?outcome=UNKNOWN"><span>可见未知记录</span><strong>{s.unknown} 个未知结果</strong><ArrowRight size={16}/></Link>{s.blockedJobs>0&&<Link to="/auto-contact"><span>帖子不可用</span><strong>{s.blockedJobs} 个受阻任务</strong><ArrowRight size={16}/></Link>}{a.failed>0&&<Link to="/comment-review"><span>评分异常</span><strong>{a.failed} 条最新评论未评分且有失败记录</strong><ArrowRight size={16}/></Link>}</section>
 <section className="project-activity"><header><h2>最近活动</h2><span>北京时间</span></header>{d.activity.length?d.activity.map(x=><Link key={x.kind+x.id} to={x.kind==='send'?'/reply-history':'/automation?'+new URLSearchParams({config:x.configId!,run:x.id,stage:'collect'})}><span className="activity-icon">{x.kind==='send'?<Send size={15}/>:<Archive size={15}/>}</span><div><strong>{x.label}</strong><small>{time(x.at)}</small></div><Badge variant="secondary">{statuses[x.status]||'状态待核查'}</Badge></Link>):<p>暂无可见活动记录。</p>}</section></div>
 <Collapsible className="project-method"><CollapsibleTrigger asChild><Button type="button" variant="ghost" size="sm">统计口径</Button></CollapsibleTrigger><CollapsibleContent><p>这里只统计当前可见记录，隐藏归档与模拟数据不计入；底层风险和额度保护始终保留。帖子按平台与帖子 ID 去重；评论按平台、帖子与评论 ID 去重。评分覆盖只看最新归档的原文／上下文版本，任一方案已评分即计入一次；不把不同方案门槛合并为全局高分。</p><p>确认、未知、失败按真实发送尝试计数。待处理包含未绑定发送尝试的队列任务与已预占／已提交尝试，关联任务不重复计数。账号仅含未归档真实账号；今日额度占用与评论、私信共用账本一致，按 Asia/Shanghai 零点划分，未验证账号的当前在线状态。</p></CollapsibleContent></Collapsible>
 </>;
}
function Pair({a,b}:{a:[number,string];b:[number,string]}){return <div className="dashboard-stat-pair">{[a,b].map(([n,label])=><div className="dashboard-stat" key={label}><strong>{n}</strong><span>{label}</span></div>)}</div>;}
function Metric({title,icon:Icon,href,children}:{title:string;icon:typeof Archive;href:string;children:React.ReactNode}){return <Card className="dashboard-metric"><div className="dashboard-metric-title"><Icon size={18}/><h2>{title}</h2><Link to={href} aria-label={'查看'+title}>查看 <ArrowRight size={14}/></Link></div>{children}</Card>;}
