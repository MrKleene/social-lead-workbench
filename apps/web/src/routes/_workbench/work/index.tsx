import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_workbench/work/')({
  beforeLoad: () => {
    throw redirect({ to: '/', replace: true })
  },
})
