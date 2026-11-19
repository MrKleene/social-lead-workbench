import { useEffect, useState } from "react";
import type { SendQueueItem, SendQueueTab } from "./local-api";
import { useSearchParams } from "@/lib/router-compat";
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
import { EmptyState } from "@/components/patterns/empty-state";
import { ErrorNotice } from "@/components/feedback";
import { FilterBar, FilterField } from "@/components/patterns/filter-bar";
import { FormField } from "@/components/patterns/form-field";
import { PageHeader } from "@/components/patterns/page-header";
import { Pagination } from "@/components/patterns/pagination";
import { SectionCard } from "@/components/patterns/section-card";
import { useSaveSteps } from "./reply-settings";
import { useLocalAction, useLocalRecords } from "./use-local-records";

const tabs: { id: SendQueueTab; label: string; key: "pending" | "quota" | "failed" | "unknown" | "expired" }[] = [
  { id: "pending", label: "待发送", key: "pending" },
  { id: "quota", label: "等待额度", key: "quota" },
  { id: "failed", label: "发送失败", key: "failed" },
  { id: "unknown", label: "结果未知", key: "unknown" },
  { id: "expired", label: "已过期", key: "expired" },
];

const reasonLabels: Record<string, string> = {
  ACCOUNT_POOL_QUOTA_EXHAUSTED: "今日额度已用完",
  WAITING_SWITCH: "自动发送已关闭",
  TEMPLATE_CHANGED: "模板已变化",
  ELIGIBILITY_CHANGED: "评论或配置已变化",
  COMMENT_TOO_OLD: "评论发布超过 7 天",
  QUEUE_TOO_OLD: "入队超过 7 天",
  SEND_INTERRUPTED: "发送中断",
  SUBMISSION_UNKNOWN: "结果未知",
  RULE_REVOKED: "自动回复已停用",
  REVIEW_REJECTED: "评论已排除",
};

function at(value: number): string {
  return new Date(value).toLocaleString();
}

function isOldComment(item: SendQueueItem): boolean {
  return item.commentPublishedAt !== null && Date.now() - item.commentPublishedAt > 7 * 86400000;
}

export function LocalPending() {
  const [params, setParams] = useSearchParams();
  const tab = (tabs.find((item) => item.id === params.get("tab"))?.id ?? "pending") as SendQueueTab;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const query = params.get("query") || "";
  const channel = params.get("channel") || "";
  const [search, setSearch] = useState(query);
  const [selected, setSelected] = useState<SendQueueItem[]>([]);
  const [requeue, setRequeue] = useState<SendQueueItem | null>(null);
  const [override, setOverride] = useState(false);
  const [sending, setSending] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [templateId, setTemplateId] = useState("");

  useEffect(() => setSearch(query), [query]);
  useEffect(() => {
    setSelected([]);
    setSending(false);
  }, [tab, page, query, channel]);

  const steps = useLocalRecords("automationSteps");
  const summary = useLocalRecords("sendQueueSummary");
  const records = useLocalRecords("sendQueueList", { tab, page, query, channel });
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
  const autoReply = !!steps.data?.autoReply;
  const channels = Array.from(new Set(selected.map((item) => item.channel)));
  const selectedChannel = channels[0] ?? null;
  const sameChannel = channels.length <= 1;

  const templateKind =
    selectedChannel === "DM" ? "DM_TEMPLATE" : "COMMENT_TEMPLATE";
  const templates =
    configs.data?.filter((item) => item.kind === templateKind) ?? [];
  const usableAccounts =
    accounts.data?.filter((item) => item.state === "VERIFIED") ?? [];

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

  const openSend = () => {
    setAccountId(usableAccounts[0]?.id ?? "");
    setTemplateId(templates[0]?.id ?? "");
    setSending(true);
  };

  return (
    <>
      <PageHeader
        title="待处理发送"
        actions={
          <div className="flex items-center gap-6">
            <p className="text-body text-muted-foreground">
              今日剩余额度 {summaryData?.remaining ?? 0} 条
            </p>
            <label className="flex items-center gap-2">
              <span className="text-body">自动发送</span>
              <Switch
                checked={autoReply}
                disabled={!steps.data || save.isPending}
                aria-label="自动发送"
                onCheckedChange={(checked) => {
                  if (!steps.data) return;
                  save.mutate({ ...steps.data, autoReply: checked });
                }}
              >
                <SwitchThumb />
              </Switch>
            </label>
          </div>
        }
      />

      {summary.error ?? steps.error ? (
        <ErrorNotice error={summary.error ?? steps.error} />
      ) : null}
      {failure ? <ErrorNotice error={failure} /> : null}

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
                <Button disabled={!sameChannel} onClick={openSend}>
                  立即发送 {selected.length} 条
                </Button>
              ) : null}
              {!sameChannel ? (
                <p className="text-caption text-attention">只能选择同一渠道</p>
              ) : null}
            </FilterBar>

            {items.length ? (
              <div className="overflow-hidden rounded-md border">
                <Table aria-label="待处理发送" className="min-w-[960px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <span className="sr-only">选择</span>
                      </TableHead>
                      <TableHead>帖子与评论</TableHead>
                      <TableHead>收件人</TableHead>
                      <TableHead>渠道</TableHead>
                      <TableHead>状态 / 原因</TableHead>
                      <TableHead>时间</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="align-top">
                          <Checkbox
                            checked={selected.some((row) => row.id === item.id)}
                            disabled={
                              !(
                                item.state === "WAITING_SWITCH" ||
                                item.state === "READY" ||
                                item.state === "WAITING_QUOTA" ||
                                item.state === "FAILED"
                              ) ||
                              (!!selectedChannel && selectedChannel !== item.channel)
                            }
                            aria-label={`选择 ${item.recipientId}`}
                            onCheckedChange={(checked) => toggle(item, checked === true)}
                          />
                        </TableCell>
                        <TableCell className="max-w-[320px] whitespace-normal align-top">
                          <p className="font-medium break-words">
                            {item.postTitle || "无标题笔记"}
                          </p>
                          <p className="mt-1 line-clamp-2 text-caption leading-relaxed text-muted-foreground break-words">
                            {item.comment}
                          </p>
                          <p className="mt-1 text-caption text-muted-foreground">
                            评分 {item.score ?? "—"} · {item.origin === "AUTO" ? "自动入队" : item.origin === "MANUAL_REVIEW" ? "人工通过" : "手动发送"}
                          </p>
                        </TableCell>
                        <TableCell className="align-top text-caption text-muted-foreground break-words">
                          {item.accountName ?? "未分配账号"}
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge variant="outline">{item.channel === "DM" ? "私信" : "评论"}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[220px] whitespace-normal align-top">
                          <Badge
                            variant={
                              item.state === "FAILED"
                                ? "destructive"
                                : item.state === "UNKNOWN" || item.state === "EXPIRED"
                                  ? "warning"
                                  : item.state === "SENDING"
                                    ? "success"
                                    : "outline"
                            }
                          >
                            {item.state === "WAITING_SWITCH" ? "等待开启" : item.state === "WAITING_QUOTA" ? "等待额度" : item.state === "SENDING" ? "发送中" : item.state === "FAILED" ? "失败" : item.state === "UNKNOWN" ? "结果未知" : item.state === "EXPIRED" ? "已过期" : "待发送"}
                          </Badge>
                          {item.reason ? (
                            <p className="mt-1 text-caption leading-relaxed text-muted-foreground break-words">
                              {reasonLabels[item.reason] ?? item.reason}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="align-top text-caption text-muted-foreground">
                          {at(item.enqueuedAt)}
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex flex-nowrap justify-end gap-2 whitespace-nowrap">
                            {tab === "failed" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={retry.isPending}
                                onClick={() => retry.mutate({ id: item.id })}
                              >
                                重试
                              </Button>
                            ) : null}
                            {tab === "expired" ? (
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
                            {tab === "pending" || tab === "quota" ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={item.state === "SENDING" || cancel.isPending}
                                onClick={() => cancel.mutate({ id: item.id })}
                              >
                                取消
                              </Button>
                            ) : null}
                            {tab === "failed" || tab === "unknown" ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={dismiss.isPending}
                                onClick={() => dismiss.mutate({ id: item.id })}
                              >
                                忽略
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState
                title={records.isPending ? "正在读取…" : `没有${tabs.find((item) => item.id === tab)?.label ?? "记录"}`}
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

      <AlertDialog
        open={sending}
        onOpenChange={(open) => {
          if (!sendNow.isPending) setSending(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>立即发送 {selected.length} 条</AlertDialogTitle>
            <AlertDialogDescription>
              选中记录会排在队列前面，当前发送完成后再继续。
            </AlertDialogDescription>
          </AlertDialogHeader>
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
            <FormField label="回复模板">
              <Select
                value={templateId}
                onValueChange={(value) => value && setTemplateId(value)}
              >
                <SelectTrigger aria-label="回复模板">
                  <SelectValue placeholder="选择模板" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            {!usableAccounts.length ? (
              <p className="text-caption text-attention">没有可用发送账号</p>
            ) : null}
            {!templates.length ? (
              <p className="text-caption text-attention">没有可用回复模板</p>
            ) : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                !accountId ||
                !templateId ||
                !sameChannel ||
                sendNow.isPending
              }
              onClick={(event) => {
                event.preventDefault();
                sendNow.mutate(
                  {
                    ids: selected.map((item) => item.id),
                    accountId,
                    templateId,
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
            </AlertDialogAction>
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
              {requeue ? `${requeue.postTitle || "无标题笔记"} · ${requeue.recipientId}` : ""}
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
