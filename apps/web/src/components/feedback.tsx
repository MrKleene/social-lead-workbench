import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * 查询/变更失败的统一提示。
 *
 * 全站「错误」只有这一种外观：`Alert variant="destructive"` + 图标 + 说明。
 * 不要在页面里手写 `<p role="alert" className="text-destructive">`——那样既没有
 * 图标也没有边框，和其余状态提示不成体系，而且每个页面都要重写一遍。
 */
export function ErrorNotice({ error }: { error: unknown }) {
  return error ? (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertDescription>
        {error instanceof Error ? error.message : "操作失败"}
      </AlertDescription>
    </Alert>
  ) : null;
}

/**
 * 首屏加载骨架。
 *
 * 只在**整块还没有任何数据**时用。有旧数据正在后台刷新时不要用它——那会把
 * 已有内容替换成骨架，比保留旧数据更糟。
 */
export function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div
      className="flex flex-col gap-3"
      role="status"
      aria-live="polite"
      aria-label="加载中"
    >
      <span className="flex items-center gap-2 text-caption text-muted-foreground">
        <Spinner aria-hidden="true" />
        加载中
      </span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-24 w-full" />
      ))}
    </div>
  );
}
