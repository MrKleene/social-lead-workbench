import {Link} from 'react-router-dom';
import {useLocalRecords} from './use-local-records';
import {LocalJobs} from './local-record-pages';
import {LocalDataManagement} from './local-data-management';
import {useLocalWorkbench} from './use-local-workbench';
import {LocalStartPanel} from './local-start-panel';
import {Button} from '@/components/ui/button';
import '@/features/work/project-dashboard.css';
const metricNames=['采集轮次','保存评论','待审核决定','已确认发送','结果未知','活动任务'];
const metricUrls=['/work?module=archive','/work?module=archive','/comment-review','/reply-history?state=CONFIRMED','/auto-contact?view=pending','/automation'];
function metricItems(v:{runs:number;comments:number;pendingReviews:number;confirmed:number;unknown:number;active:number}|undefined){
 const values=[v?.runs,v?.comments,v?.pendingReviews,v?.confirmed,v?.unknown,v?.active];
 return metricNames.map((name,i)=>[name,values[i],metricUrls[i]] as [string,number|undefined,string]);
}
export function LocalOverview(){
 const query=useLocalRecords('workspaceOverview'),v=query.data,items=metricItems(v),idle=!query.isPending&&items.every(([,value])=>!value);
 return <section className="project-dashboard">
  <header className="page-heading"><div><h1>工作台</h1><p>本机业务概览 · 打开页面不会启动采集、模型或发送。</p></div><Button asChild><Link to="/automation">进入自动化任务</Link></Button></header>
  {query.error&&<p role="alert">{query.error.message}</p>}
  {!query.isPending&&<LocalStartPanel runs={v?.runs}/>}
  {idle?<div className="local-metric-strip" aria-label="业务统计">{items.map(([name,value,url])=><Link key={name} to={url}>{name}<strong>{value??0}</strong></Link>)}</div>:<div className="local-metric-grid">{items.map(([name,value,url])=><Link className="local-metric" key={name} to={url}><span>{name}</span><strong>{value??'—'}</strong></Link>)}</div>}
  <p>统计来自当前本地库。未能映射的旧记录在“数据与恢复”的档案中保留。</p>
  {!!v?.holds.length&&<section className="local-panel"><h2>需要核对的暂停</h2>{v.holds.map(h=><p key={h.id}>{h.id} · {h.reason}</p>)}<Link to="/data">查看核对入口 →</Link></section>}
  <LocalJobs/>
 </section>;
}
export {LocalInboxPage} from './local-inbox-page';
export function LocalDataPage(){const w=useLocalWorkbench();return <><h1>数据与恢复</h1>{w.error&&<p role="alert">{w.error.message}</p>}{w.notice&&<p role="status">{w.notice}</p>}<section className="local-panel"><h2>备份与恢复</h2><p>备份业务数据，不含模型 Key、小红书 Cookie 或来源访问凭据。恢复先生成新副本。</p><div className="local-actions"><Button variant="outline" pending={w.backup.isPending} onClick={()=>w.backup.mutate()}>创建本地备份</Button><Button variant="outline" pending={w.restore.isPending} onClick={()=>w.restore.mutate()}>校验并恢复副本</Button></div></section><LocalDataManagement/></>;}
export function LocalCapabilities(){const status=useLocalRecords('status'),workflow=useLocalRecords('workflowOverview');return <><h1>平台能力</h1><p>组件已就绪不代表账号在线或平台允许操作；每次执行仍核验身份、授权与限制。</p><section className="local-panel"><h2>小红书</h2><dl>{[['账号登录',status.data?.platform.ready],['有界采集',workflow.data?.capabilities.collect],['限时收件',workflow.data?.capabilities.inbox],['精确评论与私信',workflow.data?.capabilities.send],['模型审核适配器',workflow.data?.capabilities.review],['系统凭据保护',status.data?.credentialsAvailable]].map(([label,ready])=><div key={String(label)}><dt>{label}</dt><dd>{ready?'本机组件已就绪，执行仍需授权':'当前不可用'}</dd></div>)}</dl><Link to="/work?module=accounts">查看账号与额度 →</Link></section><section className="local-panel"><h2>抖音</h2><p>当前没有接入运行适配器，不能读取或发送。</p></section></>;}
