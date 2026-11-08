import { createFileRoute } from '@tanstack/react-router'
import { LocalInboxPage } from '@/features/local-workbench/local-inbox-page'

export const Route = createFileRoute('/_authenticated/inbox/')({
  component: LocalInboxPage,
})
