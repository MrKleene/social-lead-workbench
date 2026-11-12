import type { ReactNode } from "react";
import { Separator } from "@/components/ui/separator";

/**
 * 内容块。照 shadcn-admin 的 `features/settings/components/content-section.tsx`：
 * 标题 + 描述 + 分隔线 + 内容，**不套卡片**。
 *
 * 为什么不用 `SectionCard`：设置/详情类页面的主体本来就是「一屏文档」，
 * 外面再包一圈边框会让页面变成「卡片里放卡片」。分层用 `Separator` 更轻，
 * 也和 shadcn-admin 的 Settings 一致。列表类页面（采集归档、回复记录）仍用
 * `SectionCard`——那里卡片是用来分隔独立记录的。
 */
export function ContentSection({
  title,
  description,
  actions,
  children,
  className,
  ...props
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
} & Omit<React.ComponentProps<"div">, "title" | "children">) {
  const hasHeader = Boolean(title || description || actions);
  return (
    <div className={className} {...props}>
      {hasHeader ? (
        <>
          {/* min-h-9 同上：有动作按钮（36px）与没有时高度一致。 */}
          <div className="flex min-h-9 flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              {title ? (
                <h2 className="text-section font-semibold break-words">
                  {title}
                </h2>
              ) : null}
              {description ? (
                <p className="text-body text-muted-foreground break-words">
                  {description}
                </p>
              ) : null}
            </div>
            {actions ? (
              <div className="flex flex-wrap items-center gap-3">{actions}</div>
            ) : null}
          </div>
          <Separator className="my-4" />
        </>
      ) : null}
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}
