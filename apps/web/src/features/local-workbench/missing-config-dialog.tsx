import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { JourneyStage } from "@/features/work/journey-model";

export type MissingItem = { tab: JourneyStage; text: string };

/**
 * 开始采集前的缺配置清单。
 * 每一项都能直接跳到对应页签去补，不需要用户自己找。
 */
export function MissingConfigDialog({
  open,
  onOpenChange,
  items,
  onLocate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: MissingItem[];
  onLocate: (tab: JourneyStage) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>需要先完成配置</DialogTitle>
        </DialogHeader>

        <ul className="flex flex-col divide-y border-t">
          {items.map((item) => (
            <li
              key={item.tab}
              className="flex items-center justify-between gap-3 py-3"
            >
              <span className="text-body break-words">{item.text}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  onLocate(item.tab);
                }}
              >
                去设置
              </Button>
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
