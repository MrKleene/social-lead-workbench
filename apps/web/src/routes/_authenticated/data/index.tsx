import { createFileRoute } from '@tanstack/react-router'
import { LocalDataPage } from '@/features/local-workbench/local-overview'

export const Route = createFileRoute('/_authenticated/data/')({
  component: LocalDataPage,
})
