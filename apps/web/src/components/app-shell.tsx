import {InboxIndicator} from '@/features/inbox/inbox-indicator';
import {TooltipProvider} from './ui/tooltip';
import {useEffect,useRef} from 'react';
import {Outlet,useLocation} from 'react-router-dom';
import {AuroraMotionContext} from '@/features/work/aurora-motion';
import {useAuth} from '@/features/auth/use-auth';
import {useWorkspaceMotion} from '@/features/work/use-workspace-motion';
import {useEvents} from '@/lib/use-events';
import {ErrorNotice} from './feedback';
import {DraftGuardProvider,useConfirmWorkspaceLeave} from '@/features/work/draft-guard';
import {AppNavigation} from './app-navigation/app-navigation';
import {isWorkPath} from './app-navigation/navigation-model';
export function AppShell(){return <TooltipProvider><DraftGuardProvider><ShellContent/></DraftGuardProvider></TooltipProvider>;}
function ShellContent(){
 const confirmLeave=useConfirmWorkspaceLeave(),motion=useWorkspaceMotion(),{user,logout}=useAuth(),location=useLocation();useEvents(!!user);
 const previousLocation=useRef(location.key);
 useEffect(()=>{if(previousLocation.current===location.key)return;previousLocation.current=location.key;const frame=requestAnimationFrame(()=>{if(document.activeElement===document.body)document.getElementById('workspace-main')?.focus({preventScroll:true});});return()=>cancelAnimationFrame(frame);},[location.key]);
 const spatial=isWorkPath(location.pathname)||location.pathname==='/home'||location.pathname==='/automation',module=new URLSearchParams(location.search).get('module');
 const phase=module||location.pathname!=='/work'?'review':'overview';
 return <AuroraMotionContext.Provider value={motion.reduced}><div className="space-shell ui-workspace graphite-workspace" data-phase={phase}>
 <InboxIndicator enabled={user?.role==='ADMIN'}/><a className="aurora-skip" href="#workspace-main">跳到工作内容</a>
 <AppNavigation admin={user?.role==='ADMIN'} name={user?.name||''} motion={motion} loggingOut={logout.isPending} onLogout={async()=>{if(await confirmLeave())logout.mutate();}}/>
 <main id="workspace-main" tabIndex={-1} className={spatial?'space-page':'page space-document'} key={location.pathname.split('/')[1]}><ErrorNotice error={logout.error}/><Outlet/></main>
 </div></AuroraMotionContext.Provider>;
}
