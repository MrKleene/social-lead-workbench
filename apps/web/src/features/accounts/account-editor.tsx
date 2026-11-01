import { FieldGroup } from '@/components/ui/field';
import { FormField } from '@/components/form-field';
import { SelectField, SelectOption } from '@/components/select-field';
import { Input } from '@/components/ui/input';
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ErrorNotice } from "@/components/feedback";
import { Spinner } from "@/components/ui/spinner";
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
      ...(account ? { version } : { platform }),
    });
  };
  return (
    <form className="account-form" onSubmit={submit}><FieldGroup className="form-fields">
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
      {users.isError&&<div className="account-owner-error"><ErrorNotice error={users.error}/><Button type="button" variant="outline" size="sm" onClick={()=>void users.refetch()}>重新读取负责人</Button></div>}
      <FormField>
        每日共用额度{account?.isDemo?'（UTC 演示）':'（北京时间）'}
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
      <p className="helper-text">
        评论与私信共用日额度。
      </p>
      <div className="action-row">
        <Button disabled={pending || users.isError}>{pending&&<Spinner/>}{pending?'保存中…':'保存账号设置'}</Button>
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
