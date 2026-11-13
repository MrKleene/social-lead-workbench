import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 页面标题区。结构照 shadcn-admin 普通页面的写法（`features/tasks/index.tsx` 等），
 * 但**字号和字重按本项目的 vercel 规范收敛**：
 *
 * ```tsx
 * <div className='flex flex-wrap items-end justify-between gap-2'>
 *   <div>
 *     <h2 className='text-display font-semibold leading-snug'>Tasks</h2>
 *     <p className='text-body text-muted-foreground'>…</p>
 *   </div>
 *   <PrimaryButtons />
 * </div>
 * ```
 *
 * 四点：
 * 1. **是 `h2` 不是 `h1`**。框架的普通页用 h2，只有 Settings 用 h1。
 * 2. **24px / 600**：字号走 token `text-display`（24px），字重守 `DESIGN.md` §3 的
 *    600 天花板。框架原本用 700，为统一规范改成 600——视觉上几乎无差，
 *    但不再需要为它登记例外。
 * 3. **不加负字距**：框架原本带 `tracking-tight`（-0.025em），但本项目页面标题全是
 *    中文，负字距会把汉字挤在一起（`DESIGN.md` §3「CJK 规则」）。负字距只用于纯 Latin 标题，
 *    需要时由调用点自己加。
 * 4. **不带外边距**：纵向节奏由外壳 `<Main className='flex flex-1 flex-col gap-4 sm:gap-6'>` 给。
 *
 * 只有 Dashboard 那种"分组 tab 页"才在 Header 里放 `TopNav`，普通页是 `Search me-auto`。
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // min-h-9：有动作按钮和没有动作按钮时整块高度一致（按钮 36px），
        // 否则切页签时标题下方的间距会跳。
        "flex min-h-9 flex-wrap items-end justify-between gap-2",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-display leading-snug font-semibold break-words">
          {title}
        </h2>
        {description ? (
          <p className="text-body leading-relaxed text-muted-foreground break-words">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
