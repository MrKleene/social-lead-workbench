import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { DirectionProvider } from './context/direction-provider'
import { FontProvider } from './context/font-provider'
import { ThemeProvider } from './context/theme-provider'
// Generated Routes
import { routeTree } from './routeTree.gen'
// Styles — index.css 必须第一个导入：它负责声明 Tailwind 的层顺序
// (theme → base → components → utilities)。若先导入任何 @layer components
// 的样式，该层会被注册在最前、优先级降到 preflight 之下，页面标题的字号
// 和页头外边距会全部失效（2026-11-09 修过一次，ui:check 的 css-layer-order 会守）。
import './styles/index.css'
// Page-level styles. The graphite design system (foundation/simple/mist) is
// gone: every rule that survived is scoped to a class the pages actually use.
// Feature stylesheets are imported by their own components; only the two that
// the deleted router entry used to pull in are wired here.
import './features/local-workbench/local-workbench.css'
import './features/local-workbench/local-shell.css'
import './styles/workbench.css'
import './styles/desktop-bridge.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 10 * 1000,
    },
  },
})

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('root')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <FontProvider>
            <DirectionProvider>
              <RouterProvider router={router} />
            </DirectionProvider>
          </FontProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </StrictMode>
  )
}
