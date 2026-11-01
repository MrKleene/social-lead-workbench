import {Link} from 'react-router-dom';
import {useSpatialWork} from './use-spatial-work';
import {WorkspaceAutomationProvider} from './workspace-automation';
import {TaskWorkspace} from './task-workspace';
export function AutomationPage(){
 const s=useSpatialWork();
 if(!s.admin)return <p>此页面仅管理员可用。<Link to="/work">返回工作台</Link></p>;
 return <WorkspaceAutomationProvider configs={s.configs} initialId={s.selectedConfig?.id} loading={s.work.configs.isPending} error={s.work.configs.error} enabled={s.admin}><section className="automation-page" aria-label="自动化任务"><TaskWorkspace configs={s.configs} loading={s.work.configs.isPending} error={s.work.configs.error} visible initialId={s.selectedConfig?.id} onSelect={s.setConfig} onAccounts={()=>s.openModule('accounts')} onSettings={()=>s.openModule('settings')} onResults={()=>s.openModule('archive')}/></section></WorkspaceAutomationProvider>;
}
