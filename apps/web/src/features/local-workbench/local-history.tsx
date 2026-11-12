import { useState } from "react";
import { Link } from "@/lib/router-compat";
import { Disclosure } from "@/components/disclosure";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  SELECT_EMPTY,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/patterns/empty-state";
import { FilterBar, FilterField } from "@/components/patterns/filter-bar";
import { PageHeader } from "@/components/patterns/page-header";
import { Pagination } from "@/components/patterns/pagination";
import { RecordItem, RecordList } from "@/components/patterns/record-list";
import { SectionCard } from "@/components/patterns/section-card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ErrorNotice } from "@/components/feedback";
import { LocalContact } from "./local-contact";
import { LocalHistoryFilters, LocalUnreviewed } from "./local-history-filters";
import { LocalPosts } from "./local-posts";
import { LocalReply } from "./local-reply";
import { LocalReviewDialog } from "./local-review-dialog";
import { useLocalHistory } from "./use-local-history";

const statusLabels: Record<string, string> = {
  COMPLETE: "已完整采集",
  PARTIAL: "部分完成",
  FAILED: "失败",
  CANCELLED: "已取消",
  INTERRUPTED: "已中断",
  RUNNING: "进行中",
  PENDING: "待确认",
  APPROVED: "已通过",
  REJECTED: "已排除",
  CONFIRMED: "已确认发送",
  UNKNOWN: "结果未知",
  NOT_SUBMITTED: "未提交",
  RESERVED: "已占用额度",
  DISPATCHED: "等待回执",
  RECEIVED: "已接收",
};

/** 采集轮次状态。颜色只表达状态，不表达层级（DESIGN.md §7）。 */
function RunStatus({ status }: { status: string }) {
  if (status === "COMPLETE")
    return <Badge variant="success">已完整采集</Badge>;
  if (status === "PARTIAL") return <Badge variant="warning">部分完成</Badge>;
  if (status === "FAILED") return <Badge variant="destructive">失败</Badge>;
  if (status === "RUNNING") return <Badge variant="secondary">进行中</Badge>;
  return <Badge variant="outline">{statusLabels[status] ?? status}</Badge>;
}

export function LocalHistory({
  tab,
}: {
  tab: "conversations" | "reviews" | "runs";
}) {
  const history = useLocalHistory(tab);
  const [reviewRun, setReviewRun] = useState<string | null>(null);
  const [postRun, setPostRun] = useState<string | null>(null);
  const [contactReview, setContactReview] = useState<string | null>(null);

  const current =
    history.tab === "conversations"
      ? history.conversations
      : history.tab === "reviews"
        ? history.reviews
        : history.runs;

  const title =
    tab === "conversations"
      ? "私信会话"
      : tab === "reviews"
        ? "评论审核"
        : "采集历史";

  if (tab === "reviews" && history.filters.evaluation) {
    return (
      <SectionCard title="评论审核">
        <LocalHistoryFilters tab="reviews" />
        <LocalUnreviewed />
      </SectionCard>
    );
  }

  return (
    <>
      {tab === "runs" ? (
        <PageHeader
          title="采集历史"
          description="本机保存的每一轮采集。打开历史轮次不会重跑，也不会自动推进步骤。"
        />
      ) : null}
      <SectionCard title={tab === "runs" ? undefined : title}>
      {tab === "reviews" || tab === "runs" ? (
        <LocalHistoryFilters tab={tab} />
      ) : null}

      {tab === "reviews" ? (
        <FilterBar>
          <FilterField label="审核决定">
            <Select
              value={history.filters.status}
              onValueChange={(value) =>
              history.filter("status", value)
              }
            >
              <SelectTrigger aria-label="审核决定">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SELECT_EMPTY}>全部</SelectItem>
                <SelectItem value="PENDING">待确认</SelectItem>
                <SelectItem value="APPROVED">已通过</SelectItem>
                <SelectItem value="REJECTED">已排除</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="最低匹配分">
            <Input
              type="number"
              min={0}
              max={100}
              value={history.filters.minScore}
              onChange={(event) => history.filter("score", event.target.value)}
            />
          </FilterField>
          {history.filters.runId ? (
            <Button variant="outline" onClick={() => history.filter("run", "")}>
              查看全部轮次
            </Button>
          ) : null}
        </FilterBar>
      ) : null}

      {history.error ? (
        <ErrorNotice error={history.error} />
      ) : null}

      {current.isPending ? (
        <p className="text-body text-muted-foreground">正在读取…</p>
      ) : null}
      {!current.isPending && !current.data?.total ? (
        <EmptyState title="本机还没有这类业务记录。" />
      ) : null}

      {history.tab === "conversations" ? (
        <>
          <RecordList>
            {history.conversations.data?.items.map((thread) => (
              <RecordItem
                key={thread.account_id + ":" + thread.sender_id}
                title={thread.sender_name || "未命名用户"}
                meta={`${thread.account_name}${thread.unread ? ` · ${thread.unread} 条未读` : ""}`}
                action={
                  <Button
                    variant="outline"
                    onClick={() => history.selectThread(thread)}
                  >
                    查看会话
                  </Button>
                }
              >
                {thread.body}
              </RecordItem>
            ))}
          </RecordList>

          {history.thread ? (
            <div className="flex flex-col gap-3 border-t pt-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="text-section font-semibold break-words">
                  {history.thread.sender_name || "私信会话"}
                </h3>
                <Button
                  variant="outline"
                  onClick={() => history.selectThread(null)}
                >
                  收起会话
                </Button>
              </div>

              {history.conversation.data ? (
                <>
                  <p className="text-body leading-relaxed text-muted-foreground break-words">
                    {history.conversation.data.replyEvidence
                      ? "已核验入站身份；每次回复仍需核对账号、对象及内容。"
                      : "缺少可靠入站身份，只可查看。历史消息不会因导入而自动获得回复资格。"}
                  </p>
                  <ol className="divide-y">
                    {history.conversation.data.items.map((message) => (
                      <li
                        key={message.id}
                        className="flex flex-col gap-1 py-4"
                      >
                        <p className="text-caption text-muted-foreground">
                          {message.direction === "IN" ? "对方" : "我"} ·{" "}
                          {statusLabels[message.outcome] || message.outcome}
                        </p>
                        <p className="text-body leading-relaxed break-words">
                          {message.content}
                        </p>
                        {message.unread && message.direction === "IN" ? (
                          <div className="mt-2">
                            <Button
                              variant="outline"
                              pending={history.read.isPending}
                              onClick={() => history.read.mutate(message.id)}
                            >
                              标记已读
                            </Button>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ol>

                  {history.conversation.data.replyEvidence ? (
                    <LocalReply
                      key={
                        history.conversation.data.account.id +
                        ":" +
                        history.conversation.data.anchorId
                      }
                      conversation={history.conversation.data}
                    />
                  ) : null}

                  <Pagination
                    page={history.threadPage}
                    total={history.conversation.data.total}
                    onPageChange={history.setThreadPage}
                    label="会话消息分页"
                  />
                </>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {history.tab === "reviews" ? (
        <RecordList>
          {history.reviews.data?.items.map((review) => (
            <RecordItem
              key={review.id}
              title={review.body}
              meta={`${review.policy_name} · ${review.review_mode === "INDEPENDENT" ? "独立审核" : "本轮审核"} · ${review.score} 分 · ${statusLabels[review.review_status]}`}
              action={
                <>
                  <Button
                    variant="outline"
                    disabled={
                      review.review_status === "APPROVED" ||
                      history.decide.isPending
                    }
                    onClick={() =>
                      history.decide.mutate({ row: review, status: "APPROVED" })
                    }
                  >
                    通过审核
                  </Button>
                  <Button
                    variant="outline"
                    disabled={
                      review.review_status === "REJECTED" ||
                      history.decide.isPending
                    }
                    onClick={() =>
                      history.decide.mutate({ row: review, status: "REJECTED" })
                    }
                  >
                    排除
                  </Button>
                  {review.review_status === "APPROVED" ? (
                    <Button
                      variant="outline"
                      onClick={() => setContactReview(review.id)}
                    >
                      准备联系作者
                    </Button>
                  ) : null}
                </>
              }
            >
              <p>
                {review.author_name || "用户名称未保存"} ·{" "}
                {review.post_title || "笔记标题未保存"} ·{" "}
                {review.published_at
                  ? new Date(review.published_at).toLocaleString()
                  : "评论发布时间未记录"}
              </p>
              {review.reason ? <p>{review.reason}</p> : null}
              <p>
                上下文：
                {review.context === "SUFFICIENT" ? "充分" : "不足"} · 判断：
                {review.decision === "MATCH"
                  ? "匹配"
                  : review.decision === "NO_MATCH"
                    ? "不匹配"
                    : "不确定"}
              </p>
              <Disclosure title="查看原文证据">
                {review.evidence?.map((evidence, index) => (
                  <blockquote
                    key={index}
                    className="mt-2 border-s-2 ps-3 text-caption break-words"
                  >
                    {evidence.quote}
                  </blockquote>
                ))}
                <Link
                  to={`/automation?run=${review.run_id}&stage=review`}
                  className="mt-2 inline-block text-caption underline underline-offset-4"
                >
                  返回来源轮次 →
                </Link>
              </Disclosure>
            </RecordItem>
          ))}
        </RecordList>
      ) : null}

      {history.tab === "runs" ? (
        <Table aria-label="采集历史">
          <TableHeader>
            <TableRow>
              <TableHead>轮次</TableHead>
              <TableHead>开始时间</TableHead>
              <TableHead className="text-right">笔记</TableHead>
              <TableHead className="text-right">评论</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.runs.data?.items.map((run) => (
              <TableRow key={run.id}>
                <TableCell className="font-medium">{run.name}</TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {new Date(run.created_at).toLocaleString()}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {run.posts}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {run.comments}
                </TableCell>
                <TableCell>
                  <RunStatus status={run.status} />
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => setPostRun(run.id)}
                    >
                      笔记
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => setReviewRun(run.id)}
                    >
                      审核
                    </Button>
                    <Button size="xs" variant="outline" asChild>
                      <Link to={`/reply-history?run=${run.id}`}>回复</Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      {contactReview ? (
        <LocalContact
          key={contactReview}
          reviewId={contactReview}
          onClose={() => setContactReview(null)}
        />
      ) : null}
      {postRun ? (
        <LocalPosts
          key={postRun}
          runId={postRun}
          onClose={() => setPostRun(null)}
        />
      ) : null}
      {reviewRun ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setReviewRun(null);
          }}
        >
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>审核评论</DialogTitle>
            </DialogHeader>
            <LocalReviewDialog
              runId={reviewRun}
              bare
              onClose={() => setReviewRun(null)}
            />
          </DialogContent>
        </Dialog>
      ) : null}

      <Pagination
        page={history.page}
        total={current.data?.total ?? 0}
        onPageChange={history.setPage}
      />
      </SectionCard>
    </>
  );
}
