import {useNavigate} from 'react-router-dom';
import {collectionOutcome} from '@/features/collection/collection-outcome';
import {ArrowRight,Search,ContactRound,Archive,Play,SlidersHorizontal,Clock3} from 'lucide-react';
import SpotlightCard from '@/vendor/react-bits/SpotlightCard';
import {ErrorNotice} from '@/components/feedback';
import {useMcpReadiness} from '@/features/collection/use-collection';
import {useReviewOverview} from '@/features/comment-review/use-comment-review';
import {useAuroraReduced} from './aurora-motion';
import {journeyStages,type JourneyStage} from './journey-model';
import type {SpatialState} from './use-spatial-work';
export function OrbitOverview({state:s}:{state:SpatialState}) {
 const navigate=useNavigate(),readiness=useMcpReadiness(s.admin),review=useReviewOverview(s.admin&&!s.active),reduced=useAuroraReduced();
 const recent=s.configs.flatMap(c=>c.runs.map(r=>({...r,config:c.name,configId:c.id}))).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)).slice(0,3);
 const latest=recent[0],policy=review.data?.policies[0];
 const task=(stage:JourneyStage='collect',run=latest)=>{const q=new URLSearchParams({module:'runs',stage});if(run){q.set('config',run.configId);q.set('run',run.id);}else if(s.selectedConfig)q.set('config',s.selectedConfig.id);navigate('/work?'+q);};
 const labels=[s.work.configs.isError?'读取失败':latest?collectionOutcome(latest).label:'等待开始',review.isError?'读取失败':policy?.autoEnabled?'自动识别已开启':'按需分析','按授权规则执行','收信待接通'];
 return <section className="mist-overview simple-overview" aria-label="轻序工作台" inert={!!s.active} aria-hidden={!!s.active}>
  <h1 className="sr-only">工作台</h1><ErrorNotice error={s.work.configs.error||readiness.error||review.error}/>
  <div className="simple-home-top"><div className="simple-hero"><SpotlightCard theme="light" spotlightColor="#99c7ad" intensity={reduced?0:.12} ambient={false}>
    <p className="eyebrow">从发现需求开始</p><h2>{s.admin?<>下一次获客，<br/>先开始采集。</>:<>从真实需求，<br/>开始下一次跟进。</>}</h2><p>先保存原文，再判断需求与联系。每个阶段都有自己的记录。</p>
    <button className="core-start mist-primary" disabled={s.admin&&s.work.configs.isPending} onPointerMove={e=>{if(reduced)return;const r=e.currentTarget.getBoundingClientRect();e.currentTarget.style.translate=`${((e.clientX-r.left)/r.width-.5)*7}px ${((e.clientY-r.top)/r.height-.5)*7}px`;}} onPointerLeave={e=>{e.currentTarget.style.translate='';}} onClick={()=>s.admin?task():s.openModule('matches')}><Play size={17}/>{s.admin?'自动化采集':'进入我的线索'}</button><small>复用已保存配置 · 进入任务后明确开始</small>
  </SpotlightCard></div><aside className="simple-readiness mist-panel"><h2>这轮准备好了什么</h2><button onClick={()=>s.openCollectionSettings()} disabled={!s.admin}><Search/><span><small>关键词</small><strong>{s.work.configs.isError?'暂时无法读取':s.selectedConfig?.keywords.join(' / ')||'还未配置'}</strong></span></button><button onClick={()=>s.openModule('accounts')}><ContactRound/><span><small>执行账号</small><strong>{readiness.isError?'状态读取失败':readiness.data?.accounts?.find(a=>a.id===s.selectedConfig?.defaultExecutionAccountId)?.label||'到账号中心查看'}</strong></span></button><button onClick={()=>navigate('/comment-review')} disabled={!s.admin}><SlidersHorizontal/><span><small>AI 匹配</small><strong>{review.isError?'状态读取失败':policy?.autoEnabled?'已开启 · 按已授权规则':'关闭 · 不影响采集'}</strong></span></button>{s.admin&&<button className="simple-text-link" onClick={s.openCollectionSettings}>调整已保存的配置 <ArrowRight size={16}/></button>}</aside></div>
  {s.admin&&<div className="simple-home-stages">{journeyStages.map((stage,i)=><button key={stage.id} onClick={()=>task(stage.id)}><span className="simple-stage-number">0{i+1}</span><h3>{stage.label}</h3><p>{stage.description}</p><small>{labels[i]}</small></button>)}</div>}
  <div className="simple-home-shortcuts"><button onClick={()=>s.openModule(s.admin?'archive':'follow')}><Archive/><span><strong>{s.admin?'已保存的原文，随时可查':'销售跟进与待办'}</strong><small>{s.admin?'与 AI 判断及客户管理独立':'从待处理事项继续'}</small></span><ArrowRight/></button>{latest&&s.admin&&<button onClick={()=>task('collect')}><Clock3/><span><strong>继续查看本轮</strong><small>{latest.config} · {collectionOutcome(latest).label}</small></span><ArrowRight/></button>}</div>
  <div className="simple-home-recent"><h2>最近任务</h2>{recent.length?recent.map(r=><button key={r.id} onClick={()=>task('collect',r)}><span>{r.config}</span><small>{new Date(r.createdAt).toLocaleString()}</small><span>{collectionOutcome(r).label}</span><ArrowRight size={15}/></button>):<p>{s.work.configs.isError?'任务读取失败':'开始后，每一轮结果都会保留在这里。'}</p>}</div>
 </section>;
}
