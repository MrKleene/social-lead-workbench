import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SELECT_EMPTY,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckboxField } from "@/components/patterns/checkbox-field";
import { FormField } from "@/components/patterns/form-field";
import { ErrorNotice } from "@/components/feedback";
import { localApi, type ReplyPreview } from "./local-api";

type ContactPlan = ReplyPreview & {
  recipientId: string;
  channel: string;
  requestKey: string;
};

export function LocalContact({
  reviewId,
  onClose,
}: {
  reviewId: string;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const [accountId, setAccount] = useState("");
  const [channel, setChannel] = useState("DM");
  const [content, setContent] = useState("");
  const [consent, setConsent] = useState(false);
  const [notice, setNotice] = useState("");
  const [plan, setPlan] = useState<ContactPlan | null>(null);

  const accounts = useQuery({
    queryKey: ["local", "platform-accounts"],
    queryFn: () => localApi("accountOverview"),
  });
  const configs = useQuery({
    queryKey: ["local", "configurations"],
    queryFn: () => localApi("configurations"),
  });
  const capability = useQuery({
    queryKey: ["local", "workflow"],
    queryFn: () => localApi("workflowOverview"),
  });

  const reset = () => {
    setPlan(null);
    setConsent(false);
  };

  const preview = useMutation({
    mutationFn: () =>
      localApi("previewContact", {
        reviewId,
        accountId,
        channel,
        content: content.trim(),
      }),
    onSuccess: (value) => {
      setPlan({ ...value, requestKey: crypto.randomUUID() });
      setConsent(false);
    },
  });

  const send = useMutation({
    mutationFn: () =>
      localApi("authorizeContact", {
        ...plan,
        consent: "send-reviewed-contact-once-v1",
      }),
    onSuccess: () => {
      reset();
      setNotice("已加入本地队列，请在任务记录确认结果。");
      void client.invalidateQueries({ queryKey: ["local"] });
    },
  });

  const error = preview.error ?? send.error ?? accounts.error;

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <h3 className="text-section font-semibold">联系已审核的评论作者</h3>
      {notice ? (
        <p role="status" className="text-body text-muted-foreground">
          {notice}
        </p>
      ) : null}
      {error ? (
        <ErrorNotice error={error} />
      ) : null}

      <FormField label="发送账号">
        <Select
          value={accountId}
          onValueChange={(value) => {
          setAccount(value);
          reset();
          }}
        >
          <SelectTrigger aria-label="发送账号">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SELECT_EMPTY}>选择账号</SelectItem>
            {accounts.data?.accounts
            .filter((item) => item.state === "VERIFIED" && item.hasSession)
            .map((item) => (
            <SelectItem key={item.id} value={item.id}>
            {item.name}
            </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField label="联系渠道">
        <Select
          value={channel}
          onValueChange={(value) => {
          setChannel(value);
          reset();
          }}
        >
          <SelectTrigger aria-label="联系渠道">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="DM">私信作者</SelectItem>
            <SelectItem value="COMMENT">回复这条评论</SelectItem>
          </SelectContent>
        </Select>
      </FormField>

      <FormField label="填入模板">
        <Select
          value=""
          onValueChange={(value) => {
          setContent(
          configs.data?.find((item) => item.id === value)?.body
          .text ?? "",
          );
          reset();
          }}
        >
          <SelectTrigger aria-label="填入模板">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SELECT_EMPTY}>可选模板</SelectItem>
            {configs.data
            ?.filter((item) => item.kind === channel + "_TEMPLATE")
            .map((item) => (
            <SelectItem key={item.id} value={item.id}>
            {item.name}
            </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField label="本次内容">
        <Input
          value={content}
          maxLength={1000}
          onChange={(event) => {
            setContent(event.target.value);
            reset();
          }}
        />
      </FormField>

      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          disabled={!accountId || !content.trim() || !capability.data?.capabilities.send}
          pending={preview.isPending}
          onClick={() => preview.mutate()}
        >
          预览联系对象与内容
        </Button>
        <Button variant="outline" onClick={onClose}>
          关闭
        </Button>
      </div>

      {plan ? (
        <div className="flex flex-col gap-3 border-t pt-4">
          <p className="text-body leading-relaxed break-words">
            {plan.accountName} · {plan.channel === "DM" ? "私信" : "回复评论"} ·
            对象 {plan.recipientId}
          </p>
          <p className="text-body leading-relaxed break-words">{plan.content}</p>
          <CheckboxField checked={consent} onCheckedChange={setConsent}>
            确认发送以上内容。
          </CheckboxField>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={!consent}
              pending={send.isPending}
              onClick={() => send.mutate()}
            >
              授权本次联系
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
