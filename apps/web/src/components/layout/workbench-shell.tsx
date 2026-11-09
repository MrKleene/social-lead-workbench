import { Outlet } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { DraftGuardProvider } from '@/features/work/draft-guard'
import { useLocalWorkbench } from '@/features/local-workbench/use-local-workbench'
import { AppSidebar } from './app-sidebar'

/**
 * Workbench shell: the three local bootstrap states, then the sidebar layout.
 * Authentication happens one level up in `routes/_authenticated/route.tsx`, so
 * by the time this renders the user is already known.
 */
export function WorkbenchShell() {
  const w = useLocalWorkbench()

  if (w.status.isPending)
    return (
      <main className='grid min-h-svh place-items-center text-sm text-muted-foreground'>
        正在打开本地数据…
      </main>
    )

  if (!w.status.data)
    return (
      <main className='grid min-h-svh place-items-center gap-3 p-6 text-center'>
        <p role='alert' className='text-sm text-destructive'>
          {w.error?.message}
        </p>
        <Button onClick={() => void w.status.refetch()}>重试打开</Button>
      </main>
    )

  if (!w.status.data.initialized)
    return (
      <main className='grid min-h-svh place-items-center p-6'>
        <div className='flex max-w-md flex-col gap-3 text-center'>
          <h1 className='text-xl font-semibold'>工作台</h1>
          <Button
            className='mx-auto'
            pending={w.initialize.isPending}
            onClick={() => w.initialize.mutate()}
          >
            初始化并打开
          </Button>
        </div>
      </main>
    )

  return (
    <DraftGuardProvider>
      <SidebarProvider>
        <AppSidebar />
        {/* Both classes are load-bearing: `graphite-workspace` scopes the page
            rules that have not been ported to Tailwind yet, `local-desktop`
            scopes the local-workbench overrides. The old shell grid itself is
            neutralised in styles/desktop-bridge.css. */}
        <SidebarInset className='graphite-workspace local-desktop'>
          <a
            href='#workspace-main'
            className='sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm'
          >
            跳到工作内容
          </a>
          <header className='flex h-14 shrink-0 items-center gap-2 border-b px-4'>
            <SidebarTrigger className='-ms-1' aria-label='打开导航' />
            <Separator orientation='vertical' className='me-1 h-6' />
            <span className='text-sm text-muted-foreground'>本机工作台</span>
          </header>
          <main
            id='workspace-main'
            tabIndex={-1}
            className='flex flex-1 flex-col gap-4 p-4 outline-none md:p-6'
          >
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </DraftGuardProvider>
  )
}
