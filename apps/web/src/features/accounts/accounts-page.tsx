import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, send } from '@/lib/api';
import { AccountLoginPanel, type LoginCapabilities } from './account-login-panel';
import { SavedSessionPanel } from './saved-session-panel';
import { loginStatusLabel } from './types';
import type { Account } from './types';
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
  const client=useQueryClient(),capabilities=useQuery({queryKey:['account-login-capabilities'],queryFn:()=>api<LoginCapabilities>('/accounts/login-capabilities'),enabled:admin,retry:false});
  const [adding,setAdding]=useState(false),[addError,setAddError]=useState('');
  const addLogin=async()=>{if(adding)return;setAdding(true);setAddError('');try{const account=await send<Account>('/accounts','POST',{platform:'XHS',label:'小红书 · 待授权账号',ownerId:null,dailyLimit:10,status:'PAUSED',pauseReason:'等待本人授权'});await client.invalidateQueries({queryKey:['accounts']});state.select(account.id);}catch(e){setAddError(e instanceof Error?e.message:'创建失败');}finally{setAdding(false);}};
  return (
    <section className="account-center">
      <header>
        <span className="account-eyebrow">ACCOUNT CENTER / 账号管理</span>
        <h2>账号中心</h2>
        <p>
          可用 {state.query.data?.summary.available ?? "—"} · 需处理{" "}
          {state.query.data?.summary.attention ?? "—"}
          <small>（仅模拟任务可用）</small>
        </p>
      </header>
      <p className="account-boundary">
        {capabilities.data?.enabled ? '扫码仅在本人确认后启用；真实采集和发送仍禁用。人工记录不等于平台确认成功。' : '此环境未启用扫码登录。人工记录不等于平台确认成功，真实发送禁用。'}
      </p>
      {addError&&<p role="alert">{addError}</p>}
      <ErrorNotice error={state.query.error || state.mutation.error} />
      {state.query.isPending && <p role="status">加载账号…</p>}
      {state.mutation.isSuccess && (
        <p role="status">账号已保存，审计记录已写入。</p>
      )}
      <div className="account-columns">
        <div className="account-list">
          {admin && capabilities.data?.enabled && <Button disabled={adding} onClick={()=>{if(confirmLeave())void addLogin();}}>{adding?'创建中…':'添加账号并扫码'}</Button>}
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
                {row.platform === "XHS" ? "小红书" : "抖音"} · {loginStatusLabel[row.loginStatus || "NOT_CONNECTED"]}
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
                  <dd>{a.loginStatus === "VERIFIED" ? `登录已验证 · ${a.loginNickname || a.loginPlatformUserId}` : a.loginStatus === "OFFLINE_VERIFIED" ? "离线模拟已验证 · 非真实账号" : loginStatusLabel[a.loginStatus || "NOT_CONNECTED"]}</dd>
                  <dt>能力</dt>
                  <dd>元数据管理、权限审计；真实采集和发送禁用</dd>
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
                {admin && capabilities.data?.persistent && a.loginVerifiedAt && <SavedSessionPanel key={a.id} account={a}/>}
                {admin && capabilities.data?.enabled && a.platform==='XHS' && !a.loginVerifiedAt && <AccountLoginPanel key={a.id} accountId={a.id} capabilities={capabilities.data}/>}
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
