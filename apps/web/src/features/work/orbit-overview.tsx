import {useAutomationPreferences} from './settings-data';
import {useWorkspaceAutomation} from './workspace-automation';
import {accountOptionName} from '@/features/accounts/account-presentation';
import {ReviewAndReplySetup} from './automation-setup';
import { Button } from '@/components/ui/button';
import {useQuery} from '@tanstack/react-query';
import type {AutoContactOverview} from '@crm/contracts';
import {api} from '@/lib/api';
import {useNavigate} from 'react-router-dom';
import {collectionOutcome} from '@/features/collection/collection-outcome';
import {ArrowRight,Archive,Play,Clock3} from 'lucide-react';
import {ErrorNotice} from '@/components/feedback';
import {useMcpReadiness} from '@/features/collection/use-collection';
import {useReviewOverview} from '@/features/comment-review/use-comment-review';
import {useAuroraReduced} from './aurora-motion';
import {journeyStages,type JourneyStage} from './journey-model';
import type {SpatialState} from './use-spatial-work';
export function OrbitOverview({state:s}:{state:SpatialState}) {
 const {openSettings}=useWorkspaceAutomation();
 const navigate=useNavigate(),readiness=useMcpReadiness(s.admin),review=useReviewOverview(s.admin&&!s.active),reduced=useAuroraReduced();
 const contact=useQuery({queryKey:['auto-contact'],queryFn:()=>api<AutoContactOverview>('/auto-contact'),enabled:s.admin&&!s.active,refetchInterval:5000}),rule=contact.data?.rules[0];
 const recent=s.configs.flatMap(c=>c.runs.map(r=>({...r,config:c.name,configId:c.id}))).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)).slice(0,3);
 const preferences=useAutomationPreferences(s.admin);
 const latest=recent[0],policy=(review.data?.policies.find(p=>p.id===preferences.data?.policyId)||review.data?.policies[0]),defaultAccount=readiness.data?.accounts?.find(a=>a.id===s.selectedConfig?.defaultExecutionAccountId);
 const task=(stage:JourneyStage='collect',run=latest)=>{const q=new URLSearchParams({module:'runs',stage});if(run){q.set('config',run.configId);q.set('run',run.id);}else if(s.selectedConfig)q.set('config',s.selectedConfig.id);navigate('/work?'+q);};
 const labels=[s.work.configs.isError?'读取失败':latest?collectionOutcome(latest).label:'等待开始',review.isError?'读取失败':policy?.autoEnabled?'自动识别已开启':'按需分析',contact.isError?'状态读取失败':contact.isPending?'正在读取':rule?.pauseReason?'已暂停':rule?.enabled?'已授权开启':'未启用'];
 return <section className="mist-overview simple-overview" aria-label="轻序工作台" data-workspace-inactive={!!s.active} inert={!!s.active} aria-hidden={!!s.active}>
  <h1 className="sr-only">工作台</h1><ErrorNotice error={s.work.configs.error||readiness.error||review.error||contact.error}/>
  <div className="simple-home-top"><div className="simple-hero"><div className="simple-hero-content">
    <p className="eyebrow">从发现需求开始</p><h2>{s.admin?<>下一次获客，<br/>先开始采集。</>:<>从真实需求，<br/>开始下一次跟进。</>}</h2><p>采集 → LLM 评论匹配 → 自动回复。发送处理结束后，本轮结束，不等待对方回复。</p>
    <Button size="content" className="core-start mist-primary" disabled={s.admin&&s.work.configs.isPending} onPointerMove={e=>{if(reduced)return;const r=e.currentTarget.getBoundingClientRect();e.currentTarget.style.translate=`${((e.clientX-r.left)/r.width-.5)*7}px ${((e.clientY-r.top)/r.height-.5)*7}px`;}} onPointerLeave={e=>{e.currentTarget.style.translate='';}} onClick={()=>s.admin?navigate('/work?'+new URLSearchParams({module:'runs',stage:'collect',fresh:'1',...(preferences.data?.configId||s.selectedConfig?.id?{config:preferences.data?.configId||s.selectedConfig!.id}:{})})):s.openModule('matches')}><Play size={17}/>{s.admin?'自动化采集':'进入我的线索'}</Button><small>复用已保存配置 · 进入任务后明确开始</small>
  </div></div><aside className="simple-readiness mist-panel"><h2>三步配置</h2><div className="automation-setup"><section><h3>01 · 采集</h3><p>搜索关键词：{s.work.configs.isError?'读取失败':s.selectedConfig?.keywords.join(' / ')||'未配置'}</p><p>采集账号：{readiness.isError?'读取失败':defaultAccount?accountOptionName(defaultAccount):'开始前选择可用账号'}</p><div className="action-row"><Button variant="outline" size="sm" onClick={()=>openSettings('collect')}>关键词与采集范围</Button></div></section></div>{s.admin&&<ReviewAndReplySetup/>}</aside></div>
  {s.admin&&<div className="simple-home-stages">{journeyStages.map((stage,i)=><Button variant="ghost" size="content" key={stage.id} onClick={()=>task(stage.id)}><span className="simple-stage-number">0{i+1}</span><h3>{stage.label}</h3><p>{stage.description}</p><small>{labels[i]}</small></Button>)}</div>}
  <div className="simple-home-shortcuts"><Button variant="ghost" size="content" onClick={()=>s.openModule(s.admin?'archive':'follow')}><Archive/><span><strong>{s.admin?'已保存的原文，随时可查':'销售跟进与待办'}</strong><small>{s.admin?'与 AI 判断及客户管理独立':'从待处理事项继续'}</small></span><ArrowRight/></Button>{latest&&s.admin&&<Button variant="ghost" size="content" onClick={()=>task('collect')}><Clock3/><span><strong>继续查看本轮</strong><small>{latest.config} · {collectionOutcome(latest).label}</small></span><ArrowRight/></Button>}</div>
  <section className="simple-followup"><div><h2>后续跟进与交接</h2><p>独立于本轮自动化。入站回复监控尚未接通，当前请核实实际沟通后手动跟进。</p></div><Button variant="outline" onClick={()=>s.openModule('follow')}>进入销售跟进 <ArrowRight size={16}/></Button></section>
  <div className="simple-home-recent"><h2>最近任务</h2>{recent.length?recent.map(r=><Button variant="ghost" size="content" key={r.id} onClick={()=>task('collect',r)}><span>{r.config}</span><small>{new Date(r.createdAt).toLocaleString()}</small><span>{collectionOutcome(r).label}</span><ArrowRight size={15}/></Button>):<p>{s.work.configs.isError?'任务读取失败':'开始后，每一轮结果都会保留在这里。'}</p>}</div>
 </section>;
}
