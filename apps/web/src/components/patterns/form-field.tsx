import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 表单项：标签在上、控件在下、提示与错误在下。
 *
 * 标签到控件 8px（`DESIGN.md` §5「表单标签到控件」）。
 * 提示与错误放在 `<label>` **外面**：放进去会被算进控件的可访问名称。
 *
 * 用包裹式 `<label>` 而不是 `htmlFor` + `id`，控件是原生表单元素时即可关联。
 */
export function FormField({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <label className="flex min-w-0 flex-col gap-2">
        <span className="text-body">{label}</span>
        {children}
      </label>
      {hint ? (
        <p className="text-caption leading-relaxed text-muted-foreground break-words">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-caption leading-relaxed text-destructive break-words">
          {error}
        </p>
      ) : null}
    </div>
  );
}
