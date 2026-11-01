import {useAutomationPreferences} from './settings-data';
import {useWorkspaceAutomation} from './workspace-automation';
import {accountOptionName} from '@/features/accounts/account-presentation';
import {ReviewAndReplySetup} from './automation-setup';
import { Button } from '@/components/ui/button';
import {useNavigate} from 'react-router-dom';
import {Play,Settings2} from 'lucide-react';
import {ErrorNotice} from '@/components/feedback';
import {useMcpReadiness} from '@/features/collection/use-collection';
import {useAuroraReduced} from './aurora-motion';
import {journeyStages} from './journey-model';
import type {SpatialState} from './use-spatial-work';
export function OrbitOverview({state:s}:{state:SpatialState}) {
 const {openSettings}=useWorkspaceAutomation();
 const navigate=useNavigate(),readiness=useMcpReadiness(s.admin),reduced=useAuroraReduced();
 const preferences=useAutomationPreferences(s.admin);
 const defaultAccount=readiness.data?.accounts?.find(a=>a.id===s.selectedConfig?.defaultExecutionAccountId);
 return <section className="mist-overview simple-overview" aria-label="首页" data-workspace-inactive={!!s.active} inert={!!s.active} aria-hidden={!!s.active}>
  <h1 className="sr-only">{s.admin?'启动配置':'我的工作'}</h1><ErrorNotice error={s.work.configs.error||readiness.error}/>
  <div className="simple-home-top"><div className="simple-hero"><div className="simple-hero-content">
    <h2>{s.admin?<>配置好，<br/>再开始这一轮。</>:<>从真实需求，<br/>开始下一次跟进。</>}</h2><p>{s.admin?'选择采集来源、匹配目标与回复规则。进入任务后，可逐步查看过程和结果。':'查看分配给你的线索，核对来源与需求，再记录下一步跟进。'}</p>
    <Button size="content" className="core-start mist-primary" disabled={s.admin&&s.work.configs.isPending} onPointerMove={e=>{if(reduced)return;const r=e.currentTarget.getBoundingClientRect();e.currentTarget.style.translate=`${((e.clientX-r.left)/r.width-.5)*7}px ${((e.clientY-r.top)/r.height-.5)*7}px`;}} onPointerLeave={e=>{e.currentTarget.style.translate='';}} onClick={()=>s.admin?navigate('/automation?'+new URLSearchParams({stage:'collect',fresh:'1',...(preferences.data?.configId||s.selectedConfig?.id?{config:preferences.data?.configId||s.selectedConfig!.id}:{})})):s.openModule('matches')}><Play size={17}/>{s.admin?'进入自动化任务':'进入我的线索'}</Button><small>{s.admin?'复用已保存配置 · 进入任务后明确开始':'仅显示你有权访问的线索与待办'}</small>
  </div></div>{s.admin?<aside className="simple-readiness mist-panel"><div className="simple-readiness-heading"><h2>三步配置</h2>{s.admin&&<Button variant="outline" size="sm" onClick={()=>openSettings('collect')}><Settings2 size={15}/>自动化设置</Button>}</div><div className="automation-setup"><section><h3>01 · 采集</h3><p>搜索关键词：{s.work.configs.isError?'读取失败':s.selectedConfig?.keywords.join(' / ')||'未配置'}</p><p>采集账号：{readiness.isError?'读取失败':defaultAccount?accountOptionName(defaultAccount,readiness.data?.accounts):'开始前选择可用账号'}</p></section></div><ReviewAndReplySetup/></aside>:<aside className="simple-readiness mist-panel"><h2>我的跟进</h2><p>采集、匹配和自动回复由管理员配置。你可以核对线索、记录联系结果和安排后续跟进。</p><Button variant="outline" onClick={()=>s.openModule('follow')}>查看销售跟进</Button></aside>}</div>
  {s.admin&&<div className="simple-home-stages">{journeyStages.map((stage,i)=><article key={stage.id}><span className="simple-stage-number">0{i+1}</span><h3>{stage.label}</h3><p>{stage.description}</p></article>)}</div>}
 </section>;
}
