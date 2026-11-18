import { useEffect, useState } from "react";
import type { PendingContact } from "./local-api";
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
import { EmptyState } from "@/components/patterns/empty-state";
import { ErrorNotice } from "@/components/feedback";
import { FilterBar, FilterField } from "@/components/patterns/filter-bar";
import { PageHeader } from "@/components/patterns/page-header";
import { Pagination } from "@/components/patterns/pagination";
import { SectionCard } from "@/components/patterns/section-card";
import { EvidenceVerifyDialog } from "./local-evidence";
import { useLocalEvidence } from "./use-local-evidence";
import { useLocalAction, useLocalRecords } from "./use-local-records";

type PendingView = "unsent" | "unknown";
type BadgeVariant = "warning" | "outline" | "destructive";

const reasonMeta: Record<string, { label: string; variant: BadgeVariant }> = {
  ACCOUNT_POOL_QUOTA_EXHAUSTED: { label: "额度不足", variant: "warning" },
  ACCOUNT_POOL_RESTRICTED: { label: "账号池停止", variant: "warning" },
  ACCOUNT_SWITCHED: { label: "已换号", variant: "outline" },
};

function pendingReason(item: PendingContact): { label: string; variant: BadgeVariant } {
  if (reasonMeta[item.reason]) return reasonMeta[item.reason];
  if (item.jobState === "CANCELLED") return { label: "已取消", variant: "outline" };
  if (item.jobState === "FAILED") return { label: "失败", variant: "destructive" };
  if (item.jobState === "INTERRUPTED") return { label: "已中断", variant: "warning" };
  return { label: item.reason || "未发送", variant: "outline" };
}

function at(value: number): string {
  return new Date(value).toLocaleString();
}

export function LocalPending() {
  const [params, setParams] = useSearchParams();
  const view: PendingView = params.get("view") === "unknown" ? "unknown" : "unsent";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const query = params.get("query") || "";
  const channel = params.get("channel") || "";
  const reason = params.get("reason") || "";
  const account = params.get("account") || "";
  const days = Math.max(0, Number(params.get("days")) || 0);
  const [search, setSearch] = useState(query);
  const [requeue, setRequeue] = useState<PendingContact | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);

  useEffect(() => setSearch(query), [query]);

  const summary = useLocalRecords("pendingContacts", { page: 1 });
  const unsent = useLocalRecords(
    "pendingContacts",
    { page, query, channel, reason, days },
    { enabled: view === "unsent" },
  );
  const evidence = useLocalEvidence();
  const retry = useLocalAction("retryPendingContact");
  const dismiss = useLocalAction("dismissPendingContact");

  const attempts = evidence.overview.data?.attempts ?? [];
  const unknownTotal = attempts.length;
  const unknownFiltered = attempts.filter((attempt) => {
    if (channel && attempt.channel !== channel) return false;
    if (account && attempt.account_id !== account) return false;
    if (days && attempt.updated_at < Date.now() - days * 86400000) return false;
    if (!query) return true;
    const text = `${attempt.account_name} ${attempt.recipient_id} ${attempt.content}`.toLowerCase();
    return text.includes(query.toLowerCase());
  });
  const unknownPageCount = Math.max(1, Math.ceil(unknownFiltered.length / 20));
  const unknownPage = Math.min(page, unknownPageCount);
  const unknownRows = unknownFiltered.slice((unknownPage - 1) * 20, unknownPage * 20);
  const accounts = Array.from(
    new Map(attempts.map((attempt) => [attempt.account_id, attempt.account_name])).entries(),
  );
  const pendingItems = unsent.data?.items ?? [];
  const pendingTotal = unsent.data?.total ?? 0;
  const remaining = unsent.data?.remaining ?? summary.data?.remaining ?? 0;
  const unsentFailure = unsent.error ?? retry.error ?? dismiss.error;
  const globalFailure = summary.error ?? evidence.overview.error;

  const filter = (key: string, value: string) => {
    setParams((previous) => {
      previous.set(key, value);
      previous.delete("page");
      return previous;
    });
  };
  const clear = () => {
    setParams((previous) => {
      const next = new URLSearchParams();
      if (previous.get("view") === "unknown") next.set("view", "unknown");
      return next;
    });
  };
  const changeView = (nextView: PendingView) => {
    setParams((previous) => {
      previous.set("view", nextView);
      previous.delete("page");
      if (nextView === "unsent") previous.delete("account");
      else previous.delete("reason");
      return previous;
    });
  };
  const turnPage = (next: number) => {
    setParams((previous) => {
      previous.set("page", String(next));
      return previous;
    });
  };

  const empty =
    (summary.data?.total ?? 0) === 0 &&
    unknownTotal === 0 &&
    !summary.isPending &&
    !globalFailure;

  return (
    <>
      <PageHeader
        title="待处理回复"
        description={`未发送 ${summary.data?.total ?? 0} · 结果未知 ${unknownTotal}`}
        actions={
          <p className="text-body text-muted-foreground">
            今日剩余额度 {remaining} 条
          </p>
        }
      />

      {globalFailure ? <ErrorNotice error={globalFailure} /> : null}

      {empty ? (
        <SectionCard>
          <EmptyState
            title="没有待处理回复"
            description={`未发送 0 · 结果未知 0`}
          />
        </SectionCard>
      ) : (
        <Tabs value={view} onValueChange={(value) => changeView(value as PendingView)}>
          <TabsList className="w-full sm:w-fit" aria-label="待处理回复类型">
            <TabsTrigger value="unsent" className="flex-1 sm:flex-none">未发送 {summary.data?.total ?? 0}</TabsTrigger>
            <TabsTrigger value="unknown" className="flex-1 sm:flex-none">结果未知 {unknownTotal}</TabsTrigger>
          </TabsList>

          <TabsContent value="unsent">
            <SectionCard>
              <FilterBar>
                <form
                  className="flex items-end gap-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    filter("query", search);
                  }}
                >
                  <FilterField label="搜索帖子、评论或回复内容">
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
                <FilterField label="原因">
                  <Select value={reason} onValueChange={(value) => filter("reason", value)}>
                    <SelectTrigger aria-label="原因">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SELECT_EMPTY}>全部原因</SelectItem>
                      <SelectItem value="QUOTA">额度不足</SelectItem>
                      <SelectItem value="POOL">账号池停止</SelectItem>
                      <SelectItem value="STOPPED">任务已结束</SelectItem>
                    </SelectContent>
                  </Select>
                </FilterField>
                <FilterField label="时间">
                  <Select
                    value={days ? String(days) : SELECT_EMPTY}
                    onValueChange={(value) => filter("days", value)}
                  >
                    <SelectTrigger aria-label="时间">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SELECT_EMPTY}>不限时间</SelectItem>
                      <SelectItem value="1">最近 1 天</SelectItem>
                      <SelectItem value="7">最近 7 天</SelectItem>
                      <SelectItem value="30">最近 30 天</SelectItem>
                      <SelectItem value="90">最近 90 天</SelectItem>
                    </SelectContent>
                  </Select>
                </FilterField>
                <Button variant="ghost" onClick={clear}>
                  清除
                </Button>
              </FilterBar>

              {unsentFailure ? <ErrorNotice error={unsentFailure} /> : null}

              {pendingItems.length ? (
                <div className="overflow-hidden rounded-md border">
                  <Table aria-label="未发送的回复" className="min-w-[860px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>待回复</TableHead>
                        <TableHead>将发送</TableHead>
                        <TableHead>渠道</TableHead>
                        <TableHead>原因</TableHead>
                        <TableHead>时间</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingItems.map((item) => {
                        const meta = pendingReason(item);
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="max-w-[280px] whitespace-normal align-top">
                              <p className="font-medium break-words">{item.postTitle || "无标题笔记"}</p>
                              <p className="mt-1 text-caption leading-relaxed text-muted-foreground line-clamp-2">
                                {item.comment}
                              </p>
                            </TableCell>
                            <TableCell className="max-w-[280px] whitespace-normal align-top">
                              <p className="text-body leading-relaxed line-clamp-2">{item.content}</p>
                            </TableCell>
                            <TableCell className="align-top">
                              <Badge variant="outline">{item.channel === "DM" ? "私信" : "评论"}</Badge>
                            </TableCell>
                            <TableCell className="align-top">
                              <Badge variant={meta.variant}>{meta.label}</Badge>
                            </TableCell>
                            <TableCell className="align-top text-caption text-muted-foreground">
                              {at(item.createdAt)}
                            </TableCell>
                            <TableCell className="align-top">
                              <div className="flex flex-nowrap justify-end gap-2 whitespace-nowrap">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={remaining < 1}
                                  onClick={() => setRequeue(item)}
                                >
                                  重新加入队列
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={dismiss.isPending}
                                  onClick={() => dismiss.mutate({ id: item.id })}
                                >
                                  忽略
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <EmptyState
                  title={unsent.isPending ? "正在读取待处理回复…" : "没有未发送的回复"}
                />
              )}

              <Pagination
                page={page}
                total={pendingTotal}
                onPageChange={turnPage}
                label="未发送回复分页"
              />
            </SectionCard>
          </TabsContent>

          <TabsContent value="unknown">
            <SectionCard>
              <FilterBar>
                <form
                  className="flex items-end gap-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    filter("query", search);
                  }}
                >
                  <FilterField label="搜索账号、目标或回复内容">
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
                <FilterField label="账号">
                  <Select value={account} onValueChange={(value) => filter("account", value)}>
                    <SelectTrigger aria-label="账号">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SELECT_EMPTY}>全部账号</SelectItem>
                      {accounts.map(([id, name]) => (
                        <SelectItem key={id} value={id}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FilterField>
                <FilterField label="时间">
                  <Select
                    value={days ? String(days) : SELECT_EMPTY}
                    onValueChange={(value) => filter("days", value)}
                  >
                    <SelectTrigger aria-label="时间">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SELECT_EMPTY}>不限时间</SelectItem>
                      <SelectItem value="1">最近 1 天</SelectItem>
                      <SelectItem value="7">最近 7 天</SelectItem>
                      <SelectItem value="30">最近 30 天</SelectItem>
                      <SelectItem value="90">最近 90 天</SelectItem>
                    </SelectContent>
                  </Select>
                </FilterField>
                <Button variant="ghost" onClick={clear}>
                  清除
                </Button>
              </FilterBar>

              {evidence.error ? <ErrorNotice error={evidence.error} /> : null}

              {unknownRows.length ? (
                <div className="overflow-hidden rounded-md border">
                  <Table aria-label="结果未知的回复" className="min-w-[860px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>账号</TableHead>
                        <TableHead>目标</TableHead>
                        <TableHead>内容</TableHead>
                        <TableHead>渠道</TableHead>
                        <TableHead>时间</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unknownRows.map((attempt) => (
                        <TableRow key={attempt.id}>
                          <TableCell className="align-top">
                            <p className="font-medium break-words">{attempt.account_name}</p>
                            <Badge variant="warning" className="mt-1">
                              结果未知
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[180px] whitespace-normal align-top text-caption text-muted-foreground break-words">
                            {attempt.recipient_id}
                          </TableCell>
                          <TableCell className="max-w-[320px] whitespace-normal align-top">
                            <p className="text-body leading-relaxed line-clamp-2">{attempt.content}</p>
                          </TableCell>
                          <TableCell className="align-top">
                            <Badge variant="outline">
                              {attempt.channel === "DM" ? "私信" : "评论"}
                            </Badge>
                          </TableCell>
                          <TableCell className="align-top text-caption text-muted-foreground">
                            {at(attempt.updated_at)}
                          </TableCell>
                          <TableCell className="align-top text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setVerifying(attempt.id)}
                            >
                              核对未知结果
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <EmptyState
                  title={
                    evidence.overview.isPending
                      ? "正在读取结果未知的回复…"
                      : "没有结果未知的回复"
                  }
                />
              )}

              <Pagination
                page={unknownPage}
                total={unknownFiltered.length}
                pageSize={20}
                onPageChange={turnPage}
                label="结果未知回复分页"
              />
            </SectionCard>
          </TabsContent>
        </Tabs>
      )}

      <AlertDialog open={!!requeue} onOpenChange={(open) => { if (!open) setRequeue(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>重新加入队列</AlertDialogTitle>
            <AlertDialogDescription>
              {requeue?.content}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={retry.isPending}
              onClick={() => {
                if (!requeue) return;
                retry.mutate({ id: requeue.id }, { onSuccess: () => setRequeue(null) });
              }}
            >
              重新加入队列
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EvidenceVerifyDialog
        attempt={attempts.find((attempt) => attempt.id === verifying) ?? null}
        evidence={evidence}
        onClose={() => setVerifying(null)}
      />
    </>
  );
}
