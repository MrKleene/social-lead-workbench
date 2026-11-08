import { createFileRoute } from '@tanstack/react-router'
import { LocalAccountPage } from '@/features/local-workbench/local-account-page'

export const Route = createFileRoute('/_authenticated/work/accounts')({
  component: LocalAccountPage,
})
