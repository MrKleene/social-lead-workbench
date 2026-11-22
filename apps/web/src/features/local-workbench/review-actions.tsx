import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { LocalReview, ReviewComment } from "./local-api";
import { stateLabels } from "./review-model";

export function ReviewDecisionActions({
  row,
  state,
  onDecide,
  onContact,
  onOpen,
  pending,
  canApprove,
  approveHint,
}: {
  row: LocalReview;
  state?: ReviewComment["state"];
  onDecide: (status: "APPROVED") => void;
  onContact: () => void;
  onOpen: () => void;
  pending: boolean;
  canApprove: boolean;
  approveHint?: string;
}) {
  const unreviewed = state && state !== "REVIEWED";
  return (
    <div className="flex flex-nowrap items-center justify-end gap-1 whitespace-nowrap">
      {unreviewed ? (
        <span className="text-caption text-muted-foreground">
          {stateLabels[state]}
        </span>
      ) : row.queue_state ? (
        <span className="text-caption text-muted-foreground">已入队</span>
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
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
