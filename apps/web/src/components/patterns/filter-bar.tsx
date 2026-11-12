import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 筛选/工具条。替代 `.local-filterbar`（8 处）。
 *
 * 控件之间 12px（`DESIGN.md` §5「表单控件之间」）。**不自带上下外边距**：
 * 页面里它和 `SectionCard` 都是外壳 `main`（`gap-4`）的直接子元素，
 * 自己再加 margin 会叠成 32px，破坏纵向节奏。
 */
export function FilterBar({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("flex flex-wrap items-end gap-3", className)}
    >
      {children}
    </div>
  );
}

/**
 * 带标签的筛选项。标签在上、控件在下，间距 8px（`DESIGN.md` §5）。
 *
 * `min-w-40`(160px) 是防塌陷下限：没有它，flex 行里的输入框会被压到读不出内容。
 *
 * 用包裹式 `<label>` 而不是 `htmlFor` + `id`：控件是原生表单元素时，
 * 包裹即可建立关联，也省掉每个调用点管理 id。
 */
export function FilterField({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex min-w-40 flex-col gap-2", className)}>
      <span className="text-caption text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
