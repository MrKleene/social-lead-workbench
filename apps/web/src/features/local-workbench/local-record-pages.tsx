import { useState } from "react";
import type { ReplyHistoryItem } from "@crm/contracts";
import { Link, useSearchParams } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SELECT_EMPTY,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DetailSheet } from "@/components/patterns/detail-sheet";
import { EmptyState } from "@/components/patterns/empty-state";
import { FilterBar, FilterField } from "@/components/patterns/filter-bar";
import { PageHeader } from "@/components/patterns/page-header";
import { Pagination } from "@/components/patterns/pagination";
import { RecordItem, RecordList } from "@/components/patterns/record-list";
import { SectionCard } from "@/components/patterns/section-card";
import { ErrorNotice } from "@/components/feedback";
import {
  ReplyHistoryDetail,
  ReplyHistoryTable,
} from "@/features/auto-contact/reply-history-content";
import { LocalEvidence } from "./local-evidence";
import { useLocalAction, useLocalRecords } from "./use-local-records";

const labels: Record<string, string> = {
  COLLECT: "采集",
  REVIEW: "评论匹配",
  SEND: "回复",
  INBOX: "接收消息",
  QUEUED: "排队中",
  RUNNING: "执行中",
  SUCCEEDED: "已完成",
  FAILED: "失败",
  CANCELLED: "已取消",
  INTERRUPTED: "已中断",
  UNKNOWN: "结果未知",
};

const resultStates: Array<[string, string]> = [
  ["CONFIRMED", "回复成功"],
  ["UNKNOWN", "结果未知"],
  ["RESERVED", "已预占"],
  ["ATTEMPTED", "执行中"],
  ["NOT_ATTEMPTED", "未发送"],
  ["CANCELLED", "已取消"],
  ["FAILED", "历史失败"],
];

export function LocalReplyHistory() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const channel = params.get("channel") || "";
  const state = params.get("state") || "";
  const accountId = params.get("account") || "";
  const query = params.get("query") || "";
  const runId = params.get("run") || "";
  const data = useLocalRecords("replyHistory", {
    page,
    channel,
    state,
    accountId,
    query,
    runId,
  });
  const accounts = useLocalRecords("accounts");
  const [detail, setDetail] = useState<ReplyHistoryItem | null>(null);
  const [search, setSearch] = useState(query);

  const filter = (key: string, value: string) => {
    setDetail(null);
    setParams((previous) => {
      previous.set(key, value);
      previous.delete("page");
      return previous;
    });
  };

  const items = data.data?.items ?? [];

  return (
    <>
      <PageHeader title="回复记录" />

      <FilterBar>
        <FilterField label="渠道">
          <Select
            value={channel}
            onValueChange={(value) => filter("channel", value)}
          >
            <SelectTrigger aria-label="渠道">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SELECT_EMPTY}>全部渠道</SelectItem>
              <SelectItem value="COMMENT">评论回复</SelectItem>
              <SelectItem value="DM">私信</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="结果">
          <Select
            value={state}
            onValueChange={(value) => filter("state", value)}
          >
            <SelectTrigger aria-label="结果">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SELECT_EMPTY}>全部结果</SelectItem>
              {resultStates.map(([value, label]) => (
              <SelectItem key={value} value={value}>
              {label}
              </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="发送账号">
          <Select
            value={accountId}
            onValueChange={(value) => filter("account", value)}
          >
            <SelectTrigger aria-label="发送账号">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SELECT_EMPTY}>全部账号</SelectItem>
              {accounts.data?.map((account) => (
              <SelectItem key={account.id} value={account.id}>
              {account.name}
              </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <form
          className="flex items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            filter("query", search);
          }}
        >
          <FilterField label="正文搜索">
            <Input
              value={search}
              maxLength={200}
              onChange={(event) => setSearch(event.target.value)}
            />
          </FilterField>
          <Button type="submit" variant="outline">
            搜索记录
          </Button>
        </form>
      </FilterBar>

      {runId ? (
        <p className="flex flex-wrap items-center gap-3 text-body text-muted-foreground">
          当前仅查看所选轮次。
          <Button variant="ghost" onClick={() => filter("run", "")}>
            查看全部轮次
          </Button>
        </p>
      ) : null}

      {data.error ? (
        <ErrorNotice error={data.error} />
      ) : null}

      {items.length ? (
        <ReplyHistoryTable items={items} onOpen={setDetail} />
      ) : (
        <EmptyState
          title={
            data.isPending ? "正在读取记录…" : "没有符合条件的回复记录。"
          }
        />
      )}

      <Pagination
        page={page}
        total={data.data?.total ?? 0}
        onPageChange={(next) =>
          setParams((previous) => {
            previous.set("page", String(next));
            return previous;
          })
        }
        label="回复记录分页"
      />

      <DetailSheet
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
        title="回复详情"
        description="原消息、身份、时间与持久证据"
      >
        {detail ? <ReplyHistoryDetail item={detail} /> : null}
      </DetailSheet>
    </>
  );
}

export function LocalJobs({ runId }: { runId?: string }) {
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState("");
  const [state, setState] = useState("");
  const data = useLocalRecords("jobHistory", { page, kind, state, runId });
  const cancel = useLocalAction("cancelJob");
  const failure = data.error ?? cancel.error;
  const items = data.data?.items ?? [];

  return (
    <SectionCard title="任务记录">
      <FilterBar>
        <FilterField label="任务类型">
          <Select
            value={kind}
            onValueChange={(value) => {
            setKind(value);
            setPage(1);
            }}
          >
            <SelectTrigger aria-label="任务类型">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SELECT_EMPTY}>全部</SelectItem>
              {["COLLECT", "REVIEW", "SEND", "INBOX"].map((value) => (
              <SelectItem key={value} value={value}>
              {labels[value]}
              </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="任务状态">
          <Select
            value={state}
            onValueChange={(value) => {
            setState(value);
            setPage(1);
            }}
          >
            <SelectTrigger aria-label="任务状态">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SELECT_EMPTY}>全部</SelectItem>
              {[
              "QUEUED",
              "RUNNING",
              "SUCCEEDED",
              "FAILED",
              "CANCELLED",
              "INTERRUPTED",
              "UNKNOWN",
              ].map((value) => (
              <SelectItem key={value} value={value}>
              {labels[value]}
              </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
      </FilterBar>

      {failure ? (
        <ErrorNotice error={failure} />
      ) : null}

      {items.length ? (
        <RecordList>
          {items.map((job) => (
            <RecordItem
              key={job.id}
              title={`${labels[job.kind]} · ${labels[job.state]}`}
              meta={new Date(job.created_at).toLocaleString()}
              action={
                ["QUEUED", "RUNNING"].includes(job.state) ? (
                  <Button
                    variant="outline"
                    pending={cancel.isPending}
                    onClick={() => cancel.mutate({ id: job.id })}
                  >
                    取消任务
                  </Button>
                ) : null
              }
            >
              {job.run_id ? (
                <Link
                  to={`/automation?run=${job.run_id}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  查看本轮流程
                </Link>
              ) : null}
              {job.state === "UNKNOWN" ? (
                <Link
                  to="/auto-contact/pending"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  核对未知结果
                </Link>
              ) : null}
            </RecordItem>
          ))}
        </RecordList>
      ) : (
        <EmptyState title="本机还没有任务记录。" />
      )}

      <Pagination
        page={page}
        total={data.data?.total ?? 0}
        onPageChange={setPage}
        label="任务记录分页"
      />
    </SectionCard>
  );
}

export function LocalPending() {
  return (
    <>
      <PageHeader title="待处理回复" />
      <LocalQuotaPending />
      <LocalEvidence />
      <LocalJobs />
    </>
  );
}

/**
 * 额度不足、或在发出前就夭折而没发出去的回复。
 *
 * 它们不占发送队列、也不带授权：重新排队会按当前账号池重新分配账号并签发新的单次授权；
 * 忽略只标记已处理，记录与原因都保留。列表为空时不渲染，避免在待处理页挂一个常驻空块。
 */
function LocalQuotaPending() {
  const [page, setPage] = useState(1);
  const data = useLocalRecords("pendingContacts", { page });
  const retry = useLocalAction("retryPendingContact");
  const dismiss = useLocalAction("dismissPendingContact");
  const items = data.data?.items ?? [];
  const total = data.data?.total ?? 0;
  const remaining = data.data?.remaining ?? 0;
  const failure = data.error ?? retry.error ?? dismiss.error;

  if (!total && !failure) return null;

  return (
    <SectionCard
      title="未发送的回复"
      description={`今日剩余额度 ${remaining} 条`}
    >
      {failure ? <ErrorNotice error={failure} /> : null}

      <RecordList label="未发送的回复">
        {items.map((item) => (
          <RecordItem
            key={item.id}
            title={item.postTitle || "未命名笔记"}
            meta={[
              item.channel === "DM" ? "私信" : "评论回复",
              new Date(item.createdAt).toLocaleString(),
            ].join(" · ")}
            action={
              <>
                <Button
                  variant="outline"
                  disabled={remaining < 1}
                  pending={retry.isPending}
                  onClick={() => retry.mutate({ id: item.id })}
                >
                  重新加入队列
                </Button>
                <Button
                  variant="ghost"
                  pending={dismiss.isPending}
                  onClick={() => dismiss.mutate({ id: item.id })}
                >
                  忽略
                </Button>
              </>
            }
          >
            <p className="break-words">{item.comment}</p>
            {item.content ? (
              <p className="break-words">将发送：{item.content}</p>
            ) : null}
          </RecordItem>
        ))}
      </RecordList>

      <Pagination
        page={page}
        total={total}
        onPageChange={setPage}
        label="未发送回复分页"
      />
    </SectionCard>
  );
}

export function LocalNotices() {
  const [page, setPage] = useState(1);
  const data = useLocalRecords("notices", { page });
  const holds = data.data?.holds ?? [];
  const items = data.data?.items ?? [];

  return (
    <>
      <PageHeader title="运行异常" />
      {data.error ? (
        <ErrorNotice error={data.error} />
      ) : null}

      <SectionCard title="当前暂停">
        {holds.length ? (
          holds.map((hold) => (
            <p key={hold.id} className="text-body break-words">
              {hold.id} · {hold.reason}
            </p>
          ))
        ) : (
          <p className="text-body text-muted-foreground">
            当前没有记录的全局暂停。
          </p>
        )}
        <Link
          to="/data"
          className="text-body text-primary underline-offset-4 hover:underline"
        >
          查看数据与安全核对
        </Link>
      </SectionCard>

      <SectionCard title="异常与恢复历史">
        {items.length ? (
          <RecordList>
            {items.map((notice) => (
              <RecordItem
                key={notice.id}
                title={notice.action}
                meta={new Date(notice.created_at).toLocaleString()}
              >
                记录：{notice.entity_id}
              </RecordItem>
            ))}
          </RecordList>
        ) : (
          <EmptyState title="没有异常与恢复记录。" />
        )}
        <Pagination
          page={page}
          total={data.data?.total ?? 0}
          onPageChange={setPage}
          label="异常历史分页"
        />
      </SectionCard>
    </>
  );
}
