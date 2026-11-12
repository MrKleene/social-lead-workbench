import { useSearchParams } from "@/lib/router-compat";
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
import { CheckboxField } from "@/components/patterns/checkbox-field";
import { EmptyState } from "@/components/patterns/empty-state";
import { FilterBar, FilterField } from "@/components/patterns/filter-bar";
import { PageHeader } from "@/components/patterns/page-header";
import { Pagination } from "@/components/patterns/pagination";
import { RecordItem, RecordList } from "@/components/patterns/record-list";
import { SectionCard } from "@/components/patterns/section-card";
import { ErrorNotice } from "@/components/feedback";
import { LocalHistory } from "./local-history";
import { LocalReceivePanel } from "./local-platform";
import { useLocalAction, useLocalRecords } from "./use-local-records";

const PAGE_SIZE = 30;

function LocalCommentNotifications() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const messages = useLocalRecords("inboxPage", {
    page,
    channel: "COMMENT",
    accountId: params.get("account") || undefined,
    unread: params.get("unread") === "1",
    query: params.get("query") || "",
  });
  const read = useLocalAction("markRead");
  const changePage = (next: number) =>
    setParams((previous) => {
      previous.set("page", String(next));
      return previous;
    });

  const failure = messages.error ?? read.error;
  const total = messages.data?.total ?? 0;
  const items = messages.data?.items ?? [];

  return (
    <SectionCard title="评论通知">
      {failure ? (
        <ErrorNotice error={failure} />
      ) : null}
      {messages.isPending ? (
        <p className="text-body text-muted-foreground">正在读取…</p>
      ) : null}
      {!messages.isPending && total === 0 ? (
        <EmptyState title="没有符合筛选条件的评论通知。" />
      ) : null}
      {items.length > 0 ? (
        <RecordList>
          {items.map((message) => (
            <RecordItem
              key={message.id}
              title={`${message.sender_name || "未命名用户"}${message.unread ? " · 未读" : ""}`}
              meta={`${message.post_title || "未记录笔记标题"} · ${new Date(message.received_at).toLocaleString()}`}
              action={
                message.unread ? (
                  <Button
                    variant="outline"
                    pending={read.isPending}
                    onClick={() => read.mutate({ id: message.id })}
                  >
                    标记已读
                  </Button>
                ) : null
              }
            >
              {message.content_type === "TEXT"
                ? message.body
                : "当前不支持展示此消息类型"}
            </RecordItem>
          ))}
        </RecordList>
      ) : null}
      <Pagination
        page={page}
        total={total}
        pageSize={PAGE_SIZE}
        onPageChange={changePage}
        label="评论通知分页"
      />
    </SectionCard>
  );
}

export function LocalInboxPage() {
  const status = useLocalRecords("status");
  const accounts = useLocalRecords("accounts");
  const [params, setParams] = useSearchParams();
  const comments = params.get("view") === "comments";

  const change = (key: string, value: string) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value) next.set(key, value);
        else next.delete(key);
        next.delete("page");
        return next;
      },
      { replace: true, flushSync: true },
    );

  return (
    <>
      <PageHeader
        title="消息通知"
        actions={
          <div role="group" aria-label="消息类型" className="flex gap-2">
            <Button
              variant={comments ? "outline" : "default"}
              aria-pressed={!comments}
              onClick={() => change("view", "")}
            >
              私信会话
            </Button>
            <Button
              variant={comments ? "default" : "outline"}
              aria-pressed={comments}
              onClick={() => change("view", "comments")}
            >
              评论通知
            </Button>
          </div>
        }
      />

      <FilterBar>
        <FilterField label="接收账号">
          <Select
            value={params.get("account") || ""}
            onValueChange={(value) => change("account", value)}
          >
            <SelectTrigger aria-label="接收账号">
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
        <FilterField label="搜索消息">
          <Input
            aria-label="搜索消息"
            value={params.get("query") || ""}
            onChange={(event) => change("query", event.target.value)}
            placeholder="正文或用户昵称"
          />
        </FilterField>
        <div className="flex h-9 items-center">
          <CheckboxField
            checked={params.get("unread") === "1"}
            onCheckedChange={(checked) =>
              change("unread", checked ? "1" : "")
            }
          >
            仅未读
          </CheckboxField>
        </div>
      </FilterBar>

      {comments ? (
        <LocalCommentNotifications />
      ) : (
        <LocalHistory tab="conversations" />
      )}

      <SectionCard>
        <LocalReceivePanel
          credentialsAvailable={!!status.data?.credentialsAvailable}
        />
      </SectionCard>
    </>
  );
}
