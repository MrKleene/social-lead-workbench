import { Link, useLocation } from 'react-router-dom'
import {
  Archive,
  Database,
  HardDrive,
  Inbox,
  Layers,
  ListChecks,
  PlayCircle,
  ScanLine,
  Send,
  Settings2,
  ShieldCheck,
  SquareStack,
  UsersRound,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { Badge } from '@/components/ui/badge'
import { useLocalRecords } from '@/features/local-workbench/use-local-records'

type NavItem = {
  title: string
  to: string
  icon: React.ElementType
}

const groups: { label: string; items: NavItem[] }[] = [
  {
    label: '工作区',
    items: [
      { title: '概览', to: '/work', icon: SquareStack },
      { title: '自动化任务', to: '/automation', icon: PlayCircle },
    ],
  },
  {
    label: '数据与审核',
    items: [
      { title: '采集归档', to: '/work?module=archive', icon: Archive },
      { title: '评论审核', to: '/comment-review', icon: ScanLine },
    ],
  },
  {
    label: '回复管理',
    items: [
      { title: '自动回复', to: '/auto-contact', icon: Send },
      { title: '待处理回复', to: '/auto-contact?view=pending', icon: ListChecks },
      { title: '回复记录', to: '/reply-history', icon: Archive },
      { title: '消息通知', to: '/inbox', icon: Inbox },
    ],
  },
  {
    label: '管理',
    items: [
      { title: '配置管理', to: '/configuration', icon: Settings2 },
      { title: '账号中心', to: '/work?module=accounts', icon: UsersRound },
      { title: '运行异常', to: '/work?module=notices', icon: Archive },
      { title: '平台能力', to: '/platforms', icon: ShieldCheck },
      { title: '数据与恢复', to: '/data', icon: Database },
    ],
  },
]

/** Exact match first, then a module-aware prefix so `/work?module=x` is unique. */
function isActive(pathname: string, search: string, item: NavItem) {
  const [path, query] = item.to.split('?')
  if (pathname !== path) return false
  if (!query) return !search.includes('module=')
  const module = new URLSearchParams(query).get('module')
  return module ? search.includes(`module=${module}`) : false
}

/**
 * Desktop navigation. Same groups the graphite shell used, rendered with the
 * shadcn-admin sidebar primitives.
 */
export function LocalAppSidebar() {
  const location = useLocation()
  const unread = useLocalRecords('unread')

  return (
    <Sidebar collapsible='icon' variant='sidebar'>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size='lg' asChild>
              <Link to='/work' className='flex items-center gap-2'>
                <span className='flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground'>
                  <Layers className='size-4' />
                </span>
                <span className='grid flex-1 text-start text-sm leading-tight'>
                  <span className='truncate font-semibold'>Social Lead</span>
                  <span className='truncate text-xs text-muted-foreground'>
                    本机工作台
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent role='navigation' aria-label='主导航'>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(location.pathname, location.search, item)}
                    tooltip={item.title}
                  >
                    <Link to={item.to}>
                      <item.icon />
                      <span>{item.title}</span>
                      {item.to === '/inbox' && unread.data?.count ? (
                        <Badge variant='secondary' className='ms-auto'>
                          {unread.data.count > 99 ? '99+' : unread.data.count}
                        </Badge>
                      ) : null}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <div className='flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground'>
          <HardDrive className='size-3.5 shrink-0' aria-hidden='true' />
          <span>本地存储 · 单人使用</span>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
