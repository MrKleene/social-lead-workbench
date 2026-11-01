import {useQuery} from '@tanstack/react-query';
import {Link} from 'react-router-dom';
import {api} from '@/lib/api';
import type {Config} from '@/features/collection/types';
import {collectionOutcome} from '@/features/collection/collection-outcome';
import {savedCollectionCounts} from './collection-task-summary';
import {collecting,dashboardRuns,taskHref} from './dashboard-model';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {ErrorNotice} from '@/components/feedback';
import {Spinner} from '@/components/ui/spinner';

/** Navigation and saved history only; opening the homepage never starts a task. */
export function HomeRecentTasks(){
 const history=useQuery({queryKey:['collection','dashboard'],queryFn:({signal})=>api<Config[]>('/collection/dashboard',{signal}),retry:false,refetchInterval:5000,refetchIntervalInBackground:false});
 const all=dashboardRuns(history.data||[]),runs=[...all.filter(collecting),...all.filter(r=>!collecting(r))].slice(0,3);
 return <section className="home-recent-tasks" aria-label="最近任务" aria-busy={history.isPending}>
  <header><h2>最近任务</h2><Link to="/automation">查看全部</Link></header>
  {history.isError?<div className="home-history-state"><ErrorNotice error={history.error}/><Button variant="outline" size="sm" onClick={()=>void history.refetch()}>重新读取任务</Button></div>:history.isPending?<p className="home-history-state" role="status"><Spinner aria-hidden="true"/>正在读取任务</p>:!runs.length?<p className="home-history-state">暂无采集任务</p>:<div className="home-task-list">{runs.map(run=>{const outcome=collectionOutcome(run);return <article key={run.id} className="home-task-row"><div className="home-task-title"><h3 title={run.configName}>{run.configName}</h3><Badge variant={outcome.warning?'outline':'secondary'}>{outcome.label}</Badge>{run.mode!=='XHS_MCP'&&<Badge variant="outline">模拟</Badge>}</div><p>{savedCollectionCounts(run)}</p><div className="home-task-bottom"><time dateTime={run.createdAt}>{new Date(run.createdAt).toLocaleString()}</time><nav aria-label={`${run.configName}的任务结果`}><Link to={taskHref(run,'collect')}>采集</Link><Link to={taskHref(run,'review')}>评论匹配</Link><Link to={taskHref(run,'contact')}>回复</Link></nav></div></article>;})}</div>}
 </section>;
}
