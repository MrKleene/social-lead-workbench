import { useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Orbit, Menu, LogOut, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/use-auth';
import { useWorkspaceMotion } from '@/features/work/use-workspace-motion';
import { useEvents } from '@/lib/use-events';
import { ErrorNotice } from './feedback';
const links = [
  { to: '/work', label: '环绕总览' }, { to: '/leads', label: '全部线索' },
  { to: '/tasks', label: '人工任务' }, { to: '/collection', label: '搜索设置', adminOnly: true },
  { to: '/templates', label: '回复话术', adminOnly: true }, { to: '/platforms', label: '平台能力' },
];
export function AppShell() {
  const motion = useWorkspaceMotion();
  const { user, logout } = useAuth();
  const location = useLocation();
  const [menu, setMenu] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  useEvents(!!user);
  const spatial = location.pathname.startsWith('/work');
  return <div className="space-shell">
    <header className="space-topbar" onKeyDown={e => { if(menu && e.key === "Escape") { e.stopPropagation(); setMenu(false); menuTrigger.current?.focus(); } }}>
      <Link className="space-brand" to="/work" onClick={() => setMenu(false)}><Orbit aria-hidden="true"/><span>LEAD SPACE</span></Link>
      <div className="space-account">
        <button className="motion-toggle" aria-label="粒子动效" aria-pressed={!motion.reduced} title={motion.systemReduced && motion.preference==='system' ? '已遵循系统低动态偏好。可在此仅为当前页面开启动效，不修改系统设置。' : '控制星尘、核心光点和连线粒子；后台自动暂停。'} onClick={motion.toggle}>{motion.reduced ? (motion.systemReduced && motion.preference==='system' ? '系统低动态 · 开启动效' : '粒子已暂停 · 开启') : '粒子动效 · 暂停'}</button>
        <span className="space-role">{user?.name} · {user?.role === 'ADMIN' ? '管理员' : '销售'}</span>
        <Button ref={menuTrigger} variant="ghost" size="icon" aria-label="打开工作空间菜单" aria-expanded={menu} onClick={() => setMenu(v => !v)}>{menu ? <X/> : <Menu/>}</Button>
        <Button variant="ghost" size="icon" aria-label="退出登录" onClick={() => logout.mutate()} disabled={logout.isPending}><LogOut/></Button>
      </div>
      {menu && <nav className="space-menu" aria-label="主导航" onKeyDown={e => { if(e.key === 'Escape') { e.stopPropagation(); setMenu(false); menuTrigger.current?.focus(); } }}>{links.filter(l => !l.adminOnly || user?.role === 'ADMIN').map(l => <NavLink key={l.to} to={l.to} onClick={() => setMenu(false)}>{l.label}</NavLink>)}</nav>}
    </header>
    <main className={spatial ? 'space-page' : 'page space-document'} key={location.pathname.split('/')[1]}><ErrorNotice error={logout.error}/>{!spatial && <Link className="back-to-space" to="/work">← 返回环绕总览</Link>}<Outlet/></main>
  </div>;
}
