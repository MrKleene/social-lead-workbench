import { useState, type FormEvent } from "react";
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
import { useDraftGuard } from "@/features/work/draft-guard";
import { ErrorNotice } from "@/components/feedback";
import { useLocalPlatform } from "./use-local-platform";

/** 平台组件不可用时，把后端给的原因翻成人话。 */
function platformReason(reason: string) {
  switch (reason) {
    case "PACKAGED_NATIVE_RESOURCES_UNAVAILABLE":
      return "平台组件未构建";
    case "WINDOWS_NATIVE_RUNTIME_VALIDATION_REQUIRED":
      return "平台组件未通过校验";
    case "SYNTHETIC_TEST_MODE":
      return "合成测试模式";
    default:
      return "平台组件未就绪";
  }
}

export function LocalLoginPanel({
  credentialsAvailable,
  onVerified,
  onCancelled,
}: {
  credentialsAvailable: boolean;
  /** 扫码核验通过后回调——「添加账号」弹窗用它自动关闭。 */
  onVerified?: () => void;
  /** 用户取消登录后回调——取消等于放弃这次添加，弹窗一起关掉。 */
  onCancelled?: () => void;
}) {
  const platform = useLocalPlatform({ onVerified });
  const [accountId, setAccountId] = useState("");
  const [name, setName] = useState("");
  const [limit, setLimit] = useState("10");

  const selected = platform.accounts.data?.accounts.find(
    (item) => item.id === accountId,
  );
  const runtimeReady = !!platform.accounts.data?.runtime.ready;
  const ready = runtimeReady && credentialsAvailable;
  /** 已经有二维码在等扫码（或本机还留着未完成的登录）：这时提交动作无意义，整块收起。 */
  const loginPending = !!platform.login || !!platform.accounts.data?.login;

  useDraftGuard(
    !!platform.login || !!platform.accounts.data?.login,
    "pending",
  );

  const login = (event: FormEvent) => {
    event.preventDefault();
    // 授权句不再由勾选框承载：登录本机账号是这一步的前提，点按钮即视为授权。
    // consent 常量照发——后端 begin() 仍硬校验它，只是不再有可取消的 UI 开关。
    platform.begin.mutate({
      ...(selected ? { accountId: selected.id, revision: selected.revision } : {}),
      name: name || selected?.name,
      dailyLimit: Number(limit),
      consent: "login-this-account-on-this-device-v1",
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {platform.error ? (
        <ErrorNotice error={platform.error} />
      ) : null}
      {platform.notice ? (
        <p role="status" className="text-body text-muted-foreground">
          {platform.notice}
        </p>
      ) : null}

      <form className="flex flex-col gap-4" onSubmit={login}>
        {platform.accounts.data?.accounts.length ? (
          <FormField label="账号">
            <Select
              value={accountId}
              onValueChange={(value) => {
              setAccountId(value);
              const next = platform.accounts.data?.accounts.find(
              (item) => item.id === value,
              );
              setName(next?.name ?? "");
              setLimit(String(next?.daily_limit ?? 10));
              }}
            >
              <SelectTrigger aria-label="账号">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SELECT_EMPTY}>添加新账号</SelectItem>
                {platform.accounts.data?.accounts.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                {item.name} ·{" "}
                {item.state === "VERIFIED"
                ? "已验证"
                : item.state === "RESTRICTED"
                ? "有限制"
                : "待登录"}
                </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        ) : null}

        {/* 名称占满，上限是 0–1000 的短数字，不需要和名称一样宽。 */}
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
          <FormField label="本地账号名称">
            <Input
              value={name || selected?.name || ""}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              required
            />
          </FormField>

          <FormField label="每日发送上限" hint="0 表示禁止发送">
            <Input
              type="number"
              min={0}
              max={1000}
              value={limit}
              onChange={(event) => setLimit(event.target.value)}
              required
            />
          </FormField>
        </div>

        {platform.accounts.data && !runtimeReady ? (
          <p className="text-caption text-muted-foreground">
            {platformReason(platform.accounts.data.runtime.reason)}
          </p>
        ) : null}
        {!credentialsAvailable ? (
          <p className="text-caption text-muted-foreground">
            系统凭据保护未就绪
          </p>
        ) : null}

        {/* 表单动作放页脚右对齐：单独一个按钮贴左边，看起来像没接上表单。
            二维码出来之后整块收掉——按钮已禁用，那条分隔线也没有分隔对象了。 */}
        {loginPending ? null : (
          <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-4">
            <Button
              type="submit"
              disabled={!ready}
              pending={platform.begin.isPending}
            >
              {platform.begin.isPending ? "正在生成二维码…" : "获取登录二维码"}
            </Button>
          </div>
        )}
      </form>

      {platform.login ? (
        // 二维码是这一步唯一要看的东西，整块居中：图、有效期、取消按钮都在中轴上。
        <div className="flex flex-col items-center gap-3 border-t pt-4 text-center">
          <img
            className="w-60 max-w-full rounded-md border bg-qr-surface p-3"
            src={platform.login.image}
            alt="本次小红书登录二维码"
          />
          <p className="text-body leading-relaxed text-muted-foreground break-words">
            有效期至 {new Date(platform.login.expiresAt).toLocaleTimeString()}
            。请核对扫码账号。
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button
              variant="outline"
              pending={platform.cancel.isPending}
              onClick={() =>
                platform.cancel.mutate(undefined, {
                  onSuccess: () => onCancelled?.(),
                })
              }
            >
              取消登录
            </Button>
          </div>
        </div>
      ) : null}

      {!platform.login && platform.accounts.data?.login ? (
        <div>
          <Button variant="outline" onClick={() => platform.cancel.mutate()}>
            取消尚未完成的登录
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function LocalReceivePanel({
  credentialsAvailable,
}: {
  credentialsAvailable: boolean;
}) {
  const platform = useLocalPlatform();
  const [receiverId, setReceiverId] = useState("");
  const [inboxConsent, setInboxConsent] = useState(false);
  const ready = platform.accounts.data?.runtime.ready && credentialsAvailable;

  return (
    <div className="flex flex-col gap-3">
      {platform.error ? (
        <ErrorNotice error={platform.error} />
      ) : null}
      {platform.notice ? (
        <p role="status" className="text-body text-muted-foreground">
          {platform.notice}
        </p>
      ) : null}

      <h3 className="text-section font-semibold">限时接收消息</h3>

      <FormField label="收件账号">
        <Select
          value={receiverId}
          onValueChange={(value) => {
          setReceiverId(value);
          platform.setInboxPlan(null);
          setInboxConsent(false);
          }}
        >
          <SelectTrigger aria-label="收件账号">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SELECT_EMPTY}>选择已登录账号</SelectItem>
            {platform.accounts.data?.accounts
            .filter((item) => item.state === "VERIFIED" && item.hasSession)
            .map((item) => (
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
          disabled={!ready || !receiverId}
          pending={platform.previewInbox.isPending}
          onClick={() => platform.previewInbox.mutate(receiverId)}
        >
          预览收件授权
        </Button>
      </div>

      {platform.inboxPlan ? (
        <div className="flex flex-col gap-3 border-t pt-4">
          <p className="text-body leading-relaxed text-muted-foreground break-words">
            {platform.inboxPlan.accountName} · 最长 {platform.inboxPlan.minutes}{" "}
            分钟。历史记录可能不完整，平台消息可能被标记为已读。
          </p>
          <CheckboxField
            checked={inboxConsent}
            onCheckedChange={setInboxConsent}
          >
            允许读取消息（含已读状态）。
          </CheckboxField>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={!inboxConsent}
              pending={platform.receive.isPending}
              onClick={() => platform.receive.mutate()}
            >
              授权并开始收件
            </Button>
          </div>
        </div>
      ) : null}

      {platform.receivers.data?.length ? (
        <div className="flex flex-col gap-2 border-t pt-4">
          <h3 className="text-body font-semibold">收件运行状态</h3>
          <ul className="flex flex-col gap-2">
            {platform.receivers.data.map((receiver) => (
              <li
                key={receiver.account_id}
                className="text-caption leading-relaxed text-muted-foreground break-words"
              >
                {receiver.name} ·{" "}
                {receiver.job_state === "QUEUED" &&
                receiver.reason === "YIELDED_FOR_SEND"
                  ? "等待发送结束后继续"
                  : receiver.state}{" "}
                · 截止 {new Date(receiver.expires_at).toLocaleTimeString()}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
