import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'

type HeaderProps = React.HTMLAttributes<HTMLElement> & {
  fixed?: boolean
  ref?: React.Ref<HTMLElement>
}

export function Header({ className, fixed, children, ...props }: HeaderProps) {
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    const onScroll = () => {
      setOffset(document.body.scrollTop || document.documentElement.scrollTop)
    }

    // Add scroll listener to the body
    document.addEventListener('scroll', onScroll, { passive: true })

    // Clean up the event listener on unmount
    return () => document.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'z-50 h-16 border-b',
        fixed && 'header-fixed peer/header sticky top-0 w-[inherit]',
        // 滚动后出现 1px 分割线，而不是投影：DESIGN.md §6 的分层首选是边框，
        // 阴影只留给浮层（dropdown / dialog / sheet）。
        // 顶部时用透明边框占位，避免滚动瞬间高度跳 1px。
        offset > 10 && fixed ? 'border-border' : 'border-transparent',
        className
      )}
      {...props}
    >
      <div
        className={cn(
          'relative flex h-full items-center gap-3 p-4 sm:gap-4',
          offset > 10 &&
            fixed &&
            'after:absolute after:inset-0 after:-z-10 after:bg-background/20 after:backdrop-blur-lg'
        )}
      >
        <SidebarTrigger
          variant='outline'
          className='max-md:scale-125'
          aria-label='打开导航'
        />
        <Separator orientation='vertical' className='h-6' />
        {children}
      </div>
    </header>
  )
}
