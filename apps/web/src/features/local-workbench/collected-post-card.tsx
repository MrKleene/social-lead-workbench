import { useState } from "react";
import { ImageOff, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CollectedPost } from "./local-api";

function coverageLabel(coverage: CollectedPost["coverage"]) {
  if (coverage === "COMPLETE") return "完整";
  if (coverage === "PARTIAL") return "待补读";
  return "未知";
}

function collectedDate(value: number) {
  return new Date(value).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

export function CollectedPostCard({
  post,
  onOpen,
}: {
  post: CollectedPost;
  onOpen: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const coverUrl = failed ? null : post.coverUrl;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`查看 ${post.title || "无标题笔记"} 的原文与评论`}
      className="group flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card text-left transition-colors hover:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-muted">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className="size-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-6" aria-hidden="true" />
          </div>
        )}
        <span className="absolute top-3 left-3">
          <Badge
            variant={
              post.coverage === "COMPLETE"
                ? "success"
                : post.coverage === "PARTIAL"
                  ? "warning"
                  : "outline"
            }
          >
            {coverageLabel(post.coverage)}
          </Badge>
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-2 text-caption text-muted-foreground">
          <MessageSquare className="size-4" aria-hidden="true" />
          <span className="tabular-nums">{post.comments} 条评论</span>
        </div>
        <h3 className="line-clamp-2 text-body font-medium break-words">
          {post.title || "无标题笔记"}
        </h3>
        <p className="truncate text-caption text-muted-foreground tabular-nums">
          采集 {post.collections} 次 · 最近 {collectedDate(post.latestAt)}
        </p>
        <p className="mt-auto truncate pt-1 text-caption text-muted-foreground">
          {post.authorName || "未知作者"} · {post.accountName}
        </p>
      </div>
    </button>
  );
}
