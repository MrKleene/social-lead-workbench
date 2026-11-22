import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch, SwitchThumb } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FormField } from "@/components/patterns/form-field";
import { ErrorNotice } from "@/components/feedback";
import type { LocalConfiguration, QueueRule } from "./local-api";
import { useLocalAction, useLocalRecords } from "./use-local-records";

const defaults = { threshold: 80, channels: ["COMMENT", "DM"] as ("COMMENT" | "DM")[] };

/**
 * 自动入队配置：按匹配方案设置分数阈值、渠道与是否启用。
 * 这里只决定评论是否进入待发送；真正发出去仍由「自动发送配置」和总开关控制。
 */
export function QueueSettings() {
  const configs = useLocalRecords("configurations");
  const rules = useLocalRecords("queueRules");
  const error = configs.error ?? rules.error;
  const policies =
    configs.data?.filter((item) => item.kind === "MATCHING") ?? [];
  const list = rules.data ?? [];
  const ordered = [...policies].sort((left, right) => {
    const a = list.find((rule) => rule.policyId === left.id);
    const b = list.find((rule) => rule.policyId === right.id);
    return Number(!!b?.systemDefault) - Number(!!a?.systemDefault);
  });

  return (
    <div className="flex flex-col gap-4">
      {error ? <ErrorNotice error={error} /> : null}
      {!configs.data || !rules.data ? (
        <p className="text-body text-muted-foreground">正在读取…</p>
      ) : ordered.length ? (
        ordered.map((policy) => (
          <QueueRuleEditor
            key={policy.id}
            policy={policy}
            rule={list.find((item) => item.policyId === policy.id) ?? null}
          />
        ))
      ) : (
        <p className="text-body text-muted-foreground">还没有评论匹配方案</p>
      )}
    </div>
  );
}

function QueueRuleEditor({
  policy,
  rule,
}: {
  policy: LocalConfiguration;
  rule: QueueRule | null;
}) {
  const save = useLocalAction("saveQueueRule");
  const remove = useLocalAction("deleteQueueRule");
  const [threshold, setThreshold] = useState(String(rule?.threshold ?? defaults.threshold));
  const [channels, setChannels] = useState<("COMMENT" | "DM")[]>(
    rule?.channels ?? defaults.channels,
  );
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [done, setDone] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const failure = save.error ?? remove.error;
  const toggleChannel = (channel: "COMMENT" | "DM", checked: boolean) => {
    setDone(false);
    setChannels((current) =>
      checked ? [...new Set([...current, channel])] : current.filter((value) => value !== channel),
    );
  };
  const persist = () => {
    const score = Number(threshold);
    if (!Number.isInteger(score) || score < 0 || score > 100 || !channels.length) return;
    save.mutate(
      {
        id: rule?.id,
        policyId: policy.id,
        threshold: score,
        channels,
        enabled,
        version: rule?.version ?? 0,
      },
      { onSuccess: () => setDone(true) },
    );
  };
  const removeRule = () => {
    if (!rule) return;
    remove.mutate({ id: rule.id, version: rule.version });
  };

  return (
    <section className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-section font-semibold break-words">{policy.name}</h2>
        {rule?.systemDefault ? <Badge variant="outline">系统默认</Badge> : null}
        {!rule ? <Badge variant="secondary">未配置</Badge> : null}
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <FormField label="入队分数">
          <Input
            type="number"
            min={0}
            max={100}
            aria-label={policy.name + " 入队分数"}
            className="w-28"
            value={threshold}
            disabled={save.isPending}
            onChange={(event) => {
              setThreshold(event.target.value);
              setDone(false);
            }}
          />
        </FormField>
        <label className="flex items-center gap-2 pb-2">
          <Checkbox
            checked={channels.includes("COMMENT")}
            disabled={save.isPending}
            onCheckedChange={(checked) => toggleChannel("COMMENT", checked === true)}
          />
          <span className="text-body">评论</span>
        </label>
        <label className="flex items-center gap-2 pb-2">
          <Checkbox
            checked={channels.includes("DM")}
            disabled={save.isPending}
            onCheckedChange={(checked) => toggleChannel("DM", checked === true)}
          />
          <span className="text-body">私信</span>
        </label>
        <label className="flex items-center gap-2 pb-2">
          <span className="text-body">自动入队</span>
          <Switch
            checked={enabled}
            disabled={save.isPending}
            aria-label={policy.name + " 自动入队"}
            onCheckedChange={(checked) => {
              setEnabled(checked);
              setDone(false);
            }}
          >
            <SwitchThumb />
          </Switch>
        </label>
      </div>

      {!channels.length ? <Hint>至少选择一个入队渠道</Hint> : null}
      {failure ? <ErrorNotice error={failure} /> : null}
      {done ? <p role="status" className="text-caption text-muted-foreground">已保存</p> : null}

      <div className="flex flex-wrap gap-3">
        <Button
          pending={save.isPending}
          disabled={!channels.length || remove.isPending}
          onClick={persist}
        >
          {rule ? "保存" : "启用自动入队"}
        </Button>
        {rule && !rule.systemDefault ? (
          <Button
            variant="destructive"
            disabled={save.isPending || remove.isPending}
            onClick={() => setConfirmRemove(true)}
          >
            删除规则
          </Button>
        ) : null}
      </div>

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这条入队规则？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后该匹配方案不再自动入队。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirmRemove(false);
                removeRule();
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function Hint({ children }: { children: string }) {
  return <p className="text-caption text-attention break-words">{children}</p>;
}
