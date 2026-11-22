import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch, SwitchThumb } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
 * 自动加入待发送队列配置：按匹配方案设置分数阈值、渠道与是否启用。
 * 这里只决定评论是否进入待发送；真正发出去仍由「自动发送配置」和总开关控制。
 */
export function QueueSettings({
  adding,
  onAddingChange,
}: {
  adding: boolean;
  onAddingChange: (open: boolean) => void;
}) {
  const configs = useLocalRecords("configurations");
  const rules = useLocalRecords("queueRules");
  const error = configs.error ?? rules.error;
  const policies =
    configs.data?.filter((item) => item.kind === "MATCHING") ?? [];
  const list = rules.data ?? [];
  const ordered = [...list].sort(
    (left, right) => Number(right.systemDefault) - Number(left.systemDefault),
  );
  const available = policies.filter(
    (policy) => !list.some((rule) => rule.policyId === policy.id),
  );

  return (
    <div className="flex flex-col gap-4">
      {error ? <ErrorNotice error={error} /> : null}
      {!configs.data || !rules.data ? (
        <p className="text-body text-muted-foreground">正在读取…</p>
      ) : ordered.length ? (
        ordered.map((rule) => (
          <QueueRuleEditor
            key={rule.id}
            policyId={rule.policyId}
            policyName={rule.policyName ?? "未命名匹配方案"}
            rule={rule}
          />
        ))
      ) : (
        <p className="text-body text-muted-foreground">还没有入队配置</p>
      )}
      {adding ? (
        <AddQueueRuleDialog
          policies={available}
          onClose={() => onAddingChange(false)}
        />
      ) : null}
    </div>
  );
}

function QueueRuleEditor({
  policyId,
  policyName,
  rule,
}: {
  policyId: string;
  policyName: string;
  rule: QueueRule;
}) {
  const save = useLocalAction("saveQueueRule");
  const remove = useLocalAction("deleteQueueRule");
  const [threshold, setThreshold] = useState(String(rule.threshold));
  const [channels, setChannels] = useState<("COMMENT" | "DM")[]>(rule.channels);
  const [enabled, setEnabled] = useState(rule.enabled);
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
        id: rule.id,
        policyId,
        threshold: score,
        channels,
        enabled,
        version: rule.version,
      },
      { onSuccess: () => setDone(true) },
    );
  };
  const removeRule = () => {
    remove.mutate({ id: rule.id, version: rule.version });
  };

  return (
    <section className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-section font-semibold break-words">{policyName}</h2>
        {rule.systemDefault ? <Badge variant="outline">系统默认</Badge> : null}
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <FormField label="入队分数">
          <Input
            type="number"
            min={0}
            max={100}
            aria-label={policyName + " 入队分数"}
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
            aria-label={policyName + " 自动入队"}
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
          保存
        </Button>
        {!rule.systemDefault ? (
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

function AddQueueRuleDialog({
  policies,
  onClose,
}: {
  policies: LocalConfiguration[];
  onClose: () => void;
}) {
  const save = useLocalAction("saveQueueRule");
  const [policyId, setPolicyId] = useState(policies[0]?.id ?? "");
  const [threshold, setThreshold] = useState(String(defaults.threshold));
  const [channels, setChannels] = useState<("COMMENT" | "DM")[]>(
    defaults.channels,
  );
  const [enabled, setEnabled] = useState(true);
  const score = Number(threshold);
  const valid =
    !!policyId &&
    Number.isInteger(score) &&
    score >= 0 &&
    score <= 100 &&
    channels.length > 0;

  useEffect(() => {
    if (!policyId && policies[0]) setPolicyId(policies[0].id);
  }, [policies, policyId]);

  const toggleChannel = (channel: "COMMENT" | "DM", checked: boolean) => {
    setChannels((current) =>
      checked
        ? [...new Set([...current, channel])]
        : current.filter((value) => value !== channel),
    );
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
    >
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>新增配置</DialogTitle>
        </DialogHeader>
        {policies.length ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!valid) return;
              save.mutate(
                { policyId, threshold: score, channels, enabled, version: 0 },
                { onSuccess: onClose },
              );
            }}
          >
            <FormField label="评论匹配方案">
              <Select
                value={policyId}
                onValueChange={setPolicyId}
                disabled={save.isPending}
              >
                <SelectTrigger aria-label="评论匹配方案">
                  <SelectValue placeholder="选择匹配方案" />
                </SelectTrigger>
                <SelectContent>
                  {policies.map((policy) => (
                    <SelectItem key={policy.id} value={policy.id}>
                      {policy.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <div className="flex flex-wrap items-end gap-4">
              <FormField label="入队分数">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  aria-label="入队分数"
                  className="w-28"
                  value={threshold}
                  disabled={save.isPending}
                  onChange={(event) => setThreshold(event.target.value)}
                />
              </FormField>
              <label className="flex items-center gap-2 pb-2">
                <Checkbox
                  checked={channels.includes("COMMENT")}
                  disabled={save.isPending}
                  onCheckedChange={(checked) =>
                    toggleChannel("COMMENT", checked === true)
                  }
                />
                <span className="text-body">评论</span>
              </label>
              <label className="flex items-center gap-2 pb-2">
                <Checkbox
                  checked={channels.includes("DM")}
                  disabled={save.isPending}
                  onCheckedChange={(checked) =>
                    toggleChannel("DM", checked === true)
                  }
                />
                <span className="text-body">私信</span>
              </label>
              <label className="flex items-center gap-2 pb-2">
                <span className="text-body">自动入队</span>
                <Switch
                  checked={enabled}
                  disabled={save.isPending}
                  aria-label="自动入队"
                  onCheckedChange={setEnabled}
                >
                  <SwitchThumb />
                </Switch>
              </label>
            </div>
            {!channels.length ? <Hint>至少选择一个入队渠道</Hint> : null}
            {save.error ? <ErrorNotice error={save.error} /> : null}
            <DialogFooter>
              <Button type="submit" pending={save.isPending} disabled={!valid}>
                保存
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={save.isPending}
                onClick={onClose}
              >
                取消
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <>
            <p className="text-body text-muted-foreground">
              没有可添加的评论匹配方案。
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                关闭
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Hint({ children }: { children: string }) {
  return <p className="text-caption text-attention break-words">{children}</p>;
}
