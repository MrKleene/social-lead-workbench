import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { LocalReview } from "./local-api";
import { day, decisionLabels, decisionVariant } from "./review-model";

export function ReviewDetail({
  row,
  onClose,
}: {
  row: LocalReview;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>评论审核</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={decisionVariant(row.decision)}>
              {decisionLabels[row.decision] ?? row.decision}
            </Badge>
            <span className="text-caption text-muted-foreground tabular-nums">
              {row.score} 分
            </span>
          </div>
          <p className="text-body leading-relaxed break-words whitespace-pre-wrap">
            {row.body}
          </p>
          <p className="text-caption text-muted-foreground break-words">
            {row.author_name ?? "匿名"} · {day(row.published_at)} ·{" "}
            {row.post_title ?? "无标题笔记"}
          </p>
          {row.evidence.length ? (
            <blockquote className="border-l-2 pl-4 text-body leading-relaxed text-muted-foreground break-words">
              {row.evidence.map((item) => item.quote).join(" ")}
            </blockquote>
          ) : null}
          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>
              关闭
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
