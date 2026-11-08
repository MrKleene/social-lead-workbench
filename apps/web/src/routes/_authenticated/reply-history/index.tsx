import { createFileRoute } from '@tanstack/react-router'
import { LocalReplyHistory } from '@/features/local-workbench/local-record-pages'

export const Route = createFileRoute('/_authenticated/reply-history/')({
  component: LocalReplyHistory,
})
