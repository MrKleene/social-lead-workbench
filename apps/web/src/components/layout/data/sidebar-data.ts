import {
  Archive,
  Bell,
  ContactRound,
  House,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  MessagesSquare,
  Play,
  ScanLine,
  Send,
  Settings2,
  ShieldCheck,
} from 'lucide-react'
import type { NavGroup, SidebarData } from '../types'

type BuildArgs = {
  user: SidebarData['user']
  /** Unread messages for the notifications badge. */
  unread?: number
}

export function buildSidebarData({ user, unread }: BuildArgs): SidebarData {
  const badge =
    unread && unread > 0 ? (unread > 99 ? '99+' : String(unread)) : undefined
  return {
    user,
    navGroups: [
      {
        title: '工作区',
        items: [
          { title: '概览', url: '/', icon: LayoutDashboard },
          {
            title: '自动化任务',
            url: '/tasks/collect',
            icon: Play,
            adminOnly: true,
            matchPrefix: ['/tasks'],
          },
        ],
      },
      {
        title: '数据与审核',
        items: [
          {
            title: '采集信息',
            url: '/collection',
            icon: Archive,
            adminOnly: true,
          },
          {
            title: '评论审核',
            url: '/reviews',
            icon: ScanLine,
            adminOnly: true,
          },
        ],
      },
      {
        title: '回复管理',
        items: [
          { title: '自动回复', url: '/replies', icon: Send, adminOnly: true },
          {
            title: '待处理回复',
            url: '/replies/pending',
            icon: ListChecks,
            adminOnly: true,
          },
          {
            title: '回复记录',
            url: '/reply-history',
            icon: MessageSquare,
            adminOnly: true,
          },
          {
            title: '消息通知',
            url: '/notifications',
            icon: MessagesSquare,
            adminOnly: true,
            badge,
          },
        ],
      },
      {
        title: '管理',
        items: [
          {
            title: '配置管理',
            icon: Settings2,
            adminOnly: true,
            matchPrefix: ['/settings'],
            items: [
              { title: '采集关键词', url: '/settings/keywords' },
              { title: '评论匹配方案', url: '/settings/matching' },
              { title: '评论模板', url: '/settings/templates' },
              { title: '私信模板', url: '/settings/dm-templates' },
              { title: '模型设置', url: '/settings/model' },
            ],
          },
          { title: '账号中心', url: '/accounts', icon: ContactRound },
          {
            title: '运行异常',
            url: '/errors',
            icon: Bell,
            adminOnly: true,
          },
          { title: '平台能力', url: '/platforms', icon: ShieldCheck },
          { title: '首页介绍', url: '/home', icon: House },
        ],
      },
    ],
  }
}

/**
 * Drops admin-only entries (and groups left empty) for non-admin sessions.
 * Both the sidebar and the command menu call this so the two never diverge.
 */
export function visibleNavGroups(
  groups: NavGroup[],
  isAdmin: boolean
): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items
        .filter((item) => isAdmin || !item.adminOnly)
        .map((item) =>
          item.items
            ? {
                ...item,
                items: item.items.filter((sub) => isAdmin || !sub.adminOnly),
              }
            : item
        )
        .filter((item) => !item.items || item.items.length > 0),
    }))
    .filter((group) => group.items.length > 0)
}
