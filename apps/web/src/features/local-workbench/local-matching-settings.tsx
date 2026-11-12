import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/patterns/checkbox-field";
import { ErrorNotice } from "@/components/feedback";
import { localApi } from "./local-api";
import { useLocalRecords } from "./use-local-records";

/**
 * 「评论匹配」这一步的设置：哪些匹配目标在后续采集里自动审核。
 *
 * 模型选择、每日上限、价格与密钥属于跨轮次的全局配置，留在「配置管理 → 模型配置」，
 * 这里不复制——同一件事只在一个地方改。
 */
export function LocalMatchingSettings() {
  const client = useQueryClient();
  const workflow = useLocalRecords("workflowOverview");
  const [consent, setConsent] = useState(false);
  const automatic = useMutation({
    mutationFn: (input: unknown) =>
      localApi("setAutomaticReviewPolicy", input),
    onSuccess: () => {
      setConsent(false);
      void client.invalidateQueries({ queryKey: ["local"] });
    },
  });

  const data = workflow.data;
  const error = workflow.error ?? automatic.error;
  const blocked = !data?.model?.authorized || !data?.capabilities.review;

  return (
    <div className="flex flex-col gap-3">
      {error ? <ErrorNotice error={error} /> : null}
      {blocked ? (
        <p className="text-body text-muted-foreground">模型未授权</p>
      ) : null}

      <CheckboxField checked={consent} onCheckedChange={setConsent}>
        授权后续采集自动审核（产生付费请求）
      </CheckboxField>

      <ul className="flex flex-col divide-y border-t">
        {data?.policies.map((policy) => (
          <li
            key={policy.id}
            className="flex items-center justify-between gap-3 py-3"
          >
            <span className="text-body font-medium break-words">
              {policy.name}
            </span>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant={policy.autoEnabled ? "success" : "outline"}>
                {policy.autoEnabled ? "自动审核" : "手动审核"}
              </Badge>
              <Button
                size="sm"
                variant="outline"
                pending={automatic.isPending}
                disabled={
                  !policy.autoEnabled &&
                  (!consent || !policy.enabled || blocked)
                }
                onClick={() =>
                  automatic.mutate({
                    id: policy.id,
                    version: policy.version,
                    enabled: !policy.autoEnabled,
                    consent: "comment-review-continuous-single-post-v3",
                    modelVersion: data?.model?.version,
                    priceAck: data?.model?.price_ack,
                  })
                }
              >
                {policy.autoEnabled ? "关闭" : "开启"}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
