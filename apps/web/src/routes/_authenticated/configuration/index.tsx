import { createFileRoute } from '@tanstack/react-router'
import { LocalConfigurations } from '@/features/local-workbench/local-configurations'

export const Route = createFileRoute('/_authenticated/configuration/')({
  component: LocalConfigurations,
})
