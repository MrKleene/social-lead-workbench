import { createFileRoute } from '@tanstack/react-router'
import { LocalReplyHistory } from '@/features/local-workbench/local-record-pages'

export const Route = createFileRoute('/_workbench/reply-history/')({
  component: LocalReplyHistory,
})
