import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 记录列表。替代 `.local-config-list`（15 处）/ `.local-messages`。
 *
 * 行间用 `divide-y` 出 1px 分隔线，不套卡片、不用阴影（`DESIGN.md` §6）。
 */
export function RecordList({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <ul aria-label={label} className={cn("divide-y", className)}>
      {children}
    </ul>
  );
}

/**
 * 记录行：左侧标题/元信息/正文，右侧动作。
 *
 * 窄屏（<640px）动作落到正文下方：并排会把正文压到 160px 左右，
 * 中文一句话被折成两行且断在词中间。
 *
 * 动作区 `shrink-0`，正文 `min-w-0` + `break-words`，中文长文本不会撑破容器。
 */
export function RecordItem({
  title,
  meta,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <li
      className={cn(
        "flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title ? (
          <p className="text-body font-medium break-words">{title}</p>
        ) : null}
        {meta ? (
          <p className="text-caption text-muted-foreground break-words">
            {meta}
          </p>
        ) : null}
        {children ? (
          <div className="text-body leading-relaxed text-muted-foreground break-words">
            {children}
          </div>
        ) : null}
      </div>
      {action ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>
      ) : null}
    </li>
  );
}
