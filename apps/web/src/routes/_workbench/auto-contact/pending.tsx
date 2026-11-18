import { createFileRoute } from '@tanstack/react-router'
import { LocalPending } from '@/features/local-workbench/local-pending'

export const Route = createFileRoute('/_workbench/auto-contact/pending')({
  component: LocalPending,
})
