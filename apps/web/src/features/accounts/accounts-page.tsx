import { useState } from "react";
import { useConfirmWorkspaceLeave } from "@/features/work/draft-guard";
import { useAuth } from "@/features/auth/use-auth";
import { ErrorNotice } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { SoftSwap } from "@/features/work/space-panel";
import { AccountEditor } from "./account-editor";
import { useAccountCenter } from "./use-accounts";
import { accountStatus } from "./types";
import "./accounts.css";
export function AccountsPage() {
  const confirmLeave = useConfirmWorkspaceLeave(),
    [saved, setSaved] = useState(0);
  const state = useAccountCenter(),
    admin = useAuth().user?.role === "ADMIN",
    a = state.account;
  return (
    <section className="account-center">
      <header>
        <span className="account-eyebrow">ACCOUNT CENTER / 模拟管理</span>
        <h2>账号中心</h2>
        <p>
          可用 {state.query.data?.summary.available ?? "—"} · 需处理{" "}
          {state.query.data?.summary.attention ?? "—"}
          <small>（仅模拟任务可用）</small>
        </p>
      </header>
      <p className="account-boundary">
        登录、扫码、持久授权与真实发送均未接入。人工记录不等于平台确认成功。
      </p>
      <ErrorNotice error={state.query.error || state.mutation.error} />
      {state.query.isPending && <p role="status">加载账号…</p>}
      {state.mutation.isSuccess && (
        <p role="status">账号已保存，审计记录已写入。</p>
      )}
      <div className="account-columns">
        <div className="account-list">
          {admin && (
            <Button
              onClick={() => {
                if (confirmLeave()) state.create();
              }}
            >
              添加模拟账号
            </Button>
          )}
          {state.query.data?.accounts.length === 0 && (
            <p>暂无账号。管理员可添加模拟账号并分配负责人。</p>
          )}
          {state.query.data?.accounts.map((row) => (
            <button
              className="account-card"
              key={row.id}
              aria-pressed={!state.creating && a?.id === row.id}
              onClick={() => {
                if (confirmLeave()) state.select(row.id);
              }}
            >
              <span>
                {row.platform === "XHS" ? "小红书" : "抖音"} · 未接入登录
              </span>
              <strong>{row.label}</strong>
              <span>负责人：{row.owner?.name || "未分配"}</span>
              <span>
                {row.available
                  ? accountStatus[row.status]
                  : row.status === "UNCONNECTED"
                    ? "额度耗尽 · 暂停新任务"
                    : accountStatus[row.status]}
              </span>
              <small>
                今日占用 {row.occupied} / {row.dailyLimit} · UTC
              </small>
              <progress
                max={Math.max(1, row.dailyLimit)}
                value={row.occupied}
              />
            </button>
          ))}
        </div>
        <SoftSwap identity={state.creating ? "new" : a?.id || "empty"}>
          <div className="account-detail glass-panel">
            {state.creating && admin ? (
              <AccountEditor
                pending={state.mutation.isPending}
                onSave={(body) =>
                  state.mutation.mutate(
                    { path: "/accounts", body },
                    { onSuccess: state.saved },
                  )
                }
              />
            ) : a ? (
              <>
                <h3>{a.label}</h3>
                <dl>
                  <dt>登录状态</dt>
                  <dd>未接入 · 没有扫码能力</dd>
                  <dt>能力</dt>
                  <dd>模拟管理、权限审计；读取和发送禁用</dd>
                  <dt>今日计数</dt>
                  <dd>
                    {a.occupied} / {a.dailyLimit}（包括尝试、未知与模拟成功）
                  </dd>
                  <dt>暂停状态</dt>
                  <dd>
                    {a.available
                      ? "可接收模拟任务"
                      : accountStatus[a.status] === "模拟可分配"
                        ? "额度耗尽"
                        : accountStatus[a.status]}
                    {a.pauseReason && ` · ${a.pauseReason}`}
                  </dd>
                </dl>
                {admin && (
                  <AccountEditor
                    key={`${a.id}:${saved}`}
                    account={a}
                    pending={state.mutation.isPending}
                    onSave={(body) =>
                      state.mutation.mutate(
                        { path: `/accounts/${a.id}`, method: "PATCH", body },
                        { onSuccess: () => setSaved((v) => v + 1) },
                      )
                    }
                    onArchive={() => {
                      if (confirmLeave())
                        state.mutation.mutate({
                          path: `/accounts/${a.id}`,
                          method: "DELETE",
                          body: { version: a.version },
                        });
                    }}
                  />
                )}
              </>
            ) : (
              <p>选择账号查看详情与内部额度。</p>
            )}
          </div>
        </SoftSwap>
      </div>
    </section>
  );
}
