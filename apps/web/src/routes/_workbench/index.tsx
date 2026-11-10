import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_workbench/')({
  beforeLoad: () => {
    throw redirect({ to: '/work', replace: true })
  },
})
