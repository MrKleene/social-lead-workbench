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
    <form className="account-form" onSubmit={submit}>
      <h3>{account ? "账号元数据" : "添加模拟账号"}</h3>
      <label>
        平台
        <select
          aria-label="平台"
          disabled={!!account}
          value={value.platform}
          onChange={(e) =>
            setValue({ ...value, platform: e.target.value as "XHS" | "DOUYIN" })
          }
        >
          <option value="XHS">小红书</option>
          <option value="DOUYIN">抖音</option>
        </select>
      </label>
      <label>
        别名
        <input
          required
          maxLength={80}
          value={value.label}
          onChange={(e) => setValue({ ...value, label: e.target.value })}
        />
      </label>
      <label>
        负责人
        <select
          aria-label="负责人"
          disabled={users.isPending || users.isError}
          value={value.ownerId}
          onChange={(e) => setValue({ ...value, ownerId: e.target.value })}
        >
          <option value="">未分配</option>
          {users.data
            ?.filter((u) => u.role === "SALES")
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        内部每日额度（UTC）
        <input
          type="number"
          min={0}
          max={1000}
          required
          value={value.dailyLimit}
          onChange={(e) =>
            setValue({ ...value, dailyLimit: Number(e.target.value) })
          }
        />
      </label>
      <label>
        模拟分配状态
        <select
          aria-label="模拟分配状态"
          value={value.status}
          onChange={(e) =>
            setValue({ ...value, status: e.target.value as Account["status"] })
          }
        >
          <option value="UNCONNECTED">模拟可分配 · 平台未登录</option>
          <option value="PAUSED">暂停</option>
          <option value="RESTRICTED">受限 / 验证 / 封禁</option>
        </select>
      </label>
      <label>
        暂停或处理说明
        <input
          maxLength={300}
          value={value.pauseReason}
          onChange={(e) => setValue({ ...value, pauseReason: e.target.value })}
        />
      </label>
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
    </form>
  );
}
