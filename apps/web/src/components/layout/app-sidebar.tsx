import { useLayout } from '@/context/layout-provider'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'
import { sidebarData } from './data/sidebar-data'
import { NavGroup } from './nav-group'
import { NavUser } from './nav-user'
import { TeamSwitcher } from './team-switcher'

/**
 * 侧栏。结构照 shadcn-admin 的 `app-sidebar.tsx`：
 * `TeamSwitcher`（品牌块）+ `NavGroup`（分组）+ `NavUser`（底部用户）+ `SidebarRail`。
 *
 * 唯一的接缝：`SidebarContent` 加了 `role='navigation' aria-label='主导航'`——
 * 一个导航地标应该有名字，顺带也是 e2e 的定位锚点。
 */
export function AppSidebar() {
  const { collapsible, variant } = useLayout()
  return (
    <Sidebar collapsible={collapsible} variant={variant}>
      <SidebarHeader>
        <TeamSwitcher teams={sidebarData.teams} />
      </SidebarHeader>
      <SidebarContent role='navigation' aria-label='主导航'>
        {sidebarData.navGroups.map((props) => (
          <NavGroup key={props.title} {...props} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={sidebarData.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
