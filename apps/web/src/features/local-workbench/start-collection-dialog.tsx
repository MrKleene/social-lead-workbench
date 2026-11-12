import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckboxField } from "@/components/patterns/checkbox-field";
import { ErrorNotice } from "@/components/feedback";
import { localApi } from "./local-api";
import { useLocalPlatform } from "./use-local-platform";
import { useLocalRecords } from "./use-local-records";

/**
 * 「开始自动化采集」的确认弹窗。
 *
 * 采集是有副作用的外部读取，必须经过「预览范围 → 勾选授权 → 提交」三步，
 * 不能点一下页头按钮就直接跑。范围来自已保存的本组偏好，不在这里改设置
 * （改设置去「采集设置」，避免两个地方各存一份）。
 */
export function StartCollectionDialog({
  open,
  onOpenChange,
  credentialsAvailable,
  onStarted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  credentialsAvailable: boolean;
  onStarted: () => void;
}) {
  const platform = useLocalPlatform();
  const selection = useLocalRecords("workspaceSelection", undefined, {
    enabled: open,
  });
  const configs = useLocalRecords("configurations", undefined, {
    enabled: open,
  });
  const configId = selection.data?.configId ?? "";
  const preferences = useQuery({
    queryKey: ["local", "collectionPreferences", configId],
    queryFn: () => localApi("collectionPreferences", { configId }),
    enabled: open && !!configId,
  });
  const steps = useLocalRecords("automationSteps", undefined, { enabled: open });
  const policies = useLocalRecords("workflowOverview", undefined, {
    enabled: open,
  });
  const rules = useLocalRecords("automationRules", undefined, { enabled: open });

  const [consent, setConsent] = useState(false);
  const handled = useRef<string | null>(null);
  const { setPlan } = platform;
  const resetCollect = platform.collect.reset;

  useEffect(() => {
    if (!open) return;
    handled.current = null;
    setConsent(false);
    setPlan(null);
    resetCollect();
  }, [open, setPlan, resetCollect]);

  const queuedJob = platform.collect.data?.id;
  useEffect(() => {
    if (!queuedJob || handled.current === queuedJob) return;
    handled.current = queuedJob;
    onStarted();
    onOpenChange(false);
  }, [queuedJob, onStarted, onOpenChange]);

  const config = configs.data?.find((item) => item.id === configId);
  const account = platform.accounts.data?.accounts.find(
    (item) => item.id === preferences.data?.accountId,
  );
  const policyId = steps.data?.policyId ?? null;
  const ruleId = steps.data?.autoReply ? (steps.data?.ruleId ?? null) : null;
  const policy = policies.data?.policies.find((item) => item.id === policyId);
  const rule = rules.data?.find((item) => item.id === ruleId);
  const missing = !policyId
    ? steps.data?.autoReview
      ? "需要配置匹配目标"
      : ""
    : !policy?.enabled
      ? "匹配目标未授权"
      : steps.data?.autoReply && !ruleId
        ? steps.data?.channel === "COMMENT"
          ? "需要配置评论规则"
          : "需要配置私信规则"
        : "";
  const ready =
    !!platform.accounts.data?.runtime.ready &&
    credentialsAvailable &&
    account?.state === "VERIFIED" &&
    !!account.hasSession &&
    !missing;

  const failure =
    platform.error ?? selection.error ?? preferences.error ?? configs.error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>确认本轮采集范围</DialogTitle>
        </DialogHeader>

        {failure ? <ErrorNotice error={failure} /> : null}

        {!configId ? (
          <div className="flex flex-col gap-3">
            <p className="text-body text-muted-foreground">未选择关键词组</p>
            <div>
              <Button variant="outline" asChild>
                <Link to="/configuration?tab=keywords">采集设置</Link>
              </Button>
            </div>
          </div>
        ) : preferences.isPending || !preferences.data ? (
          <p className="text-body text-muted-foreground">正在读取…</p>
        ) : (
          <>
            <dl className="flex flex-col border-t">
              <ScopeRow label="关键词组" value={config?.name ?? "未命名配置"} />
              <ScopeRow
                label="采集账号"
                value={
                  account
                    ? account.name +
                      (account.state === "VERIFIED" && account.hasSession
                        ? " · 已验证"
                        : " · 需重新登录")
                    : "未选择"
                }
              />
              <ScopeRow
                label="笔记上限"
                value={`${preferences.data.batchLimit} 篇`}
              />
              <ScopeRow
                label="后续步骤"
                value={[
                  policy ? `评论匹配（${policy.name}）` : "仅采集",
                  rule ? `自动回复（${rule.name}）` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
            </dl>

            {missing ? (
              <p role="alert" className="text-body text-destructive break-words">
                {missing}
              </p>
            ) : null}

            {platform.plan ? (
              <div className="flex flex-col gap-3 border-t pt-4">
                <p className="text-body break-words">
                  {platform.plan.accountName} · {platform.plan.configurationName} ·
                  最多 {platform.plan.batchLimit} 篇笔记 ·{" "}
                  {platform.plan.reviewTargets} 个匹配目标
                </p>
                <p className="text-body text-muted-foreground break-words">
                  关键词：{platform.plan.keywords.join("、")}
                </p>
                <CheckboxField checked={consent} onCheckedChange={setConsent}>
                  {platform.plan.automaticRules
                    ? `授权读取以上范围一次，并冻结 ${platform.plan.automaticRules} 条联系规则。`
                    : `授权读取以上范围一次，并付费审核 ${platform.plan.automaticReviews} 个匹配目标。`}
                </CheckboxField>
              </div>
            ) : null}

            {account?.state !== "VERIFIED" || !account?.hasSession ? (
              <p className="text-body text-muted-foreground">采集账号未验证</p>
            ) : null}
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          {configId && preferences.data ? (
            platform.plan ? (
              <Button
                disabled={!consent || !ready}
                pending={platform.collect.isPending}
                onClick={() => platform.collect.mutate()}
              >
                授权并开始采集
              </Button>
            ) : (
              <Button
                disabled={!ready}
                pending={platform.preview.isPending}
                onClick={() =>
                  platform.preview.mutate({
                    configId,
                    accountId: preferences.data.accountId,
                    batchLimit: preferences.data.batchLimit,
                    policyIds: policyId ? [policyId] : [],
                    ruleIds: ruleId ? [ruleId] : [],
                  })
                }
              >
                预览采集范围
              </Button>
            )
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScopeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-3 last:border-b-0">
      <dt className="text-body shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-body text-right font-medium break-words">{value}</dd>
    </div>
  );
}
