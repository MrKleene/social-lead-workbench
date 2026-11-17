import {
  Archive,
  Database,
  Inbox,
  Layers,
  ListChecks,
  PlayCircle,
  ScanLine,
  Settings2,
  ShieldCheck,
  SquareStack,
  UsersRound,
} from 'lucide-react'
import { type SidebarData } from '../types'

/**
 * 侧栏数据。结构照 shadcn-admin 的 `sidebarData`（`user` / `teams` / `navGroups`），
 * 内容换成本项目的 13 个页面。
 *
 * `teams` 只留一项：本机应用没有多团队，`TeamSwitcher` 因此退化成静态品牌块
 * （外观与框架一致，只是没有可切换项）。`user` 同理——没有登录用户，
 * 放的是「本地工作台 / 本机数据」。
 */
export const sidebarData: SidebarData = {
  user: {
    name: '本地工作台',
    email: '本机数据',
    avatar: '',
  },
  teams: [
    {
      name: 'Social Lead',
      logo: Layers,
      plan: '本机工作台',
    },
  ],
  navGroups: [
    {
      title: '工作区',
      items: [
        { title: '仪表盘', url: '/', icon: SquareStack },
        { title: '自动化任务', url: '/automation', icon: PlayCircle },
        { title: '采集历史', url: '/work/archive', icon: Archive },
      ],
    },
    {
      title: '数据与审核',
      items: [{ title: '评论审核', url: '/comment-review', icon: ScanLine }],
    },
    {
      title: '回复管理',
      items: [
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
