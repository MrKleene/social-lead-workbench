import { useState } from "react";
import type { EvidenceAttempt } from "./local-api";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/patterns/empty-state";
import { RecordItem, RecordList } from "@/components/patterns/record-list";
import { SectionCard } from "@/components/patterns/section-card";
import { ErrorNotice } from "@/components/feedback";
import { EvidenceVerifyDialog } from "./local-evidence";
import { useLocalEvidence } from "./use-local-evidence";

/** 未知发送：已提交但没拿到平台回执的一次发送，核对前不会继续派发。 */
export function LocalUnknownSends() {
  const evidence = useLocalEvidence();
  const [attempt, setAttempt] = useState<EvidenceAttempt | null>(null);
  const attempts = evidence.overview.data?.attempts ?? [];

  return (
    <SectionCard title="未知发送">
      {evidence.error ? <ErrorNotice error={evidence.error} /> : null}
      {attempts.length ? (
        <RecordList>
          {attempts.map((item) => {
            const checking =
              item.auto_state === "WAITING" || item.auto_state === "RUNNING";
            const autoFailed =
              item.auto_state === "UNVERIFIED" || item.auto_state === "STOPPED";
            return (
            <RecordItem
              key={item.id}
              title={item.account_name + " · " + (item.channel === "DM" ? "私信" : "评论")}
              meta={
                new Date(item.updated_at).toLocaleString() +
                (checking
                  ? " · 自动核对中"
                  : autoFailed
                    ? " · 自动核对未完成"
                    : "")
              }
              action={
                <Button
                  size="sm"
                  variant="outline"
                  disabled={checking}
                  onClick={() => setAttempt(item)}
                >
                  {checking ? "自动核对中" : "核对结果"}
                </Button>
              }
            >
              <span className="break-words">{item.content}</span>
            </RecordItem>
            );
          })}
        </RecordList>
      ) : (
        <EmptyState title="没有未知发送。" />
      )}
      <EvidenceVerifyDialog
        attempt={attempt}
        evidence={evidence}
        onClose={() => setAttempt(null)}
      />
    </SectionCard>
  );
}
