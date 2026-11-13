import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 空状态。替代 `.local-empty`（CSS 里根本不存在，所以一直渲染成普通正文）
 * 和散落的裸 `<p>`。
 *
 * **它本身不带边框、底色和左右内边距**——空状态几乎总是出现在 `SectionCard` 里，
 * 自带边框会变成「卡片套卡片」（`DESIGN.md` §4 明令禁止）；自带 `px-6` 则会和
 * `CardContent` 的 24px 叠成 48px，同一张卡片里列表行从 24px 起、空态文字却从 48px 起。
 * 需要独立的带框空状态时，外面套一层 `SectionCard`。
 */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("py-8 text-center", className)}>
      <p className="text-body leading-relaxed text-muted-foreground break-words">
        {title}
      </p>
      {description ? (
        <p className="mt-2 text-caption leading-relaxed text-muted-foreground break-words">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
