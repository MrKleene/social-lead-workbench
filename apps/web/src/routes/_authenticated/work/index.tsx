import { createFileRoute } from '@tanstack/react-router'
import { LocalOverview } from '@/features/local-workbench/local-overview'

export const Route = createFileRoute('/_authenticated/work/')({
  component: LocalOverview,
})
