import {useAutomationPreferences} from './settings-data';
import {useWorkspaceAutomation} from './workspace-automation';
import {accountOptionName} from '@/features/accounts/account-presentation';
import {HomeRecentTasks} from './home-recent-tasks';
import './home-content.css';
import {ReviewAndReplySetup} from './automation-setup';
import { Button } from '@/components/ui/button';
import {useNavigate} from 'react-router-dom';
import {Play,Settings2} from 'lucide-react';
import {ErrorNotice} from '@/components/feedback';
import {useMcpReadiness} from '@/features/collection/use-collection';
import {useAuroraReduced} from './aurora-motion';
import type {SpatialState} from './use-spatial-work';
export function OrbitOverview({state:s}:{state:SpatialState}) {
 const {openSettings}=useWorkspaceAutomation();
 const navigate=useNavigate(),readiness=useMcpReadiness(s.admin),reduced=useAuroraReduced();
 const preferences=useAutomationPreferences(s.admin);
 const defaultAccount=readiness.data?.accounts?.find(a=>a.id===s.selectedConfig?.defaultExecutionAccountId);
 return <section className="mist-overview simple-overview" aria-label="首页">
  <h1 className="sr-only">{s.admin?'启动配置':'我的工作'}</h1><ErrorNotice error={s.work.configs.error||readiness.error}/>
  <div className="simple-home-top"><div className="simple-hero"><div className="simple-hero-content">
    <h2>{s.admin?'开始新任务':'我的工作'}</h2>
    <Button size="content" className="core-start mist-primary" disabled={s.admin&&s.work.configs.isPending} onPointerMove={e=>{if(reduced)return;const r=e.currentTarget.getBoundingClientRect();e.currentTarget.style.translate=`${((e.clientX-r.left)/r.width-.5)*7}px ${((e.clientY-r.top)/r.height-.5)*7}px`;}} onPointerLeave={e=>{e.currentTarget.style.translate='';}} onClick={()=>s.admin?navigate('/automation?'+new URLSearchParams({stage:'collect',fresh:'1',...(preferences.data?.configId||s.selectedConfig?.id?{config:preferences.data?.configId||s.selectedConfig!.id}:{})})):s.openModule('matches')}><Play size={17}/>{s.admin?'进入自动化任务':'进入我的线索'}</Button>{s.admin&&<HomeRecentTasks/>}
  </div></div>{s.admin?<aside className="simple-readiness mist-panel"><div className="simple-readiness-heading"><h2>三步配置</h2>{s.admin&&<Button variant="outline" size="sm" onClick={()=>openSettings('collect')}><Settings2 size={15}/>自动化设置</Button>}</div><div className="automation-setup"><section><h3>01 · 采集</h3><p>搜索关键词：{s.work.configs.isError?'读取失败':s.work.configs.isPending?'正在读取':s.selectedConfig?.keywords.join(' / ')||'未配置'}</p><p>采集账号：{readiness.isError?'读取失败':readiness.isPending?'正在读取':defaultAccount?accountOptionName(defaultAccount,readiness.data?.accounts):'开始前选择可用账号'}</p></section></div><ReviewAndReplySetup/></aside>:<aside className="simple-readiness mist-panel"><h2>我的跟进</h2><Button variant="outline" onClick={()=>s.openModule('follow')}>查看销售跟进</Button></aside>}</div>

 </section>;
}
