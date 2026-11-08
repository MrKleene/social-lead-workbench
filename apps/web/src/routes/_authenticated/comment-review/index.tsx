import { createFileRoute } from '@tanstack/react-router'
import { LocalHistory } from '@/features/local-workbench/local-history'

export const Route = createFileRoute('/_authenticated/comment-review/')({
  component: () => <LocalHistory key='reviews' tab='reviews' />,
})
