import { useEffect, useRef, useState, type FormEvent } from "react";
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
import { cn } from "@/lib/utils";
import { useLocalPlatform } from "./use-local-platform";

/** 平台组件不可用时，把后端给的原因翻成人话。 */
export function platformReason(reason: string) {
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
  defaultAccountId,
  onVerified,
  onCancelled,
}: {
  credentialsAvailable: boolean;
  /** 从账号详情点「重新登录」进来时预选该账号；不传就是添加新账号。 */
  defaultAccountId?: string;
  /** 扫码核验通过后回调——「添加账号」弹窗用它自动关闭。 */
  onVerified?: () => void;
  /** 用户取消登录后回调——取消等于放弃这次添加，弹窗一起关掉。 */
  onCancelled?: () => void;
}) {
  const platform = useLocalPlatform({ onVerified });
  const [accountId, setAccountId] = useState("");
  const [name, setName] = useState("");
  const [limit, setLimit] = useState("10");
  /** 账号列表是异步来的：只补一次初值，之后用户自己选什么就是什么。 */
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current || !defaultAccountId) return;
    const target = platform.accounts.data?.accounts.find(
      (item) => item.id === defaultAccountId,
    );
    if (!target) return;
    seeded.current = true;
    setAccountId(target.id);
    setName(target.name);
    setLimit(String(target.daily_limit));
  }, [defaultAccountId, platform.accounts.data]);

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
            className={cn(
              "w-60 max-w-full rounded-md border bg-qr-surface p-3 transition-opacity",
              // 取消要等浏览器进程真正退出（最长 10s），期间把二维码压暗，表示"正在作废"；
              // 扫上码之后二维码也没用了，一并压暗，把视线让给下面那句状态。
              (platform.cancel.isPending || platform.scanned) && "opacity-40",
            )}
            src={platform.login.image}
            alt="本次小红书登录二维码"
          />
          <p role="status" className="text-body leading-relaxed text-muted-foreground break-words">
            {platform.scanned
              ? "已扫码，正在核验账号…"
              : `有效期至 ${new Date(platform.login.expiresAt).toLocaleTimeString()}。请核对扫码账号。`}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button
              variant="outline"
              pending={platform.cancel.isPending}
              onClick={() =>
                platform.cancel.mutate(undefined, {
                  // 只有确认停住才关窗。停止未确认时留着弹窗，让 notice 能说清楚，
                  // 否则关掉就只剩一个"不知道成没成"的结果。
                  onSuccess: (result) => {
                    if (result.stopped) onCancelled?.();
                  },
                })
              }
            >
              {platform.cancel.isPending ? "正在取消…" : "取消登录"}
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
  accountId,
  credentialsAvailable,
  onFetched,
}: {
  accountId: string;
  credentialsAvailable: boolean;
  onFetched?: () => void;
}) {
  const platform = useLocalPlatform();
  const [consent, setConsent] = useState(false);
  const ready = platform.accounts.data?.runtime.ready && credentialsAvailable;

  return (
    <div className="flex flex-col gap-3">
      {platform.error ? <ErrorNotice error={platform.error} /> : null}
      {platform.notice ? (
        <p role="status" className="text-body text-muted-foreground">
          {platform.notice}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          disabled={!ready || !accountId}
          pending={platform.previewInbox.isPending}
          onClick={() => platform.previewInbox.mutate(accountId)}
        >
          获取消息
        </Button>
      </div>

      {platform.inboxPlan ? (
        <div className="flex flex-col gap-3 border-t pt-4">
          <p className="text-body leading-relaxed text-muted-foreground break-words">
            {platform.inboxPlan.accountName}
          </p>
          <CheckboxField checked={consent} onCheckedChange={setConsent}>
            允许读取消息（含已读状态）。
          </CheckboxField>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={!consent}
              pending={platform.receive.isPending}
              onClick={() =>
                platform.receive.mutate(undefined, {
                  onSuccess: () => {
                    setConsent(false);
                    onFetched?.();
                  },
                })
              }
            >
              开始获取
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
