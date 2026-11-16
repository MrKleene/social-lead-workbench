import { ArrowRight, Layers, ListChecks, Monitor, ScanLine } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type WelcomeDestination = '/work/accounts' | '/work'

const steps = [
  { title: '连接平台账号', description: '扫码连接账号，确认平台登录状态。', icon: ScanLine },
  { title: '配置模型', description: '按需添加模型服务，用于内容分析与回复。', icon: Layers },
  { title: '创建采集任务', description: '设置关键词，开始整理你的第一批笔记与评论。', icon: ListChecks },
]

type WelcomeProps = {
  onContinue: (destination: WelcomeDestination) => void
  pending?: boolean
  error?: string
}

export function Welcome({ onContinue, pending = false, error }: WelcomeProps) {
  return (
    <section aria-labelledby='welcome-title' className='mx-auto w-full max-w-5xl break-words px-4 py-10 text-body leading-relaxed sm:px-6 sm:py-16'>
      <header className='text-center'>
        <div className='mb-8 inline-flex items-center gap-4 text-start'>
          <Layers className='size-10' aria-hidden='true' />
          <div>
            <p className='text-section font-semibold'>Lead Workbench</p>
            <p className='text-caption text-muted-foreground'>本地工作台</p>
          </div>
        </div>
        <h1 id='welcome-title' className='text-display font-semibold'>欢迎使用线索工作台</h1>
      </header>

      <div className='mt-6 flex flex-col gap-4 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:p-6'>
        <Monitor className='size-8 shrink-0' aria-hidden='true' />
        <div>
          <h2 className='text-section font-semibold'>为你的本地工作准备就绪</h2>
          <p className='mt-2 text-muted-foreground'>工作数据保存在本机。连接平台和使用模型时，相关请求会发送至对应服务。</p>
        </div>
      </div>

      <ol className='mt-6 grid gap-4 md:grid-cols-3'>
        {steps.map(({ title, description, icon: Icon }, index) => (
          <li key={title} className='rounded-lg border bg-card p-4 sm:p-6'>
            <p className='text-caption text-muted-foreground'>0{index + 1}</p>
            <Icon className='mt-4 size-8' aria-hidden='true' />
            <h2 className='mt-4 text-section font-semibold'>{title}</h2>
            <p className='mt-2 text-muted-foreground'>{description}</p>
          </li>
        ))}
      </ol>

      <div className='mt-10 text-center'>
        {error ? <p role='alert' className='mb-4 text-destructive'>{error}</p> : null}
        <div className='flex flex-col justify-center gap-4 sm:flex-row'>
          <Button size='lg' pending={pending} onClick={() => onContinue('/work/accounts')}>
            连接账号 <ArrowRight aria-hidden='true' />
          </Button>
          <Button size='lg' variant='outline' pending={pending} onClick={() => onContinue('/work')}>
            先进入工作台
          </Button>
        </div>
        {pending ? (
          <p role='status' className='mt-4 text-caption text-muted-foreground'>
            正在打开本地工作台…
          </p>
        ) : null}
      </div>
      <footer className='mt-10 border-t pt-6 text-center text-caption text-muted-foreground'>无需注册工作台账号</footer>
    </section>
  )
}
