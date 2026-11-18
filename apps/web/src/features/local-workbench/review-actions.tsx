import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { LocalReview, ReviewComment } from "./local-api";

export function ReviewDecisionActions({
  row,
  state,
  onDecide,
  onContact,
  onOpen,
  pending,
}: {
  row: LocalReview;
  state?: ReviewComment["state"];
  onDecide: (status: "APPROVED" | "REJECTED") => void;
  onContact: () => void;
  onOpen: () => void;
  pending: boolean;
}) {
  const [confirmReject, setConfirmReject] = useState(false);
  if (state && state !== "REVIEWED") {
    return <span className="text-caption text-muted-foreground">—</span>;
  }
  if (row.review_status === "REJECTED") {
    return (
      <Button variant="ghost" size="sm" onClick={onOpen}>
        查看
      </Button>
    );
  }
  return (
    <div className="flex flex-nowrap items-center justify-end gap-1 whitespace-nowrap">
      {row.review_status === "APPROVED" ? (
        <Button variant="outline" size="sm" onClick={onContact}>
          准备联系作者
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => onDecide("APPROVED")}
        >
          通过
        </Button>
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
          {row.review_status === "PENDING" ? (
            <DropdownMenuItem
              variant="destructive"
              onSelect={(event) => {
                event.preventDefault();
                setConfirmReject(true);
              }}
            >
              排除
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmReject} onOpenChange={setConfirmReject}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>排除这条评论？</AlertDialogTitle>
            <AlertDialogDescription>
              排除后不会再为这条评论准备联系。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => onDecide("REJECTED")}
            >
              排除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
