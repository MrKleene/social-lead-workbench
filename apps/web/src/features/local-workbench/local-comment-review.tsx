import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutGrid, List, Search } from "lucide-react";
import { useSearchParams } from "@/lib/router-compat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
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
import { ReviewDecisionActions } from "./review-actions";
import { ReviewDetail } from "./review-detail";
import { ReviewPostDialog } from "./review-post-dialog";
import { ReviewPostGrid } from "./review-post-card";
import { useLocalRecords } from "./use-local-records";
import {
  localApi,
  type LocalReview,
  type ReviewCommentListItem,
} from "./local-api";
import {
  day,
  approvalState,
  decisionLabels,
  decisionVariant,
  score,
  toReview,
} from "./review-model";

export function LocalCommentReview() {
  const [params, setParams] = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);
  const [commentPageSize, setCommentPageSize] = useState(30);
  const [detail, setDetail] = useState<LocalReview | null>(null);
  const [contact, setContact] = useState<LocalReview | null>(null);
  const client = useQueryClient();

  const runId = params.get("run") || "";
  const rawView = params.get("view");
  const view = rawView === "comments" || (!rawView && !runId) ? "comments" : "posts";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const selectedPostId = params.get("post") || "";
  const query = params.get("query") || "";
  const status = params.get("status") || "";
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
      status,
      decision,
      context,
      minScore,
      maxScore,
      mode,
      from,
      to,
      publication,
    ],
    queryFn: () =>
      localApi("reviewPosts", {
        page,
        pageSize: 8,
        runId,
        policyId,
        query,
        status,
        decision,
        context,
        minScore,
        maxScore,
        mode,
        from,
        to,
        publication,
      }),
    enabled: view === "posts",
  });

  const commentList = useQuery({
    queryKey: [
      "local",
      "reviewCommentList",
      page,
      commentPageSize,
      runId,
      policyId,
      query,
      status,
      decision,
      context,
      minScore,
      maxScore,
      mode,
      from,
      to,
      publication,
      sort,
    ],
    queryFn: () =>
      localApi("reviewCommentList", {
        page,
        pageSize: commentPageSize,
        runId,
        policyId,
        query,
        status,
        decision,
        context,
        minScore,
        maxScore,
        mode,
        from,
        to,
        publication,
        sort,
      }),
    enabled: view === "comments",
  });

  const queueRules = useLocalRecords("queueRules");
  const decide = useMutation({
    mutationFn: ({
      row,
      next,
    }: {
      row: LocalReview;
      next: "APPROVED";
    }) =>
      localApi("decideReview", {
        id: row.id,
        version: row.version,
        status: next,
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["local"] }),
  });

  const selectedPost = reviewPosts.data?.items.find(
    (post) => post.postId === selectedPostId,
  );
  const error =
    workflow.error ?? reviewPosts.error ?? commentList.error ?? decide.error ?? queueRules.error;
  const total = view === "posts" ? reviewPosts.data?.total : commentList.data?.total;
  const description =
    total === undefined
      ? "正在读取…"
      : view === "posts"
        ? total + " 篇帖子"
        : total + " 条评论";

  return (
    <>
      <PageHeader
        title="评论审核"
        description={description}
        actions={
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
              placeholder="搜索评论原文"
              aria-label="搜索评论原文"
              value={query}
              className="pl-10"
              onChange={(event) => update("query", event.target.value)}
            />
          </div>
          <Select value={status} onValueChange={(value) => update("status", value)}>
            <SelectTrigger aria-label="审核决定" className="w-[calc(50%-0.25rem)] sm:w-[128px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SELECT_EMPTY}>审核决定</SelectItem>
              <SelectItem value="PENDING">待确认</SelectItem>
              <SelectItem value="APPROVED">已通过</SelectItem>
            </SelectContent>
          </Select>
          <Select value={policyId} onValueChange={(value) => update("policy", value)}>
            <SelectTrigger aria-label="匹配方案" className="w-[calc(50%-0.25rem)] sm:w-[148px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SELECT_EMPTY}>匹配方案</SelectItem>
              {workflow.data?.policies.map((policy) => (
                <SelectItem key={policy.id} value={policy.id}>
                  {policy.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            aria-expanded={showFilters}
            onClick={() => setShowFilters((value) => !value)}
          >
            筛选
          </Button>
          <Button variant="ghost" onClick={clear}>
            清除
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
            <FilterField label="上下文">
              <Select value={context} onValueChange={(value) => update("context", value)}>
                <SelectTrigger aria-label="上下文">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SELECT_EMPTY}>全部</SelectItem>
                  <SelectItem value="SUFFICIENT">充分</SelectItem>
                  <SelectItem value="INSUFFICIENT">不足</SelectItem>
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label="审核来源">
              <Select value={mode} onValueChange={(value) => update("mode", value)}>
                <SelectTrigger aria-label="审核来源">
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
                min={0}
                max={100}
                value={minScore}
                onChange={(event) => update("score", event.target.value)}
              />
            </FilterField>
            <FilterField label="最高匹配分">
              <Input
                type="number"
                min={0}
                max={100}
                value={maxScore}
                onChange={(event) => update("maxScore", event.target.value)}
              />
            </FilterField>
            <FilterField label="评论发布开始日期">
              <DatePicker
                ariaLabel="评论发布开始日期"
                value={from}
                placeholder="不限"
                onChange={(value) => update("from", value)}
              />
            </FilterField>
            <FilterField label="评论发布结束日期">
              <DatePicker
                ariaLabel="评论发布结束日期"
                value={to}
                placeholder="不限"
                onChange={(value) => update("to", value)}
              />
            </FilterField>
            <FilterField label="发布时间">
              <Select
                value={publication}
                onValueChange={(value) => update("publication", value)}
              >
                <SelectTrigger aria-label="发布时间">
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
                    <SelectItem value="newest">审核时间</SelectItem>
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
            <EmptyState title="没有符合条件的帖子。" />
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
          {commentList.isLoading ? <Loading /> : null}
          {!commentList.isLoading && !commentList.data?.items.length ? (
            <EmptyState title="没有符合条件的评论。" />
          ) : null}
          {commentList.data?.items.length ? (
            <div className="overflow-x-auto rounded-lg border">
              <Table className="min-w-[1080px]" aria-label="全部评论审核记录">
                <TableHeader>
                  <TableRow>
                    <TableHead>评论</TableHead>
                    <TableHead className="w-[224px]">帖子</TableHead>
                    <TableHead className="w-[80px]">匹配分</TableHead>
                    <TableHead className="w-[104px]">判断</TableHead>
                    <TableHead className="w-[96px]">时间</TableHead>
                    <TableHead className="w-[168px] text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commentList.data.items.map((row: ReviewCommentListItem) => {
                    const review = toReview(row, row.run_id, {
                      id: row.post_id,
                      title: row.post_title,
                    });
                    const approval = approvalState(
                      row,
                      queueRules.data?.find((rule) => rule.policyId === row.policy_id) ??
                        null,
                    );
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-normal">
                          <button
                            type="button"
                            className="block w-full text-left"
                            onClick={() => setDetail(review)}
                          >
                            <span className="line-clamp-2 text-body leading-relaxed break-words">
                              {row.body}
                            </span>
                            <span className="mt-1 block text-caption text-muted-foreground">
                              {row.nickname ?? "匿名"} · {day(row.published_at)}
                            </span>
                          </button>
                        </TableCell>
                        <TableCell className="text-caption whitespace-normal text-muted-foreground">
                          <span className="line-clamp-2">{row.post_title}</span>
                        </TableCell>
                        <TableCell className="tabular-nums">{score(row.score)}</TableCell>
                        <TableCell>
                          {row.decision ? (
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
                            pending={decide.isPending}
                            canApprove={approval.canApprove}
                            approveHint={approval.approveHint}
                            onDecide={(next) => decide.mutate({ row: review, next })}
                            onContact={() => setContact(review)}
                            onOpen={() => setDetail(review)}
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
            total={commentList.data?.total ?? 0}
            pageSize={commentPageSize}
            onPageChange={setPage}
            countLabel="条评论"
            pageSizeOptions={[20, 30, 50]}
            onPageSizeChange={setCommentPageSize}
          />
        </>
      )}

      {selectedPost ? (
        <ReviewPostDialog post={selectedPost} onClose={closePost} />
      ) : null}
      {detail ? <ReviewDetail row={detail} onClose={() => setDetail(null)} /> : null}
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
