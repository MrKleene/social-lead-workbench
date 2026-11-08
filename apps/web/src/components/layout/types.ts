import { type LinkProps } from '@tanstack/react-router'

type User = {
  name: string
  email: string
  avatar?: string
}

type BaseNavItem = {
  title: string
  badge?: string
  icon?: React.ElementType
  /** Hidden from non-admin sessions; the route guard blocks the URL too. */
  adminOnly?: boolean
  /** Extra path prefixes that should keep this item highlighted. */
  matchPrefix?: string[]
}

type NavLink = BaseNavItem & {
  url: LinkProps['to'] | (string & {})
  items?: never
}

type NavCollapsible = BaseNavItem & {
  items: (BaseNavItem & { url: LinkProps['to'] | (string & {}) })[]
  url?: never
}

type NavItem = NavCollapsible | NavLink

type NavGroup = {
  title: string
  items: NavItem[]
}

type SidebarData = {
  user: User
  navGroups: NavGroup[]
}

export type { SidebarData, NavGroup, NavItem, NavCollapsible, NavLink }
