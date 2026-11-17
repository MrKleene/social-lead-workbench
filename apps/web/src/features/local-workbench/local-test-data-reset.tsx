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
import { CheckboxField } from "@/components/patterns/checkbox-field";
import { ErrorNotice } from "@/components/feedback";
import { localApi } from "./local-api";

const CATEGORIES = [
  { id: "runs", label: "采集历史" },
  { id: "posts", label: "采集到的帖子" },
  { id: "comments", label: "采集到的评论" },
  { id: "reviews", label: "评论审核纪录" },
] as const;

type Category = (typeof CATEGORIES)[number]["id"];

const ALL: Category[] = CATEGORIES.map((category) => category.id);

export function LocalTestDataReset() {
  const client = useQueryClient();
  const [selected, setSelected] = useState<Category[]>(ALL);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const reset = useMutation({
    mutationFn: () => localApi("deleteTestData", { categories: selected }),
    onSuccess: () => {
      setOpen(false);
      setNotice("已删除");
      void client.invalidateQueries({ queryKey: ["local"] });
    },
    onError: () => setNotice(""),
  });

  const toggle = (id: Category, checked: boolean) => {
    setNotice("");
    setSelected((value) =>
      checked ? [...value, id] : value.filter((item) => item !== id),
    );
  };

  const labels = CATEGORIES.filter((category) =>
    selected.includes(category.id),
  ).map((category) => category.label);

  return (
    <>
      {reset.error ? <ErrorNotice error={reset.error} /> : null}
      {notice ? (
        <p role="status" className="text-body text-muted-foreground">
          {notice}
        </p>
      ) : null}

      <div className="flex flex-col gap-4">
        {CATEGORIES.map((category) => (
          <CheckboxField
            key={category.id}
            checked={selected.includes(category.id)}
            onCheckedChange={(checked) => toggle(category.id, checked)}
          >
            {category.label}
          </CheckboxField>
        ))}
      </div>

      <p className="text-body text-muted-foreground break-words">
        {labels.length ? "将删除：" + labels.join("、") : "未选择数据"}
      </p>

      <div>
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={!selected.length}>
              删除所选数据
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>删除所选数据？</AlertDialogTitle>
              <AlertDialogDescription>删除后不可恢复。</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => reset.mutate()}
              >
                删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
}
