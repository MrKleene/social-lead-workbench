import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/patterns/page-header'
import { LocalAutomation } from '@/features/local-workbench/local-automation'

export const Route = createFileRoute('/_workbench/auto-contact/')({
  component: () => (
    <>
      <PageHeader title='自动回复与账号矩阵' />
      <LocalAutomation />
    </>
  ),
})
