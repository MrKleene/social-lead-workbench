import { Monitor, Moon, RotateCcw, Settings, Sun, Type } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/context/theme-provider'
import { useFont } from '@/context/font-provider'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

const themes = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor },
] as const

const fonts = [
  { value: 'inter', label: 'Inter' },
  { value: 'manrope', label: 'Manrope' },
  { value: 'system', label: '系统字体' },
] as const

function Option({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
        active
          ? 'border-primary bg-accent text-accent-foreground'
          : 'hover:bg-accent/60'
      )}
    >
      {children}
    </button>
  )
}

/**
 * Appearance settings for the desktop shell. The web variant also exposes
 * sidebar/direction options; the desktop window has a fixed LTR layout, so only
 * theme and font are offered here.
 */
export function ConfigDrawer() {
  const { theme, setTheme, resetTheme } = useTheme()
  const { font, setFont, resetFont } = useFont()

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button size='icon' variant='ghost' aria-label='外观设置'>
          <Settings />
        </Button>
      </SheetTrigger>
      <SheetContent className='flex flex-col gap-6 overflow-y-auto sm:max-w-sm'>
        <SheetHeader>
          <SheetTitle>外观设置</SheetTitle>
          <SheetDescription>仅影响本机界面，不改变业务数据。</SheetDescription>
        </SheetHeader>

        <section className='flex flex-col gap-2'>
          <h3 className='text-sm font-medium'>主题</h3>
          <div className='grid grid-cols-3 gap-2'>
            {themes.map((item) => (
              <Option
                key={item.value}
                active={theme === item.value}
                onClick={() => setTheme(item.value)}
              >
                <item.icon className='size-4' aria-hidden='true' />
                {item.label}
              </Option>
            ))}
          </div>
        </section>

        <section className='flex flex-col gap-2'>
          <h3 className='flex items-center gap-1.5 text-sm font-medium'>
            <Type className='size-4' aria-hidden='true' />
            字体
          </h3>
          <div className='grid grid-cols-3 gap-2'>
            {fonts.map((item) => (
              <Option
                key={item.value}
                active={font === item.value}
                onClick={() => setFont(item.value)}
              >
                {item.label}
              </Option>
            ))}
          </div>
        </section>

        <Button
          variant='outline'
          onClick={() => {
            resetTheme()
            resetFont()
          }}
        >
          <RotateCcw />
          恢复默认
        </Button>
      </SheetContent>
    </Sheet>
  )
}
