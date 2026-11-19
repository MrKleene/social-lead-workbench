import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ErrorNotice } from "@/components/feedback";
import { cn } from "@/lib/utils";
import { localApi, type LocalConfiguration } from "./local-api";
import { useLocalRecords } from "./use-local-records";

const refreshTimes = Array.from({ length: 48 }, (_, index) => {
  const hour = String(Math.floor(index / 2)).padStart(2, "0");
  const minute = index % 2 === 0 ? "00" : "30";
  return `${hour}:${minute}`;
});

/**
 * 自动回复配置：账号池、模板池、阈值和额度刷新时间。
 * 开关在「待处理发送」页头，这里不重复放。
 */
export function ReplySettings() {
  const configs = useLocalRecords("configurations");
  const steps = useLocalRecords("automationSteps");
  const accounts = useLocalRecords("accountDetails");
  const save = useSaveSteps();
  const [text, setText] = useState("");

  const current = steps.data;
  const comment =
    configs.data?.filter((item) => item.kind === "COMMENT_TEMPLATE") ?? [];
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

      <FormField label="额度刷新时间">
        <Select
          value={current?.refreshTime ?? "00:00"}
          onValueChange={(value) => value && persist({ refreshTime: value })}
        >
          <SelectTrigger aria-label="额度刷新时间">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {refreshTimes.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

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

      {!current?.commentTemplateIds.length && !current?.dmTemplateIds.length ? (
        <Hint>未选择回复模板</Hint>
      ) : null}
      {!selected.length ? <Hint>未选择回复账号</Hint> : null}
      {blocked ? <Hint>已选账号存在未解除的回复限制</Hint> : null}
    </div>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="text-caption text-attention break-words">{children}</p>;
}

/** 保存三步设置：把返回结果直接写回查询缓存再触发失效。 */
export function useSaveSteps() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) => localApi("saveAutomationSteps", input),
    onSuccess: (data) => {
      client.setQueryData(["local", "automationSteps", null], data);
      void client.invalidateQueries({ queryKey: ["local"] });
    },
  });
}

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
