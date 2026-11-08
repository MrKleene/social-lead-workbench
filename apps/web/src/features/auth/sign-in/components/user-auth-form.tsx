import { useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { Loader2, LogIn } from 'lucide-react'
import { toast } from 'sonner'
import {
  DEMO_ACCOUNT,
  SESSION_TTL_MS,
  verifyDemoAccount,
} from '@/lib/demo-account'
import { setSession } from '@/lib/session'
import { sleep, cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/password-input'

const formSchema = z.object({
  email: z.email({
    error: (iss) => (iss.input === '' ? '请输入邮箱。' : undefined),
  }),
  password: z.string().min(1, '请输入密码。'),
})

interface UserAuthFormProps extends React.HTMLAttributes<HTMLFormElement> {
  redirectTo?: string
}

export function UserAuthForm({
  className,
  redirectTo,
  ...props
}: UserAuthFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: DEMO_ACCOUNT.email,
      password: DEMO_ACCOUNT.password,
    },
  })

  async function onSubmit(data: z.infer<typeof formSchema>) {
    setIsLoading(true)
    await sleep(400)

    if (!verifyDemoAccount(data.email, data.password)) {
      setIsLoading(false)
      form.setError('password', { message: '账号或密码不正确' })
      return
    }

    setSession({
      token: 'local-demo-token',
      user: {
        accountNo: DEMO_ACCOUNT.accountNo,
        email: DEMO_ACCOUNT.email,
        name: DEMO_ACCOUNT.name,
        role: ['user'],
        exp: Date.now() + SESSION_TTL_MS,
      },
    })

    setIsLoading(false)
    toast.success(`欢迎回来，${DEMO_ACCOUNT.name}`)
    const target = redirectTo?.startsWith('/') ? redirectTo : '/work'
    navigate({ href: target, replace: true })
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('grid gap-3', className)}
        {...props}
      >
        <FormField
          control={form.control}
          name='email'
          render={({ field }) => (
            <FormItem>
              <FormLabel>邮箱</FormLabel>
              <FormControl>
                <Input
                  placeholder='name@example.com'
                  autoComplete='username'
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='password'
          render={({ field }) => (
            <FormItem>
              <FormLabel>密码</FormLabel>
              <FormControl>
                <PasswordInput
                  placeholder='********'
                  autoComplete='current-password'
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button className='mt-2' pending={isLoading}>
          {isLoading ? <Loader2 className='animate-spin' /> : <LogIn />}
          登录
        </Button>
        <p className='text-center text-xs text-muted-foreground'>
          本机演示账号已预填：{DEMO_ACCOUNT.email} / {DEMO_ACCOUNT.password}
        </p>
      </form>
    </Form>
  )
}
