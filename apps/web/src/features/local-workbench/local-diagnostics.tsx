import { Button } from "@/components/ui/button";
import { ErrorNotice } from "@/components/feedback";
import { useLocalAction } from "./use-local-records";

const reasons: Record<string, string> = {
  ACCOUNT_REQUIRES_LOGIN: "需要重新登录原账号",
  ACCOUNT_IDENTITY_UNVERIFIED: "缺少可靠平台身份",
  ACCOUNT_HAS_ACTIVE_TASKS: "存在本账号活动任务",
  ACCOUNT_HAS_RETAINED_RESTRICTION: "保留的账号或渠道限制",
  DAILY_QUOTA_EXHAUSTED: "今日发送额度已用完或设置为零",
  SENDING_PAUSED: "全局发送或平台操作已暂停",
  UNKNOWN_SEND_REQUIRES_EVIDENCE: "存在需要证据核对的未知发送",
};

export function LocalAccountDiagnostics({ accountId }: { accountId: string }) {
  const check = useLocalAction("accountDiagnostics");
  const result = check.data;

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <h3 className="text-section font-semibold">本地资格检查</h3>
      <div>
        <Button
          variant="outline"
          pending={check.isPending}
          onClick={() => check.mutate({ accountId })}
        >
          检查本地资格
        </Button>
      </div>
      {check.error ? (
        <ErrorNotice error={check.error} />
      ) : null}
      {result ? (
        <>
          <p className="text-body leading-relaxed text-muted-foreground break-words">
            检查时间：{new Date(result.checkedAt).toLocaleString()} · 今日占用{" "}
            {result.occupied}/{result.limit} · 剩余额度 {result.remaining}
          </p>
          {result.channels.map((channel) => (
            <div key={channel.channel} className="flex flex-col gap-1">
              <h4 className="text-body font-medium">
                {channel.channel === "DM" ? "私信" : "评论回复"}
              </h4>
              {channel.reasons.length ? (
                <ul className="flex flex-col gap-1">
                  {channel.reasons.map((reason) => (
                    <li
                      key={reason}
                      className="text-caption leading-relaxed text-muted-foreground break-words"
                    >
                      {reasons[reason] ?? reason}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-caption text-muted-foreground">
                  未发现阻止项。
                </p>
              )}
            </div>
          ))}
        </>
      ) : null}
    </div>
  );
}
