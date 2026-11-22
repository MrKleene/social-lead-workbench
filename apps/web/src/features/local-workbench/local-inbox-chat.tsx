import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckboxField } from "@/components/patterns/checkbox-field";
import { EmptyState } from "@/components/patterns/empty-state";
import { ErrorNotice } from "@/components/feedback";
import { localApi, type LocalConversation, type LocalNotification } from "./local-api";
import { cn } from "@/lib/utils";

type QueueState = "QUEUED" | "SENDING" | "SENT" | "UNKNOWN" | "FAILED" | "UNSENT";
type QueueItem = { key: string; content: string; state: QueueState; jobId?: string };
type ScopeState = { items: QueueItem[]; error: unknown };

const label: Record<QueueState, string> = {
  QUEUED: "排队中",
  SENDING: "发送中",
  SENT: "已发送",
  UNKNOWN: "结果未知",
  FAILED: "发送失败",
  UNSENT: "未发送",
};

const draftStates: QueueState[] = ["QUEUED", "SENDING", "UNSENT"];
const activeStates: QueueState[] = ["QUEUED", "SENDING"];
const scopes = new Map<string, ScopeState>();
const listeners = new Map<string, Set<() => void>>();
const handlers = new Map<string, { send: (content: string) => Promise<{ id: string }>; onSent?: () => void }>();
const pumping = new Set<string>();
const hydrated = new Set<string>();
const emptyState: ScopeState = { items: [], error: null };

function getScope(scopeKey: string) {
  let state = scopes.get(scopeKey);
  if (!state) {
    state = emptyState;
    scopes.set(scopeKey, state);
  }
  return state;
}

function storageKey(scopeKey: string) {
  return `inbox-compose:v1:${scopeKey}`;
}

function reportPending() {
  const count = [...scopes.values()].reduce(
    (sum, state) => sum + state.items.filter((item) => activeStates.includes(item.state)).length,
    0,
  );
  void localApi("reportPendingSends", { count }).catch(() => {});
}

function persist(scopeKey: string, items: QueueItem[]) {
  try {
    const pending = items.filter((item) => draftStates.includes(item.state));
    if (pending.length > 0) {
      window.localStorage.setItem(
        storageKey(scopeKey),
        JSON.stringify(pending.map((item) => ({ key: item.key, content: item.content }))),
      );
    } else {
      window.localStorage.removeItem(storageKey(scopeKey));
    }
  } catch {
    // 存储不可用时只影响崩溃恢复，不阻塞发送。
  }
}

function write(scopeKey: string, patch: Partial<ScopeState>) {
  const next = { ...getScope(scopeKey), ...patch };
  scopes.set(scopeKey, next);
  persist(scopeKey, next.items);
  reportPending();
  listeners.get(scopeKey)?.forEach((listener) => listener());
}

function subscribe(scopeKey: string, listener: () => void) {
  let set = listeners.get(scopeKey);
  if (!set) {
    set = new Set();
    listeners.set(scopeKey, set);
  }
  set.add(listener);
  return () => set?.delete(listener);
}

function hydrate(scopeKey: string) {
  if (hydrated.has(scopeKey)) return;
  hydrated.add(scopeKey);
  try {
    const raw = window.localStorage.getItem(storageKey(scopeKey));
    const stored = raw ? (JSON.parse(raw) as { content?: unknown }[]) : [];
    const items = Array.isArray(stored)
      ? stored
          .filter((item) => typeof item.content === "string" && item.content.length > 0)
          .map((item) => ({ key: crypto.randomUUID(), content: item.content as string, state: "UNSENT" as const }))
      : [];
    if (items.length > 0) write(scopeKey, { items });
  } catch {
    // 本地草稿损坏时按空队列处理，不阻止重新输入。
  }
}

async function waitForJob(jobId: string) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const page = await localApi("jobHistory", { page: 1 });
    const job = page.items.find((item) => item.id === jobId);
    if (!job) continue;
    if (job.state === "SUCCEEDED") return "SENT" as const;
    if (job.state === "UNKNOWN") return "UNKNOWN" as const;
    if (job.state === "FAILED" || job.state === "CANCELLED") return "FAILED" as const;
  }
  return "UNKNOWN" as const;
}

/** 队列独立于组件存在：离开聊天页面后仍继续发，回到页面时恢复同一队列。 */
async function pump(scopeKey: string) {
  if (pumping.has(scopeKey)) return;
  const handler = handlers.get(scopeKey);
  if (!handler) return;
  pumping.add(scopeKey);
  try {
    for (;;) {
      const next = getScope(scopeKey).items.find((item) => item.state === "QUEUED");
      if (!next) break;
      write(scopeKey, {
        items: getScope(scopeKey).items.map((item) =>
          item.key === next.key ? { ...item, state: "SENDING" as const } : item,
        ),
        error: null,
      });
      try {
        const job = await handler.send(next.content);
        write(scopeKey, {
          items: getScope(scopeKey).items.map((item) =>
            item.key === next.key ? { ...item, jobId: job.id } : item,
          ),
        });
        const result = await waitForJob(job.id);
        write(scopeKey, {
          items: getScope(scopeKey).items.map((item) =>
            item.key === next.key ? { ...item, state: result } : item,
          ),
        });
        if (result === "SENT") {
          handler.onSent?.();
          window.setTimeout(() => {
            if (getScope(scopeKey).items.some((item) => item.key === next.key)) {
              write(scopeKey, {
                items: getScope(scopeKey).items.filter((item) => item.key !== next.key),
              });
            }
          }, 1000);
        } else {
          write(scopeKey, {
            items: getScope(scopeKey).items.map((item) =>
              item.state === "QUEUED" ? { ...item, state: "FAILED" as const } : item,
            ),
            error: new Error(result === "UNKNOWN" ? "发送结果未知，后续消息已取消。" : "发送失败，后续消息已取消。"),
          });
          break;
        }
      } catch (failure) {
        write(scopeKey, {
          items: getScope(scopeKey).items.map((item) =>
            item.key === next.key || item.state === "QUEUED" ? { ...item, state: "FAILED" as const } : item,
          ),
          error: failure,
        });
        break;
      }
    }
  } finally {
    pumping.delete(scopeKey);
    if (getScope(scopeKey).items.some((item) => item.state === "QUEUED")) void pump(scopeKey);
  }
}

/** 串行发送：上一提交拿到平台确认后才发下一条，失败就取消后面的排队。 */
function SendQueue({
  disabled,
  placeholder,
  scopeKey,
  onSend,
  onSent,
}: {
  disabled?: boolean;
  placeholder: string;
  scopeKey: string;
  onSend: (content: string) => Promise<{ id: string }>;
  onSent?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [consent, setConsent] = useState(false);
  const sendRef = useRef(onSend);
  const sentRef = useRef(onSent);
  sendRef.current = onSend;
  sentRef.current = onSent;

  const state = useSyncExternalStore(
    useCallback((listener) => subscribe(scopeKey, listener), [scopeKey]),
    useCallback(() => getScope(scopeKey), [scopeKey]),
  );

  useEffect(() => {
    hydrate(scopeKey);
    handlers.set(scopeKey, {
      send: (content) => sendRef.current(content),
      onSent: () => sentRef.current?.(),
    });
    void pump(scopeKey);
  }, [scopeKey]);

  const submit = () => {
    const content = draft.trim();
    if (!content || !consent) return;
    if (/[\r\n]/.test(content)) {
      write(scopeKey, { error: new Error("消息不能换行。") });
      return;
    }
    setDraft("");
    write(scopeKey, {
      items: [...getScope(scopeKey).items, { key: crypto.randomUUID(), content, state: "QUEUED" }],
      error: null,
    });
    void pump(scopeKey);
  };

  const resend = (key: string) => {
    write(scopeKey, {
      items: getScope(scopeKey).items.map((item) => (item.key === key ? { ...item, state: "QUEUED" } : item)),
    });
    void pump(scopeKey);
  };

  const remove = (key: string) => {
    write(scopeKey, { items: getScope(scopeKey).items.filter((item) => item.key !== key) });
  };

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      {state.items.length > 0 ? (
        <div className="flex flex-col gap-2">
          {state.items.map((item) => (
            <div key={item.key} className="flex justify-end">
              <div className="max-w-[80%] rounded-lg border bg-muted px-3 py-2">
                <p className="text-body leading-relaxed break-words">{item.content}</p>
                <p className="text-caption text-muted-foreground">{label[item.state]}</p>
                {item.state === "UNSENT" ? (
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => resend(item.key)}>重新发送</Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(item.key)}>删除</Button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {state.error ? <ErrorNotice error={state.error} /> : null}

      <Textarea
        aria-label={placeholder}
        value={draft}
        rows={2}
        maxLength={1000}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
      />
      <CheckboxField checked={consent} onCheckedChange={setConsent}>
        确认发送以上内容。
      </CheckboxField>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={disabled || !consent || !draft.trim()}
          pending={state.items.some((item) => item.state === "SENDING")}
          onClick={submit}
        >
          发送
        </Button>
        {state.items.some((item) => item.state === "QUEUED") ? (
          <span role="status" className="text-caption text-muted-foreground">
            {state.items.filter((item) => item.state === "QUEUED").length} 条消息待发送
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function LocalDmChat({
  accountId,
  conversation,
  recipientName,
  onSent,
}: {
  accountId: string;
  conversation: LocalConversation;
  recipientName: string;
  onSent: () => void;
}) {
  const items = conversation.items;
  return (
    <div className="flex min-h-[420px] flex-col gap-4">
      <div className="flex items-center justify-between gap-3 border-b pb-3">
        <div>
          <h3 className="text-section font-semibold">{recipientName || conversation.senderId}</h3>
          <p className="text-caption text-muted-foreground">{conversation.account.name}</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {items.length === 0 ? (
          <EmptyState title="还没有消息。" />
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className={cn("flex", item.direction === "OUT" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-lg px-3 py-2",
                  item.direction === "OUT"
                    ? "bg-primary text-primary-foreground"
                    : "border bg-card",
                )}
              >
                <p className="text-body leading-relaxed break-words">{item.content}</p>
                <p className="text-caption opacity-70">
                  {new Date(item.at).toLocaleString()}
                  {item.direction === "OUT" && item.outcome === "UNKNOWN" ? " · 结果未知" : ""}
                  {item.direction === "OUT" && item.outcome === "FAILED" ? " · 失败" : ""}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <SendQueue
        placeholder="输入私信"
        scopeKey={`dm:${accountId}:${conversation.senderId}`}
        onSend={async (content) => {
          const latest = await localApi("conversation", {
            accountId,
            senderId: conversation.senderId,
            page: 1,
          });
          if (latest.replyable && latest.anchorId) {
            const preview = await localApi("previewReply", {
              accountId,
              senderId: conversation.senderId,
              messageId: latest.anchorId,
              content,
            });
            return localApi("authorizeReply", {
              scope: preview.scope,
              previewHash: preview.previewHash,
              consent: "send-exact-inbox-reply-once-v1",
              requestKey: crypto.randomUUID(),
            });
          }
          const preview = await localApi("previewChat", {
            accountId,
            senderId: conversation.senderId,
            recipientName,
            content,
          });
          return localApi("authorizeChat", {
            scope: preview.scope,
            previewHash: preview.previewHash,
            consent: "send-inbox-chat-message-once-v1",
            requestKey: crypto.randomUUID(),
          });
        }}
        onSent={onSent}
      />
    </div>
  );
}

export function LocalCommentReply({
  accountId,
  message,
  onSent,
}: {
  accountId: string;
  message: LocalNotification;
  onSent: () => void;
}) {
  return (
    <div className="flex min-h-[420px] flex-col gap-4">
      <div className="border-b pb-3">
        <h3 className="text-section font-semibold">{message.sender_name || "未命名用户"}</h3>
        <p className="text-caption text-muted-foreground">{message.post_title || "未记录笔记标题"}</p>
      </div>
      <div className="rounded-lg border bg-card px-3 py-2">
        <p className="text-body leading-relaxed break-words">{message.body}</p>
        <p className="text-caption text-muted-foreground">
          {new Date(message.received_at).toLocaleString()}
        </p>
      </div>
      <SendQueue
        disabled={message.replyable !== 1}
        placeholder={message.replyable === 1 ? "回复这条评论" : "无原帖引用"}
        scopeKey={`comment:${accountId}:${message.id}`}
        onSend={async (content) => {
          const preview = await localApi("previewCommentReply", {
            accountId,
            receivedMessageId: message.id,
            content,
          });
          return localApi("authorizeCommentReply", {
            scope: preview.scope,
            previewHash: preview.previewHash,
            consent: "send-inbox-comment-reply-once-v1",
            requestKey: crypto.randomUUID(),
          });
        }}
        onSent={onSent}
      />
    </div>
  );
}
