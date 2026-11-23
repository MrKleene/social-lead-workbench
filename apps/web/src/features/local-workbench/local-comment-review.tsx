import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutGrid, List, Search } from "lucide-react";
import { toast } from "sonner";
import { useSearchParams } from "@/lib/router-compat";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/patterns/empty-state";
import { FilterBar, FilterField } from "@/components/patterns/filter-bar";
import { PageHeader } from "@/components/patterns/page-header";
import { Pagination } from "@/components/patterns/pagination";
import { ErrorNotice, Loading } from "@/components/feedback";
import { LocalContact } from "./local-contact";
import { LocalPostHistory } from "./local-post-history";
import { ReviewDecisionActions } from "./review-actions";
import { ReviewDetail } from "./review-detail";
import { ReviewPostDialog } from "./review-post-dialog";
import { ReviewPostGrid } from "./review-post-card";
import { useLocalAction, useLocalRecords } from "./use-local-records";
import {
  localApi,
  type GenerateQueuePreview,
  type LocalReview,
  type ReviewAuthorGroup,
  type ReviewCommentListItem,
} from "./local-api";
import {
  day,
  approvalState,
  coverageLabels,
  coverageVariant,
  decisionLabels,
  decisionVariant,
  score,
  toReview,
} from "./review-model";

type ReviewDecision = "APPROVED" | "REJECTED" | "PENDING";

export function LocalCommentReview() {
  const [params, setParams] = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);
  const [queryDraft, setQueryDraft] = useState(params.get("query") || "");
  const [minDraft, setMinDraft] = useState(params.get("score") || "");
  const [maxDraft, setMaxDraft] = useState(params.get("maxScore") || "");
  const [commentPageSize, setCommentPageSize] = useState(30);
  const [detail, setDetail] = useState<LocalReview | null>(null);
  const [contact, setContact] = useState<LocalReview | null>(null);
  const [original, setOriginal] = useState<LocalReview | null>(null);
  const [preview, setPreview] = useState<GenerateQueuePreview | null>(null);
  const [groupDetail, setGroupDetail] = useState<ReviewAuthorGroup | null>(null);
  const [groupPrompt, setGroupPrompt] = useState<{
    group: ReviewAuthorGroup;
    next: ReviewDecision;
  } | null>(null);
  const client = useQueryClient();
  const generate = useLocalAction("generateSendQueue");

  const runId = params.get("run") || "";
  const rawView = params.get("view");
  const view = rawView === "comments" || (!rawView && !runId) ? "comments" : "posts";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const selectedPostId = params.get("post") || "";
  const query = params.get("query") || "";
  const decision = params.get("decision") || "";
  const context = params.get("context") || "";
  const mode = params.get("mode") || "";
  const minScore = Number(params.get("score")) || 0;
  const maxScore = params.has("maxScore") ? Number(params.get("maxScore")) : 100;
  const from = params.get("from") || "";
  const to = params.get("to") || "";
  const publication = params.get("publication") || "";
  const sort = params.get("sort") || "newest";
  const policyId = params.get("policy") || "";
  const queue = params.get("queue") || "";

  const update = (key: string, value: string) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value) next.set(key, value);
        else next.delete(key);
        next.delete("page");
        next.delete("post");
        return next;
      },
      { replace: true, flushSync: true },
    );

  useEffect(() => {
    setQueryDraft(query);
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (queryDraft !== query) update("query", queryDraft);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [queryDraft, query]);

  useEffect(() => {
    setMinDraft(minScore === 0 ? "" : String(minScore));
  }, [minScore]);

  useEffect(() => {
    setMaxDraft(maxScore === 100 ? "" : String(maxScore));
  }, [maxScore]);

  const commitMin = () => {
    const text = minDraft.trim();
    if (!text) {
      update("score", "");
      return;
    }
    const value = Number(text);
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      setMinDraft(minScore === 0 ? "" : String(minScore));
      return;
    }
    update("score", value === 0 ? "" : String(value));
  };

  const commitMax = () => {
    const text = maxDraft.trim();
    if (!text) {
      update("maxScore", "");
      return;
    }
    const value = Number(text);
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      setMaxDraft(maxScore === 100 ? "" : String(maxScore));
      return;
    }
    update("maxScore", value === 100 ? "" : String(value));
  };

  const setView = (next: "posts" | "comments") =>
    setParams(
      (previous) => {
        const value = new URLSearchParams(previous);
        value.set("view", next);
        value.delete("page");
        value.delete("post");
        return value;
      },
      { replace: true, flushSync: true },
    );

  const setPage = (next: number) =>
    setParams(
      (previous) => {
        const value = new URLSearchParams(previous);
        value.set("page", String(next));
        return value;
      },
      { replace: true, flushSync: true },
    );

  const openPost = (postId: string) =>
    setParams(
      (previous) => {
        const value = new URLSearchParams(previous);
        value.set("post", postId);
        return value;
      },
      { replace: true, flushSync: true },
    );

  const closePost = () =>
    setParams(
      (previous) => {
        const value = new URLSearchParams(previous);
        value.delete("post");
        return value;
      },
      { replace: true, flushSync: true },
    );

  const clear = () =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const key of [
          "query",
          "status",
          "decision",
          "context",
          "mode",
          "score",
          "maxScore",
          "from",
          "to",
          "publication",
          "queue",
          "sort",
          "policy",
          "page",
          "post",
        ])
          next.delete(key);
        return next;
      },
      { replace: true, flushSync: true },
    );

  const hasFilters = Boolean(
    query ||
      decision ||
      context ||
      mode ||
      minScore > 0 ||
      maxScore < 100 ||
      from ||
      to ||
      publication ||
      policyId ||
      queue,
  );
  const advancedCount = [
    policyId,
    context,
    mode,
    from,
    to,
    publication,
    minScore > 0,
    maxScore < 100,
  ].filter(Boolean).length;

  const workflow = useQuery({
    queryKey: ["local", "workflow"],
    queryFn: () => localApi("workflowOverview"),
  });

  const reviewPosts = useQuery({
    queryKey: [
      "local",
      "reviewPosts",
      page,
      8,
      runId,
      policyId,
      query,
      decision,
      context,
      minScore,
      maxScore,
      mode,
      from,
      to,
      publication,
      queue,
    ],
    queryFn: () =>
      localApi("reviewPosts", {
        page,
        pageSize: 8,
        runId,
        policyId,
        query,
        decision,
        context,
        minScore,
        maxScore,
        mode,
        from,
        to,
        publication,
        queue,
      }),
    enabled: view === "posts",
  });

  const groupList = useQuery({
    queryKey: [
      "local",
      "reviewAuthorGroups",
      page,
      commentPageSize,
      runId,
      policyId,
      query,
      decision,
      context,
      minScore,
      maxScore,
      mode,
      from,
      to,
      publication,
      queue,
      sort,
    ],
    queryFn: () =>
      localApi("reviewAuthorGroups", {
        page,
        pageSize: commentPageSize,
        runId,
        policyId,
        query,
        decision,
        context,
        minScore,
        maxScore,
        mode,
        from,
        to,
        publication,
        queue,
        sort,
      }),
    enabled: view === "comments",
  });

  const queueRules = useLocalRecords("queueRules");
  const pendingComments = (group: ReviewAuthorGroup) =>
    group.comments.filter((row) => row.review_status === "PENDING");
  const unmatchedPending = (group: ReviewAuthorGroup) =>
    pendingComments(group).filter((row) => row.decision === "NO_MATCH");
  const actionCount = (group: ReviewAuthorGroup, next: ReviewDecision) =>
    next === "APPROVED"
      ? pendingComments(group).length - unmatchedPending(group).length
      : next === "REJECTED"
        ? pendingComments(group).length
        : group.comments.filter((row) => row.review_status === "REJECTED").length;
  const decideGroup = useMutation({
    mutationFn: ({
      group,
      next,
    }: {
      group: ReviewAuthorGroup;
      next: ReviewDecision;
    }) => {
      const items = group.comments.flatMap((row) =>
        row.review_id && row.version !== null
          ? [{ id: row.review_id, version: row.version }]
          : [],
      );
      return localApi("decideReviewGroup", {
        representativeId: group.representative.review_id ?? "",
        items,
        status: next,
      });
    },
    onSuccess: (result, variables) => {
      const count = actionCount(variables.group, variables.next);
      if (variables.next === "APPROVED") {
        const unmatched = unmatchedPending(variables.group).length;
        toast.success(
          `已通过这位作者的 ${count} 条评论${result.queued ? "，加入待发送队列" : ""}${unmatched ? `；${unmatched} 条不符合已标记` : ""}`,
        );
      } else if (variables.next === "REJECTED") {
        toast.success(`已标记这位作者的 ${count} 条评论为不符合`);
      } else {
        toast.success(`已恢复这位作者的 ${count} 条评论为待确认`);
      }
      setGroupPrompt(null);
      setGroupDetail(null);
      void client.invalidateQueries({ queryKey: ["local"] });
    },
  });

  const selectedPost = reviewPosts.data?.items.find(
    (post) => post.postId === selectedPostId,
  );
  const ruleFor = (row: ReviewCommentListItem) =>
    queueRules.data?.find((rule) => rule.policyId === row.policy_id) ?? null;
  const groupApproval = (group: ReviewAuthorGroup) => {
    const pending = group.comments.filter(
      (row) => row.review_status === "PENDING",
    );
    const candidates = pending.filter((row) => row.decision !== "NO_MATCH");
    const fallbackRow = candidates[0] ?? pending[0] ?? group.representative;
    const matched = candidates
      .map((row) => approvalState(row, ruleFor(row)))
      .find((item) => item.canApprove);
    const approval = matched ?? approvalState(fallbackRow, ruleFor(fallbackRow));
    return {
      canApprove:
        !group.covered &&
        !group.queueState &&
        Boolean(group.representative.review_id) &&
        Boolean(matched),
      canReject: !group.covered && !group.queueState && pending.length > 0,
      approveHint: approval.approveHint,
    };
  };
  const askGroupDecision = (group: ReviewAuthorGroup, next: ReviewDecision) =>
    setGroupPrompt({ group, next });
  const error =
    workflow.error ??
    reviewPosts.error ??
    groupList.error ??
    decideGroup.error ??
    queueRules.error;
  const total =
    view === "posts" ? reviewPosts.data?.total : groupList.data?.total;
  const description =
    total === undefined
      ? "正在读取…"
      : view === "posts"
        ? total + " 篇帖子"
        : `${total} 位作者 · ${groupList.data?.commentTotal ?? 0} 条评论`;

  return (
    <>
      <PageHeader
        title="评论审核"
        description={description}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="outline"
              pending={generate.isPending}
              onClick={() =>
                generate.mutate(
                  { apply: false },
                  { onSuccess: (data) => setPreview(data) },
                )
              }
            >
              生成待发送
            </Button>
            <div
              className="flex items-center gap-1 rounded-md border p-0.5"
              role="group"
              aria-label="切换评论审核视图"
            >
              <Button
                variant={view === "posts" ? "default" : "ghost"}
                size="icon-sm"
                aria-label="按帖子"
                aria-pressed={view === "posts"}
                onClick={() => setView("posts")}
              >
                <LayoutGrid />
              </Button>
              <Button
                variant={view === "comments" ? "default" : "ghost"}
                size="icon-sm"
                aria-label="全部评论"
                aria-pressed={view === "comments"}
                onClick={() => setView("comments")}
              >
                <List />
              </Button>
            </div>
          </div>
        }
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full min-w-0 sm:max-w-xs sm:flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              maxLength={200}
              placeholder={view === "posts" ? "搜索帖子或评论" : "搜索评论原文"}
              aria-label={view === "posts" ? "搜索帖子或评论" : "搜索评论原文"}
              value={queryDraft}
              className="pl-10"
              onChange={(event) => setQueryDraft(event.target.value)}
            />
          </div>
          <Select value={decision} onValueChange={(value) => update("decision", value)}>
            <SelectTrigger aria-label="判断" className="w-[calc(50%-0.25rem)] sm:w-[128px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SELECT_EMPTY}>全部判断</SelectItem>
              <SelectItem value="MATCH">符合</SelectItem>
              <SelectItem value="NO_MATCH">不符合</SelectItem>
              <SelectItem value="UNCERTAIN">不确定</SelectItem>
            </SelectContent>
          </Select>
          <Select value={queue} onValueChange={(value) => update("queue", value)}>
            <SelectTrigger aria-label="入队状态" className="w-[calc(50%-0.25rem)] sm:w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SELECT_EMPTY}>全部队列</SelectItem>
              <SelectItem value="NONE">未入队</SelectItem>
              <SelectItem value="QUEUED">已入队</SelectItem>
              <SelectItem value="SENT">已发送</SelectItem>
              <SelectItem value="FAILED">发送失败</SelectItem>
              <SelectItem value="UNKNOWN">结果未知</SelectItem>
              <SelectItem value="EXPIRED">已过期</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            aria-expanded={showFilters}
            onClick={() => setShowFilters((value) => !value)}
          >
            {showFilters ? "收起筛选" : "更多筛选"}
            {advancedCount ? <Badge variant="secondary">{advancedCount}</Badge> : null}
          </Button>
          <Button variant="ghost" disabled={!hasFilters} onClick={clear}>
            清除筛选
          </Button>
          {runId ? (
            <div className="flex items-center gap-2 sm:ms-auto">
              <Badge variant="outline">本轮</Badge>
              <Button variant="ghost" onClick={() => update("run", "")}>
                查看全部轮次
              </Button>
            </div>
          ) : null}
        </div>

        {showFilters ? (
          <FilterBar>
            <FilterField label="匹配方案">
              <Select value={policyId} onValueChange={(value) => update("policy", value)}>
                <SelectTrigger aria-label="匹配方案">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SELECT_EMPTY}>全部匹配方案</SelectItem>
                  {workflow.data?.policies.map((policy) => (
                    <SelectItem key={policy.id} value={policy.id}>
                      {policy.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label="证据上下文">
              <Select value={context} onValueChange={(value) => update("context", value)}>
                <SelectTrigger aria-label="证据上下文">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SELECT_EMPTY}>全部</SelectItem>
                  <SelectItem value="SUFFICIENT">充分</SelectItem>
                  <SelectItem value="INSUFFICIENT">不足</SelectItem>
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label="审核方式">
              <Select value={mode} onValueChange={(value) => update("mode", value)}>
                <SelectTrigger aria-label="审核方式">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SELECT_EMPTY}>全部</SelectItem>
                  <SelectItem value="FROZEN_RUN">本轮审核</SelectItem>
                  <SelectItem value="INDEPENDENT">独立审核</SelectItem>
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label="最低匹配分">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                placeholder="不限"
                aria-label="最低匹配分"
                value={minDraft}
                onChange={(event) => setMinDraft(event.target.value)}
                onBlur={commitMin}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
              />
            </FilterField>
            <FilterField label="最高匹配分">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                placeholder="不限"
                aria-label="最高匹配分"
                value={maxDraft}
                onChange={(event) => setMaxDraft(event.target.value)}
                onBlur={commitMax}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
              />
            </FilterField>
            <FilterField label="评论发布时间从">
              <DatePicker
                ariaLabel="评论发布时间从"
                value={from}
                placeholder="不限"
                onChange={(value) => update("from", value)}
              />
            </FilterField>
            <FilterField label="评论发布时间到">
              <DatePicker
                ariaLabel="评论发布时间到"
                value={to}
                placeholder="不限"
                onChange={(value) => update("to", value)}
              />
            </FilterField>
            <FilterField label="评论发布时间">
              <Select
                value={publication}
                onValueChange={(value) => update("publication", value)}
              >
                <SelectTrigger aria-label="评论发布时间">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SELECT_EMPTY}>全部</SelectItem>
                  <SelectItem value="known">已记录</SelectItem>
                  <SelectItem value="unknown">未记录</SelectItem>
                </SelectContent>
              </Select>
            </FilterField>
            {view === "comments" ? (
              <FilterField label="排序">
                <Select value={sort} onValueChange={(value) => update("sort", value)}>
                  <SelectTrigger aria-label="排序">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">审核时间从新到旧</SelectItem>
                    <SelectItem value="score-desc">匹配分从高到低</SelectItem>
                    <SelectItem value="score-asc">匹配分从低到高</SelectItem>
                    <SelectItem value="comment-newest">评论时间从新到旧</SelectItem>
                    <SelectItem value="comment-oldest">评论时间从旧到新</SelectItem>
                  </SelectContent>
                </Select>
              </FilterField>
            ) : null}
          </FilterBar>
        ) : null}
      </div>

      {error ? <ErrorNotice error={error} /> : null}

      {view === "posts" ? (
        <>
          {reviewPosts.isLoading ? <Loading /> : null}
          {!reviewPosts.isLoading && !reviewPosts.data?.items.length ? (
            <EmptyState
              title={hasFilters ? "没有符合条件的帖子。" : "本机还没有可审核的帖子。"}
              action={
                hasFilters ? (
                  <Button variant="outline" onClick={clear}>
                    清除筛选
                  </Button>
                ) : undefined
              }
            />
          ) : null}
          {reviewPosts.data?.items.length ? (
            <ReviewPostGrid
              posts={reviewPosts.data.items}
              activePostId={selectedPostId}
              onOpen={(post) => openPost(post.postId)}
            />
          ) : null}
          <Pagination
            page={page}
            total={reviewPosts.data?.total ?? 0}
            pageSize={8}
            onPageChange={setPage}
            countLabel="篇帖子"
          />
        </>
      ) : (
        <>
          {groupList.isLoading ? <Loading /> : null}
          {!groupList.isLoading && !groupList.data?.items.length ? (
            <EmptyState
              title={hasFilters ? "没有符合条件的作者。" : "本机还没有可审核的评论。"}
              action={
                hasFilters ? (
                  <Button variant="outline" onClick={clear}>
                    清除筛选
                  </Button>
                ) : undefined
              }
            />
          ) : null}
          {groupList.data?.items.length ? (
            <div className="overflow-x-auto rounded-lg border">
              <Table className="min-w-[1128px]" aria-label="按作者聚合的评论审核记录">
                <TableHeader>
                  <TableRow>
                    <TableHead>作者与评论</TableHead>
                    <TableHead className="w-[224px]">帖子</TableHead>
                    <TableHead className="w-[80px]">最高分</TableHead>
                    <TableHead className="w-[120px]">判断</TableHead>
                    <TableHead className="w-[96px]">时间</TableHead>
                    <TableHead className="w-[168px] text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupList.data.items.map((group) => {
                    const row = group.representative;
                    const review = toReview(row, row.run_id, {
                      id: row.post_id,
                      title: row.post_title,
                    });
                    const approval = groupApproval(group);
                    const posts = new Set(group.comments.map((item) => item.post_id));
                    const mergedCount =
                      group.count -
                      group.comments.filter(
                        (item) =>
                          item.decision === "MATCH" &&
                          item.review_status !== "REJECTED",
                      ).length;
                    return (
                      <TableRow key={`${group.authorId}:${group.policyId}`}>
                        <TableCell className="whitespace-normal">
                          <button
                            type="button"
                            className="block w-full rounded-sm text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            onClick={() => setGroupDetail(group)}
                          >
                            <span className="flex min-w-0 flex-wrap items-center gap-2 text-body font-medium">
                              <span className="truncate">{group.nickname ?? "匿名"}</span>
                              <Badge variant="secondary">{group.count} 条评论</Badge>
                            </span>
                            <span className="mt-1 line-clamp-2 text-body leading-relaxed break-words text-muted-foreground">
                              {row.body}
                            </span>
                            <span className="mt-1 block text-caption text-muted-foreground">
                              {day(row.published_at)}
                            </span>
                          </button>
                        </TableCell>
                        <TableCell className="text-caption whitespace-normal text-muted-foreground">
                          <span className="line-clamp-2">
                            {posts.size > 1 ? `${posts.size} 篇帖子` : row.post_title}
                          </span>
                        </TableCell>
                        <TableCell className="tabular-nums">{score(group.highest)}</TableCell>
                        <TableCell>
                          {group.coverage ? (
                            <div className="flex flex-col items-start gap-1">
                              <Badge variant={coverageVariant(group.coverage)}>
                                {coverageLabels[group.coverage] ?? group.coverage}
                              </Badge>
                              {group.coveredCount > 0 ? (
                                <span className="text-caption text-muted-foreground">
                                  {group.coveredCount} 条已覆盖
                                </span>
                              ) : null}
                            </div>
                          ) : group.qualified ? (
                            <div className="flex flex-col items-start gap-1">
                              <Badge variant="success">已符合</Badge>
                              {mergedCount > 0 ? (
                                <span className="text-caption text-muted-foreground">
                                  {mergedCount} 条已归并
                                </span>
                              ) : null}
                            </div>
                          ) : group.queueState ? (
                            <Badge variant="success">已入队</Badge>
                          ) : group.reviewStatus === "APPROVED" ? (
                            <Badge variant="success">已通过</Badge>
                          ) : group.reviewStatus === "REJECTED" ? (
                            <Badge variant="outline">不符合</Badge>
                          ) : group.reviewStatus === "MIXED" ? (
                            <Badge variant="secondary">部分已通过</Badge>
                          ) : row.decision ? (
                            <Badge variant={decisionVariant(row.decision)}>
                              {decisionLabels[row.decision] ?? row.decision}
                            </Badge>
                          ) : (
                            <span className="text-caption text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-caption text-muted-foreground">
                          {day(row.published_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <ReviewDecisionActions
                            row={review}
                            state={row.state}
                            pending={decideGroup.isPending}
                            canApprove={approval.canApprove}
                            canReject={approval.canReject}
                            approveHint={approval.approveHint}
                            coverage={group.coverage}
                            onDecide={(next) => askGroupDecision(group, next)}
                            onContact={() => setContact(review)}
                            onOpen={() => setGroupDetail(group)}
                            onOpenOriginal={() => {
                              setGroupDetail(null);
                              setOriginal(review);
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : null}
          <Pagination
            page={page}
            total={groupList.data?.total ?? 0}
            pageSize={commentPageSize}
            onPageChange={setPage}
            countLabel="位作者"
            pageSizeOptions={[20, 30, 50]}
            onPageSizeChange={setCommentPageSize}
          />
        </>
      )}

      {selectedPost ? (
        <ReviewPostDialog post={selectedPost} onClose={closePost} />
      ) : null}
      {detail ? (
        <ReviewDetail
          row={detail}
          state={groupList.data?.items
            .flatMap((group) => group.comments)
            .find((item) => item.review_id === detail.id)?.state}
          onClose={() => setDetail(null)}
          onOpenOriginal={() => {
            setOriginal(detail);
            setDetail(null);
          }}
        />
      ) : null}
      {original ? (
        <LocalPostHistory
          postId={original.post_id}
          focusCommentId={original.comment_platform_id}
          onClose={() => setOriginal(null)}
        />
      ) : null}
      <Dialog
        open={!!preview}
        onOpenChange={(open) => {
          if (!open && !generate.isPending) setPreview(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>生成待发送</DialogTitle>
            <DialogDescription>
              {preview
                ? `范围：全部历史审核，不受当前筛选影响 · ${preview.comments} 条评论 · 评论回复 ${preview.commentRows} 条 · 私信 ${preview.dmRows} 条`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {preview ? (
            <div className="grid gap-2 text-body">
              <p>已过期 {preview.expired} 条</p>
              <p>跳过 {preview.skipped} 条</p>
            </div>
          ) : null}
          {generate.error ? <ErrorNotice error={generate.error} /> : null}
          <DialogFooter>
            <Button
              variant="outline"
              pending={generate.isPending}
              onClick={() => setPreview(null)}
            >
              取消
            </Button>
            <Button
              pending={generate.isPending}
              onClick={() => {
                generate.mutate(
                  { apply: true },
                  { onSuccess: () => setPreview(null) },
                );
              }}
            >
              确认生成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!groupDetail}
        onOpenChange={(open) => {
          if (!open && !decideGroup.isPending) setGroupDetail(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {groupDetail?.nickname ?? "匿名"} · {groupDetail?.count ?? 0} 条评论
            </DialogTitle>
            <DialogDescription>
              {groupDetail?.coverage
                ? `${coverageLabels[groupDetail.coverage] ?? groupDetail.coverage} · 其余评论不再单独发送`
                : groupDetail?.qualified
                  ? "已符合 · 其余评论不再逐条审核"
                  : `最高分 ${score(groupDetail?.highest ?? null)} · 通过后只发送一条`}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            {groupDetail?.comments.map((row) => {
              const review = toReview(row, row.run_id, {
                id: row.post_id,
                title: row.post_title,
              });
              return (
                <div key={row.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 text-body leading-relaxed break-words">
                      {row.body}
                    </p>
                    <div className="flex flex-wrap items-center gap-1">
                      {groupDetail?.coverage && row.review_status === "PENDING" ? (
                        <Badge variant="outline">已覆盖</Badge>
                      ) : null}
                      {groupDetail?.qualified &&
                      !groupDetail.coverage &&
                      row.review_status === "PENDING" &&
                      row.decision !== "MATCH" ? (
                        <Badge variant="outline">同作者已符合</Badge>
                      ) : null}
                      {row.decision ? (
                        <Badge variant={decisionVariant(row.decision)}>
                          {decisionLabels[row.decision] ?? row.decision}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-1 text-caption text-muted-foreground">
                    {row.post_title} · {day(row.published_at)} · 匹配分 {score(row.score)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setGroupDetail(null);
                        setDetail(review);
                      }}
                    >
                      查看详情
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setGroupDetail(null);
                        setOriginal(review);
                      }}
                    >
                      查看原帖
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            {groupDetail?.covered ? (
              <span className="text-caption text-muted-foreground">
                同作者已覆盖，其余评论不再单独处理
              </span>
            ) : groupDetail?.qualified ? (
              <span className="text-caption text-muted-foreground">
                同作者已符合，其余评论不再逐条处理
              </span>
            ) : null}
            {groupDetail && groupApproval(groupDetail).canReject ? (
              <Button
                variant="outline"
                disabled={decideGroup.isPending}
                onClick={() => askGroupDecision(groupDetail, "REJECTED")}
              >
                标记不符合
              </Button>
            ) : null}
            {groupDetail && groupApproval(groupDetail).canApprove ? (
              <Button
                disabled={decideGroup.isPending}
                onClick={() => askGroupDecision(groupDetail, "APPROVED")}
              >
                通过作者
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!groupPrompt}
        onOpenChange={(open) => {
          if (!open && !decideGroup.isPending) setGroupPrompt(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {groupPrompt?.next === "APPROVED"
                ? `通过这位作者的 ${actionCount(groupPrompt.group, "APPROVED")} 条评论？`
                : groupPrompt?.next === "REJECTED"
                  ? `标记这位作者的 ${actionCount(groupPrompt.group, "REJECTED")} 条评论为不符合？`
                  : `恢复这位作者的 ${groupPrompt ? actionCount(groupPrompt.group, "PENDING") : 0} 条评论为待确认？`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {groupPrompt?.next === "APPROVED"
                ? `通过后合并为一次发送，其余评论只记录审核结果。${unmatchedPending(groupPrompt.group).length ? ` ${unmatchedPending(groupPrompt.group).length} 条不符合将标记为不符合。` : ""}`
                : groupPrompt?.next === "REJECTED"
                  ? "标记后从待确认转为不符合；可在“不符合”筛选中恢复。"
                  : "恢复后重新进入待确认，并按入队规则处理。"}
            </AlertDialogDescription>
            {groupPrompt?.next === "APPROVED" &&
            groupPrompt.group.comments.some((row) => row.context !== "SUFFICIENT") ? (
              <p className="text-caption text-warning">
                含{" "}
                {
                  groupPrompt.group.comments.filter(
                    (row) => row.context !== "SUFFICIENT",
                  ).length
                }{" "}
                条上下文不足的评论。
              </p>
            ) : null}
          </AlertDialogHeader>
          {decideGroup.error ? <ErrorNotice error={decideGroup.error} /> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={decideGroup.isPending}>取消</AlertDialogCancel>
            <Button
              variant={groupPrompt?.next === "REJECTED" ? "outline" : "default"}
              pending={decideGroup.isPending}
              onClick={() => {
                if (groupPrompt) decideGroup.mutate(groupPrompt);
              }}
            >
              {groupPrompt?.next === "APPROVED"
                ? "通过"
                : groupPrompt?.next === "REJECTED"
                  ? "标记不符合"
                  : "恢复待确认"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {contact ? (
        <Dialog open onOpenChange={(open) => !open && setContact(null)}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>准备联系作者</DialogTitle>
            </DialogHeader>
            <LocalContact reviewId={contact.id} onClose={() => setContact(null)} />
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
