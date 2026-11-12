import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { JourneyStage } from "@/features/work/journey-model";

/** `tab` 为 null 表示环境问题（平台组件/凭据），没有可跳转的设置页。 */
export type MissingItem = { tab: JourneyStage | null; text: string };

/**
 * 开始采集前的缺配置清单。
 *
 * 所有前置条件都走这一个弹窗：能定位的带「去设置」，环境类只列文字。
 * 不再出现「有时弹这个、有时在开始弹窗里显示红字」两种样式。
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
              key={item.text}
              className="flex items-center justify-between gap-3 py-3"
            >
              <span className="text-body break-words">{item.text}</span>
              {item.tab ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onOpenChange(false);
                    onLocate(item.tab as JourneyStage);
                  }}
                >
                  去设置
                </Button>
              ) : null}
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
