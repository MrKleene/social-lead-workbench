import { createFileRoute } from '@tanstack/react-router'
import { LocalPostsPage } from '@/features/local-workbench/local-posts-page'

export const Route = createFileRoute('/_workbench/posts/')({
  component: LocalPostsPage,
})
