import { createFileRoute } from '@tanstack/react-router'
import { LocalCommentReview } from '@/features/local-workbench/local-comment-review'

export const Route = createFileRoute('/_workbench/comment-review/')({
  component: LocalCommentReview,
})
