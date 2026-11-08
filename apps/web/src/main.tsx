import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { DirectionProvider } from './context/direction-provider'
import { FontProvider } from './context/font-provider'
import { ThemeProvider } from './context/theme-provider'
// Generated Routes
import { routeTree } from './routeTree.gen'
// Legacy page styles, still load-bearing until each page is ported to Tailwind.
// They must load BEFORE styles/index.css so the slate tokens in theme.css win
// the `:root` cascade; desktop-bridge.css then neutralises the old shell grid.
import './features/work/mist.css'
import './features/work/ui-consistency.css'
import './features/work/simple.css'
import './design-system/foundation.css'
import './features/local-workbench/local-workbench.css'
import './features/local-workbench/local-shell.css'
// Styles
import './styles/index.css'
import './styles/desktop-bridge.css'

// The desktop renderer talks to the local runtime over IPC, never HTTP, so the
// query client only needs cache policy — no status-code interception.
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
