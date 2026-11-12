import type { ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/**
 * 复选框 + 文字说明。替代 `.local-check`（20 处授权块 + 若干筛选勾选）。
 *
 * 说明文字与复选框文字左对齐（`ps-6` = 复选框 16px + 间隙 8px），
 * 不写死在调用点。
 *
 * 授权类文案必须**完整描述后果**，不要用本组件去压缩措辞——
 * 这些勾选是产品里唯一的人工确认点。
 */
export function CheckboxField({
  checked,
  onCheckedChange,
  disabled,
  children,
  hint,
  ariaLabel,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
  hint?: ReactNode;
  /**
   * 需要覆盖可访问名称时用（例如文案会随状态变化，标签文字不再稳定）。
   * 设了它，读屏和 `getByLabel` 都按这个走。
   */
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <label className="flex items-start gap-2 text-body leading-relaxed">
        <Checkbox
          checked={checked}
          onCheckedChange={(value) => onCheckedChange(value === true)}
          disabled={disabled}
          aria-label={ariaLabel}
          className="mt-0.5"
        />
        <span className="min-w-0 break-words">{children}</span>
      </label>
      {hint ? (
        <p className="ps-6 text-caption leading-relaxed text-muted-foreground break-words">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
