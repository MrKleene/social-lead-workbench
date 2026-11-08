import { Layers } from 'lucide-react'
import { getSession } from '@/lib/session'
import { useLocalRecords } from '@/features/local-workbench/use-local-records'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { NavGroup } from './nav-group'
import { NavUser } from './nav-user'
import { sidebarData } from './data/sidebar-data'

export function AppSidebar() {
  const session = getSession()
  const unread = useLocalRecords('unread')

  const navGroups = sidebarData.navGroups.map((group) => ({
    ...group,
    items: group.items.map((item) =>
      item.url === '/inbox' && unread.data?.count
        ? {
            ...item,
            badge: unread.data.count > 99 ? '99+' : String(unread.data.count),
          }
        : item
    ),
  }))

  return (
    <Sidebar collapsible='icon' variant='sidebar'>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size='lg' asChild>
              <div className='flex items-center gap-2'>
                <span className='flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground'>
                  <Layers className='size-4' />
                </span>
                <span className='grid flex-1 text-start text-sm leading-tight'>
                  <span className='truncate font-semibold'>Social Lead</span>
                  <span className='truncate text-xs text-muted-foreground'>
                    本机工作台
                  </span>
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent role='navigation' aria-label='主导航'>
        {navGroups.map((group) => (
          <NavGroup key={group.title} {...group} />
        ))}
      </SidebarContent>

      <SidebarFooter>
        <NavUser
          user={{
            name: session?.user.name ?? '未登录',
            email: session?.user.email ?? '',
            avatar: '',
          }}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
