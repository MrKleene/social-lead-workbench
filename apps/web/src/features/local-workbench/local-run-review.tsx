import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/patterns/checkbox-field";
import { SectionCard } from "@/components/patterns/section-card";
import { ErrorNotice } from "@/components/feedback";
import { useLocalAction, useLocalRecords } from "./use-local-records";
import type { RunReviewPreview } from "./local-api";
import { reviewFailureLabel } from "../comment-review/run-review-model";

export function LocalRunReview({ runId }: { runId: string }) {
  const [plan, setPlan] = useState<
    (RunReviewPreview & { requestKey: string }) | null
  >(null);
  const [consent, setConsent] = useState(false);
  const preview = useLocalAction("previewRunReview");
  const authorize = useLocalAction("authorizeRunReview");
  const workflow = useLocalRecords("workflowOverview");
  const progress = useLocalRecords("runProgress", { runId });

  const failure = preview.error ?? authorize.error;
  const pauses = plan?.pauses.length
    ? plan.pauses
    : (progress.data?.reviewPauses ?? []);
  const reviewProgress = progress.data?.reviewProgress;
  const failures = progress.data?.reviewFailures ?? [];
  const queuePaused = pauses.some((pause) => pause.kind === "QUEUE");

  return (
    <SectionCard
      title="本轮剩余评论匹配"
      footer={
        <>
          <Button
            variant="outline"
            pending={preview.isPending}
            onClick={() =>
              preview.mutate(
                { runId },
                {
                  onSuccess: (value) => {
                    setPlan({ ...value, requestKey: crypto.randomUUID() });
                    setConsent(false);
                  },
                },
              )
            }
          >
            预览本轮剩余审核
          </Button>
          {plan ? (
            <Button
              disabled={
                !consent || !plan.requests || !workflow.data?.capabilities.review
              }
              pending={authorize.isPending}
              onClick={() =>
                authorize.mutate(
                  { ...plan, consent: "review-exact-new-run-batches-v1" },
                  { onSuccess: () => setPlan(null) },
                )
              }
            >
              授权本轮剩余审核
            </Button>
          ) : null}
        </>
      }
    >
      {failure ? <ErrorNotice error={failure} /> : null}

      {reviewProgress ? (
        <p className="text-body leading-relaxed text-muted-foreground break-words">
          已审 {reviewProgress.reviewed}/{reviewProgress.total} 条
          {reviewProgress.processing
            ? " · 审核中 " + reviewProgress.processing + " 条"
            : ""}
          {reviewProgress.failed
            ? " · 失败 " + reviewProgress.failed + " 条"
            : ""}
          {reviewProgress.unknown
            ? " · 结果未知 " + reviewProgress.unknown + " 条"
            : ""}
        </p>
      ) : null}

      {pauses.length ? (
        <p role="status" className="text-body text-warning break-words">
          {queuePaused ? "审核队列已暂停" : "该帖审核已暂停"}，可预览后人工重试。
        </p>
      ) : null}

      {failures.length ? (
        <ul className="space-y-2 text-body text-muted-foreground">
          {failures.slice(0, 3).map((item) => (
            <li key={item.batchId} className="break-words">
              {reviewFailureLabel(item)}
            </li>
          ))}
        </ul>
      ) : null}

      {plan ? (
        <>
          <p className="text-body leading-relaxed text-muted-foreground break-words">
            {plan.requests} 个请求 · {plan.comments} 条评论输入 · 跳过{" "}
            {plan.skipped} 个已有或空批次 · 估算 ¥
            {plan.estimatedMicros === null
              ? "未知"
              : (plan.estimatedMicros / 1000000).toFixed(4)}
            ，并非硬费用上限。
          </p>
          <p className="text-body leading-relaxed text-muted-foreground break-words">
            {plan.scope.automaticRules
              ? "本轮已有 " + plan.scope.automaticRules + " 条冻结规则，全部审核完成后可自动发送。"
              : "本轮没有冻结自动联系规则。"}
          </p>
          <CheckboxField checked={consent} onCheckedChange={setConsent}>
            同意发送以上评论原文至北京千问（付费）。
          </CheckboxField>
        </>
      ) : null}

      {authorize.isSuccess ? (
        <p role="status" className="text-body text-muted-foreground">
          已加入队列。
        </p>
      ) : null}
    </SectionCard>
  );
}
