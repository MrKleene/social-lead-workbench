"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

/**
 * Switch（shadcn `new-york` 源）。
 * 相对上游去掉拇指阴影——DESIGN §6 阴影只给浮层；开关靠位置和底色区分状态。
 */
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent transition-colors outline-none",
        "data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted-foreground/40",
        "focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function SwitchThumb({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Thumb>) {
  return (
    <SwitchPrimitive.Thumb
      data-slot="switch-thumb"
      className={cn(
        "pointer-events-none block size-4 rounded-full bg-card ring-0 transition-transform",
        "data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0",
        className,
      )}
      {...props}
    />
  );
}

export { Switch, SwitchThumb };
