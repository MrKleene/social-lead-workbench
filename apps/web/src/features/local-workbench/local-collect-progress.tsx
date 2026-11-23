import { useState } from "react";
import { Check, ChevronDown, CircleAlert, LoaderCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/patterns/section-card";
import { cn } from "@/lib/utils";
import { reasonLabels } from "../collection/types";
import type { CollectionRunEvent, LocalMethods } from "./local-api";

type RunProgress = LocalMethods["runProgress"];

const timeFormat = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const dateTimeFormat = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function formatTime(value: number) {
  return timeFormat.format(new Date(value));
}

function formatDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours ? hours + ":" + mm + ":" + ss : mm + ":" + ss;
}

function reasonLabel(reason: string | null) {
  if (!reason) return null;
  if (reason === "READ_FAILED") return "读取失败";
  return reasonLabels[reason] ?? reason;
}

type RowState = "complete" | "running" | "partial" | "failed";

type Row = {
  key: string;
  title: string;
  detail: string;
  at: number;
  state: RowState;
  keywords?: string[];
};

function RowIcon({ state }: { state: RowState }) {
  if (state === "running") {
    return <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />;
  }
  if (state === "failed") {
    return <CircleAlert className="size-4" aria-hidden="true" />;
  }
  if (state === "partial") {
    return <CircleAlert className="size-4" aria-hidden="true" />;
  }
  return <Check className="size-4" aria-hidden="true" />;
}

function markerClass(state: RowState) {
  if (state === "complete") return "border-success/40 bg-success-bg text-success";
  if (state === "running") return "border-border bg-muted text-foreground";
  if (state === "partial") return "border-warning/40 bg-warning-bg text-warning";
  return "border-destructive/40 bg-destructive-soft text-destructive";
}

function eventRows(
  events: CollectionRunEvent[],
  status: string,
  currentPost: RunProgress["currentPost"],
) {
  const posts = new Map<
    string,
    { index: number; title: string; start: number; last: CollectionRunEvent }
  >();
  for (const event of events) {
    if (!event.platformId) continue;
    const current = posts.get(event.platformId);
    if (event.kind === "POST_STARTED") {
      posts.set(event.platformId, {
        index: posts.size + 1,
        title: event.title ?? "未命名笔记",
        start: event.createdAt,
        last: event,
      });
      continue;
    }
    if (current) {
      current.last = event;
      current.title = event.title ?? current.title;
    } else {
      posts.set(event.platformId, {
        index: posts.size + 1,
        title: event.title ?? "未命名笔记",
        start: event.createdAt,
        last: event,
      });
    }
  }

  return [...posts.values()].map((post): Row => {
    const { last } = post;
    if (last.kind === "POST_SAVED") {
      return {
        key: last.platformId ?? String(last.sequence),
        title: `第 ${post.index} 篇 · ${post.title}`,
        detail: `已保存 ${last.comments} 条评论`,
        at: last.createdAt,
        state: "complete",
      };
    }
    if (last.kind === "POST_PARTIAL") {
      const reason = reasonLabel(last.reason);
      return {
        key: last.platformId ?? String(last.sequence),
        title: `第 ${post.index} 篇 · ${post.title}`,
        detail: reason
          ? `${last.comments} 条评论 · ${reason}`
          : `已保存 ${last.comments} 条评论`,
        at: last.createdAt,
        state: "partial",
      };
    }
    if (last.kind === "POST_FAILED") {
      const reason = reasonLabel(last.reason);
      return {
        key: last.platformId ?? String(last.sequence),
        title: `第 ${post.index} 篇 · ${post.title}`,
        detail: reason ? `采集失败 · ${reason}` : "采集失败",
        at: last.createdAt,
        state: "failed",
      };
    }
    const progress =
      currentPost && currentPost.platformId === last.platformId
        ? [
            `已读取 ${currentPost.comments} 条`,
            currentPost.declared === null ? null : `平台显示 ${currentPost.declared} 条`,
            `已用时 ${formatDuration(Date.now() - currentPost.startedAt)}`,
          ]
            .filter(Boolean)
            .join(" · ")
        : null;
    return {
      key: last.platformId ?? String(last.sequence),
      title: `第 ${post.index} 篇 · ${post.title}`,
      detail: progress ?? (status === "RUNNING" ? "采集中" : "部分完成"),
      at: last.createdAt,
      state: status === "RUNNING" ? "running" : "partial",
    };
  });
}

function terminalRow(data: RunProgress): Row | null {
  const { run } = data;
  if (run.status === "RUNNING") return null;
  const at = run.finishedAt ?? run.createdAt;
  const reason = reasonLabel(run.reason);
  if (run.status === "COMPLETE") {
    return {
      key: "terminal",
      title: "本轮完成",
      detail: `${data.posts} 篇笔记 · ${data.comments} 条评论`,
      at,
      state: "complete",
    };
  }
  if (run.status === "PARTIAL") {
    const missing = Math.max(0, run.batchLimit - data.posts);
    return {
      key: "terminal",
      title: "本轮部分完成",
      detail: [
        `${data.posts} 篇笔记 · ${data.comments} 条评论`,
        missing ? `${missing} 篇待补读` : null,
        reason,
      ]
        .filter(Boolean)
        .join(" · "),
      at,
      state: "partial",
    };
  }
  if (run.status === "FAILED") {
    return {
      key: "terminal",
      title: "本轮采集失败",
      detail: reason ?? "采集失败",
      at,
      state: "failed",
    };
  }
  if (run.status === "CANCELLED") {
    return {
      key: "terminal",
      title: "本轮已取消",
      detail: `${data.posts} 篇笔记 · ${data.comments} 条评论`,
      at,
      state: "partial",
    };
  }
  return {
    key: "terminal",
    title: "本轮已中断",
    detail: reason ?? `${data.posts} 篇笔记 · ${data.comments} 条评论`,
    at,
    state: "partial",
  };
}

export function LocalCollectProgress({
  data,
  history = false,
}: {
  data: RunProgress;
  history?: boolean;
}) {
  const [override, setOverride] = useState<boolean | null>(null);
  const [showKeywords, setShowKeywords] = useState(false);
  const { run } = data;
  const settled = run.status !== "RUNNING";
  const attention = ["FAILED", "PARTIAL", "INTERRUPTED"].includes(run.status);
  const expanded = override ?? (!settled || attention);
  const started = data.events.filter((event) => event.kind === "POST_STARTED").length;
  const rows: Row[] = [
    {
      key: "start",
      title: "开始采集",
      detail: run.accountName,
      at: run.createdAt,
      state: "complete",
    },
  ];
  if (run.keywords.length) {
    rows.push({
      key: "keywords",
      title: `关键词 ${run.keywords.length} 个`,
      detail: "",
      at: run.createdAt,
      state: "complete",
      keywords: run.keywords,
    });
  }
  rows.push(...eventRows(data.events, run.status, data.currentPost));
  const terminal = terminalRow(data);
  if (terminal) rows.push(terminal);

  const description = !settled
    ? `${run.accountName} · ${
        started
          ? `第 ${started} 篇 / 共 ${run.batchLimit} 篇`
          : `共 ${run.batchLimit} 篇`
      } · 累计 ${data.comments} 条评论`
    : `${run.accountName} · ${run.name} · ${dateTimeFormat.format(new Date(run.createdAt))}`;

  const duration = run.finishedAt
    ? run.finishedAt - run.createdAt
    : run.status === "RUNNING"
      ? Date.now() - run.createdAt
      : null;

  const badge = history ? (
    <Badge variant="outline">历史轮次</Badge>
  ) : run.status === "COMPLETE" ? (
    <Badge variant="success">已完成</Badge>
  ) : run.status === "PARTIAL" ? (
    <Badge variant="warning">部分完成</Badge>
  ) : run.status === "FAILED" ? (
    <Badge variant="destructive">失败</Badge>
  ) : run.status === "RUNNING" ? (
    <Badge variant="outline">
      <LoaderCircle className="animate-spin" aria-hidden="true" />
      运行中
    </Badge>
  ) : (
    <Badge variant="outline">已结束</Badge>
  );

  return (
    <SectionCard
      title="采集进度"
      description={description}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {badge}
          {settled ? (
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={expanded}
              onClick={() => setOverride(!expanded)}
            >
              {expanded ? "收起过程" : "查看过程"}
              <ChevronDown
                className={cn("size-4 transition-transform", expanded && "rotate-180")}
                aria-hidden="true"
              />
            </Button>
          ) : null}
        </div>
      }
    >
      {settled ? (
        <div className="grid grid-cols-3 border-y py-4">
          {[
            { value: data.posts, label: "篇笔记" },
            { value: data.comments, label: "条评论" },
            {
              value: duration === null ? "—" : formatDuration(duration),
              label: "用时",
            },
          ].map((item, index) => (
            <div
              key={item.label}
              className={cn("px-4 first:pl-0 last:pr-0", index < 2 && "border-r")}
            >
              <div className="text-title font-semibold tabular-nums">
                {item.value}
              </div>
              <div className="text-caption text-muted-foreground">{item.label}</div>
            </div>
          ))}
        </div>
      ) : null}

      {expanded ? (
        <ol className="flex flex-col" aria-label="采集过程">
          {rows.map((row, index) => (
            <li key={row.key} className="flex gap-4">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border",
                    markerClass(row.state),
                  )}
                >
                  <RowIcon state={row.state} />
                </span>
                {index < rows.length - 1 ? (
                  <span className="w-px flex-1 bg-border" aria-hidden="true" />
                ) : null}
              </div>
              <div
                className={cn(
                  "flex min-w-0 flex-1 flex-wrap items-start justify-between gap-2 pb-4",
                  row.state === "running" && "-mt-2 rounded-md bg-muted px-2 py-2",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-body font-medium break-words">{row.title}</div>
                    {row.keywords?.length ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-expanded={showKeywords}
                        onClick={() => setShowKeywords(!showKeywords)}
                      >
                        {showKeywords ? "收起" : "查看"}
                      </Button>
                    ) : null}
                  </div>
                  {row.detail ? (
                    <div className="text-caption text-muted-foreground break-words">
                      {row.detail}
                    </div>
                  ) : null}
                  {row.keywords && showKeywords ? (
                    <p className="mt-2 text-caption text-muted-foreground break-words">
                      {row.keywords.join("、")}
                    </p>
                  ) : null}
                </div>
                <time
                  dateTime={new Date(row.at).toISOString()}
                  className="shrink-0 text-caption text-muted-foreground tabular-nums"
                >
                  {formatTime(row.at)}
                </time>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </SectionCard>
  );
}
