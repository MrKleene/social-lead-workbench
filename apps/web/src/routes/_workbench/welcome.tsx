import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Welcome } from '@/features/onboarding/welcome'

export const Route = createFileRoute('/_workbench/welcome')({
  component: WelcomePage,
})

function WelcomePage() {
  const navigate = useNavigate()
  return <Welcome onContinue={(to) => void navigate({ to })} />
}
