import type {
  LocalReview,
  ReviewComment,
  ReviewPostSummary,
} from "./local-api";

export const decisionLabels: Record<string, string> = {
  MATCH: "符合",
  NO_MATCH: "不符合",
  UNCERTAIN: "不确定",
};

export const statusLabels: Record<string, string> = {
  PENDING: "待确认",
  APPROVED: "已通过",
  REJECTED: "已排除",
};

export const stateLabels: Record<ReviewComment["state"], string> = {
  REVIEWED: "已评分",
  PROCESSING: "审核中",
  UNKNOWN: "结果未知",
  FAILED: "失败",
  PENDING: "待审核",
  SKIPPED: "已跳过",
};

export function stateVariant(state: ReviewComment["state"]) {
  return state === "REVIEWED"
    ? "success"
    : state === "FAILED" || state === "UNKNOWN"
      ? "destructive"
      : "secondary";
}

export function decisionVariant(decision: string | null) {
  return decision === "MATCH"
    ? "success"
    : decision === "UNCERTAIN"
      ? "warning"
      : "secondary";
}

export const coverageLabels: Record<string, string> = {
  QUEUED: "已入队",
  SENT: "已发送",
  UNKNOWN: "结果未知",
  FAILED: "发送失败",
  EXPIRED: "已过期",
};

export function coverageVariant(coverage: string | null) {
  return coverage === "SENT" || coverage === "QUEUED"
    ? "success"
    : coverage === "FAILED"
      ? "destructive"
      : coverage === "UNKNOWN"
        ? "warning"
        : "secondary";
}

export function queueStatus(row: {
  review_status: "PENDING" | "APPROVED" | "REJECTED" | null;
  queue_state: string | null;
  decision: string | null;
}) {
  if (row.queue_state) return { label: "已入队", variant: "success" as const };
  if (row.review_status === "APPROVED")
    return { label: "已通过未入队", variant: "success" as const };
  if (row.review_status === "REJECTED" || row.decision === "NO_MATCH")
    return { label: "不符合", variant: "secondary" as const };
  return { label: "待确认", variant: "warning" as const };
}

/** 只有尚未入队、且不会被自动入队接走的评论才需要人工通过。 */
export function approvalState(
  row: {
    review_status: "PENDING" | "APPROVED" | "REJECTED" | null;
    queue_state: string | null;
    decision: string | null;
    score: number | null;
  },
  rule: { threshold: number; enabled: boolean } | null,
) {
  if (row.review_status !== "PENDING" || row.queue_state || row.decision === "NO_MATCH")
    return { canApprove: false, approveHint: undefined as string | undefined };
  if (!rule) return { canApprove: false, approveHint: "未配置入队规则" };
  if (row.decision === "UNCERTAIN" || !rule.enabled || (row.score ?? 0) < rule.threshold)
    return { canApprove: true, approveHint: undefined as string | undefined };
  return { canApprove: false, approveHint: "未入队" };
}

export function statusVariant(status: string | null) {
  return status === "APPROVED"
    ? "success"
    : status === "REJECTED"
      ? "secondary"
      : "warning";
}

export function postVariant(status: ReviewPostSummary["status"]) {
  return status === "COMPLETED"
    ? "success"
    : status === "PARTIAL" || status === "PROCESSING"
      ? "warning"
      : status === "FAILED" || status === "UNKNOWN"
        ? "destructive"
        : "secondary";
}

export function postLabel(status: ReviewPostSummary["status"]) {
  return status === "COMPLETED"
    ? "已评分"
    : status === "PARTIAL"
      ? "部分评分"
      : status === "PROCESSING"
        ? "审核中"
        : status === "UNKNOWN"
          ? "结果未知"
          : status === "FAILED"
            ? "失败"
            : "待审核";
}

export function day(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

export function score(value: number | null) {
  return value === null ? "—" : value;
}

export function toReview(
  row: ReviewComment & { comment_platform_id?: string | null },
  runId: string,
  post: { id: string; title: string },
): LocalReview {
  return {
    published_at: row.published_at,
    author_name: row.nickname,
    post_title: post.title,
    post_id: post.id,
    comment_platform_id: row.comment_platform_id ?? row.platform_id,
    id: row.review_id ?? row.id,
    run_id: runId,
    evidence: [],
    body: row.body,
    policy_name: row.policy_name ?? "",
    score: row.score ?? 0,
    context: row.context ?? "",
    decision: row.decision ?? "",
    reason: row.reason ?? "",
    review_mode: row.review_mode === "INDEPENDENT" ? "INDEPENDENT" : "FROZEN_RUN",
    review_status: row.review_status ?? "PENDING",
    version: row.version ?? 1,
    queue_state: row.queue_state,
    queue_channels: row.queue_channels,
  };
}
