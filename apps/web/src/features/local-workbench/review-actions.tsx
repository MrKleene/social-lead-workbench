import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { LocalReview, ReviewComment } from "./local-api";
import { coverageLabels, stateLabels } from "./review-model";

export function ReviewDecisionActions({
  row,
  state,
  onDecide,
  onContact,
  onOpen,
  onOpenOriginal,
  pending,
  canApprove,
  canReject,
  approveHint,
  coverage,
}: {
  row: LocalReview;
  state?: ReviewComment["state"];
  onDecide: (status: "APPROVED" | "REJECTED" | "PENDING") => void;
  onContact: () => void;
  onOpen: () => void;
  onOpenOriginal: () => void;
  pending: boolean;
  canApprove: boolean;
  canReject: boolean;
  approveHint?: string;
  coverage?: string | null;
}) {
  const unreviewed = state && state !== "REVIEWED";
  const rejected = row.review_status === "REJECTED";
  return (
    <div className="flex flex-nowrap items-center justify-end gap-1 whitespace-nowrap">
      {unreviewed ? (
        <span className="text-caption text-muted-foreground">
          {stateLabels[state]}
        </span>
      ) : coverage ? (
        <span className="text-caption text-muted-foreground">
          {coverageLabels[coverage] ?? coverage}
        </span>
      ) : row.queue_state ? (
        <span className="text-caption text-muted-foreground">已入队</span>
      ) : rejected ? (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => onDecide("PENDING")}
        >
          恢复待确认
        </Button>
      ) : row.review_status === "APPROVED" ? (
        <Button variant="outline" size="sm" onClick={onContact}>
          准备联系作者
        </Button>
      ) : canApprove ? (
        <Button
          variant="default"
          size="sm"
          disabled={pending}
          onClick={() => onDecide("APPROVED")}
        >
          通过
        </Button>
      ) : canReject ? (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => onDecide("REJECTED")}
        >
          标记不符合
        </Button>
      ) : (
        <span className="text-caption text-muted-foreground">{approveHint ?? "—"}</span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="更多审核操作"
            disabled={pending}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onOpen}>查看详情</DropdownMenuItem>
          <DropdownMenuItem onSelect={onOpenOriginal}>查看原帖</DropdownMenuItem>
          {!unreviewed && !coverage && !row.queue_state && (canReject || rejected) ? (
            <DropdownMenuItem
              onSelect={() => onDecide(rejected ? "PENDING" : "REJECTED")}
            >
              {rejected ? "恢复待确认" : "标记不符合"}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
