import { Link } from '@tanstack/react-router'
import { BadgeCheck, BookOpen } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { sidebarData } from '@/components/layout/data/sidebar-data'

/**
 * 顶栏右上角头像菜单。外壳照 shadcn-admin 的 `profile-dropdown.tsx`，
 * 菜单项换成本项目存在的两页：没有登录、账单、设置、登出。
 */
export function ProfileDropdown() {
  const user = sidebarData.user

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          className='relative h-8 w-8 rounded-full'
          aria-label='账号菜单'
        >
          <Avatar className='h-8 w-8'>
            <AvatarImage src={user.avatar} alt={user.name} />
            <AvatarFallback>SL</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-56' align='end' forceMount>
        <DropdownMenuLabel className='font-normal'>
          <div className='flex flex-col gap-1.5'>
            <p className='text-sm leading-none font-medium'>{user.name}</p>
            <p className='text-xs leading-none text-muted-foreground'>
              {user.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link to='/work/accounts'>
              <BadgeCheck />
              账号中心
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to='/welcome'>
              <BookOpen />
              使用引导
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
