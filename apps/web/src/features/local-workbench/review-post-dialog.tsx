import { useEffect, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Pagination } from "@/components/patterns/pagination";
import { ErrorNotice, Loading } from "@/components/feedback";
import { LocalContact } from "./local-contact";
import { ReviewDecisionActions } from "./review-actions";
import { ReviewDetail } from "./review-detail";
import { useLocalRecords } from "./use-local-records";
import {
  localApi,
  type LocalReview,
  type ReviewPostSummary,
} from "./local-api";
import {
  approvalState,
  day,
  decisionLabels,
  decisionVariant,
  postLabel,
  postVariant,
  score,
  toReview,
} from "./review-model";

const scoreRanges = [
  { value: "all", label: "全部分数", min: 0, max: 100 },
  { value: "90", label: "90 分以上", min: 90, max: 100 },
  { value: "60", label: "60–89 分", min: 60, max: 89 },
  { value: "low", label: "60 分以下", min: 0, max: 59 },
];

export function ReviewPostDialog({
  post,
  onClose,
}: {
  post: ReviewPostSummary;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [decision, setDecision] = useState("");
  const [scoreRange, setScoreRange] = useState("all");
  const [detail, setDetail] = useState<LocalReview | null>(null);
  const [contact, setContact] = useState<LocalReview | null>(null);
  const queueRules = useLocalRecords("queueRules");

  const range = scoreRanges.find((item) => item.value === scoreRange) ?? scoreRanges[0];
  useEffect(() => {
    setPage(1);
  }, [post.postId, query, stateFilter, decision, scoreRange, pageSize]);

  const comments = useQuery({
    queryKey: [
      "local",
      "reviewComments",
      post.runId,
      post.postId,
      page,
      pageSize,
      query,
      stateFilter,
      decision,
      range.min,
      range.max,
    ],
    queryFn: () =>
      localApi("reviewComments", {
        runId: post.runId,
        postId: post.postId,
        page,
        pageSize,
        query,
        state: stateFilter,
        decision,
        minScore: range.min,
        maxScore: range.max,
      }),
    placeholderData: keepPreviousData,
  });

  const decide = useMutation({
    mutationFn: (input: { id: string; version: number; status: "APPROVED" }) =>
      localApi("decideReview", input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["local", "reviewComments"] });
      void client.invalidateQueries({ queryKey: ["local", "reviewPosts"] });
      void client.invalidateQueries({ queryKey: ["local", "reviewCommentList"] });
      void client.invalidateQueries({ queryKey: ["local", "runProgress"] });
    },
  });

  const rows = comments.data?.items ?? [];

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-5xl">
          <DialogHeader className="shrink-0">
            <div className="flex flex-wrap items-start justify-between gap-3 pe-8">
              <div className="min-w-0">
                <DialogTitle className="break-words">{post.title}</DialogTitle>
                <DialogDescription className="tabular-nums">
                  {post.total + post.skipped} 条评论 · {post.reviewed}/{post.total} 已评分 · 最高{" "}
                  {post.highest ?? "—"}
                  {post.skipped ? ` · 跳过 ${post.skipped} 条（评论超长）` : ""}
                </DialogDescription>
              </div>
              <Badge variant={postVariant(post.status)}>{postLabel(post.status)}</Badge>
            </div>
          </DialogHeader>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <div className="relative w-full min-w-0 sm:max-w-xs sm:flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索评论原文"
                aria-label="搜索评论原文"
                className="pl-10"
              />
            </div>
            <Select
              value={stateFilter || SELECT_EMPTY}
              onValueChange={(value) => setStateFilter(value === SELECT_EMPTY ? "" : value)}
            >
              <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-[140px]" aria-label="审核状态">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SELECT_EMPTY}>全部状态</SelectItem>
                <SelectItem value="REVIEWED">已评分</SelectItem>
                <SelectItem value="PROCESSING">审核中</SelectItem>
                <SelectItem value="PENDING">待审核</SelectItem>
                <SelectItem value="UNKNOWN">结果未知</SelectItem>
                <SelectItem value="FAILED">失败</SelectItem>
                <SelectItem value="SKIPPED">已跳过</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={decision || SELECT_EMPTY}
              onValueChange={(value) => setDecision(value === SELECT_EMPTY ? "" : value)}
            >
              <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-[136px]" aria-label="判断">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SELECT_EMPTY}>全部判断</SelectItem>
                <SelectItem value="MATCH">符合</SelectItem>
                <SelectItem value="NO_MATCH">不符合</SelectItem>
                <SelectItem value="UNCERTAIN">不确定</SelectItem>
              </SelectContent>
            </Select>
            <Select value={scoreRange} onValueChange={setScoreRange}>
              <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-[156px]" aria-label="分数区间">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {scoreRanges.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              onClick={() => {
                setQuery("");
                setStateFilter("");
                setDecision("");
                setScoreRange("all");
              }}
            >
              清除
            </Button>
          </div>

          {comments.error ? (
            <ErrorNotice error={comments.error} />
          ) : comments.isLoading ? (
            <Loading />
          ) : rows.length ? (
            <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
              <Table className="w-full min-w-[820px] table-fixed">
                <TableHeader className="sticky top-0 z-10">
                  <TableRow>
                    <TableHead>评论</TableHead>
                    <TableHead className="w-[72px]">匹配分</TableHead>
                    <TableHead className="w-[96px]">判断</TableHead>
                    <TableHead className="w-[168px] text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const review = toReview(row, post.runId, {
                      id: post.postId,
                      title: post.title,
                    });
                    const approval = approvalState(
                      row,
                      queueRules.data?.find((rule) => rule.policyId === row.policy_id) ??
                        null,
                    );
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-normal">
                          <p className="line-clamp-2 text-body leading-relaxed break-words">
                            {row.body}
                          </p>
                          <p className="mt-1 text-caption text-muted-foreground">
                            {row.nickname ?? "匿名"} · {day(row.published_at)}
                          </p>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {score(row.score)}
                        </TableCell>
                        <TableCell>
                          {row.decision ? (
                            <Badge variant={decisionVariant(row.decision)}>
                              {decisionLabels[row.decision] ?? row.decision}
                            </Badge>
                          ) : (
                            <span className="text-caption text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <ReviewDecisionActions
                            row={review}
                            state={row.state}
                            pending={decide.isPending}
                            canApprove={approval.canApprove}
                            approveHint={approval.approveHint}
                            onDecide={(status) =>
                              decide.mutate({
                                id: review.id,
                                version: review.version,
                                status,
                              })
                            }
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
          ) : (
            <EmptyState title="没有符合条件的评论。" />
          )}

          <div className="shrink-0">
            <Pagination
              page={page}
              total={comments.data?.total ?? 0}
              pageSize={pageSize}
              onPageChange={setPage}
              countLabel="条评论"
              pageSizeOptions={[20, 30, 50]}
              onPageSizeChange={setPageSize}
            />
          </div>

          <div className="flex shrink-0 justify-end border-t pt-4">
            <Button variant="outline" onClick={onClose}>
              关闭
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
