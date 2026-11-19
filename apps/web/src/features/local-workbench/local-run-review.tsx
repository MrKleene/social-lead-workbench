import { useState } from "react";
import { Link } from "@/lib/router-compat";
import { LoaderCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/patterns/section-card";
import { useLocalRecords } from "./use-local-records";
import type { ReviewPostSummary } from "./local-api";
import { ReviewPostDialog } from "./review-post-dialog";
import { ReviewPostGrid } from "./review-post-card";
import { statusVariant } from "./review-model";
import { reviewFailureLabel } from "../comment-review/run-review-model";

export function LocalRunReview({ runId }: { runId: string }) {
  const [selectedId, setSelectedId] = useState("");
  const progress = useLocalRecords("runProgress", { runId }, { refetchInterval: 2000 });

  const pauses = progress.data?.reviewPauses ?? [];
  const reviewProgress = progress.data?.reviewProgress;
  const failures = progress.data?.reviewFailures ?? [];
  const posts: ReviewPostSummary[] = progress.data?.reviewPosts ?? [];
  const activity = progress.data?.reviewActivity;
  const queuePaused = pauses.some((pause) => pause.kind === "QUEUE");
  const percent = reviewProgress?.total
    ? Math.round((reviewProgress.reviewed / reviewProgress.total) * 100)
    : 0;
  const selected = posts.find((post) => post.postId === selectedId);
  const showFailures =
    failures.length > 0 &&
    (pauses.length > 0 ||
      (reviewProgress?.failed ?? 0) > 0 ||
      (reviewProgress?.unknown ?? 0) > 0);

  const status =
    reviewProgress && reviewProgress.total > 0
      ? reviewProgress.reviewed >= reviewProgress.total
        ? "COMPLETED"
        : reviewProgress.processing > 0
          ? "PROCESSING"
          : reviewProgress.failed > 0
            ? "FAILED"
            : reviewProgress.unknown > 0
              ? "UNKNOWN"
              : "PENDING"
      : null;
  const statusLabel =
    status === "COMPLETED"
      ? "已评分"
      : status === "PROCESSING"
        ? "审核中"
        : status === "FAILED"
          ? "失败"
          : status === "UNKNOWN"
            ? "结果未知"
            : status === "PENDING"
              ? "待审核"
              : "待开始";

  return (
    <SectionCard
      title="评论匹配"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/comment-review?view=posts&run=${runId}`}>查看评论审核</Link>
          </Button>
          <Badge variant={status ? statusVariant(status) : "secondary"}>
            {statusLabel}
          </Badge>
        </div>
      }
    >
      {reviewProgress ? (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-caption text-muted-foreground">已评分</dt>
              <dd className="mt-1 text-title tabular-nums">
                {reviewProgress.reviewed}
                <span className="text-body font-normal text-muted-foreground">
                  {" "}/ {reviewProgress.total}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-caption text-muted-foreground">审核中</dt>
              <dd className="mt-1 text-title tabular-nums">
                {reviewProgress.processing}
              </dd>
            </div>
            <div>
              <dt className="text-caption text-muted-foreground">待审核</dt>
              <dd className="mt-1 text-title tabular-nums">
                {reviewProgress.pending}
              </dd>
            </div>
            <div>
              <dt className="text-caption text-muted-foreground">失败</dt>
              <dd className="mt-1 text-title tabular-nums">
                {reviewProgress.failed}
              </dd>
            </div>
          </dl>
          {reviewProgress.skipped ? (
            <p className="text-caption text-muted-foreground tabular-nums">
              跳过 {reviewProgress.skipped} 条（评论超长）
            </p>
          ) : null}
          <div
            role="progressbar"
            aria-label="评论审核进度"
            aria-valuemin={0}
            aria-valuemax={reviewProgress.total}
            aria-valuenow={reviewProgress.reviewed}
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-foreground transition-[width]"
              style={{ width: percent + "%" }}
            />
          </div>
        </div>
      ) : null}

      {activity ? (
        <div className="flex flex-col gap-1">
          <p
            role="status"
            className="flex flex-wrap items-center gap-2 text-body text-muted-foreground"
          >
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            <span className="break-words">
              正在审核：{activity.postTitle}
            </span>
          </p>
          <p className="text-caption text-muted-foreground">
            第 {activity.postIndex} / {activity.postCount} 篇 · 第{" "}
            {activity.segmentNo + 1} 段 · 已提交 {activity.inputs} 条
          </p>
        </div>
      ) : null}

      {reviewProgress?.unknown ? (
        <p role="status" className="text-body text-warning break-words">
          结果未知 {reviewProgress.unknown} 条。
        </p>
      ) : null}

      {pauses.length ? (
        <p role="status" className="text-body text-warning break-words">
          {queuePaused ? "审核队列已暂停。" : "该帖审核已暂停。"}
        </p>
      ) : null}

      {showFailures ? (
        <ul className="space-y-2 text-body text-muted-foreground">
          {failures.slice(0, 3).map((item) => (
            <li key={item.batchId} className="break-words">
              {reviewFailureLabel(item)}
            </li>
          ))}
        </ul>
      ) : null}

      {posts.length ? (
        <ReviewPostGrid
          posts={posts}
          activePostId={activity?.postId ?? selectedId}
          reviewingPostId={activity?.postId ?? null}
          onOpen={(post) => setSelectedId(post.postId)}
        />
      ) : (
        <p className="text-body text-muted-foreground">还没有可审核的评论。</p>
      )}

      {selected ? (
        <ReviewPostDialog post={selected} onClose={() => setSelectedId("")} />
      ) : null}
    </SectionCard>
  );
}
