import type { ComponentProps, ReactNode } from "react";
import { Card, CardAction, CardContent, CardHeader } from "@/components/ui/card";

/**
 * 内容卡片。替代 `.local-panel` / `.configuration-detail` / `.model-configuration-content`
 * 三套手写容器。
 *
 * 度量来自 `DESIGN.md` §4/§5：内边距 24px、圆角 8px（`Card` 自带 `rounded-lg`）、
 * 只用 1px 边框分层（`Card` 的 `shadow-sm` 已按 §6「阴影仅浮层」移除）、
 * 标题到内容 16px（`Card` 的 `gap-4`）。
 *
 * **卡片里不再套卡片**：分段用 `border-t`（`DESIGN.md` §4）。
 *
 * 其余 `Card` 属性（`id` / `aria-label` / `asChild` 等）原样透传。
 */
export function SectionCard({
  title,
  description,
  actions,
  footer,
  children,
  className,
  ...props
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
} & Omit<ComponentProps<typeof Card>, "title" | "children">) {
  return (
    <Card className={className} {...props}>
      {title || description || actions ? (
        <CardHeader>
          {title ? (
            <h2 className="text-section font-semibold break-words">{title}</h2>
          ) : null}
          {description ? (
            <p className="text-body leading-relaxed text-muted-foreground break-words">
              {description}
            </p>
          ) : null}
          {actions ? <CardAction>{actions}</CardAction> : null}
        </CardHeader>
      ) : null}
      <CardContent className="flex flex-col gap-3">
        {children}
        {footer ? (
          <div className="mt-1 flex flex-wrap items-center gap-3 border-t pt-4">
            {footer}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
