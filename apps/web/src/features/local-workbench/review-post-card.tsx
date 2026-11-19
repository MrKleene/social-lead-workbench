import { useState } from "react";
import { ChevronRight, ImageOff, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ReviewPostSummary } from "./local-api";
import { postLabel, postVariant } from "./review-model";

export function ReviewPostCard({
  post,
  active = false,
  reviewing = false,
  onOpen,
}: {
  post: ReviewPostSummary;
  active?: boolean;
  reviewing?: boolean;
  onOpen: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const coverUrl = failed ? null : post.coverUrl;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`查看 ${post.title} 的评论审核`}
      className={cn(
        "group flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card text-left transition-colors hover:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active && "border-ring ring-2 ring-ring/20",
      )}
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
          <Badge variant={postVariant(post.status)}>{postLabel(post.status)}</Badge>
        </span>
        {reviewing ? (
          <span className="absolute top-3 right-3">
            <Badge variant="outline" className="bg-background/90">
              审核中
            </Badge>
          </span>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-2 text-caption text-muted-foreground">
          <MessageSquare className="size-4" aria-hidden="true" />
          <span className="tabular-nums">{post.total + post.skipped} 条评论</span>
        </div>
        <h3 className="line-clamp-2 text-body font-medium break-words">
          {post.title}
        </h3>
        <p className="text-caption text-muted-foreground tabular-nums">
          {post.reviewed}/{post.total} 已评分 · 最高 {post.highest ?? "—"}
          {post.skipped ? ` · 跳过 ${post.skipped} 条` : ""}
        </p>
        {reviewing ? (
          <div
            className="h-1 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={post.total}
            aria-valuenow={post.reviewed}
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${post.total ? Math.round((post.reviewed / post.total) * 100) : 0}%` }}
            />
          </div>
        ) : null}
        <p className="mt-auto truncate pt-1 text-caption text-muted-foreground">
          {post.authorName ?? "匿名"}
        </p>
      </div>
    </button>
  );
}

function ReviewPostRow({
  post,
  active,
  onOpen,
}: {
  post: ReviewPostSummary;
  active: boolean;
  onOpen: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const coverUrl = failed ? null : post.coverUrl;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`查看 ${post.title} 的评论审核`}
      className={cn(
        "flex min-w-0 items-center gap-3 border-b py-3 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active && "bg-muted",
      )}
    >
      <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-4" aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="line-clamp-2 min-w-0 flex-1 text-body font-medium">
            {post.title}
          </h3>
          <Badge variant={postVariant(post.status)} className="shrink-0">
            {postLabel(post.status)}
          </Badge>
        </div>
        <p className="mt-1 truncate text-caption text-muted-foreground tabular-nums">
          {post.total + post.skipped} 条评论 · {post.reviewed}/{post.total} 已评分 ·
          最高 {post.highest ?? "—"}
          {post.skipped ? ` · 跳过 ${post.skipped}` : ""}
        </p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

export function ReviewPostList({
  posts,
  activePostId,
  onOpen,
}: {
  posts: ReviewPostSummary[];
  activePostId?: string | null;
  onOpen: (post: ReviewPostSummary) => void;
}) {
  return (
    <div className="grid gap-x-6 sm:grid-cols-2">
      {posts.map((post) => (
        <ReviewPostRow
          key={post.postId}
          post={post}
          active={post.postId === activePostId}
          onOpen={() => onOpen(post)}
        />
      ))}
    </div>
  );
}

export function ReviewPostGrid({
  posts,
  activePostId,
  reviewingPostId,
  onOpen,
}: {
  posts: ReviewPostSummary[];
  activePostId?: string | null;
  reviewingPostId?: string | null;
  onOpen: (post: ReviewPostSummary) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
      {posts.map((post) => (
        <ReviewPostCard
          key={post.postId}
          post={post}
          active={post.postId === activePostId}
          reviewing={post.postId === reviewingPostId}
          onOpen={() => onOpen(post)}
        />
      ))}
    </div>
  );
}
