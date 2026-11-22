import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ErrorNotice } from "@/components/feedback";
import { localApi } from "./local-api";

export function LocalInitialStateReset() {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const reset = useMutation({
    mutationFn: () => localApi("restoreInitialState"),
    onSuccess: () => {
      setOpen(false);
      setNotice("已恢复");
      void client.invalidateQueries({ queryKey: ["local"] });
    },
    onError: () => setNotice(""),
  });

  return (
    <>
      {reset.error ? <ErrorNotice error={reset.error} /> : null}
      {notice ? (
        <p role="status" className="text-body text-muted-foreground">
          {notice}
        </p>
      ) : null}

      <div>
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">恢复初始状态</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>恢复初始状态？</AlertDialogTitle>
              <AlertDialogDescription>
                删除后不可恢复。仅保留系统默认配置与已选模型。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => reset.mutate()}
              >
                恢复
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
}
