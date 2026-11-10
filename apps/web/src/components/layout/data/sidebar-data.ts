import {
  Archive,
  Database,
  Inbox,
  ListChecks,
  PlayCircle,
  ScanLine,
  Send,
  Settings2,
  ShieldCheck,
  SquareStack,
  UsersRound,
} from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  navGroups: [
    {
      title: '工作区',
      items: [
        { title: '概览', url: '/work', icon: SquareStack },
        { title: '自动化任务', url: '/automation', icon: PlayCircle },
      ],
    },
    {
      title: '数据与审核',
      items: [
        { title: '采集归档', url: '/work/archive', icon: Archive },
        { title: '评论审核', url: '/comment-review', icon: ScanLine },
      ],
    },
    {
      title: '回复管理',
      items: [
        { title: '自动回复', url: '/auto-contact', icon: Send },
        { title: '待处理回复', url: '/auto-contact/pending', icon: ListChecks },
        { title: '回复记录', url: '/reply-history', icon: Archive },
        { title: '消息通知', url: '/inbox', icon: Inbox },
      ],
    },
    {
      title: '管理',
      items: [
        { title: '配置管理', url: '/configuration', icon: Settings2 },
        { title: '账号中心', url: '/work/accounts', icon: UsersRound },
        { title: '运行异常', url: '/work/notices', icon: Archive },
        { title: '平台能力', url: '/platforms', icon: ShieldCheck },
        { title: '数据与恢复', url: '/data', icon: Database },
      ],
    },
  ],
}
