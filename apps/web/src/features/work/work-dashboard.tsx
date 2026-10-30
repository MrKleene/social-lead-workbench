import {Link} from 'react-router-dom';
import {Card} from '@/components/ui/card';
import {ErrorNotice} from '@/components/feedback';
import type {SpatialState} from './use-spatial-work';
function Stat({label,value}:{label:string;value?:number}){return <div className="dashboard-stat"><strong>{value??'—'}</strong><span>{label}</span></div>;}
export function SalesDashboard({state:s}:{state:SpatialState}){return <section className="work-dashboard" aria-label="销售工作台"><header className="dashboard-heading"><div><p className="eyebrow">跟进与处理</p><h1>工作台</h1><p>查看分配给你的线索与待办。</p></div></header><ErrorNotice error={s.work.leads.error||s.work.tasks.error}/><div className="dashboard-metrics"><Card className="dashboard-metric"><Stat label="待办任务" value={s.work.tasks.data?s.work.pendingTasks.length:undefined}/><Link to="/tasks">查看任务</Link></Card><Card className="dashboard-metric"><Stat label="待跟进线索" value={s.work.leads.data?s.work.follow.length:undefined}/><Link to="/work?module=follow&view=follow">查看跟进</Link></Card></div></section>;}
