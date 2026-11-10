import { Link } from '@tanstack/react-router'
import { BadgeCheck, BookOpen, ChevronsUpDown, Monitor } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'

export function NavWorkspace() {
  const { isMobile } = useSidebar()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size='lg' aria-label='本地工作台菜单'>
              <Monitor aria-hidden='true' />
              <div className='grid flex-1 text-start text-body leading-relaxed'>
                <span className='truncate font-medium'>本地工作台</span>
                <span className='truncate text-caption text-muted-foreground'>当前设备</span>
              </div>
              <ChevronsUpDown className='ms-auto size-4' aria-hidden='true' />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side={isMobile ? 'bottom' : 'right'} align='end' sideOffset={4}>
            <DropdownMenuItem asChild>
              <Link to='/work/accounts'><BadgeCheck aria-hidden='true' />账号中心</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to='/welcome'><BookOpen aria-hidden='true' />使用引导</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
