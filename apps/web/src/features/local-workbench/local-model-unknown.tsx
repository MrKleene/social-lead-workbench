import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/patterns/checkbox-field";
import { SectionCard } from "@/components/patterns/section-card";
import { EmptyState } from "@/components/patterns/empty-state";
import { ErrorNotice } from "@/components/feedback";
import { useLocalAction, useLocalRecords } from "./use-local-records";

/**
 * 未知模型请求：提交给模型后没拿到确认的那一批。
 *
 * 没人知道这次请求到底扣费、出了什么结果，所以只能由用户明确作废——作废只清掉这道
 * 互锁并把这批标成失败，不会补发、不会退额度。
 */
export function LocalUnknownModels() {
  const data = useLocalRecords("unknownModelSubmissions");
  const discard = useLocalAction("discardModelSubmission");
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const items = data.data ?? [];

  return (
    <SectionCard title="未知模型请求">
      {data.error ? <ErrorNotice error={data.error} /> : null}
      {discard.error ? <ErrorNotice error={discard.error} /> : null}
      {items.length ? (
        <>
          {items.map((item) => (
            <div key={item.batchId} className="flex flex-col gap-1">
              <p className="text-body break-words">
                {new Date(item.createdAt).toLocaleString()} ·{" "}
                {item.errorCode ?? "结果未知"}
              </p>
              <p className="text-caption text-muted-foreground break-words">
                {item.batchId}
              </p>
              <div>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={!consent || discard.isPending}
                  onClick={() => {
                    setPending(item.batchId);
                    discard.mutate(
                      {
                        batchId: item.batchId,
                        consent: "discard-unknown-model-submission-v1",
                      },
                      { onSettled: () => setPending(null) },
                    );
                  }}
                >
                  {pending === item.batchId ? "正在作废…" : "作废这次请求"}
                </Button>
              </div>
            </div>
          ))}
          <CheckboxField checked={consent} onCheckedChange={setConsent}>
            确认作废这些未知请求，作废后不再重试。
          </CheckboxField>
        </>
      ) : (
        <EmptyState title="没有未知模型请求。" />
      )}
    </SectionCard>
  );
}
