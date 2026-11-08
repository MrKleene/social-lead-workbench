import { createFileRoute, redirect } from '@tanstack/react-router'
import { getSession } from '@/lib/session'
import { WorkbenchShell } from '@/components/layout/workbench-shell'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ location }) => {
    if (!getSession()) {
      throw redirect({
        to: '/sign-in',
        search: { redirect: location.pathname + location.searchStr },
      })
    }
  },
  component: WorkbenchShell,
})
