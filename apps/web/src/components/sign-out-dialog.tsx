import { useNavigate, useLocation } from '@tanstack/react-router'
import { clearSession } from '@/lib/session'
import { ConfirmDialog } from '@/components/confirm-dialog'

interface SignOutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SignOutDialog({ open, onOpenChange }: SignOutDialogProps) {
  const navigate = useNavigate()
  const location = useLocation()

  const handleSignOut = () => {
    clearSession()
    const currentPath = location.pathname + location.searchStr
    navigate({
      to: '/sign-in',
      search: { redirect: currentPath },
      replace: true,
    })
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title='退出登录'
      desc='退出后需要重新输入本机账号才能打开工作台。本地数据不会受影响。'
      confirmText='退出登录'
      destructive
      handleConfirm={handleSignOut}
      className='sm:max-w-sm'
    />
  )
}
