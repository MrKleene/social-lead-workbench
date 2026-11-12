import type { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * 详情抽屉。替代 5 处手写 `<Sheet>` + `.local-detail-sheet` 的宽度强制覆盖
 * （那条 `ALLOWED` 例外也随之可以删掉）。
 *
 * 宽度用 `sm:max-w-xl`（576px）而不是任意值；内容区自己滚，标题区固定。
 */
export function DetailSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className={cn("w-full gap-0 overflow-y-auto sm:max-w-xl", className)}
      >
        <SheetHeader>
          <SheetTitle className="text-section">{title}</SheetTitle>
          {description ? (
            <SheetDescription>{description}</SheetDescription>
          ) : null}
        </SheetHeader>
        <div className="flex flex-col gap-5 px-4 pb-6">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

/** 描述列表容器。`<dl>` 里每个 `DetailItem` 是一个 `div`（合法结构）。 */
export function DetailList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <dl className={cn("grid gap-4", className)}>{children}</dl>;
}

/** 描述列表项：12px 次级标签 + 14px 值。 */
export function DetailItem({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-body leading-relaxed break-words">{children}</dd>
    </div>
  );
}
