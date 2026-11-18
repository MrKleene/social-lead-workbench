import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

function pageWindow(page: number, pageCount: number): (number | "left" | "right")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, "right", pageCount];
  if (page >= pageCount - 3)
    return [1, "left", pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1, pageCount];
  return [1, "left", page - 1, page, page + 1, "right", pageCount];
}

/**
 * 列表分页。替代三套重复实现（`Pages` / `LocalPagination` / inbox 内联 `<nav>`）。
 *
 * - 无数据时整体不渲染；只有一页且允许改每页条数时仍渲染。
 * - 页码 + 首/上/下/末，按钮 36px，满足 `AGENTS.md` §5。
 * - 页码用 `tabular-nums`，位数变化不抖（`DESIGN.md` §3）。
 */
export function Pagination({
  page,
  total,
  pageSize = 30,
  onPageChange,
  label = "分页",
  countLabel = "条",
  pageSizeOptions,
  onPageSizeChange,
  className,
}: {
  page: number;
  total: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  label?: string;
  countLabel?: string;
  pageSizeOptions?: number[];
  onPageSizeChange?: (pageSize: number) => void;
  className?: string;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(page, 1), pageCount);
  if (total <= 0) return null;
  if (pageCount <= 1 && !pageSizeOptions?.length) return null;

  return (
    <nav
      aria-label={label}
      className={cn(
        "mt-4 flex flex-wrap items-center justify-between gap-3",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <span className="text-caption text-muted-foreground tabular-nums">
          共 {total} {countLabel}
        </span>
        {pageSizeOptions?.length && onPageSizeChange ? (
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              onPageSizeChange(Number(value));
              onPageChange(1);
            }}
          >
            <SelectTrigger className="h-9 w-[148px]" aria-label="每页条数">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} 条/页
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-caption text-muted-foreground tabular-nums">
          第 {current} / {pageCount} 页
        </span>
        <Button
          variant="outline"
          size="icon"
          aria-label="第一页"
          disabled={current <= 1}
          onClick={() => onPageChange(1)}
        >
          <ChevronFirst />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="上一页"
          disabled={current <= 1}
          onClick={() => onPageChange(current - 1)}
        >
          <ChevronLeft />
        </Button>
        {pageWindow(current, pageCount).map((entry) =>
          typeof entry === "number" ? (
            <Button
              key={entry}
              variant={entry === current ? "default" : "outline"}
              size="icon"
              aria-label={`第 ${entry} 页`}
              aria-current={entry === current ? "page" : undefined}
              onClick={() => onPageChange(entry)}
              className="tabular-nums"
            >
              {entry}
            </Button>
          ) : (
            <span
              key={entry}
              aria-hidden="true"
              className="w-6 text-center text-caption text-muted-foreground"
            >
              …
            </span>
          ),
        )}
        <Button
          variant="outline"
          size="icon"
          aria-label="下一页"
          disabled={current >= pageCount}
          onClick={() => onPageChange(current + 1)}
        >
          <ChevronRight />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="最后一页"
          disabled={current >= pageCount}
          onClick={() => onPageChange(pageCount)}
        >
          <ChevronLast />
        </Button>
      </div>
    </nav>
  );
}
