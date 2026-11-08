import type { ReactNode } from 'react'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'

type PageShellProps = {
  title?: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}

/**
 * Shared page chrome for the desktop renderer. shadcn-admin keeps Header/Main
 * per page rather than in the layout, so every route renders this.
 *
 * The web variant also renders Search / ThemeSwitch / ConfigDrawer /
 * ProfileDropdown here; the desktop shell has no account, so those live in the
 * sidebar footer instead.
 */
export function PageShell({
  title,
  description,
  actions,
  children,
}: PageShellProps) {
  return (
    <>
      <Header fixed>
        <span className='text-sm font-medium text-muted-foreground'>本机工作台</span>
      </Header>
      <Main className='flex flex-1 flex-col gap-4 sm:gap-6'>
        {title ? (
          <div className='flex flex-wrap items-end justify-between gap-2'>
            <div>
              <h1 className='text-2xl font-bold tracking-tight'>{title}</h1>
              {description ? (
                <p className='text-muted-foreground'>{description}</p>
              ) : null}
            </div>
            {actions}
          </div>
        ) : (
          actions
        )}
        {children}
      </Main>
    </>
  )
}
