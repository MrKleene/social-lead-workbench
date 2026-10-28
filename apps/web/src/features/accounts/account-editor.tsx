import { FieldGroup } from '@/components/ui/field';
import { FormField } from '@/components/form-field';
import { SelectField, SelectOption } from '@/components/select-field';
import { Input } from '@/components/ui/input';
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { useDraftGuard } from "@/features/work/draft-guard";
import type { Account } from "./types";
export function AccountEditor({
  account,
  pending,
  onSave,
  onArchive,
}: {
  account?: Account;
  pending: boolean;
  onSave: (data: unknown) => void;
  onArchive?: () => void;
}) {
  const initial = {
    platform: account?.platform || "XHS",
    label: account?.label || "",
    ownerId: account?.ownerId || "",
    dailyLimit: account?.dailyLimit ?? 10,
    status: account?.status || "UNCONNECTED",
    pauseReason: account?.pauseReason || "",
  };
  const [baseline] = useState(initial),
    [version] = useState(account?.version),
    [value, setValue] = useState(initial);
  const dirty = JSON.stringify(value) !== JSON.stringify(baseline);
  useDraftGuard(dirty, "retained");
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api<User[]>("/users"),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const { platform, ...rest } = value;
    onSave({
      ...rest,
      ownerId: value.ownerId || null,
      pauseReason: value.pauseReason || null,
      ...(account ? { version } : { platform }),
    });
  };
  return (
    <form className="account-form" onSubmit={submit}><FieldGroup className="form-fields">
      <h3>{account ? "账号元数据" : "添加模拟账号"}</h3>
      <FormField>
        平台
        <SelectField
          aria-label="平台"
          disabled={!!account}
          value={value.platform}
          onValueChange={(e) =>
            setValue({ ...value, platform: e as "XHS" | "DOUYIN" })
          }
        >
          <SelectOption value="XHS">小红书</SelectOption>
          <SelectOption value="DOUYIN">抖音</SelectOption>
        </SelectField>
      </FormField>
      <FormField>
        别名
        <Input
          required
          maxLength={80}
          value={value.label}
          onChange={(e) => setValue({ ...value, label: e.target.value })}
        />
      </FormField>
      <FormField>
        负责人
        <SelectField
          aria-label="负责人"
          disabled={users.isPending || users.isError}
          value={value.ownerId}
          onValueChange={(e) => setValue({ ...value, ownerId: e })}
        >
          <SelectOption value="">未分配</SelectOption>
          {users.data
            ?.filter((u) => u.role === "SALES")
            .map((u) => (
              <SelectOption key={u.id} value={u.id}>
                {u.name}
              </SelectOption>
            ))}
        </SelectField>
      </FormField>
      <FormField>
        内部每日额度（UTC）
        <Input
          type="number"
          min={0}
          max={1000}
          required
          value={value.dailyLimit}
          onChange={(e) =>
            setValue({ ...value, dailyLimit: Number(e.target.value) })
          }
        />
      </FormField>
      <FormField>
        模拟分配状态
        <SelectField
          aria-label="模拟分配状态"
          value={value.status}
          onValueChange={(e) =>
            setValue({ ...value, status: e as Account["status"] })
          }
        >
          <SelectOption value="UNCONNECTED">模拟可分配 · 平台未登录</SelectOption>
          <SelectOption value="PAUSED">暂停</SelectOption>
          <SelectOption value="RESTRICTED">受限 / 验证 / 封禁</SelectOption>
        </SelectField>
      </FormField>
      <FormField>
        暂停或处理说明
        <Input
          maxLength={300}
          value={value.pauseReason}
          onChange={(e) => setValue({ ...value, pauseReason: e.target.value })}
        />
      </FormField>
      <p className="helper-text">
        额度仅供内部管理，不保证平台安全额度。耗尽后暂停接收新模拟任务。
      </p>
      <div className="action-row">
        <Button disabled={pending || users.isError}>保存元数据</Button>
        {onArchive && (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onArchive}
          >
            归档账号
          </Button>
        )}
      </div>
    </FieldGroup></form>
  );
}
