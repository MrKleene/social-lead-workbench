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
import { Textarea } from "@/components/ui/textarea";
import { CheckboxField } from "@/components/patterns/checkbox-field";
import { FormField } from "@/components/patterns/form-field";
import { RecordItem, RecordList } from "@/components/patterns/record-list";
import { SectionCard } from "@/components/patterns/section-card";
import { useDraftGuard } from "@/features/work/draft-guard";
import { ErrorNotice } from "@/components/feedback";
import { useLocalAutomation } from "./use-local-automation";
import type { AutomationRule, LocalAccount, WorkflowOverview } from "./local-api";
import { LocalAutomationReport } from "./local-diagnostics";

function RuleEditor({
  rule,
  accounts,
  policies,
  onSave,
  onCancel,
  pending,
}: {
  rule?: AutomationRule;
  accounts: LocalAccount[];
  policies: WorkflowOverview["policies"];
  onSave: (input: unknown) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const [name, setName] = useState(rule?.name ?? "");
  const [policyId, setPolicy] = useState(rule?.policyId ?? "");
  const [pool, setPool] = useState(rule?.accounts ?? []);
  const [channel, setChannel] = useState<"DM" | "COMMENT">(
    rule?.plans[0]?.channel ?? "DM",
  );
  const [content, setContent] = useState(rule?.plans[0]?.content ?? "");
  const [threshold, setThreshold] = useState(rule?.threshold ?? 80);

  useDraftGuard(true, "modal");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const policy = policies.find((item) => item.id === policyId);
    if (!pool.length || !policy) return;
    onSave({
      ...(rule ? { id: rule.id } : {}),
      name,
      input: {
        version: rule?.version ?? 0,
        policyId,
        policyRevision: policy.revision,
        threshold,
        channel,
        content,
        accounts: pool,
      },
    });
  };

  return (
    <form className="flex flex-col gap-3 border-t pt-4" onSubmit={submit}>
      <h3 className="text-section font-semibold">
        {rule ? "编辑联系规则" : "新增联系规则"}
      </h3>

      <FormField label="规则名称">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={100}
          required
        />
      </FormField>

      <FormField label="匹配目标">
        <Select
          value={policyId}
          onValueChange={(value) => setPolicy(value)}
        >
          <SelectTrigger aria-label="规则匹配目标">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SELECT_EMPTY}>选择已授权目标</SelectItem>
            {policies
            .filter((policy) => policy.enabled)
            .map((policy) => (
            <SelectItem key={policy.id} value={policy.id}>
            {policy.name}
            </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-body font-medium">账号池与共享日额度</legend>
        {accounts.map((account) => {
          const chosen = pool.find((item) => item.id === account.id);
          return (
            <div key={account.id} className="flex flex-wrap items-end gap-3">
              <CheckboxField
                ariaLabel={"加入账号池 " + account.name}
                checked={!!chosen}
                onCheckedChange={(checked) =>
                  setPool((previous) =>
                    checked
                      ? [
                          ...previous,
                          {
                            id: account.id,
                            version: account.revision,
                            dailyLimit: account.daily_limit,
                          },
                        ]
                      : previous.filter((item) => item.id !== account.id),
                  )
                }
                className="flex-1"
              >
                {account.name}
                {chosen ? " · 顺序 " + (pool.indexOf(chosen) + 1) : ""}
              </CheckboxField>
              <FormField label="每日条数" className="w-32">
                <Input
                  aria-label={account.name + " 规则每日条数"}
                  type="number"
                  min={0}
                  max={1000}
                  disabled={!chosen}
                  value={chosen?.dailyLimit ?? account.daily_limit}
                  onChange={(event) =>
                    setPool((previous) =>
                      previous.map((item) =>
                        item.id === account.id
                          ? { ...item, dailyLimit: Number(event.target.value) }
                          : item,
                      ),
                    )
                  }
                />
              </FormField>
            </div>
          );
        })}
      </fieldset>

      <FormField label="渠道">
        <Select
          value={channel}
          onValueChange={(value) =>
          setChannel(value as "DM" | "COMMENT")
          }
        >
          <SelectTrigger aria-label="渠道">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="DM">私信</SelectItem>
            <SelectItem value="COMMENT">回复评论</SelectItem>
          </SelectContent>
        </Select>
      </FormField>

      <FormField label="最低匹配分">
        <Input
          type="number"
          min={0}
          max={100}
          value={threshold}
          onChange={(event) => setThreshold(Number(event.target.value))}
          required
        />
      </FormField>

      <FormField label="发送内容">
        <Textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          maxLength={1000}
          required
          rows={4}
        />
      </FormField>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" pending={pending}>
          保存规则草稿
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          取消编辑
        </Button>
      </div>
    </form>
  );
}

export function LocalAutomation({
  showReport = true,
}: {
  /** 嵌进设置抽屉时关掉诊断报表，只留规则本身。 */
  showReport?: boolean;
} = {}) {
  const automation = useLocalAutomation();

  return (
    <>
      <SectionCard
        title="自动联系规则"
        actions={
          <Button
            onClick={() => {
              automation.setEditing("new");
              automation.setPreview(null);
            }}
          >
            新增联系规则
          </Button>
        }
      >
        {automation.error ? (
          <ErrorNotice error={automation.error} />
        ) : null}

        {automation.editing ? (
          <RuleEditor
            key={
              automation.editing === "new" ? "new" : automation.editing.id
            }
            rule={automation.editing === "new" ? undefined : automation.editing}
            accounts={automation.accounts.data?.accounts ?? []}
            policies={automation.workflow.data?.policies ?? []}
            onSave={automation.save.mutate}
            onCancel={() => automation.setEditing(null)}
            pending={automation.save.isPending}
          />
        ) : null}

        <RecordList>
          {automation.rules.data?.map((rule) => (
            <RecordItem
              key={rule.id}
              title={`${rule.name} · ${rule.enabled ? "已授权" : "停用"}`}
              meta={`${rule.plans.map((plan) => (plan.channel === "DM" ? "私信" : "评论")).join("、")} · 最低 ${rule.threshold} 分`}
              action={
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      automation.setEditing(rule);
                      automation.setPreview(null);
                    }}
                  >
                    编辑规则
                  </Button>
                  {rule.enabled ? (
                    <Button
                      variant="outline"
                      pending={automation.revoke.isPending}
                      onClick={() => automation.revoke.mutate(rule.id)}
                    >
                      停用并取消待发
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      pending={automation.inspect.isPending}
                      onClick={() => automation.inspect.mutate(rule)}
                    >
                      预览规则授权
                    </Button>
                  )}
                </>
              }
            />
          ))}
        </RecordList>

        {automation.preview ? (
          <div className="flex flex-col gap-3 border-t pt-4">
            <h3 className="text-section font-semibold">核对自动联系授权</h3>
            <p className="text-body leading-relaxed break-words">
              {automation.preview.name} · 最低 {automation.preview.threshold} 分
            </p>
            {automation.preview.plans.map((plan) => (
              <p
                key={plan.channel}
                className="text-body leading-relaxed break-words"
              >
                {plan.channel === "DM" ? "私信" : "评论"}：{plan.content}
              </p>
            ))}
            {automation.preview.accounts.map((account) => (
              <p
                key={account.id}
                className="text-body leading-relaxed break-words"
              >
                {automation.accounts.data?.accounts.find(
                  (item) => item.id === account.id,
                )?.name ?? "账号"}{" "}
                · 每日规则上限 {account.dailyLimit}
              </p>
            ))}
            <CheckboxField
              checked={automation.consent}
              onCheckedChange={automation.setConsent}
            >
              授权此规则用于后续采集轮次。
            </CheckboxField>
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={
                  !automation.consent ||
                  !automation.workflow.data?.capabilities.send
                }
                pending={automation.authorize.isPending}
                onClick={() => automation.authorize.mutate()}
              >
                确认并启用规则
              </Button>
            </div>
          </div>
        ) : null}
      </SectionCard>

      {showReport ? <LocalAutomationReport /> : null}
    </>
  );
}
