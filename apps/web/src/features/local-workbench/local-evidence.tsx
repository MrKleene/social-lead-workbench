import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckboxField } from "@/components/patterns/checkbox-field";
import { EmptyState } from "@/components/patterns/empty-state";
import { FormField } from "@/components/patterns/form-field";
import { RecordItem, RecordList } from "@/components/patterns/record-list";
import { SectionCard } from "@/components/patterns/section-card";
import { ErrorNotice } from "@/components/feedback";
import { evidenceMessage } from "./local-evidence-messages";
import { useLocalEvidence } from "./use-local-evidence";

const checkStates: Record<string, string> = {
  RUNNING: "正在读取证据",
  CONFIRMED: "原消息已确认",
  UNVERIFIED: "证据不足，保持未知",
  INTERRUPTED: "已中断，未自动重试",
};

export function LocalEvidence() {
  const evidence = useLocalEvidence();
  const [replyIds, setReplies] = useState<Record<string, string>>({});
  const attempts = evidence.overview.data?.attempts ?? [];
  const checks = evidence.overview.data?.checks ?? [];

  return (
    <SectionCard title="未知发送证据核对">
      {evidence.error ? (
        <ErrorNotice error={evidence.error} />
      ) : null}
      {evidence.notice ? (
        <p role="status" className="text-body text-muted-foreground">
          {evidence.notice}
        </p>
      ) : null}

      {attempts.length ? (
        <RecordList>
          {attempts.map((attempt) => (
            <RecordItem
              key={attempt.id}
              title={`${attempt.account_name} · ${attempt.channel === "DM" ? "私信" : "评论"}`}
              meta={`目标：${attempt.recipient_id}`}
              action={
                <Button
                  variant="outline"
                  disabled={evidence.verify.isPending}
                  pending={evidence.preview.isPending}
                  onClick={() =>
                    evidence.preview.mutate({
                      attemptId: attempt.id,
                      ...(attempt.channel === "COMMENT"
                        ? { replyId: replyIds[attempt.id] }
                        : {}),
                    })
                  }
                >
                  预览证据核对
                </Button>
              }
            >
              <p>{attempt.content}</p>
              {attempt.channel === "COMMENT" ? (
                <FormField label="候选回复 ID" className="mt-2">
                  <Input
                    value={replyIds[attempt.id] ?? ""}
                    maxLength={24}
                    onChange={(event) =>
                      setReplies((previous) => ({
                        ...previous,
                        [attempt.id]: event.target.value,
                      }))
                    }
                  />
                </FormField>
              ) : null}
            </RecordItem>
          ))}
        </RecordList>
      ) : (
        <EmptyState title="没有待核对的记录。" />
      )}

      {evidence.plan ? (
        <div className="flex flex-col gap-3 border-t pt-4">
          <h3 className="text-body font-semibold">核对范围</h3>
          <p className="text-body leading-relaxed break-words">
            {evidence.plan.accountName}：{evidence.plan.content}
          </p>
          <CheckboxField
            checked={evidence.consent}
            disabled={evidence.verify.isPending}
            onCheckedChange={evidence.setConsent}
          >
            授权两次独立读取以上原消息。
            {evidence.plan.mayMarkRead
              ? "打开私信会话可能将平台消息标记已读。"
              : "只查看指定笔记和候选回复。"}
            不会发送或清除账号限制。
          </CheckboxField>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={!evidence.consent || !evidence.plan.available}
              pending={evidence.verify.isPending}
              onClick={() => evidence.verify.mutate()}
            >
              开始只读核对
            </Button>
            {evidence.verify.isPending ? (
              <Button
                variant="outline"
                pending={evidence.cancel.isPending}
                onClick={() => evidence.cancel.mutate()}
              >
                取消核对
              </Button>
            ) : null}
          </div>
          {!evidence.plan.available ? (
            <p className="text-caption text-muted-foreground">
              本机专用核对组件尚未就绪。
            </p>
          ) : null}
        </div>
      ) : null}

      {checks.length ? (
        <ul className="flex flex-col gap-2 border-t pt-4">
          {checks.map((check) => (
            <li
              key={check.id}
              className="text-caption leading-relaxed text-muted-foreground break-words"
            >
              {new Date(check.started_at).toLocaleString()} ·{" "}
              {checkStates[check.state] || check.state}
              {check.details.reason
                ? ` · ${evidenceMessage(check.details.reason)}`
                : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </SectionCard>
  );
}
