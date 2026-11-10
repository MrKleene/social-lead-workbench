import { createFileRoute } from '@tanstack/react-router'
import { WorkbenchShell } from '@/components/layout/workbench-shell'

export const Route = createFileRoute('/_workbench')({
  component: WorkbenchShell,
})
