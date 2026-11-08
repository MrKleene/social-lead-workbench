import { createFileRoute } from '@tanstack/react-router'
import { LocalPending } from '@/features/local-workbench/local-record-pages'

export const Route = createFileRoute('/_authenticated/auto-contact/pending')({
  component: LocalPending,
})
