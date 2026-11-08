import { createFileRoute } from '@tanstack/react-router'
import { LocalNotices } from '@/features/local-workbench/local-record-pages'

export const Route = createFileRoute('/_authenticated/work/notices')({
  component: LocalNotices,
})
