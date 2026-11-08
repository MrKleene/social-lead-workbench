import { HardDrive } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

/**
 * The desktop build has no account: everything runs against the local SQLite
 * database for a single operator. This replaces the web variant's account menu
 * so the header keeps the same shape without pretending a session exists.
 */
export function ProfileDropdown() {
  return (
    <Badge variant='outline' className='gap-1.5 py-1.5'>
      <HardDrive className='size-3.5' aria-hidden='true' />
      本机存储
    </Badge>
  )
}
