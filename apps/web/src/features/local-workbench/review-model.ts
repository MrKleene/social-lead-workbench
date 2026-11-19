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
  row: ReviewComment,
  runId: string,
  post: { id: string; title: string },
): LocalReview {
  return {
    published_at: row.published_at,
    author_name: row.nickname,
    post_title: post.title,
    post_id: post.id,
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
  };
}
