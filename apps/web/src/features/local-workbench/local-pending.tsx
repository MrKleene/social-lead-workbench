import { useEffect, useState } from "react";
import { ChevronDown, CircleAlert, Clock, Loader2 } from "lucide-react";
import type { SendQueueItem, SendQueueTab } from "./local-api";
import { Link, useSearchParams } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  SELECT_EMPTY,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch, SwitchThumb } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/patterns/empty-state";
import { ErrorNotice } from "@/components/feedback";
import { FilterBar, FilterField } from "@/components/patterns/filter-bar";
import { FormField } from "@/components/patterns/form-field";
import { PageHeader } from "@/components/patterns/page-header";
import { Pagination } from "@/components/patterns/pagination";
import { SectionCard } from "@/components/patterns/section-card";
import { pendingReasonLabels } from "./local-status-labels";
import { useSaveSteps } from "./reply-settings";
import { useLocalAction, useLocalRecords } from "./use-local-records";

const tabs: {
  id: SendQueueTab;
  label: string;
  key: "queue" | "attention";
}[] = [
  { id: "queue", label: "发送队列", key: "queue" },
  { id: "attention", label: "需要处理", key: "attention" },
];

const queueStates: Record<string, string> = {
  WAITING_SWITCH: "等待开启",
  WAITING_QUOTA: "等待额度",
  SENDING: "发送中",
  FAILED: "发送失败",
  UNKNOWN: "结果未知",
  EXPIRED: "已过期",
};

function at(value: number): string {
  return new Date(value).toLocaleString();
}

function isOldComment(item: SendQueueItem): boolean {
  return item.commentPublishedAt !== null && Date.now() - item.commentPublishedAt > 7 * 86400000;
}

export function LocalPending() {
  const [params, setParams] = useSearchParams();
  const rawTab = params.get("tab");
  const tab: SendQueueTab =
    rawTab === "attention" || ["failed", "unknown", "expired"].includes(rawTab ?? "")
      ? "attention"
      : "queue";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const query = params.get("query") || "";
  const channel = params.get("channel") || "";
  const [search, setSearch] = useState(query);
  const [selected, setSelected] = useState<SendQueueItem[]>([]);
  const [requeue, setRequeue] = useState<SendQueueItem | null>(null);
  const [cancelTarget, setCancelTarget] = useState<SendQueueItem | null>(null);
  const [dismissTarget, setDismissTarget] = useState<SendQueueItem | null>(null);
  const [override, setOverride] = useState(false);
  const [sending, setSending] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [templateIds, setTemplateIds] = useState<string[]>([]);

  useEffect(() => setSearch(query), [query]);
  useEffect(() => {
    setSelected([]);
    setSending(false);
  }, [tab, page, query, channel]);

  const steps = useLocalRecords("automationSteps");
  const fast = { refetchInterval: tab === "queue" ? 1000 : 5000 };
  const summary = useLocalRecords("sendQueueSummary", undefined, fast);
  const records = useLocalRecords("sendQueueList", { tab, page, query, channel }, fast);
  const accounts = useLocalRecords("accountDetails");
  const configs = useLocalRecords("configurations");
  const save = useSaveSteps();
  const retry = useLocalAction("retrySendQueueItem");
  const cancel = useLocalAction("cancelSendQueueItem");
  const requeueAction = useLocalAction("requeueSendQueueItem");
  const dismiss = useLocalAction("dismissSendQueueItem");
  const sendNow = useLocalAction("sendNow");

  const items = records.data?.items ?? [];
  const total = records.data?.total ?? 0;
  const failure = records.error ?? retry.error ?? cancel.error ?? requeueAction.error ?? dismiss.error ?? sendNow.error;
  const summaryData = summary.data;
  const progress = summaryData?.progress ?? null;
  const autoReply = !!steps.data?.autoReply;
  const hasAccountPool = (steps.data?.replyAccountIds.length ?? 0) > 0;
  const hasChannel = !!steps.data && (steps.data.autoComment || steps.data.autoDm);
  const hasCommentConfig =
    !steps.data?.autoComment ||
    (steps.data.commentTemplateIds.length > 0 &&
      steps.data.replyAccountIds.length > 0);
  const hasDmConfig =
    !steps.data?.autoDm ||
    (steps.data.dmTemplateIds.length > 0 &&
      steps.data.replyAccountIds.length > 0);
  const canEnableAuto = hasChannel && hasCommentConfig && hasDmConfig;
  const channels = Array.from(new Set(selected.map((item) => item.channel)));
  const selectedChannel = channels[0] ?? null;
  const selectedChannelLabel = selectedChannel === "DM" ? "私信" : "评论";
  const sameChannel = channels.length <= 1;
  const stateLabel = (item: SendQueueItem) => {
    if (item.state === "SENDING") return "发送中";
    if (item.state === "READY" && progress && item.batchId === progress.batchId)
      return "排队中";
    if (item.state === "WAITING_QUOTA") {
      if (item.reason === "ACCOUNT_POOL_UNAVAILABLE") return "发送账号不可用";
      if (item.reason === "ACCOUNT_POOL_EMPTY") return "未配置发送账号";
    }
    return queueStates[item.state] ?? "待发送";
  };
  const progressLabel =
    progress?.state === "SENDING"
      ? "正在发送"
      : progress?.state === "WAITING_QUOTA"
        ? progress.reason === "ACCOUNT_POOL_UNAVAILABLE"
          ? "发送账号不可用"
          : progress.reason === "ACCOUNT_POOL_EMPTY"
            ? "未配置发送账号"
            : "等待额度"
        : "等待发送";
  const progressPosition = progress
    ? Math.min(progress.done + progress.failed + 1, progress.total)
    : 0;

  const templateKind =
    selectedChannel === "DM" ? "DM_TEMPLATE" : "COMMENT_TEMPLATE";
  const templates =
    configs.data?.filter((item) => item.kind === templateKind) ?? [];
  const usableAccounts =
    accounts.data?.filter((item) => item.state === "VERIFIED") ?? [];
  const templateSummary =
    templateIds.length === 0
      ? "未选择模板"
      : templateIds.length === 1
        ? "已选 1 个"
        : `已选 ${templateIds.length} 个 · 随机使用`;

  const filter = (key: string, value: string) => {
    setParams((previous) => {
      if (value) previous.set(key, value);
      else previous.delete(key);
      previous.delete("page");
      return previous;
    });
  };
  const turnPage = (next: number) => {
    setParams((previous) => {
      previous.set("page", String(next));
      return previous;
    });
  };
  const changeTab = (next: string) => {
    setParams((previous) => {
      previous.set("tab", next);
      previous.delete("page");
      return previous;
    });
  };
  const toggle = (item: SendQueueItem, checked: boolean) => {
    if (!checked) {
      setSelected((current) => current.filter((row) => row.id !== item.id));
      return;
    }
    setSelected((current) => {
      if (current.length && current[0].channel !== item.channel) return current;
      return [...current, item];
    });
  };

  const openSend = (rows: SendQueueItem[] = selected) => {
    const channel = rows[0]?.channel ?? "COMMENT";
    const kind = channel === "DM" ? "DM_TEMPLATE" : "COMMENT_TEMPLATE";
    const pool = configs.data?.filter((item) => item.kind === kind) ?? [];
    const configured =
      (channel === "DM" ? steps.data?.dmTemplateIds : steps.data?.commentTemplateIds) ??
      [];
    const available = new Set(pool.map((item) => item.id));
    setAccountId(usableAccounts[0]?.id ?? "");
    setTemplateIds([...new Set(configured)].filter((id) => available.has(id)));
    setSending(true);
  };

  return (
    <>
      <PageHeader
        title="待处理发送"
        actions={
          <div className="flex flex-wrap items-center gap-6">
            <p className="text-body text-muted-foreground">
              {hasAccountPool
                ? `今日剩余额度 ${summaryData?.remaining ?? 0} 条`
                : "未配置发送账号"}
            </p>
            <label className="flex items-center gap-2">
              <span className="text-body">自动发送</span>
              <Switch
                checked={autoReply}
                disabled={
                  !steps.data ||
                  save.isPending ||
                  (!autoReply && !canEnableAuto)
                }
                aria-label="自动发送"
                onCheckedChange={(checked) => {
                  if (!steps.data) return;
                  save.mutate({ ...steps.data, autoReply: checked });
                }}
              >
                <SwitchThumb />
              </Switch>
            </label>
            {!canEnableAuto ? (
              <div className="flex items-center gap-2">
                <p className="text-caption text-attention">
                  {hasChannel ? "发送渠道或模板未配置" : "未选择自动发送渠道"}
                </p>
                <Link
                  to="/configuration?tab=reply"
                  className="text-caption text-attention underline underline-offset-4"
                >
                  去配置
                </Link>
              </div>
            ) : null}
          </div>
        }
      />

      {summary.error ?? steps.error ? (
        <ErrorNotice error={summary.error ?? steps.error} />
      ) : null}
      {failure ? <ErrorNotice error={failure} /> : null}
      {summaryData?.paused ? (
        <Alert variant="warning">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>发送已暂停</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {summaryData.checking
                ? "系统正在自动核对发送结果"
                : summaryData.pauseReason?.includes("UNKNOWN")
                  ? "有发送结果未知"
                  : "发送结果未知"}
            </span>
            <Button asChild variant="outline" size="sm">
              <Link to="/work/notices">
                {summaryData.checking ? "查看进度" : "核对结果"}
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {progress ? (
        <SectionCard>
          <div className="flex flex-wrap items-center gap-3">
            {progress.state === "SENDING" ? (
              <Loader2
                className="size-4 shrink-0 animate-spin text-muted-foreground"
                aria-hidden="true"
              />
            ) : (
              <Clock
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-body font-medium">
                {progressLabel} {progressPosition}/{progress.total}
              </p>
              <p className="mt-1 text-caption text-muted-foreground">
                {progress.channel === "DM" ? "私信" : "评论"}
                {progress.accountName ? " · " + progress.accountName : ""}
                {progress.recipientNickname
                  ? " · 收件人 " + progress.recipientNickname
                  : ""}
              </p>
            </div>
            <p className="text-caption text-muted-foreground">
              已完成 {progress.done} 条
              {progress.failed ? " · 失败 " + progress.failed + " 条" : ""}
            </p>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="发送进度"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done + progress.failed}
          >
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{
                width: String(((progress.done + progress.failed) / progress.total) * 100) + "%",
              }}
            />
          </div>
          <p className="text-caption leading-relaxed text-muted-foreground break-words">
            {progress.postTitle || "无标题笔记"}
            {progress.comment ? " · " + progress.comment : ""}
          </p>
        </SectionCard>
      ) : null}

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList className="w-full sm:w-fit" aria-label="发送状态">
          {tabs.map((item) => (
            <TabsTrigger key={item.id} value={item.id} className="flex-1 sm:flex-none">
              {item.label} {summaryData?.[item.key] ?? 0}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={tab}>
          <SectionCard>
            <FilterBar>
              <form
                className="flex items-end gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  filter("query", search);
                }}
              >
                <FilterField label="搜索帖子、评论或收件人">
                  <Input
                    value={search}
                    maxLength={200}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </FilterField>
                <Button type="submit" variant="outline">
                  搜索
                </Button>
              </form>
              <FilterField label="渠道">
                <Select value={channel} onValueChange={(value) => filter("channel", value)}>
                  <SelectTrigger aria-label="渠道">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SELECT_EMPTY}>全部渠道</SelectItem>
                    <SelectItem value="COMMENT">评论</SelectItem>
                    <SelectItem value="DM">私信</SelectItem>
                  </SelectContent>
                </Select>
              </FilterField>
              {selected.length ? (
                <Button disabled={!sameChannel} onClick={() => openSend()}>
                  立即发送 {selected.length} 条
                </Button>
              ) : null}
              {!sameChannel ? (
                <p className="text-caption text-attention">只能选择同一渠道</p>
              ) : null}
            </FilterBar>

            {items.length ? (
              <div className="overflow-hidden rounded-md border">
                <Table aria-label="待处理发送" className="min-w-[1080px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <span className="sr-only">选择</span>
                      </TableHead>
                      <TableHead className="min-w-[250px]">帖子与评论</TableHead>
                      <TableHead>发送账号</TableHead>
                      <TableHead>渠道</TableHead>
                      <TableHead className="w-[120px]">状态 / 原因</TableHead>
                      <TableHead>入队时间</TableHead>
                      <TableHead>有效期</TableHead>
                      <TableHead className="sticky right-0 z-10 w-[200px] bg-muted text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id} className="group">
                        <TableCell className="align-top">
                          <Checkbox
                            checked={selected.some((row) => row.id === item.id)}
                            disabled={
                              tab !== "queue" ||
                              !(
                                item.state === "WAITING_SWITCH" ||
                                item.state === "READY" ||
                                item.state === "WAITING_QUOTA"
                              ) ||
                              (!!selectedChannel && selectedChannel !== item.channel)
                            }
                            aria-label={`选择 ${item.recipientNickname || item.comment.slice(0, 20)}`}
                            onCheckedChange={(checked) => toggle(item, checked === true)}
                          />
                        </TableCell>
                        <TableCell className="min-w-[250px] max-w-[320px] whitespace-normal align-top">
                          <p className="font-medium break-words">
                            {item.postTitle || "无标题笔记"}
                          </p>
                          <p className="mt-1 line-clamp-2 text-caption leading-relaxed text-muted-foreground break-words">
                            {item.comment}
                          </p>
                          <p className="mt-1 text-caption text-muted-foreground">
                            收件人 {item.recipientNickname || "未知收件人"}
                          </p>
                          <p className="mt-1 text-caption text-muted-foreground">
                            评分 {item.score ?? "—"} · {item.origin === "AUTO" ? "自动入队" : item.origin === "MANUAL_REVIEW" ? "人工通过" : "手动发送"}
                          </p>
                        </TableCell>
                        <TableCell className="align-top text-caption text-muted-foreground break-words">
                          {item.accountName ?? "待分配"}
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge variant="outline">{item.channel === "DM" ? "私信" : "评论"}</Badge>
                        </TableCell>
                        <TableCell className="w-[120px] whitespace-nowrap align-top">
                          <Badge
                            variant={
                              item.state === "FAILED"
                                ? "destructive"
                                : item.state === "UNKNOWN" ||
                                    item.state === "EXPIRED" ||
                                    item.state === "WAITING_QUOTA"
                                  ? "warning"
                                  : item.state === "SENDING"
                                    ? "success"
                                    : "outline"
                            }
                          >
                            {item.state === "SENDING" ? (
                              <Loader2 className="animate-spin" aria-hidden="true" />
                            ) : null}
                            {stateLabel(item)}
                          </Badge>
                          {item.reason ? (
                            <p className="mt-1 text-caption leading-relaxed text-muted-foreground">
                              {pendingReasonLabels[item.reason] ?? "等待处理"}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="align-top text-caption text-muted-foreground">
                          {at(item.enqueuedAt)}
                        </TableCell>
                        <TableCell className="align-top text-caption text-muted-foreground">
                          {at(item.expiresAt)}
                        </TableCell>
                        <TableCell className="sticky right-0 z-10 w-[200px] bg-card align-top transition-colors group-hover:bg-muted/50">
                          <div className="flex flex-nowrap justify-end gap-2 whitespace-nowrap">
                            {tab === "attention" ? (
                              <>
                                {item.state === "FAILED" ? (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={retry.isPending}
                                      onClick={() => retry.mutate({ id: item.id })}
                                    >
                                      重试
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={dismiss.isPending}
                                      onClick={() => setDismissTarget(item)}
                                    >
                                      移除记录
                                    </Button>
                                  </>
                                ) : null}
                                {item.state === "EXPIRED" ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setOverride(false);
                                      setRequeue(item);
                                    }}
                                  >
                                    重新排队
                                  </Button>
                                ) : null}
                                {item.state === "UNKNOWN" ? (
                                  <>
                                    <Button asChild size="sm" variant="outline">
                                      <Link to="/work/notices">核对结果</Link>
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={dismiss.isPending}
                                      onClick={() => setDismissTarget(item)}
                                    >
                                      移出队列
                                    </Button>
                                  </>
                                ) : null}
                              </>
                            ) : item.state === "SENDING" ? (
                              <span className="text-caption text-muted-foreground">
                                发送中
                              </span>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSelected([item]);
                                    openSend([item]);
                                  }}
                                >
                                  发送
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={cancel.isPending}
                                  onClick={() => setCancelTarget(item)}
                                >
                                  移出待发送
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState
                title={
                  records.isPending
                    ? "正在读取…"
                    : tab === "queue"
                      ? "没有待发送"
                      : "没有需要处理的发送"
                }
                action={
                  tab === "queue" && !records.isPending ? (
                    <Button asChild variant="link" size="sm">
                      <Link to="/comment-review">去评论审核</Link>
                    </Button>
                  ) : undefined
                }
              />
            )}

            <Pagination
              page={page}
              total={total}
              onPageChange={turnPage}
              label="发送队列分页"
            />
          </SectionCard>
        </TabsContent>
      </Tabs>

      <Dialog
        open={sending}
        onOpenChange={(open) => {
          if (!sendNow.isPending) setSending(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>立即发送 {selected.length} 条</DialogTitle>
            <DialogDescription>
              将发送 {selected.length} 条{selectedChannelLabel}，占用今日额度，不可撤回。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <FormField label="发送账号">
              <Select
                value={accountId}
                onValueChange={(value) => value && setAccountId(value)}
              >
                <SelectTrigger aria-label="发送账号">
                  <SelectValue placeholder="选择账号" />
                </SelectTrigger>
                <SelectContent>
                  {usableAccounts.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.nickname ?? item.name} · 每日 {item.daily_limit} 条
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <div className="flex min-w-0 flex-col gap-2">
              <span className="text-body">回复模板</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between font-normal"
                    aria-label="回复模板"
                  >
                    <span
                      className={
                        templateIds.length ? undefined : "text-muted-foreground"
                      }
                    >
                      {templateSummary}
                    </span>
                    <ChevronDown
                      className="size-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 p-2">
                  <div className="flex max-h-80 flex-col overflow-y-auto">
                    {templates.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start gap-2 rounded-sm px-2 py-2 hover:bg-muted"
                      >
                        <Checkbox
                          id={`send-template-${item.id}`}
                          checked={templateIds.includes(item.id)}
                          onCheckedChange={(checked) =>
                            setTemplateIds((current) =>
                              checked === true
                                ? current.includes(item.id)
                                  ? current
                                  : [...current, item.id]
                                : current.filter((id) => id !== item.id),
                            )
                          }
                          className="mt-0.5"
                          aria-label={item.name}
                        />
                        <label
                          htmlFor={`send-template-${item.id}`}
                          className="cursor-pointer text-body break-words"
                        >
                          {item.name}
                        </label>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            {!usableAccounts.length ? (
              <p className="text-caption text-attention">没有可用发送账号</p>
            ) : null}
            {!templates.length ? (
              <p className="text-caption text-attention">没有可用回复模板</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSending(false)}>
              取消
            </Button>
            <Button
              pending={sendNow.isPending}
              disabled={
                !accountId ||
                !templateIds.length ||
                !sameChannel
              }
              onClick={() => {
                sendNow.mutate(
                  {
                    ids: selected.map((item) => item.id),
                    accountId,
                    templateIds,
                  },
                  {
                    onSuccess: () => {
                      setSending(false);
                      setSelected([]);
                    },
                  },
                );
              }}
            >
              立即发送
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!cancelTarget}
        onOpenChange={(open) => {
          if (!open && !cancel.isPending) setCancelTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>移出待发送？</AlertDialogTitle>
            <AlertDialogDescription>
              这条记录将不再发送。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancel.isPending}>取消</AlertDialogCancel>
            <Button
              variant="destructive"
              pending={cancel.isPending}
              onClick={() => {
                if (!cancelTarget) return;
                cancel.mutate(
                  { id: cancelTarget.id },
                  { onSuccess: () => setCancelTarget(null) },
                );
              }}
            >
              移出待发送
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!dismissTarget}
        onOpenChange={(open) => {
          if (!open && !dismiss.isPending) setDismissTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>移除记录？</AlertDialogTitle>
            <AlertDialogDescription>
              将从列表删除这条发送记录。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={dismiss.isPending}>取消</AlertDialogCancel>
            <Button
              variant="destructive"
              pending={dismiss.isPending}
              onClick={() => {
                if (!dismissTarget) return;
                dismiss.mutate(
                  { id: dismissTarget.id },
                  { onSuccess: () => setDismissTarget(null) },
                );
              }}
            >
              移除记录
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!requeue}
        onOpenChange={(open) => {
          if (!open) setRequeue(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>重新排队</AlertDialogTitle>
            <AlertDialogDescription>
              {requeue
                ? `${requeue.postTitle || "无标题笔记"} · ${requeue.recipientNickname || "未知收件人"}`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {requeue && isOldComment(requeue) ? (
            <label className="flex items-start gap-2">
              <Checkbox
                checked={override}
                onCheckedChange={(checked) => setOverride(checked === true)}
                className="mt-0.5"
              />
              <span className="text-body leading-relaxed">
                评论发布已超过 7 天，仍要发送
              </span>
            </label>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={requeueAction.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (!requeue) return;
                requeueAction.mutate(
                  { id: requeue.id, override },
                  {
                    onSuccess: () => {
                      setRequeue(null);
                      setOverride(false);
                    },
                  },
                );
              }}
            >
              重新排队
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
