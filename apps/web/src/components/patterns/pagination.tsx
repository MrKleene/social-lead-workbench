import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 列表分页。替代三套重复实现（`Pages` / `LocalPagination` / inbox 内联 `<nav>`）。
 *
 * - **只有一页时整体不渲染**：显示「共 1 条 · 第 1 / 1 页」加两个禁用按钮是纯噪音，
 *   空结果由 `EmptyState` 表达。
 * - 按钮用默认尺寸 36px，满足 `AGENTS.md` §5「触摸目标 ≥ 36×36px」。
 * - 上方留 16px（`DESIGN.md` §5「分页行到上方内容」）。
 * - 页码用 `tabular-nums`，位数变化不抖（`DESIGN.md` §3）。
 */
export function Pagination({
  page,
  total,
  pageSize = 30,
  onPageChange,
  label = "分页",
  countLabel = "条",
  className,
}: {
  page: number;
  total: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  label?: string;
  countLabel?: string;
  className?: string;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) return null;

  return (
    <nav
      aria-label={label}
      className={cn("mt-4 flex flex-wrap items-center gap-3", className)}
    >
      <span className="text-caption text-muted-foreground tabular-nums">
        共 {total} {countLabel} · 第 {page} / {pageCount} 页
      </span>
      <Button
        variant="outline"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        上一页
      </Button>
      <Button
        variant="outline"
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
      >
        下一页
      </Button>
    </nav>
  );
}
