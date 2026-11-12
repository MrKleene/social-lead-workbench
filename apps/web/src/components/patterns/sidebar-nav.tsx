import type { ReactNode } from "react";
import { Link } from "@/lib/router-compat";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

/**
 * 侧边导航。照 shadcn-admin 的 `features/settings/components/sidebar-nav.tsx`：
 * 每项是 `ghost` 按钮 + 图标，选中态 `bg-muted`。
 *
 * 与上游的两处差异：
 * - **选中项由 `activeHref` 传入**，不读 `useLocation`。本项目的分类切换靠 query
 *   （`/configuration?tab=model`），`pathname` 全一样，读 location 判断不出来。
 * - **移动端保留横向滚动**，不换成 `Select` 下拉。`router-compat` 没有暴露
 *   `useNavigate`，为一个下拉引入 navigate 不值得；横向滚动已经把「窄屏看不到
 *   其他分类」这个真问题解决了。
 */
export function SidebarNav({
  items,
  activeHref,
  className,
  ...props
}: {
  items: { href: string; title: string; icon?: ReactNode }[];
  activeHref?: string;
  className?: string;
} & Omit<React.ComponentProps<"nav">, "children">) {
  return (
    <nav
      className={cn(
        "flex gap-1 overflow-x-auto lg:flex-col lg:gap-1 lg:overflow-visible",
        className,
      )}
      {...props}
    >
      {items.map((item) => {
        const active = item.href === activeHref;
        return (
          <Link
            key={item.href}
            to={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              buttonVariants({ variant: "ghost" }),
              "h-auto min-h-10 shrink-0 justify-start px-3 py-2.5 text-start whitespace-normal",
              active ? "bg-muted hover:bg-accent" : "hover:bg-accent",
            )}
          >
            {item.icon ? (
              <span className="me-2 shrink-0" aria-hidden="true">
                {item.icon}
              </span>
            ) : null}
            {item.title}
          </Link>
        );
      })}
    </nav>
  );
}
