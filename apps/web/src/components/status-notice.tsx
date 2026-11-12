import { useRef, useState } from "react";
import { CircleAlert, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * 紧凑状态条：一行风险标签 + 可选的「查看原因」。
 *
 * 风险标签**永不隐藏**——`attention` 时图标换成警示符号并把文字转成
 * `text-attention`。原因放在抽屉里，因为可能有多条，展开会把列表挤走。
 *
 * 抽屉宽度用 `min(480px, 100vw-24px)`：窄屏留 12px 边距，避免贴边。
 */
export function StatusNotice({
  label,
  details,
  attention = false,
}: {
  label: string;
  details?: string[];
  attention?: boolean;
}) {
  const trigger = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const lines = [...new Set(details?.filter(Boolean))];
  const Icon = attention ? CircleAlert : Info;

  return (
    <div className="mb-4 flex items-center gap-2 py-1 text-caption leading-relaxed">
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={cn(
          "flex min-w-0 items-center gap-2 break-words",
          attention ? "text-attention" : "text-muted-foreground",
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </div>
      {lines.length > 0 ? (
        <>
          <Button
            ref={trigger}
            variant="ghost"
            size="sm"
            className="ms-auto shrink-0"
            onClick={() => setOpen(true)}
          >
            查看原因
          </Button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent
              className="h-auto max-h-[calc(100dvh-2rem)] w-[min(480px,calc(100vw-24px))] sm:max-w-[480px]"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                trigger.current?.focus();
              }}
            >
              <SheetHeader>
                <SheetTitle>任务状态</SheetTitle>
                <SheetDescription className="sr-only">
                  所选任务的状态与注意事项
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-3 overflow-auto px-4 pb-6 text-body leading-relaxed break-words">
                {lines.map((line) => (
                  <p
                    key={line}
                    className="border-t pt-3 first:border-t-0 first:pt-0"
                  >
                    {line}
                  </p>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </>
      ) : null}
    </div>
  );
}

/** 暂停原因 → 面向运营的说明。 */
export function pauseDescription(reason: string) {
  return (
    (
      {
        SUBMISSION_UNKNOWN:
          "发送结果尚未确认，已暂停发送。请勿重发或换号补发；额度与去重保护保留。",
        DM_SUBMISSION_UNKNOWN:
          "私信结果尚未确认，已暂停发送。请勿重复发送；额度与去重保护保留。",
        RATE_LIMITED: "平台触发频率限制，已暂停发送。核查限制前不换号。",
        PLATFORM_REFUSED: "平台拒绝请求，已暂停发送。核查限制前不换号。",
        ACCOUNT_RESTRICTED: "发送账号受限，已暂停发送。核查限制前不换号。",
      } as Record<string, string>
    )[reason] || `发送已暂停：${reason}。核查限制前不换号。`
  );
}
