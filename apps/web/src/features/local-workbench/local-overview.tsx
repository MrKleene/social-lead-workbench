import { Link } from "@/lib/router-compat";
import { Inbox, Layers, MessageSquare, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DetailItem, DetailList } from "@/components/patterns/detail-sheet";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { RecordItem, RecordList } from "@/components/patterns/record-list";
import { SectionCard } from "@/components/patterns/section-card";
import { ErrorNotice } from "@/components/feedback";
import type { DashboardReply } from "./local-api";
import { LocalTestDataReset } from "./local-test-data-reset";
import { useLocalRecords } from "./use-local-records";

export function LocalOverview() {
  const query = useLocalRecords("workspaceOverview");
  const overview = query.data;
  const reviewDetail = overview
    ? "已审核 " +
      overview.reviews +
      " · 不符合 " +
      overview.notMatched +
      (overview.uncertain ? " · 不确定 " + overview.uncertain : "")
    : "—";

  const metrics = [
    {
      name: "采集笔记",
      value: overview?.collectedPosts,
      detail: (overview?.runs ?? 0) + " 轮采集",
      url: "/work/archive",
      icon: Layers,
    },
    {
      name: "符合评论",
      value: overview?.matched,
      detail: reviewDetail,
      url: "/comment-review",
      icon: MessageSquare,
    },
    {
      name: "已回复",
      value: overview?.confirmed,
      detail:
        "成功 " +
        (overview?.confirmed ?? 0) +
        " · 结果未知 " +
        (overview?.unknown ?? 0),
      url: "/reply-history",
      icon: Send,
    },
    {
      name: "收到回复",
      value: overview?.received,
      detail: "未读 " + (overview?.unread ?? 0),
      url: "/inbox",
      icon: Inbox,
    },
  ];

  return (
    <>
      <PageHeader
        title="仪表盘"
        description={
          overview
            ? "数据截至 " + formatDateTime(overview.asOf) + " · 本机数据"
            : "本机数据"
        }
        actions={
          <Button asChild>
            <Link to="/automation">进入自动化任务</Link>
          </Button>
        }
      />

      {query.error ? (
        <ErrorNotice error={query.error} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map(({ name, value, detail, url, icon: Icon }) => (
          <Card
            key={name}
            asChild
            className="gap-2 p-6 transition-colors hover:bg-accent"
          >
            <Link to={url}>
              <span className="flex items-start justify-between gap-2">
                <span className="text-caption text-muted-foreground">
                  {name}
                </span>
                <Icon
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </span>
              <strong className="text-title font-semibold tabular-nums">
                {value ?? "—"}
              </strong>
              <span className="text-caption break-words text-muted-foreground">
                {detail}
              </span>
            </Link>
          </Card>
        ))}
      </div>

      {overview?.latestRun &&
      ["FAILED", "PARTIAL", "INTERRUPTED"].includes(
        overview.latestRun.status,
      ) ? (
        <p role="status" className="text-body break-words text-warning">
          最近一轮采集未完成 ·{" "}
          <Link
            to="/work/archive"
            className="text-primary underline-offset-4 hover:underline"
          >
            查看采集历史
          </Link>
        </p>
      ) : null}

      {overview ? (
        <>
          <SectionCard
            title="收到回复"
            description="最近 14 天 · 评论与私信"
            actions={
              <Link
                to="/inbox"
                className="text-body text-primary underline-offset-4 hover:underline"
              >
                查看消息通知
              </Link>
            }
          >
            {overview.dailyReplies.some((day) => day.count > 0) ? (
              <ReplyTrend days={overview.dailyReplies} />
            ) : (
              <EmptyState title="最近 14 天没有收到回复" />
            )}
          </SectionCard>

          {overview.recentReplies.length ? (
            <SectionCard
              title="最近回复"
              actions={
                <Link
                  to="/inbox"
                  className="text-body text-primary underline-offset-4 hover:underline"
                >
                  查看全部
                </Link>
              }
            >
              <RecordList label="最近回复">
                {overview.recentReplies.map((reply) => (
                  <RecentReply key={reply.id} reply={reply} />
                ))}
              </RecordList>
            </SectionCard>
          ) : null}
        </>
      ) : null}

      {overview?.holds.length ? (
        <SectionCard title="需要核对的暂停">
          {overview.holds.map((hold) => (
            <p key={hold.id} className="text-body break-words">
              {hold.id} · {hold.reason}
            </p>
          ))}
          <Link
            to="/data"
            className="text-body text-primary underline-offset-4 hover:underline"
          >
            查看核对入口
          </Link>
        </SectionCard>
      ) : null}
    </>
  );
}

const dateTime = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const shortDateTime = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatDateTime(value: number) {
  return dateTime.format(new Date(value));
}

function formatDay(value: string) {
  return value.slice(5).replace("-", "/");
}

function ReplyTrend({
  days,
}: {
  days: { day: string; count: number }[];
}) {
  const max = Math.max(1, ...days.map((day) => day.count));
  const total = days.reduce((sum, day) => sum + day.count, 0);

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex gap-2"
        role="img"
        aria-label={"最近 14 天收到 " + total + " 条回复"}
      >
        <div
          className="flex h-48 w-8 shrink-0 flex-col justify-between text-right text-caption tabular-nums text-muted-foreground"
          aria-hidden="true"
        >
          <span>{max}</span>
          {max > 1 ? <span>{Math.round(max / 2)}</span> : null}
          <span>0</span>
        </div>
        <div className="relative flex h-48 flex-1 items-end gap-2 border-b border-border">
          <div
            className="pointer-events-none absolute inset-0 flex flex-col justify-between"
            aria-hidden="true"
          >
            {[0, 1, 2].map((line) => (
              <span key={line} className="border-t border-border" />
            ))}
          </div>
          {days.map((day) => (
            <div
              key={day.day}
              className="relative flex h-full flex-1 items-end"
              title={formatDay(day.day) + "：" + day.count + " 条"}
            >
              <div
                className={
                  day.count
                    ? "w-full rounded-sm bg-foreground"
                    : "h-1 w-full rounded-sm bg-border"
                }
                style={
                  day.count
                    ? { height: Math.max(4, (day.count / max) * 100) + "%" }
                    : undefined
                }
              />
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-2 pl-10">
        {days.map((day, index) => (
          <span
            key={day.day}
            className="min-w-0 flex-1 text-center text-caption text-muted-foreground"
          >
            {index === 0 ||
            index === days.length - 1 ||
            (index % 4 === 0 && days.length - 1 - index > 2)
              ? formatDay(day.day)
              : ""}
          </span>
        ))}
      </div>
      <p className="text-caption text-muted-foreground">
        {"共 " + total + " 条回复"}
      </p>
    </div>
  );
}

function RecentReply({ reply }: { reply: DashboardReply }) {
  return (
    <RecordItem
      title={reply.sender_name || "未知用户"}
      meta={
        <>
          {reply.channel === "DM" ? "私信" : "评论"} ·{" "}
          {shortDateTime.format(new Date(reply.at))}
          {reply.post_title ? " · " + reply.post_title : ""}
          {reply.unread ? (
            <Badge variant="warning" className="ms-2">
              未读
            </Badge>
          ) : null}
        </>
      }
      action={
        <Link
          to="/inbox"
          className="text-body text-primary underline-offset-4 hover:underline"
        >
          查看消息
        </Link>
      }
    >
      <p className="line-clamp-2 break-words">{reply.body}</p>
    </RecordItem>
  );
}

export { LocalInboxPage } from "./local-inbox-page";

export function LocalDataPage() {
  return (
    <>
      <PageHeader title="数据管理" />
      <SectionCard title="删除测试数据">
        <LocalTestDataReset />
      </SectionCard>
    </>
  );
}

export function LocalCapabilities() {
  const status = useLocalRecords("status");
  const workflow = useLocalRecords("workflowOverview");

  const capabilities: Array<[string, boolean | undefined]> = [
    ["账号登录", status.data?.platform.ready],
    ["有界采集", workflow.data?.capabilities.collect],
    ["限时收件", workflow.data?.capabilities.inbox],
    ["精确评论与私信", workflow.data?.capabilities.send],
    ["模型审核适配器", workflow.data?.capabilities.review],
    ["系统凭据保护", status.data?.credentialsAvailable],
  ];

  return (
    <>
      <PageHeader title="平台能力" />
      <SectionCard title="小红书">
        <DetailList className="gap-3 sm:grid-cols-2">
          {capabilities.map(([label, ready]) => (
            <DetailItem key={label} label={label}>
              {ready ? "可用" : "不可用"}
            </DetailItem>
          ))}
        </DetailList>
        <Link
          to="/work/accounts"
          className="text-body text-primary underline-offset-4 hover:underline"
        >
          查看账号与额度
        </Link>
      </SectionCard>
      <SectionCard title="抖音">
        <p className="text-body text-muted-foreground">未接入</p>
      </SectionCard>
    </>
  );
}
