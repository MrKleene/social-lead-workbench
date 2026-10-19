import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  PanelLeftClose,
  PanelLeftOpen,
  LayoutList,
  ListChecks,
  Layers,
  LogOut,
  Monitor,
  Inbox,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/use-auth";
import { useWorkspaceMotion } from "@/features/work/use-workspace-motion";
import { useEvents } from "@/lib/use-events";
import { ErrorNotice } from "./feedback";
const links = [
  { to: "/work", label: "找线索", icon: Inbox },
  { to: "/leads", label: "线索管理", icon: LayoutList },
  { to: "/tasks", label: "任务中心", icon: ListChecks },
  { to: "/collection", label: "搜索设置", icon: Settings2, adminOnly: true },
  { to: "/templates", label: "回复话术", icon: Settings2, adminOnly: true },
  { to: "/platforms", label: "平台能力", icon: Layers },
];
export function AppShell() {
  const motion = useWorkspaceMotion();
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout } = useAuth();
  const location = useLocation();
  useEvents(!!user);
  const title =
    links.find((v) => location.pathname.startsWith(v.to))?.label || "线索管理";
  return (
    <div className={`app-shell ${collapsed ? "is-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">L</span>
          <div className="sidebar-text">
            <strong>线索工作台</strong>
            <small>LEAD WORKSPACE</small>
          </div>
        </div>
        <p className="nav-caption sidebar-text">工作空间</p>
        <nav aria-label="主导航">
          {links.filter(link=>!link.adminOnly||user?.role==='ADMIN').map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              title={label}
              className={({ isActive }) =>
                isActive ? "nav-item active" : "nav-item"
              }
            >
              <Icon size={20} />
              <span className="sidebar-text">{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Monitor size={18} />
          <span className="sidebar-text">本机开发 · 演示环境</span>
          <span className="live-dot" />
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCollapsed((v) => !v)}
              aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
            >
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
            <span>工作台</span>
            <span className="muted">/</span>
            <strong>{title}</strong>
          </div>
          <div className="user-menu"><button className="motion-toggle" aria-pressed={motion.reduced} onClick={motion.toggle}>{motion.reduced ? "动态已减少" : "减少动态"}</button>
            <span className="avatar admin-avatar">
              {user?.name.slice(0, 1)}
            </span>
            <div>
              <strong>{user?.name}</strong>
              <small>
                {user?.role === "ADMIN" ? "管理员" : "销售 · 仅我的线索"}
              </small>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="退出登录"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
            >
              <LogOut />
            </Button>
          </div>
        </header>
        <main className="page" key={location.pathname.split("/")[1]}>
          <ErrorNotice error={logout.error} />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
