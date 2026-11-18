import { ImageOff, MessageSquare } from "lucide-react";
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
        {post.coverUrl ? (
          <img
            src={post.coverUrl}
            alt=""
            loading="lazy"
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
          <span className="tabular-nums">{post.total} 条评论</span>
        </div>
        <h3 className="line-clamp-2 text-body font-medium break-words">
          {post.title}
        </h3>
        <p className="text-caption text-muted-foreground tabular-nums">
          {post.reviewed}/{post.total} 已评分 · 最高 {post.highest ?? "—"}
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
