"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

/**
 * Tabs（shadcn `new-york` 源）。
 *
 * 相对上游按本项目规范收敛了三处：
 * 1. 尺寸走 Tailwind 刻度（`h-9` / `p-1` / `h-7`），不用像素任意值——`ui:check` 会拦。
 * 2. 选中态用表面差（`bg-card`）而不是 `shadow-sm`——DESIGN §6 阴影只给浮层。
 * 3. 圆角：列表 `rounded-md`（控件尺度），内部滑块 `rounded-sm`。
 */
function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-4", className)}
      {...props}
    />
  );
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "inline-flex h-9 w-fit items-center justify-center gap-1 rounded-md border bg-muted p-1",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-sm border border-transparent px-3 text-body font-medium whitespace-nowrap text-muted-foreground transition-colors",
        "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        "data-[state=active]:border-border data-[state=active]:bg-card data-[state=active]:text-foreground",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("min-w-0 flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
