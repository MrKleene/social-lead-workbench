import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AuthLayout } from '../auth-layout'
import { OtpForm } from './components/otp-form'

export function Otp() {
  return (
    <AuthLayout>
      <Card className='max-w-md gap-4'>
        <CardHeader>
          <CardTitle className='text-base tracking-tight'>两步验证</CardTitle>
        </CardHeader>
        <CardContent>
          <OtpForm />
        </CardContent>
      </Card>
    </AuthLayout>
  )
}
