import { createFileRoute } from '@tanstack/react-router'
import { LocalTaskPage } from '@/features/local-workbench/local-task-page'

export const Route = createFileRoute('/_workbench/automation/')({
  component: LocalTaskPage,
})
