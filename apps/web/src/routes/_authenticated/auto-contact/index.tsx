import { createFileRoute } from '@tanstack/react-router'
import { LocalAutomation } from '@/features/local-workbench/local-automation'

export const Route = createFileRoute('/_authenticated/auto-contact/')({
  component: () => (
    <>
      <h1>自动回复与账号矩阵</h1>
      <LocalAutomation />
    </>
  ),
})
