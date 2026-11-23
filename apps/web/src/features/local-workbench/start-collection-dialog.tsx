import { useEffect, useState } from "react";
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
import { localApi } from "./local-api";
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
  /** `id` 是本轮 COLLECT 任务 id；`replySkipped` 是「自动回复规则未加入本轮」的原因，没有就传 null。 */
  onStarted: (started: { id: string; replySkipped: string | null }) => void;
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
  /** 本轮搜索计划由本机随机抽取并冻结；每次打开弹窗重新抽一次，展示的和授权的是同一份。 */
  const [planRound, setPlanRound] = useState(0);
  useEffect(() => {
    if (open) setPlanRound((round) => round + 1);
  }, [open]);
  const planPreview = useQuery({
    queryKey: [
      "local",
      "collectionPlan",
      configId,
      preferences.data?.accountId ?? null,
      preferences.data?.batchLimit ?? 0,
      planRound,
    ],
    queryFn: () =>
      localApi("previewCollection", {
        configId,
        accountId: preferences.data!.accountId,
        batchLimit: preferences.data!.batchLimit,
        policyIds: [],
        ruleIds: [],
      }),
    enabled: open && !!configId && !!preferences.data?.accountId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const keywordPlan = planPreview.data?.keywordPlan;

  const start = useMutation({
    mutationFn: async (input: {
      accountId: string;
      batchLimit: number;
      policyId: string | null;
    }) => {
      // 采集只负责采集与评论匹配。自动加入待发送队列由审核完成后的队列规则决定，
      // 自动发送由「待处理发送」页头总开关与发送渠道配置决定，都不属于本轮采集授权。
      const preview = await localApi("previewCollection", {
        configId,
        accountId: input.accountId,
        batchLimit: input.batchLimit,
        policyIds: input.policyId ? [input.policyId] : [],
        ruleIds: [],
        keywordPlan,
      });
      const result = await localApi("authorizeCollection", {
        scope: preview.scope,
        previewHash: preview.previewHash,
        requestKey: crypto.randomUUID(),
        consent: "bounded-platform-read-once-v1",
      });
      return { id: result.id, replySkipped: null as string | null };
    },
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: ["local"] });
      onStarted(result);
      onOpenChange(false);
    },
  });

  const config = configs.data?.find((item) => item.id === configId);
  const account = accounts.data?.find(
    (item) => item.id === preferences.data?.accountId,
  );
  const policyId = steps.data?.policyId ?? null;
  const policy = workflow.data?.policies.find((item) => item.id === policyId);
  const verified = account?.state === "VERIFIED" && !!account.hasSession;

  /** 缺配置由页面统一拦在「需要先完成配置」弹窗里，这里只做确认。 */
  const ready = !!preferences.data;

  const failure =
    selection.error ??
    preferences.error ??
    configs.error ??
    planPreview.error ??
    start.error;

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
                <Link to="/configuration?tab=keywords">关键词配置</Link>
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
              <ScopeRow
                label="笔记上限"
                value={`${preferences.data.batchLimit} 篇`}
              />
              <ScopeRow
                label="本轮范围"
                value={
                  policy ? `采集与评论匹配（${policy.name}）` : "仅采集"
                }
              />
            </dl>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            disabled={!ready || planPreview.isPending}
            pending={start.isPending}
            onClick={() =>
              start.mutate({
                accountId: preferences.data!.accountId!,
                batchLimit: preferences.data!.batchLimit,
                policyId,
              })
            }
          >
            {start.isPending ? "正在准备采集" : "开始采集"}
          </Button>
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
