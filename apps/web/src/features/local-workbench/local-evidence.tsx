import { useEffect, useState } from "react";
import type { EvidenceAttempt } from "./local-api";
import type { useLocalEvidence } from "./use-local-evidence";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckboxField } from "@/components/patterns/checkbox-field";
import { FormField } from "@/components/patterns/form-field";
import { ErrorNotice } from "@/components/feedback";
import { evidenceMessage } from "./local-evidence-messages";

const checkStates: Record<string, string> = {
  RUNNING: "正在读取证据",
  CONFIRMED: "原消息已确认",
  UNVERIFIED: "证据不足，保持未知",
  INTERRUPTED: "已中断，未自动重试",
};

export function EvidenceVerifyDialog({
  attempt,
  evidence,
  onClose,
}: {
  attempt: EvidenceAttempt | null;
  evidence: ReturnType<typeof useLocalEvidence>;
  onClose: () => void;
}) {
  const [replyId, setReplyId] = useState("");

  useEffect(() => {
    setReplyId("");
  }, [attempt?.id]);

  if (!attempt) return null;
  const plan = evidence.plan?.scope.attemptId === attempt.id ? evidence.plan : null;
  const checks = (evidence.overview.data?.checks ?? []).filter(
    (check) => check.attempt_id === attempt.id,
  );
  const channel = attempt.channel === "DM" ? "私信" : "评论";

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>核对未知结果</DialogTitle>
          <DialogDescription>
            {attempt.account_name} · {channel} · {attempt.recipient_id}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <p className="text-body leading-relaxed break-words">{attempt.content}</p>
          {attempt.channel === "COMMENT" ? (
            <FormField label="候选回复 ID">
              <Input
                value={replyId}
                maxLength={24}
                onChange={(event) => setReplyId(event.target.value)}
              />
            </FormField>
          ) : null}

          {evidence.error ? <ErrorNotice error={evidence.error} /> : null}
          {evidence.notice ? (
            <p role="status" className="text-body text-muted-foreground">
              {evidence.notice}
            </p>
          ) : null}

          {plan ? (
            <div className="flex flex-col gap-3 border-t pt-4">
              <h3 className="text-body font-semibold">核对范围</h3>
              <p className="text-body leading-relaxed break-words">
                {plan.accountName}：{plan.content}
              </p>
              <CheckboxField
                checked={evidence.consent}
                disabled={evidence.verify.isPending}
                onCheckedChange={evidence.setConsent}
              >
                授权两次独立读取以上原消息。
                {plan.mayMarkRead
                  ? "打开私信会话可能将平台消息标记已读。"
                  : "只查看指定笔记和候选回复。"}
                不会发送或清除账号限制。
              </CheckboxField>
              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={!evidence.consent || !plan.available}
                  pending={evidence.verify.isPending}
                  onClick={() =>
                    evidence.verify.mutate(undefined, { onSuccess: () => onClose() })
                  }
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
              {!plan.available ? (
                <p className="text-caption text-muted-foreground">
                  本机专用核对组件尚未就绪。
                </p>
              ) : null}
            </div>
          ) : (
            <Button
              variant="outline"
              pending={evidence.preview.isPending}
              onClick={() =>
                evidence.preview.mutate({
                  attemptId: attempt.id,
                  ...(attempt.channel === "COMMENT" ? { replyId } : {}),
                })
              }
            >
              预览核对范围
            </Button>
          )}

          {checks.length ? (
            <ul className="flex flex-col gap-2 border-t pt-4">
              {checks.map((check) => (
                <li
                  key={check.id}
                  className="text-caption leading-relaxed text-muted-foreground break-words"
                >
                  {new Date(check.started_at).toLocaleString()} ·{" "}
                  {checkStates[check.state] || check.state}
                  {check.details.reason ? ` · ${evidenceMessage(check.details.reason)}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
