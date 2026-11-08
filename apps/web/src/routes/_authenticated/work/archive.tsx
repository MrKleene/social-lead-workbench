import { createFileRoute } from '@tanstack/react-router'
import { LocalHistory } from '@/features/local-workbench/local-history'

export const Route = createFileRoute('/_authenticated/work/archive')({
  component: () => <LocalHistory key='runs' tab='runs' />,
})
