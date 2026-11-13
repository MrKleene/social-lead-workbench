import * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-16 w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-base transition-[color,box-shadow] outline-none placeholder:text-faint disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-muted",
        // 焦点与 Input 同一套（DESIGN.md §4/§7）。
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
