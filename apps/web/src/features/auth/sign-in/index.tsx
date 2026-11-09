import { Link, useSearch } from '@tanstack/react-router'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AuthLayout } from '../auth-layout'
import { UserAuthForm } from './components/user-auth-form'

export function SignIn() {
  const { redirect } = useSearch({ from: '/(auth)/sign-in' })

  return (
    <AuthLayout>
      <Card className='max-w-sm gap-4'>
        <CardHeader>
          <CardTitle className='text-section tracking-tight'>登录</CardTitle>
          <CardDescription>
            输入邮箱和密码登录。
            <br className='max-sm:hidden' /> 还没有账号？{' '}
            <Link
              to='/sign-up'
              className='text-nowrap underline underline-offset-4 hover:text-primary'
            >
              注册
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UserAuthForm redirectTo={redirect} />
        </CardContent>
        <CardFooter>
          <p className='px-8 text-center text-sm text-muted-foreground'>
            点击登录即表示同意
            <span className='underline underline-offset-4'>服务条款</span>
            和
            <span className='underline underline-offset-4'>隐私政策</span>。
          </p>
        </CardFooter>
      </Card>
    </AuthLayout>
  )
}
