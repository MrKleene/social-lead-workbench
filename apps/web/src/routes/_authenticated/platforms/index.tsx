import { createFileRoute } from '@tanstack/react-router'
import { LocalCapabilities } from '@/features/local-workbench/local-overview'

export const Route = createFileRoute('/_authenticated/platforms/')({
  component: LocalCapabilities,
})
