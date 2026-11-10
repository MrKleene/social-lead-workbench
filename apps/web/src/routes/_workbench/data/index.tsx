import { createFileRoute } from '@tanstack/react-router'
import { LocalDataPage } from '@/features/local-workbench/local-overview'

export const Route = createFileRoute('/_workbench/data/')({
  component: LocalDataPage,
})
