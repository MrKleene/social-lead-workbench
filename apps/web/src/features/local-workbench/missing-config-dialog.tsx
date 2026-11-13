import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/router-compat";
import type { JourneyStage } from "@/features/work/journey-model";

/**
 * 缺配置清单的一项。
 *
 * - `tab`：在采集设置弹窗里定位到对应页签（选项就在弹窗里）
 * - `to`：跳站内路由（例如账号只能去账号中心登录）
 *
 * 两者互斥。没有 `tab` 也没有 `to` 的项只列文字，不给按钮（环境类问题）。
 */
export type MissingItem = {
  text: string;
  tab?: JourneyStage;
  to?: string;
  /** 按钮文案，默认「去设置」。指向别处时要写清楚去哪做什么。 */
  action?: string;
};

/**
 * 开始采集前的缺配置清单。
 *
 * 所有前置条件都走这一个弹窗：能定位的带按钮，环境类只列文字。
 * 不再出现「有时弹这个、有时在开始弹窗里显示红字」两种样式。
 *
 * **不设底部关闭按钮**：右上角 X 与 Esc 已能关闭，而每一行自己的按钮才是这个弹窗的动作。
 * 底部再放一个同尺寸的「关闭」，会和「去设置」排成同一列，看起来像第四个待办项。
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
              {item.to ? (
                <Button size="sm" variant="outline" asChild>
                  <Link to={item.to} onClick={() => onOpenChange(false)}>
                    {item.action ?? "去设置"}
                  </Link>
                </Button>
              ) : item.tab ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onOpenChange(false);
                    onLocate(item.tab as JourneyStage);
                  }}
                >
                  {item.action ?? "去设置"}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
