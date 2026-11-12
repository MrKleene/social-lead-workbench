import { Link } from "@/lib/router-compat";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch, SwitchThumb } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorNotice } from "@/components/feedback";
import type { JourneyStage } from "@/features/work/journey-model";
import { localApi } from "./local-api";
import { LocalCollectionPanel } from "./local-collection";
import { useLocalAction, useLocalRecords } from "./use-local-records";

/**
 * 「采集设置」弹窗：三步各自的开关与选择。
 *
 * 每一组都有「必须配好才能开始」的东西：
 * - 采集：关键词组（采集规则）
 * - 评论匹配：开自动审核就必须选一个匹配目标
 * - 自动回复：开自动回复就必须选渠道（私信/评论）+ 该渠道下的一条规则
 *
 * 缺配置时在对应页签内用红字指出，点「开始自动化采集」会被拦到那一页。
 */
export type AutomationSettingsTab = JourneyStage;

export function AutomationSettingsDialog({
  open,
  onOpenChange,
  tab,
  onTab,
  credentialsAvailable,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: AutomationSettingsTab;
  onTab: (tab: AutomationSettingsTab) => void;
  credentialsAvailable: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>采集设置</DialogTitle>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(value) => onTab(value as AutomationSettingsTab)}
        >
          <TabsList aria-label="采集设置分组" className="w-full">
            <TabsTrigger value="collect">采集</TabsTrigger>
            <TabsTrigger value="review">评论匹配</TabsTrigger>
            <TabsTrigger value="contact">自动回复</TabsTrigger>
          </TabsList>

          <div className="max-h-[60vh] overflow-y-auto pe-1">
            <TabsContent value="collect" className="flex flex-col gap-4">
              <CollectTab credentialsAvailable={credentialsAvailable} />
              <FooterLink
                to="/configuration?tab=keywords"
                label="管理关键词组与模板 →"
              />
            </TabsContent>

            <TabsContent value="review" className="flex flex-col gap-4">
              <MatchingTab />
              <FooterLink
                to="/configuration?tab=matching"
                label="管理匹配目标 →"
              />
            </TabsContent>

            <TabsContent value="contact" className="flex flex-col gap-4">
              <ReplyTab />
              <FooterLink to="/auto-contact" label="管理联系规则 →" />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- 采集 ---------------- */

function CollectTab({
  credentialsAvailable,
}: {
  credentialsAvailable: boolean;
}) {
  const selection = useLocalRecords("workspaceSelection");
  const configId = selection.data?.configId ?? "";

  return (
    <>
      <LocalCollectionPanel credentialsAvailable={credentialsAvailable} />
      {!configId ? <Missing text="需要配置关键词组" /> : null}
    </>
  );
}

/* ---------------- 评论匹配 ---------------- */

function MatchingTab() {
  const client = useQueryClient();
  const workflow = useLocalRecords("workflowOverview");
  const steps = useLocalRecords("automationSteps");
  const save = useLocalAction("saveAutomationSteps");
  const review = useMutation({
    mutationFn: (input: unknown) => localApi("setReviewPolicy", input),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["local"] }),
  });
  const automatic = useMutation({
    mutationFn: (input: unknown) =>
      localApi("setAutomaticReviewPolicy", input),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["local"] }),
  });

  const data = workflow.data;
  const current = steps.data;
  const modelReady = !!data?.model?.authorized && !!data?.capabilities.review;
  const selected = data?.policies.find((item) => item.id === current?.policyId);
  const error = workflow.error ?? steps.error ?? save.error ?? review.error ?? automatic.error;

  const persist = (patch: Partial<NonNullable<typeof current>>) => {
    if (!current) return;
    save.mutate({ ...current, ...patch });
  };

  const pickPolicy = async (policyId: string) => {
    if (!data || !current) return;
    const previous = data.policies.find((item) => item.id === current.policyId);
    const next = data.policies.find((item) => item.id === policyId);
    // 换目标时先关掉旧目标的自动审核，避免两个目标同时自动付费审核。
    if (previous && previous.id !== policyId && previous.autoEnabled) {
      automatic.mutate({
        id: previous.id,
        version: previous.version,
        enabled: false,
      });
    }
    if (next && !next.enabled) {
      await review.mutateAsync({
        id: next.id,
        version: next.version,
        enabled: true,
        consent: "comment-review-original-first-use-v2",
        modelVersion: data.model?.version,
      });
    }
    persist({ policyId });
    if (!current.autoReview) return;
    // 开关已经打开时，换目标后要立刻为新目标补上自动审核授权。
    const fresh = await client.fetchQuery({
      queryKey: ["local", "workflowOverview"],
      queryFn: () => localApi("workflowOverview"),
    });
    const target = fresh.policies.find((item) => item.id === policyId);
    if (target?.enabled && !target.autoEnabled) {
      automatic.mutate({
        id: target.id,
        version: target.version,
        enabled: true,
        consent: "comment-review-continuous-single-post-v3",
        modelVersion: fresh.model?.version,
        priceAck: fresh.model?.price_ack,
      });
    }
  };

  const toggle = (enabled: boolean) => {
    if (!current || !data) return;
    if (enabled) {
      if (selected?.enabled && !selected.autoEnabled) {
        automatic.mutate({
          id: selected.id,
          version: selected.version,
          enabled: true,
          consent: "comment-review-continuous-single-post-v3",
          modelVersion: data.model?.version,
          priceAck: data.model?.price_ack,
        });
      }
    } else if (selected?.autoEnabled) {
      automatic.mutate({
        id: selected.id,
        version: selected.version,
        enabled: false,
      });
    }
    persist({ autoReview: enabled });
  };

  return (
    <div className="flex flex-col gap-3">
      {error ? <ErrorNotice error={error} /> : null}

      <div className="flex items-center justify-between gap-3">
        <span className="text-body font-medium">自动审核</span>
        <Switch
          checked={!!current?.autoReview}
          disabled={!modelReady || automatic.isPending}
          onCheckedChange={toggle}
          aria-label="自动审核"
        >
          <SwitchThumb />
        </Switch>
      </div>

      {!modelReady ? <Missing text="模型未授权" /> : null}

      <RadioGroup
        value={current?.policyId ?? ""}
        onValueChange={pickPolicy}
        aria-label="匹配目标"
        className="flex flex-col gap-2"
      >
        {data?.policies.map((policy) => (
          <label
            key={policy.id}
            className="flex items-center gap-3 rounded-md border p-3"
          >
            <RadioGroupItem value={policy.id} />
            <span className="min-w-0 flex-1">
              <span className="block text-body font-medium break-words">
                {policy.name}
              </span>
              <span className="block text-caption text-muted-foreground break-words">
                {policy.enabled ? "已允许用于审核" : "尚未授权"}
              </span>
            </span>
          </label>
        ))}
      </RadioGroup>

      {current?.autoReview && !current.policyId ? (
        <Missing text="需要配置匹配目标" />
      ) : null}
    </div>
  );
}

/* ---------------- 自动回复 ---------------- */

function ReplyTab() {
  const rules = useLocalRecords("automationRules");
  const steps = useLocalRecords("automationSteps");
  const save = useLocalAction("saveAutomationSteps");

  const current = steps.data;
  const channel = current?.channel ?? "DM";
  const available =
    rules.data?.filter(
      (rule) => rule.enabled && rule.plans.some((plan) => plan.channel === channel),
    ) ?? [];
  const error = rules.error ?? steps.error ?? save.error;

  const persist = (patch: Partial<NonNullable<typeof current>>) => {
    if (!current) return;
    save.mutate({ ...current, ...patch });
  };

  return (
    <div className="flex flex-col gap-3">
      {error ? <ErrorNotice error={error} /> : null}

      <div className="flex items-center justify-between gap-3">
        <span className="text-body font-medium">自动回复</span>
        <Switch
          checked={!!current?.autoReply}
          onCheckedChange={(enabled) => persist({ autoReply: enabled })}
          aria-label="自动回复"
        >
          <SwitchThumb />
        </Switch>
      </div>

      <RadioGroup
        value={channel}
        onValueChange={(value) =>
          persist({ channel: value as "DM" | "COMMENT", ruleId: null })
        }
        aria-label="回复渠道"
        className="flex gap-2"
      >
        {(
          [
            ["DM", "私信"],
            ["COMMENT", "评论"],
          ] as const
        ).map(([value, label]) => (
          <label
            key={value}
            className="flex flex-1 items-center gap-2 rounded-md border p-3"
          >
            <RadioGroupItem value={value} />
            <span className="text-body">{label}</span>
          </label>
        ))}
      </RadioGroup>

      <RadioGroup
        value={current?.ruleId ?? ""}
        onValueChange={(value) => persist({ ruleId: value })}
        aria-label="联系规则"
        className="flex flex-col gap-2"
      >
        {available.map((rule) => (
          <label
            key={rule.id}
            className="flex items-center gap-3 rounded-md border p-3"
          >
            <RadioGroupItem value={rule.id} />
            <span className="min-w-0 flex-1">
              <span className="block text-body font-medium break-words">
                {rule.name}
              </span>
              <span className="block text-caption text-muted-foreground">
                最低 {rule.threshold} 分
              </span>
            </span>
          </label>
        ))}
      </RadioGroup>

      {!available.length ? (
        <Missing
          text={channel === "DM" ? "需要配置私信规则" : "需要配置评论规则"}
        />
      ) : current?.autoReply && !current.ruleId ? (
        <Missing
          text={channel === "DM" ? "需要选择私信规则" : "需要选择评论规则"}
        />
      ) : null}
    </div>
  );
}

/* ---------------- 共用 ---------------- */

function Missing({ text }: { text: string }) {
  return (
    <p role="alert" className="text-body text-destructive break-words">
      {text}
    </p>
  );
}

function FooterLink({ to, label }: { to: string; label: string }) {
  return (
    <div className="border-t pt-4">
      <Button variant="ghost" size="sm" asChild>
        <Link to={to}>{label}</Link>
      </Button>
    </div>
  );
}
