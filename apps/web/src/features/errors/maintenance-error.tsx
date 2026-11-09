import { Button } from '@/components/ui/button'

export function MaintenanceError() {
  return (
    <div className='h-svh'>
      <div className='m-auto flex h-full w-full flex-col items-center justify-center gap-2'>
        <h1 className='text-hero leading-tight font-semibold'>503</h1>
        <span className='font-medium'>系统维护中</span>
        <p className='text-center text-muted-foreground'>
          服务暂时不可用，<br />
          请稍后回来。
        </p>
        <div className='mt-6 flex gap-4'>
          <Button variant='outline'>了解更多</Button>
        </div>
      </div>
    </div>
  )
}
