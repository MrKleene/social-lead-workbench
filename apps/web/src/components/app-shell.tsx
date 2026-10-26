import {useEffect,useRef} from 'react';
import {Link,Outlet,useLocation} from 'react-router-dom';
import {Layers} from 'lucide-react';
import {AuroraMotionContext} from '@/features/work/aurora-motion';
import {useAuth} from '@/features/auth/use-auth';
import {useWorkspaceMotion} from '@/features/work/use-workspace-motion';
import {useEvents} from '@/lib/use-events';
import {ErrorNotice} from './feedback';
import {DraftGuardProvider,useConfirmWorkspaceLeave} from '@/features/work/draft-guard';
import {AppNavigation} from './app-navigation/app-navigation';
import {isWorkPath} from './app-navigation/navigation-model';
export function AppShell(){return <DraftGuardProvider><ShellContent/></DraftGuardProvider>;}
function ShellContent(){
 const confirmLeave=useConfirmWorkspaceLeave(),motion=useWorkspaceMotion(),{user,logout}=useAuth(),location=useLocation();useEvents(!!user);
 const previousLocation=useRef(location.key);
 useEffect(()=>{if(previousLocation.current===location.key)return;previousLocation.current=location.key;const frame=requestAnimationFrame(()=>{if(document.activeElement===document.body)document.getElementById('workspace-main')?.focus({preventScroll:true});});return()=>cancelAnimationFrame(frame);},[location.key]);
 const spatial=isWorkPath(location.pathname),module=new URLSearchParams(location.search).get('module');
 const phase=module==='follow'?'handoff':module||location.pathname!=='/work'?'review':'overview';
 return <AuroraMotionContext.Provider value={motion.reduced}><div className="space-shell" data-phase={phase}>
 <a className="aurora-skip" href="#workspace-main">跳到工作内容</a>
 <header className="space-topbar app-topbar"><Link className="app-brand" to="/work"><Layers aria-hidden="true"/><span><strong>Social Lead</strong><small>AI 辅助获客工作台</small></span></Link><AppNavigation admin={user?.role==='ADMIN'} name={user?.name||''} motion={motion} loggingOut={logout.isPending} onLogout={()=>{if(confirmLeave())logout.mutate();}}/></header>
 <main id="workspace-main" tabIndex={-1} className={spatial?'space-page':'page space-document'} key={location.pathname.split('/')[1]}><ErrorNotice error={logout.error}/>{!spatial&&<Link className="back-to-space" to="/work">← 返回工作台</Link>}<Outlet/></main>
 </div></AuroraMotionContext.Provider>;
}
