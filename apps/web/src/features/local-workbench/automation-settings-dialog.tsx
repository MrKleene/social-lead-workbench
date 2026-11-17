import { useState, type ReactNode } from "react";
import { Link } from "@/lib/router-compat";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormField } from "@/components/patterns/form-field";
import { Input } from "@/components/ui/input";
import {
  SELECT_EMPTY,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { Switch, SwitchThumb } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorNotice } from "@/components/feedback";
import { cn } from "@/lib/utils";
import type { JourneyStage } from "@/features/work/journey-model";
import { localApi, type LocalConfiguration } from "./local-api";
import { LocalCollectionPanel } from "./local-collection";
import { useLocalRecords } from "./use-local-records";

/**
 * 「采集设置」弹窗：三步各自的开关与选择。
 *
 * 布局照 shadcn-admin 的设置页：左边一列步骤（带状态），右边一张内容卡。
 * 三步是先后关系而不是并列分类，竖排比横向页签更能表达顺序，也能顺带显示每步配好没有。
 *
 * 每组「必须配好才能开始」的东西：
 * - 采集：关键词组
 * - 评论匹配：开自动审核就必须选一个评论匹配规则
 * - 自动回复：开自动回复就必须选至少一个回复账号 + 该账号要用的模板
 */
export type AutomationSettingsTab = JourneyStage;

const order: AutomationSettingsTab[] = ["collect", "review", "contact"];

const labels: Record<AutomationSettingsTab, string> = {
  collect: "采集",
  review: "评论匹配",
  contact: "自动回复",
};

/** 每个步骤对应的全局配置页与入口文案——放页脚左侧，和主按钮分开。
 *  采集页签多一个「管理账号」：账号不在这个弹窗里配置，只能去账号中心。 */
const manage: Record<AutomationSettingsTab, { to: string; label: string }[]> = {
  collect: [
    { to: "/configuration?tab=keywords", label: "管理关键词组" },
    { to: "/work/accounts", label: "管理账号" },
  ],
  review: [{ to: "/configuration?tab=matching", label: "管理评论匹配规则" }],
  contact: [
    { to: "/configuration?tab=templates", label: "管理回复模板" },
    // 日额度是账号属性，只能在账号中心改；这里只读展示。
    { to: "/work/accounts", label: "管理账号" },
  ],
};

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
  const selection = useLocalRecords("workspaceSelection", undefined, {
    enabled: open,
  });
  const steps = useLocalRecords("automationSteps", undefined, {
    enabled: open,
  });

  const configured: Record<AutomationSettingsTab, string> = {
    collect: selection.data?.configId ? "已配置" : "未配置",
    review: !steps.data?.autoReview
      ? "已关闭"
      : steps.data.policyId
        ? "已配置"
        : "未配置",
    contact: !steps.data?.autoReply
      ? "已关闭"
      : (steps.data.replyAccountIds.length > 0 &&
          (steps.data.commentTemplateIds.length > 0 ||
            steps.data.dmTemplateIds.length > 0))
        ? "已配置"
        : "未配置",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>采集设置</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 gap-4">
          <nav
            aria-label="采集设置分组"
            className="flex w-44 shrink-0 flex-col gap-1"
          >
            {order.map((id, index) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => onTab(id)}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-start transition-colors",
                    active ? "bg-muted" : "hover:bg-muted/60",
                  )}
                >
                  <span
                    className={cn(
                      "text-body font-medium",
                      active ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {index + 1}. {labels[id]}
                  </span>
                  <span className="text-caption text-muted-foreground">
                    {configured[id]}
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="max-h-[60vh] min-h-80 min-w-0 flex-1 overflow-y-auto rounded-lg border bg-card p-6">
            {tab === "collect" ? (
              <CollectTab credentialsAvailable={credentialsAvailable} />
            ) : tab === "review" ? (
              <MatchingTab />
            ) : (
              <ReplyTab />
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {manage[tab].map((entry) => (
            <Button key={entry.to} variant="outline" asChild>
              <Link to={entry.to}>{entry.label}</Link>
            </Button>
          ))}
          <Button onClick={() => onOpenChange(false)}>完成</Button>
        </div>
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
  return <LocalCollectionPanel credentialsAvailable={credentialsAvailable} />;
}

/* ---------------- 评论匹配 ---------------- */

function MatchingTab() {
  const client = useQueryClient();
  const workflow = useLocalRecords("workflowOverview");
  const steps = useLocalRecords("automationSteps");
  const save = useSaveSteps();
  const review = useMutation({
    mutationFn: (input: unknown) => localApi("setReviewPolicy", input),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["local"] }),
  });
  const automatic = useMutation({
    mutationFn: (input: unknown) => localApi("setAutomaticReviewPolicy", input),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["local"] }),
  });

  const data = workflow.data;
  const current = steps.data;
  const modelReady = !!data?.model?.authorized && !!data?.capabilities.review;
  const selected = data?.policies.find((item) => item.id === current?.policyId);
  const error =
    workflow.error ??
    steps.error ??
    save.error ??
    review.error ??
    automatic.error;

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
    <div className="flex flex-col gap-4">
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

      <FormField label="评论匹配规则">
        <Select
          value={current?.policyId ?? ""}
          disabled={!modelReady || !data?.policies.length}
          onValueChange={(value) =>
            value ? void pickPolicy(value) : persist({ policyId: null })
          }
        >
          <SelectTrigger aria-label="评论匹配规则">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SELECT_EMPTY}>选择评论匹配规则</SelectItem>
            {data?.policies.map((policy) => (
              <SelectItem key={policy.id} value={policy.id}>
                {policy.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      {!modelReady ? <Hint>模型未选择，不允许开启自动审核</Hint> : null}
      {modelReady && current?.autoReview && !current.policyId ? (
        <Hint>未选择评论匹配规则</Hint>
      ) : null}
    </div>
  );
}

/* ---------------- 自动回复 ---------------- */

function ReplyTab() {
  const configs = useLocalRecords("configurations");
  const steps = useLocalRecords("automationSteps");
  const accounts = useLocalRecords("accountDetails");
  const save = useSaveSteps();
  const [text, setText] = useState("");

  const current = steps.data;
  const comment = configs.data?.filter((item) => item.kind === "COMMENT_TEMPLATE") ?? [];
  const dm = configs.data?.filter((item) => item.kind === "DM_TEMPLATE") ?? [];
  const selected = current?.replyAccountIds ?? [];
  const blocked = (accounts.data ?? []).some(
    (item) => selected.includes(item.id) && item.holds.length > 0,
  );
  const error = configs.error ?? steps.error ?? accounts.error ?? save.error;

  const persist = (patch: Partial<NonNullable<typeof current>>) => {
    if (!current) return;
    save.mutate({ ...current, ...patch });
  };

  const commitThreshold = () => {
    const next = Number(text);
    setText("");
    if (!Number.isInteger(next) || next < 0 || next > 100) return;
    if (next !== current?.threshold) persist({ threshold: next });
  };

  const toggleAccount = (id: string, checked: boolean) => {
    persist({
      replyAccountIds: checked
        ? [...selected, id]
        : selected.filter((value) => value !== id),
    });
  };

  return (
    <div className="flex flex-col gap-4">
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

      <FormField label="满足分数自动发送">
        <Input
          type="number"
          min={0}
          max={100}
          value={text || String(current?.threshold ?? 80)}
          onChange={(event) => setText(event.target.value)}
          onBlur={commitThreshold}
        />
      </FormField>

      {/* 账号池：顺序即配额耗尽后的取用顺序；日额度是账号属性，只在这里展示。 */}
      <div className="flex min-w-0 flex-col gap-2">
        <span className="text-body">回复账号</span>
        {accounts.data?.length ? (
          <div className="flex flex-col divide-y rounded-md border">
            {accounts.data.map((item) => {
              const usable = item.state === "VERIFIED" && !!item.hasSession;
              const restricted = item.holds.length > 0;
              const chosen = selected.includes(item.id);
              return (
                <label
                  key={item.id}
                  className="flex cursor-pointer items-start gap-2 px-4 py-2"
                >
                  <Checkbox
                    checked={chosen}
                    disabled={save.isPending || (!chosen && (!usable || restricted))}
                    onCheckedChange={(checked) =>
                      toggleAccount(item.id, checked === true)
                    }
                    className="mt-0.5"
                  />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="text-body break-words">
                      {item.nickname ?? item.name}
                    </span>
                    <span
                      className={cn(
                        "text-caption break-words",
                        usable && !restricted
                          ? "text-muted-foreground"
                          : "text-attention",
                      )}
                    >
                      每日 {item.daily_limit} 条
                      {restricted ? " · 受限" : ""}
                      {usable ? "" : " · 需重新登录"}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        ) : (
          <p className="text-body text-muted-foreground">
            {accounts.isPending ? "正在读取…" : "还没有账号"}
          </p>
        )}
      </div>

      <FormField label="评论回复模板">
        <TemplatePicker
          name="评论回复模板"
          items={comment}
          selected={current?.commentTemplateIds ?? []}
          disabled={save.isPending}
          onChange={(ids) => persist({ commentTemplateIds: ids })}
        />
      </FormField>

      <FormField label="私信模板">
        <TemplatePicker
          name="私信模板"
          items={dm}
          selected={current?.dmTemplateIds ?? []}
          disabled={save.isPending}
          onChange={(ids) => persist({ dmTemplateIds: ids })}
        />
      </FormField>

      {current?.autoReply &&
      !current.commentTemplateIds.length &&
      !current.dmTemplateIds.length ? (
        <Hint>请选择至少一个自动回复模式</Hint>
      ) : null}
      {current?.autoReply && !selected.length ? (
        <Hint>未选择回复账号</Hint>
      ) : null}
      {blocked ? <Hint>已选账号存在未解除的回复限制</Hint> : null}
    </div>
  );
}

/* ---------------- 共用 ---------------- */

/**
 * 保存三步设置：把返回结果直接写回查询缓存再触发失效。
 * 否则下拉选完要等一次 refetch 才更新，慢的时候看起来像「选了没生效」。
 */
function useSaveSteps() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) => localApi("saveAutomationSteps", input),
    onSuccess: (data) => {
      client.setQueryData(["local", "automationSteps", null], data);
      void client.invalidateQueries({ queryKey: ["local"] });
    },
  });
}

/** 多选模板：勾选顺序不影响发送，后端每次从池里随机选一条且不与上一条重复。 */
function TemplatePicker({
  name,
  items,
  selected,
  disabled,
  onChange,
}: {
  name: string;
  items: LocalConfiguration[];
  selected: string[];
  disabled: boolean;
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string, checked: boolean) =>
    onChange(
      checked ? [...selected, id] : selected.filter((value) => value !== id),
    );

  if (!items.length)
    return (
      <p className="text-body text-muted-foreground">还没有可用的{name}</p>
    );

  return (
    <div className="flex flex-col divide-y rounded-md border">
      {items.map((item) => (
        <label
          key={item.id}
          className="flex cursor-pointer items-start gap-2 px-4 py-2"
        >
          <Checkbox
            checked={selected.includes(item.id)}
            disabled={disabled}
            onCheckedChange={(checked) => toggle(item.id, checked === true)}
            className="mt-0.5"
            aria-label={item.name}
          />
          <span className="text-body break-words">{item.name}</span>
        </label>
      ))}
    </div>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return (
    <Alert variant="warning">
      <AlertCircle />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
