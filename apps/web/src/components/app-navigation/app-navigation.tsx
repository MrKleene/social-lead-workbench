import {useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {Archive,Bell,BriefcaseBusiness,ContactRound,House,ListChecks,LogOut,MessageSquare,Play,ScanLine,Send,Settings2,ShieldCheck,UsersRound,ArrowUpRight} from 'lucide-react';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import type {useWorkspaceMotion} from '@/features/work/use-workspace-motion';
import {useAppNavigation} from './use-app-navigation';
const icons:Record<string,typeof House>={overview:House,runs:Play,archive:Archive,review:ScanLine,'reply-history':MessageSquare,'auto-contact':Send,matches:UsersRound,follow:BriefcaseBusiness,'all-leads':UsersRound,tasks:ListChecks,templates:MessageSquare,notices:Bell,accounts:ContactRound,settings:Settings2,platforms:ShieldCheck};
type Props={admin:boolean;name:string;motion:ReturnType<typeof useWorkspaceMotion>;loggingOut:boolean;onLogout:()=>void};
export function AppNavigation({admin,name,motion,loggingOut,onLogout}:Props){
 const n=useAppNavigation(admin),[panel,setPanel]=useState<'工作管理'|'设置'|null>(null);
 useEffect(()=>{setPanel(null);},[n.locationKey]);
 const trigger=useRef<HTMLButtonElement|null>(null);
 const items=n.primary;
 const navigation=(dock=false)=><nav ref={dock?undefined:n.scroll} className={dock?'simple-dock':'app-primary-navigation'} aria-label={dock?'业务快捷入口':'常用导航'}>
   {items.map(item=>{const Icon=icons[item.id];return <Link key={item.id} to={n.href(item)} aria-current={n.active===item.id||item.id==='overview'&&n.active==='runs'?'page':undefined}><Icon size={17} aria-hidden="true"/><span>{item.label}</span></Link>;})}
   {(['工作管理','设置'] as const).map(group=>{const Icon=group==='设置'?Settings2:UsersRound;return <button type="button" key={group} aria-label={dock?'快捷'+(group==='设置'?'设置':'业务'):(group==='设置'?'设置':'业务')} aria-haspopup="dialog" aria-expanded={panel===group} data-active={n.active!=='runs'&&n.currentSecondary?.group===group} onClick={e=>{trigger.current=e.currentTarget;setPanel(group);}}><Icon size={17}/><span>{group==='设置'?'设置':'业务'}</span></button>;})}
 </nav>;
 return <>{navigation()}<div className="app-header-actions"><span className="simple-role">{admin?'获客工作台':'销售工作台'}</span><button type="button" className="app-logout" aria-label="退出登录" title="退出登录" disabled={loggingOut} onClick={onLogout}><LogOut size={17}/></button></div>
 {navigation(true)}
 <Sheet open={!!panel} onOpenChange={open=>{if(!open)setPanel(null);}}><SheetContent className="navigation-dialog" onCloseAutoFocus={e=>{e.preventDefault();trigger.current?.focus({preventScroll:true});}}><SheetHeader><SheetTitle>{panel==='设置'?'设置':'业务'}</SheetTitle><SheetDescription>{panel==='设置'?'账号、搜索、模型与工作偏好。':'查看原文之后，继续处理线索与跟进。'}</SheetDescription></SheetHeader><div className="navigation-dialog-body"><div className="navigation-grid">{n.secondary.filter(item=>item.group===panel).map(item=>{const Icon=icons[item.id];return <Link key={item.id} to={n.href(item)} aria-current={n.active===item.id?'page':undefined}><Icon size={20}/><span>{item.label}</span><ArrowUpRight size={15}/></Link>;})}</div>{panel==='设置'&&<div className="navigation-preferences"><span>{name} · {admin?'管理员':'销售'}</span><label><input type="checkbox" checked={!motion.reduced} onChange={motion.toggle}/>界面动效</label><small>遵循系统减少动效偏好，也可在这里切换。</small></div>}</div></SheetContent></Sheet>
 </>;
}
