import {Link} from 'react-router-dom';
import {useSpatialWork} from './use-spatial-work';
import {WorkspaceAutomationProvider} from './workspace-automation';
import {TaskWorkspace} from './task-workspace';
export function AutomationPage(){
 const s=useSpatialWork();
 if(!s.admin)return <p>此页面仅管理员可用。<Link to="/work">返回工作台</Link></p>;
 return <WorkspaceAutomationProvider configs={s.configs} initialId={s.selectedConfig?.id} loading={s.work.configs.isPending} error={s.work.configs.error} enabled={s.admin}><section className="automation-page" aria-label="自动化任务"><div className="automation-breadcrumb"><Link to="/home">首页</Link><span>/</span><strong>自动化任务</strong><Link to="/work">项目数据概览 →</Link></div><TaskWorkspace configs={s.configs} loading={s.work.configs.isPending} error={s.work.configs.error} visible initialId={s.selectedConfig?.id} onSelect={s.setConfig} onAccounts={()=>s.openModule('accounts')} onSettings={()=>s.openModule('settings')} onResults={()=>s.openModule('archive')}/></section></WorkspaceAutomationProvider>;
}
