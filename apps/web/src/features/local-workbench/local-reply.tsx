import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckboxField } from "@/components/patterns/checkbox-field";
import { FormField } from "@/components/patterns/form-field";
import { ErrorNotice } from "@/components/feedback";
import { localApi, type LocalConversation, type ReplyPreview } from "./local-api";

export function LocalReply({
  conversation,
}: {
  conversation: LocalConversation;
}) {
  const client = useQueryClient();
  const [content, setContent] = useState("");
  const [plan, setPlan] = useState<
    (ReplyPreview & { requestKey: string }) | null
  >(null);
  const [consent, setConsent] = useState(false);
  const [notice, setNotice] = useState("");

  const capabilities = useQuery({
    queryKey: ["local", "workflow"],
    queryFn: () => localApi("workflowOverview"),
  });

  const preview = useMutation({
    mutationFn: () =>
      localApi("previewReply", {
        accountId: conversation.account.id,
        senderId: conversation.senderId,
        messageId: conversation.anchorId,
        content: content.trim(),
      }),
    onSuccess: (value) => {
      setPlan({ ...value, requestKey: crypto.randomUUID() });
      setConsent(false);
    },
  });

  const send = useMutation({
    mutationFn: () =>
      localApi("authorizeReply", {
        ...plan,
        consent: "send-exact-inbox-reply-once-v1",
      }),
    onSuccess: () => {
      setPlan(null);
      setContent("");
      setConsent(false);
      setNotice("已加入发送队列。请在任务记录确认结果；未知结果不会自动重发。");
      void client.invalidateQueries({ queryKey: ["local"] });
    },
  });

  const error = preview.error ?? send.error;

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <h4 className="text-body font-semibold">回复这条私信</h4>
      <p className="text-body leading-relaxed text-muted-foreground break-words">
        发送账号：{conversation.account.name}。回复对象：{conversation.senderId}
        。正在收件时，请先在任务列表取消收件。
      </p>
      {notice ? (
        <p role="status" className="text-body text-muted-foreground">
          {notice}
        </p>
      ) : null}
      {error ? (
        <ErrorNotice error={error} />
      ) : null}

      <FormField label="本次回复">
        <Input
          value={content}
          maxLength={1000}
          onChange={(event) => {
            setContent(event.target.value);
            setPlan(null);
            setConsent(false);
          }}
        />
      </FormField>

      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          disabled={!content.trim() || !capabilities.data?.capabilities.send}
          pending={preview.isPending}
          onClick={() => preview.mutate()}
        >
          预览单次回复
        </Button>
      </div>

      {plan ? (
        <div className="flex flex-col gap-3 border-t pt-4">
          <p className="text-body leading-relaxed break-words">
            {plan.accountName}：{plan.content}
          </p>
          <CheckboxField checked={consent} onCheckedChange={setConsent}>
            确认发送以上内容。
          </CheckboxField>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={!consent}
              pending={send.isPending}
              onClick={() => send.mutate()}
            >
              授权并发送一次
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
