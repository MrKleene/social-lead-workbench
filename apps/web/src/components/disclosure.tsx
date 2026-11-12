import { useState, type ComponentProps, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "./ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";

/**
 * 可折叠区块。基于 `Collapsible`，替代手写 `<details>/<summary>`。
 *
 * 为什么不用原生 `<details>`：原生元素的三角标记无法统一，没有展开动画，
 * 且和 `Collapsible` 的 `data-state` 事件模型不同——同一页面里两套折叠行为
 * 会让键盘操作不一致。
 *
 * 触发器用 `ghost` + `size="content"`，左侧负外边距把 ghost 的 padding 抵掉，
 * 让标题和上方正文左对齐。
 *
 * **箭头旋转用内联 `transform`，不是 Tailwind 类**：试过
 * `group-data-[state=open]:rotate-180`（`asChild` 让 Trigger 与 Button 同元素，
 * 没有祖先可匹配）、`[&[data-state=open]>svg]:rotate-180`（Tailwind v4 生成独立
 * `rotate` 属性，SVG 元素不支持，计算值恒为 0deg）、
 * `[&[data-state=open]>span]:rotate-180`（规则生成了但未命中）。
 * 只有直接读状态写 `transform` 是确定的。这里只有这一个内联样式。
 */
export function Disclosure({
  title,
  children,
  className,
  open: openProp,
  defaultOpen,
  onOpenChange,
  ...props
}: Omit<ComponentProps<typeof Collapsible>, "title"> & { title: ReactNode }) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen ?? false);
  const open = openProp ?? uncontrolled;

  const handleOpenChange = (next: boolean) => {
    setUncontrolled(next);
    onOpenChange?.(next);
  };

  return (
    <Collapsible
      open={open}
      onOpenChange={handleOpenChange}
      className={className}
      {...props}
    >
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="content"
          className="-ms-2 w-full justify-start gap-2 px-2 py-1 text-left font-medium"
        >
          <span
            className="inline-flex shrink-0 transition-transform"
            style={{ transform: open ? "rotate(180deg)" : undefined }}
          >
            <ChevronDown className="size-4" aria-hidden="true" />
          </span>
          {title}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">{children}</CollapsibleContent>
    </Collapsible>
  );
}
