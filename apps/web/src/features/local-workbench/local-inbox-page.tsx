import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckboxField } from "@/components/patterns/checkbox-field";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { SectionCard } from "@/components/patterns/section-card";
import { ErrorNotice } from "@/components/feedback";
import { LocalReceivePanel } from "./local-platform";
import { accountCapability } from "./local-status-labels";
import { LocalCommentReply, LocalDmChat } from "./local-inbox-chat";
import { useLocalAction, useLocalRecords } from "./use-local-records";
import type { InboxAccount, LocalNotification } from "./local-api";

const capability = (account: InboxAccount) =>
  accountCapability(account).join(" · ");

const time = (value: number | null | undefined) =>
  value ? new Date(value).toLocaleString() : "未记录";

function change(
  setParams: ReturnType<typeof useSearchParams>[1],
  patch: Record<string, string>,
) {
  setParams(
    (previous) => {
      const next = new URLSearchParams(previous);
      for (const [key, value] of Object.entries(patch)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      return next;
    },
    { replace: true },
  );
}

function AccountList() {
  const accounts = useLocalRecords("inboxAccounts");
  const [, setParams] = useSearchParams();

  return (
    <SectionCard title="账号">
      {accounts.error ? <ErrorNotice error={accounts.error} /> : null}
      {accounts.isPending ? (
        <p className="text-body text-muted-foreground">正在读取…</p>
      ) : null}
      {!accounts.isPending && !accounts.data?.length ? (
        <EmptyState
          title="没有可用账号。"
          action={
            <Button asChild variant="outline">
              <Link to="/work/accounts">去账号中心</Link>
            </Button>
          }
        />
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {accounts.data?.map((account) => (
          <Button
            key={account.id}
            variant="outline"
            className="h-auto flex-col items-start justify-start gap-2 p-4 text-left sm:p-6"
            onClick={() =>
              change(setParams, {
                account: account.id,
                view: "dm",
                sender: "",
                message: "",
              })
            }
          >
            <span className="text-section font-semibold break-words">{account.name}</span>
            <span className="text-caption text-muted-foreground">{capability(account)}</span>
            <span className="flex flex-wrap gap-3 text-body">
              <span>未读私信 {account.unread_dm}</span>
              <span>未读评论 {account.unread_comment}</span>
            </span>
            <span className="text-caption text-muted-foreground">
              {account.last_fetched_at
                ? `上次获取 ${time(account.last_fetched_at)}`
                : "尚未获取"}
            </span>
          </Button>
        ))}
      </div>
    </SectionCard>
  );
}

function DmInbox({
  accountId,
  onSent,
}: {
  accountId: string;
  onSent: () => void;
}) {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const senderId = params.get("sender") || "";
  const conversations = useLocalRecords(
    "conversations",
    { accountId, query },
    { refetchInterval: 5000 },
  );
  const conversation = useLocalRecords(
    "conversation",
    { accountId, senderId },
    { enabled: !!senderId, refetchInterval: 5000 },
  );
  const read = useLocalAction("markThreadRead");

  const selected = conversations.data?.items.find((item) => item.sender_id === senderId);
  const failure = conversations.error ?? conversation.error ?? read.error;

  return (
    <SectionCard>
      {failure ? <ErrorNotice error={failure} /> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          aria-label="搜索私信"
          value={query}
          placeholder="昵称或正文"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="flex max-h-[560px] flex-col overflow-y-auto border-b pb-3 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
          {conversations.isPending ? (
            <p className="text-body text-muted-foreground">正在读取…</p>
          ) : null}
          {!conversations.isPending && !conversations.data?.items.length ? (
            <EmptyState title="没有私信会话。" />
          ) : null}
          {conversations.data?.items.map((item) => (
            <Button
              key={item.sender_id}
              variant="ghost"
              aria-current={item.sender_id === senderId ? "true" : undefined}
              className={
                item.sender_id === senderId
                  ? "h-auto flex-col items-start justify-start gap-1 rounded-md bg-accent px-3 py-2 text-left"
                  : "h-auto flex-col items-start justify-start gap-1 rounded-md px-3 py-2 text-left"
              }
              onClick={() => {
                change(setParams, { sender: item.sender_id, message: "" });
                read.mutate({ accountId, senderId: item.sender_id });
              }}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-body font-medium break-words">
                  {item.sender_name || "未命名用户"}
                </span>
                {item.unread > 0 ? (
                  <span className="text-caption text-destructive">
                    未读 {item.unread}
                  </span>
                ) : null}
              </span>
              <span className="text-caption text-muted-foreground break-words">{item.body}</span>
              <span className="text-caption text-muted-foreground">
                {item.direction === "OUT" ? "已发送" : "收到"} ·{" "}
                {time(item.received_at)}
              </span>
            </Button>
          ))}
        </div>

        <div className="min-w-0">
          {!senderId ? (
            <EmptyState title="选择一条会话。" />
          ) : conversation.isPending ? (
            <p className="text-body text-muted-foreground">正在读取…</p>
          ) : conversation.data ? (
            <LocalDmChat
              accountId={accountId}
              conversation={conversation.data}
              recipientName={selected?.sender_name || "未命名用户"}
              onSent={onSent}
            />
          ) : (
            <EmptyState
              title="会话不可用。"
              action={
                <Button
                  variant="outline"
                  pending={conversation.isFetching}
                  onClick={() => void conversation.refetch()}
                >
                  重试
                </Button>
              }
            />
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function CommentInbox({
  accountId,
  onSent,
}: {
  accountId: string;
  onSent: () => void;
}) {
  const [params, setParams] = useSearchParams();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [query, setQuery] = useState("");
  const selectedId = params.get("message") || "";
  const messages = useLocalRecords(
    "inboxPage",
    { accountId, channel: "COMMENT", unread: unreadOnly, query },
    { refetchInterval: 5000 },
  );
  const read = useLocalAction("markRead");
  const selected = messages.data?.items.find((item) => item.id === selectedId);
  const failure = messages.error ?? read.error;

  return (
    <SectionCard>
      {failure ? <ErrorNotice error={failure} /> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          aria-label="搜索评论"
          value={query}
          placeholder="昵称、正文或笔记"
          onChange={(event) => setQuery(event.target.value)}
        />
        <CheckboxField checked={unreadOnly} onCheckedChange={setUnreadOnly}>
          仅未读
        </CheckboxField>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="flex max-h-[560px] flex-col overflow-y-auto border-b pb-3 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
          {messages.isPending ? (
            <p className="text-body text-muted-foreground">正在读取…</p>
          ) : null}
          {!messages.isPending && !messages.data?.items.length ? (
            <EmptyState title="没有评论通知。" />
          ) : null}
          {messages.data?.items.map((message: LocalNotification) => (
            <Button
              key={message.id}
              variant="ghost"
              aria-current={message.id === selectedId ? "true" : undefined}
              className={
                message.id === selectedId
                  ? "h-auto flex-col items-start justify-start gap-1 rounded-md bg-accent px-3 py-2 text-left"
                  : "h-auto flex-col items-start justify-start gap-1 rounded-md px-3 py-2 text-left"
              }
              onClick={() => {
                change(setParams, { message: message.id, sender: "" });
                if (message.unread) read.mutate({ id: message.id });
              }}
            >
              <span className="text-body font-medium break-words">
                {message.sender_name || "未命名用户"}
              </span>
              <span className="text-caption text-muted-foreground break-words">{message.body}</span>
              <span className="text-caption text-muted-foreground">
                {message.post_title || "未记录笔记标题"} ·{" "}
                {time(message.received_at)}
              </span>
            </Button>
          ))}
        </div>

        <div className="min-w-0">
          {!selected ? (
            <EmptyState title="选择一条评论。" />
          ) : (
            <LocalCommentReply accountId={accountId} message={selected} onSent={onSent} />
          )}
        </div>
      </div>
    </SectionCard>
  );
}

export function LocalInboxPage() {
  const status = useLocalRecords("status");
  const accounts = useLocalRecords("inboxAccounts");
  const [params, setParams] = useSearchParams();
  const [fetchOpen, setFetchOpen] = useState(false);
  const client = useQueryClient();
  const accountId = params.get("account") || "";
  const account = accounts.data?.find((item) => item.id === accountId);
  const view = params.get("view") === "comment" ? "comment" : "dm";

  if (!accountId) {
    return (
      <>
        <PageHeader title="消息通知" />
        <AccountList />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={account?.name || "消息通知"}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => setFetchOpen(true)}>
              获取消息
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                change(setParams, { account: "", sender: "", message: "" })
              }
            >
              返回账号
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-4">
        <Tabs
          value={view}
          onValueChange={(value) =>
            change(setParams, { view: value, sender: "", message: "" })
          }
        >
          <TabsList aria-label="消息类型">
            <TabsTrigger value="dm">私信</TabsTrigger>
            <TabsTrigger value="comment">评论</TabsTrigger>
          </TabsList>
        </Tabs>
        {account ? (
          <p className="text-caption text-muted-foreground">{capability(account)}</p>
        ) : null}
      </div>

      <Dialog open={fetchOpen} onOpenChange={setFetchOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>获取消息</DialogTitle>
          </DialogHeader>
          <LocalReceivePanel
            accountId={accountId}
            credentialsAvailable={!!status.data?.credentialsAvailable}
            onFetched={() => {
              void client.invalidateQueries({ queryKey: ["local"] });
              setFetchOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>

      {view === "dm" ? (
        <DmInbox accountId={accountId} onSent={() => void client.invalidateQueries({ queryKey: ["local"] })} />
      ) : (
        <CommentInbox accountId={accountId} onSent={() => void client.invalidateQueries({ queryKey: ["local"] })} />
      )}
    </>
  );
}