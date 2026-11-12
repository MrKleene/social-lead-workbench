import { Outlet, useNavigate } from '@tanstack/react-router'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { SkipToMain } from '@/components/skip-to-main'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { LayoutProvider } from '@/context/layout-provider'
import { SearchProvider } from '@/context/search-provider'
import { DraftGuardProvider } from '@/features/work/draft-guard'
import { useLocalWorkbench } from '@/features/local-workbench/use-local-workbench'
import { Welcome, type WelcomeDestination } from '@/features/onboarding/welcome'
import { getCookie } from '@/lib/cookies'
import { Main } from '@/components/layout/main'
import { AppSidebar } from './app-sidebar'

/** Opens local data before rendering the workbench; first use shows the welcome flow. */
export function WorkbenchShell() {
  const w = useLocalWorkbench()
  const navigate = useNavigate()

  async function start(destination: WelcomeDestination) {
    try {
      await w.initialize.mutateAsync()
      await navigate({ to: destination, replace: true })
    } catch {
      // Mutation errors are displayed on the welcome screen so the user can retry.
    }
  }

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
      <main className='min-h-svh bg-background text-foreground'>
        <Welcome
          onContinue={(destination) => void start(destination)}
          pending={w.initialize.isPending}
          error={w.initialize.error?.message}
        />
      </main>
    )

  return (
    <DraftGuardProvider>
      <SearchProvider>
        <LayoutProvider>
          <SidebarProvider
            defaultOpen={getCookie('sidebar_state') !== 'false'}
          >
            <SkipToMain />
            <AppSidebar />
            <SidebarInset className='@container/content'>
              {/* 顶栏与侧栏都来自 shadcn-admin 原样文件：Header 负责 64px 横带，
                  TopNav / Search / ThemeSwitch / ConfigDrawer / ProfileDropdown
                  是它的子元素，间距靠 Header 内层的 gap-4。 */}
              <Header fixed>
                <Search placeholder='搜索' className='me-auto min-w-0' />
                <ThemeSwitch />
                <ConfigDrawer />
                <ProfileDropdown />
              </Header>
              <Main
                id='content'
                tabIndex={-1}
                className='flex flex-1 flex-col gap-4 outline-none sm:gap-6'
              >
                <Outlet />
              </Main>
            </SidebarInset>
          </SidebarProvider>
        </LayoutProvider>
      </SearchProvider>
    </DraftGuardProvider>
  )
}
