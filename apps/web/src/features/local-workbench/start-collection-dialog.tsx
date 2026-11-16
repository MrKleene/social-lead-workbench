import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorNotice } from "@/components/feedback";
import {
  localApi,
  type AutomationSteps,
  type LocalConfiguration,
} from "./local-api";
import { useLocalRecords } from "./use-local-records";

/**
 * 「开始自动化采集」的确认弹窗。
 *
 * 一次提交完成「预览范围 + 授权入队」：预览只是内部拿 scope 和哈希，不该让用户先点一次
 * 「预览」再点一次「开始」。范围来自已保存的本组偏好，要改去「采集设置」。
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
  /** 参数是「本轮没带上的后续步骤」的原因，没有就传 null。 */
  onStarted: (replySkipped: string | null) => void;
}) {
  const client = useQueryClient();
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
  const accounts = useLocalRecords("accountDetails", undefined, {
    enabled: open,
  });
  const workflow = useLocalRecords("workflowOverview", undefined, {
    enabled: open,
  });

  const start = useMutation({
    mutationFn: async (input: {
      accountId: string;
      batchLimit: number;
      policyId: string | null;
      policyRevision: number;
      threshold: number;
      replyAccounts: { id: string; version: number; dailyLimit: number }[];
      plans: { channel: "DM" | "COMMENT"; content: string; templateId: string; templateVersion: number }[];
    }) => {
      // 采集与回复解耦：回复账号受限时只放弃本轮的自动回复，采集照常开始。
      // 未选匹配规则属于配置缺失，仍然阻断——那不是「回复暂时发不出去」。
      if (input.plans.length && !input.policyId) {
        throw new Error("未选择评论匹配规则");
      }
      let ruleIds: string[] = [];
      let replySkipped: string | null = null;
      if (input.plans.length) {
        try {
          ruleIds = [await syncReplyRule(input)];
        } catch (error) {
          replySkipped = error instanceof Error ? error.message : "自动回复未加入本轮";
        }
      }
      const preview = await localApi("previewCollection", {
        configId,
        accountId: input.accountId,
        batchLimit: input.batchLimit,
        policyIds: input.policyId ? [input.policyId] : [],
        ruleIds,
      });
      const result = await localApi("authorizeCollection", {
        scope: preview.scope,
        previewHash: preview.previewHash,
        requestKey: crypto.randomUUID(),
        consent: preview.automaticRules
          ? "bounded-read-with-frozen-contact-v1"
          : "bounded-platform-read-once-v1",
      });
      return { id: result.id, replySkipped };
    },
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: ["local"] });
      onStarted(result.replySkipped);
      onOpenChange(false);
    },
  });

  const config = configs.data?.find((item) => item.id === configId);
  const account = accounts.data?.find(
    (item) => item.id === preferences.data?.accountId,
  );
  const policyId = steps.data?.policyId ?? null;
  const policy = workflow.data?.policies.find((item) => item.id === policyId);
  const plans = replyPlans(configs.data, steps.data);
  /** 回复账号按设置里的顺序取；账号被删或刷新后失效的会自然掉出列表。 */
  const replyAccounts = (steps.data?.replyAccountIds ?? []).flatMap((id) => {
    const item = accounts.data?.find((account) => account.id === id);
    return item ? [item] : [];
  });
  const verified = account?.state === "VERIFIED" && !!account.hasSession;

  /** 缺配置由页面统一拦在「需要先完成配置」弹窗里，这里只做确认。 */
  const ready = !!preferences.data;

  const failure =
    selection.error ?? preferences.error ?? configs.error ?? start.error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>开始自动化采集</DialogTitle>
        </DialogHeader>

        {failure ? <ErrorNotice error={failure} /> : null}

        {!configId ? (
          <div className="flex flex-col gap-3">
            <p className="text-body text-destructive">未选择关键词组</p>
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
                    ? account.name + (verified ? "" : " · 未验证")
                    : "未选择"
                }
              />
              {plans.length ? (
                <ScopeRow
                  label="回复账号"
                  value={
                    replyAccounts.length
                      ? replyAccounts
                          .map(
                            (item) =>
                              item.name + (item.holds.length ? " · 受限" : ""),
                          )
                          .join("、")
                      : "未选择"
                  }
                />
              ) : null}
              <ScopeRow
                label="笔记上限"
                value={`${preferences.data.batchLimit} 篇`}
              />
              <ScopeRow
                label="后续步骤"
                value={[
                  policy ? `评论匹配（${policy.name}）` : "仅采集",
                  plans.length
                    ? `自动回复（${plans.map((plan) => (plan.channel === "DM" ? "私信" : "评论")).join("、")}）`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
            </dl>

          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            disabled={!ready}
            pending={start.isPending}
            onClick={() =>
              start.mutate({
                accountId: preferences.data!.accountId!,
                batchLimit: preferences.data!.batchLimit,
                policyId,
                policyRevision: policy?.revision ?? 1,
                threshold: steps.data?.threshold ?? 80,
                replyAccounts: replyAccounts.map((item) => ({
                  id: item.id,
                  version: item.revision,
                  dailyLimit: item.daily_limit,
                })),
                plans,
              })
            }
          >
            开始采集
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 本轮要用的回复模板：选了哪个渠道就用哪个模板。 */
function replyPlans(
  configs: LocalConfiguration[] | undefined,
  steps: AutomationSteps | undefined,
) {
  if (!steps?.autoReply) return [];
  const pairs = [
    ["COMMENT_TEMPLATE", steps.commentTemplateId, "COMMENT"],
    ["DM_TEMPLATE", steps.dmTemplateId, "DM"],
  ] as const;
  return pairs.flatMap(([kind, id, channel]) => {
    if (!id) return [];
    const item = configs?.find((config) => config.id === id && config.kind === kind);
    const content = item?.body.text ?? "";
    if (!item || !content) return [];
    return [
      {
        channel,
        content,
        templateId: item.id,
        templateVersion: item.revision,
      },
    ];
  });
}

/**
 * 把三步设置翻译成一条自动联系规则并授权。
 * 界面上不再暴露「规则」，所以每次开始前按当前设置同步一次，id 固定为 auto-reply。
 * 发送账号来自「自动回复」里选的回复账号池，与采集账号无关。
 */
async function syncReplyRule(input: {
  accountId: string;
  policyId: string | null;
  policyRevision: number;
  threshold: number;
  replyAccounts: { id: string; version: number; dailyLimit: number }[];
  plans: { channel: "DM" | "COMMENT"; content: string; templateId: string; templateVersion: number }[];
}) {
  if (!input.policyId) throw new Error("未选择评论匹配规则");
  if (!input.replyAccounts.length) throw new Error("未选择回复账号");
  const existing = (await localApi("automationRules")).find(
    (rule) => rule.id === "auto-reply",
  );
  const saved = await localApi("saveAutomationRule", {
    id: "auto-reply",
    name: "自动回复",
    input: {
      version: existing?.version ?? 0,
      platform: "XHS",
      policyId: input.policyId,
      policyRevision: input.policyRevision,
      threshold: input.threshold,
      channel: input.plans[0].channel,
      content: input.plans[0].content,
      channelPlans: input.plans,
      accounts: input.replyAccounts,
    },
  });
  const preview = await localApi("previewAutomationRule", {
    id: "auto-reply",
    version: saved.version,
  });
  await localApi("authorizeAutomationRule", {
    id: "auto-reply",
    version: saved.version,
    previewHash: preview.previewHash,
    consent: "automatic-contact-frozen-run-v1",
  });
  return "auto-reply";
}

function ScopeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-3 last:border-b-0">
      <dt className="text-body shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-body text-right font-medium break-words">{value}</dd>
    </div>
  );
}
