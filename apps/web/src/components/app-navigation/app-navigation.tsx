import {useEffect,useId,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {Archive,Bell,BriefcaseBusiness,ContactRound,House,LayoutDashboard,ListChecks,LogOut,MessageSquare,Play,ScanLine,Send,Settings2,ShieldCheck,UsersRound,Layers,Menu,ChevronDown} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Switch} from '@/components/ui/switch';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import type {useWorkspaceMotion} from '@/features/work/use-workspace-motion';
import {useAppNavigation} from './use-app-navigation';
const icons:Record<string,typeof House>={home:House,overview:LayoutDashboard,runs:Play,archive:Archive,review:ScanLine,'review-policies':Settings2,'reply-history':MessageSquare,'auto-contact':Send,'pending-replies':ListChecks,matches:UsersRound,follow:BriefcaseBusiness,'all-leads':UsersRound,tasks:ListChecks,templates:MessageSquare,notices:Bell,accounts:ContactRound,settings:Settings2,platforms:ShieldCheck};
const groups=[{label:'工作区',ids:['overview','runs']},{label:'数据与审核',ids:['archive','review']},{label:'回复管理',ids:['auto-contact','pending-replies','reply-history']},{label:'线索与跟进',ids:['matches','follow','all-leads','tasks']},{label:'配置管理',ids:['settings','review-policies','templates']},{label:'管理',ids:['accounts','notices','platforms']}];
type Props={admin:boolean;name:string;motion:ReturnType<typeof useWorkspaceMotion>;loggingOut:boolean;onLogout:()=>void};
export function AppNavigation({admin,name,motion,loggingOut,onLogout}:Props){
 const n=useAppNavigation(admin),id=useId(),[mobile,setMobile]=useState(false),[preferences,setPreferences]=useState(false);
 const menuTrigger=useRef<HTMLButtonElement>(null),preferenceTrigger=useRef<HTMLButtonElement|null>(null);
 useEffect(()=>{setMobile(false);},[n.locationKey]);
 const items=[...n.primary,...n.secondary],active=items.find(item=>item.id===n.active);
 const navigation=(mobileView=false)=><nav className="graphite-navigation" aria-label={mobileView?'移动导航':'主导航'}>{groups.map(group=>{const visible=group.ids.flatMap(key=>items.filter(item=>item.id===key));return visible.length>0&&<section key={group.label} className="graphite-nav-group"><h2>{group.label}</h2>{visible.map(item=>{const Icon=icons[item.id];return <Link key={item.id} to={n.href(item)} aria-current={n.active===item.id?'page':undefined}><Icon aria-hidden="true"/><span>{item.id==='auto-contact'?'自动回复':item.label}</span></Link>;})}</section>;})}</nav>;
 const brand=<Link className="graphite-brand" to="/home" aria-label="Social Lead 首页" aria-current={n.active==='home'?'page':undefined}><Layers aria-hidden="true"/><strong>Social Lead</strong></Link>;
 return <>
  <aside className="graphite-sidebar">{brand}{navigation()}<div className="graphite-profile"><Button variant="ghost" size="content" onClick={event=>{preferenceTrigger.current=event.currentTarget;setPreferences(true);}} aria-label="个人偏好"><span className="graphite-avatar" aria-hidden="true">{name.slice(0,1)||'S'}</span><span><strong>{name||'工作账号'}</strong><small>{admin?'管理员':'销售'}</small></span><ChevronDown aria-hidden="true"/></Button></div></aside>
  <header className="graphite-mobile-bar"><Button ref={menuTrigger} variant="ghost" size="icon" aria-label="打开导航" aria-expanded={mobile} onClick={()=>setMobile(true)}><Menu aria-hidden="true"/></Button>{brand}<Button variant="ghost" size="icon" aria-label="个人偏好" onClick={event=>{preferenceTrigger.current=event.currentTarget;setPreferences(true);}}><Settings2 aria-hidden="true"/></Button></header>
  <div className="graphite-breadcrumb"><span>{groups.find(g=>g.ids.includes(n.active||''))?.label||'工作区'}</span><span aria-hidden="true">/</span><span>{n.active==='home'?'首页':active?.label||'工作台'}</span></div>
  <Sheet open={mobile} onOpenChange={setMobile}><SheetContent className="graphite-mobile-navigation" onCloseAutoFocus={event=>{event.preventDefault();menuTrigger.current?.focus();}}><SheetHeader><SheetTitle>导航</SheetTitle><SheetDescription className="sr-only">工作区页面导航</SheetDescription></SheetHeader>{navigation(true)}</SheetContent></Sheet>
  <Sheet open={preferences} onOpenChange={setPreferences}><SheetContent className="navigation-dialog" onCloseAutoFocus={event=>{event.preventDefault();preferenceTrigger.current?.focus();}}><SheetHeader><SheetTitle>个人偏好</SheetTitle><SheetDescription className="sr-only">界面动效与登录管理</SheetDescription></SheetHeader><div className="navigation-dialog-body"><p>{name} · {admin?'管理员':'销售'}</p><div className="navigation-motion"><label htmlFor={id}>界面动效</label><Switch id={id} checked={!motion.reduced} onCheckedChange={motion.toggle}/></div><Button variant="outline" disabled={loggingOut} onClick={onLogout}><LogOut data-icon="inline-start"/>{loggingOut?'退出中…':'退出登录'}</Button></div></SheetContent></Sheet>
 </>;
}
