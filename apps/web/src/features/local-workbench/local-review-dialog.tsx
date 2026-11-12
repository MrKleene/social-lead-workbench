import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckboxField } from "@/components/patterns/checkbox-field";
import { FormField } from "@/components/patterns/form-field";
import { ErrorNotice } from "@/components/feedback";
import { localApi, type ReviewPreview } from "./local-api";

export function LocalReviewDialog({
  runId,
  onClose,
  independent = false,
  postId,
  bare = false,
}: {
  runId: string;
  onClose: () => void;
  independent?: boolean;
  postId?: string;
  /** 放进 Dialog 时用：不再画自己的标题和分隔线。 */
  bare?: boolean;
}) {
  const client = useQueryClient();
  const options = useQuery({
    queryKey: ["local", "review-options", runId],
    queryFn: () => localApi("postReviewOptions", { runId }),
  });
  const [post, setPost] = useState(postId ?? "");
  const [policy, setPolicy] = useState("");
  const [plan, setPlan] = useState<(ReviewPreview & { requestKey: string }) | null>(
    null,
  );
  const [consent, setConsent] = useState(false);

  const workflow = useQuery({
    queryKey: ["local", "workflow"],
    queryFn: () => localApi("workflowOverview"),
  });

  const policies = independent
    ? workflow.data?.policies.filter((item) => item.enabled)
    : options.data?.policies;
  const selectedPost = post || options.data?.posts[0]?.id;
  const selectedPolicy = policy || policies?.[0]?.id;

  const preview = useMutation({
    mutationFn: () =>
      localApi("previewReview", {
        runId,
        postId: selectedPost,
        policyId: selectedPolicy,
        ...(independent ? { reviewMode: "INDEPENDENT" } : {}),
      }),
    onSuccess: (value) => {
      setPlan({ ...value, requestKey: crypto.randomUUID() });
      setConsent(false);
    },
  });

  const authorize = useMutation({
    mutationFn: () =>
      localApi("authorizeReview", {
        scope: plan!.scope,
        previewHash: plan!.previewHash,
        requestKey: plan!.requestKey,
        consent: independent
          ? "independent-archived-post-review-v1"
          : "comment-review-original-first-use-v2",
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["local"] });
      onClose();
    },
  });

  const error =
    workflow.error ?? options.error ?? preview.error ?? authorize.error;

  return (
    <div className={bare ? "flex flex-col gap-3" : "flex flex-col gap-3 border-t pt-4"}>
      {bare ? null : (
        <h3 className="text-section font-semibold">
          {independent ? "独立审核历史笔记" : "按笔记审核评论"}
        </h3>
      )}
      {error ? (
        <ErrorNotice error={error} />
      ) : null}

      <FormField label="笔记">
        <Select
          value={selectedPost ?? ""}
          onValueChange={(value) => {
          setPost(value);
          setPlan(null);
          }}
        >
          <SelectTrigger aria-label="笔记">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.data?.posts.map((item) => (
            <SelectItem key={item.id} value={item.id}>
            {item.title || "无标题笔记"}
            </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField label="匹配目标">
        <Select
          value={selectedPolicy ?? ""}
          onValueChange={(value) => {
          setPolicy(value);
          setPlan(null);
          }}
        >
          <SelectTrigger aria-label="匹配目标">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {policies?.map((item) => (
            <SelectItem key={item.id} value={item.id}>
            {item.name}
            </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          disabled={!selectedPost || !selectedPolicy}
          pending={preview.isPending}
          onClick={() => preview.mutate()}
        >
          预览审核范围
        </Button>
        <Button variant="outline" onClick={onClose}>
          关闭
        </Button>
      </div>

      {plan ? (
        <div className="flex flex-col gap-3 border-t pt-4">
          <p className="text-body leading-relaxed text-muted-foreground break-words">
            {plan.comments} 条评论；本地估算约 ¥
            {plan.estimatedMicros === null
              ? "未知"
              : (plan.estimatedMicros / 1000000).toFixed(4)}
            。这是估算，不是费用上限。
          </p>
          <p className="text-body leading-relaxed text-muted-foreground break-words">
            {plan.automaticRules
              ? `本轮已冻结 ${plan.automaticRules} 条自动联系规则。全部笔记与目标审核完成后，规则可自动发送。`
              : "本轮未选择自动联系规则。"}
          </p>
          <CheckboxField checked={consent} onCheckedChange={setConsent}>
            同意发送本批评论原文至北京千问（付费）。
          </CheckboxField>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={
                !consent ||
                plan.empty ||
                workflow.data?.capabilities.review === false
              }
              pending={authorize.isPending}
              onClick={() => authorize.mutate()}
            >
              授权并审核本批
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
