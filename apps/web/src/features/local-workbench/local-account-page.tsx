import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DetailItem, DetailList } from "@/components/patterns/detail-sheet";
import { EmptyState } from "@/components/patterns/empty-state";
import { FormField } from "@/components/patterns/form-field";
import { PageHeader } from "@/components/patterns/page-header";
import { SectionCard } from "@/components/patterns/section-card";
import { useDraftGuard } from "@/features/work/draft-guard";
import { ErrorNotice } from "@/components/feedback";
import { LocalAccountDiagnostics } from "./local-diagnostics";
import { LocalLoginPanel } from "./local-platform";
import { useLocalAction, useLocalRecords } from "./use-local-records";
import type { AccountDetails } from "./local-api";

function AccountEditor({
  account,
  onClose,
}: {
  account: AccountDetails;
  onClose: () => void;
}) {
  const [name, setName] = useState(account.name);
  const [limit, setLimit] = useState(account.daily_limit);
  const [today, setToday] = useState(
    account.todayOverride === null ? "" : String(account.todayOverride),
  );
  const edit = useLocalAction("updateAccount");

  useDraftGuard(
    name !== account.name ||
      limit !== account.daily_limit ||
      today !== (account.todayOverride === null ? "" : String(account.todayOverride)),
    "modal",
  );

  return (
    <form
      className="flex flex-col gap-3 border-t pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        edit.mutate(
          {
            id: account.id,
            revision: account.revision,
            name,
            dailyLimit: limit,
            todayLimit: today === "" ? null : Number(today),
          },
          { onSuccess: onClose },
        );
      }}
    >
      <h3 className="text-section font-semibold">编辑账号设置</h3>
      <FormField label="本地名称">
        <Input
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </FormField>
      <FormField label="默认每日发送上限">
        <Input
          type="number"
          min={0}
          max={1000}
          value={limit}
          onChange={(event) => setLimit(Number(event.target.value))}
          required
        />
      </FormField>
      <FormField label="仅今日上限">
        <Input
          type="number"
          min={0}
          max={1000}
          value={today}
          placeholder="留空使用默认值"
          onChange={(event) => setToday(event.target.value)}
        />
      </FormField>
      {edit.error ? (
        <ErrorNotice error={edit.error} />
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" pending={edit.isPending}>
          保存账号设置
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          取消编辑
        </Button>
      </div>
    </form>
  );
}

export function LocalAccountPage() {
  const data = useLocalRecords("accountDetails");
  const status = useLocalRecords("status");
  const disconnect = useLocalAction("disconnectAccount");
  const [selected, setSelected] = useState("");
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const account =
    data.data?.find((item) => item.id === selected) ?? data.data?.[0];
  const failure = data.error ?? disconnect.error;

  return (
    <>
      <PageHeader title="账号中心" />

      {failure ? (
        <ErrorNotice error={failure} />
      ) : null}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(200px,240px)_minmax(0,1fr)]">
        <aside aria-label="账号列表" className="flex min-w-0 flex-col gap-1.5">
          {data.data?.map((item) => (
            <Button
              variant="ghost"
              key={item.id}
              disabled={editing}
              aria-pressed={account?.id === item.id}
              className="h-auto min-h-16 flex-col items-start justify-start gap-1.5 border border-transparent px-3 py-3 text-start whitespace-normal aria-pressed:border-border aria-pressed:bg-muted"
              onClick={() => {
                setSelected(item.id);
                setConfirm(false);
              }}
            >
              <span className="text-body font-semibold break-words">
                {item.name}
              </span>
              <small className="line-clamp-2 text-caption leading-relaxed text-muted-foreground break-words">
                {item.hasSession ? "已有本机会话" : "待重新登录"} · 今日{" "}
                {item.occupied}/{item.todayLimit}
              </small>
            </Button>
          ))}
        </aside>

        <SectionCard title={account?.name} className="min-w-0">
          {account ? (
            <>
              <DetailList>
                <DetailItem label="平台账号 ID">
                  {account.platform_user_id ?? "尚未取得可靠身份"}
                </DetailItem>
                <DetailItem label="登录与会话">
                  {account.hasSession
                    ? "本机已保存；实际执行前再次核验"
                    : "本机未保存有效会话"}
                </DetailItem>
                <DetailItem label="今日额度（北京时间）">
                  {account.occupied} / {account.todayLimit} · {account.day}
                </DetailItem>
                <DetailItem label="默认每日上限">
                  {account.daily_limit}
                </DetailItem>
                <DetailItem label="风险记录">
                  {account.holds.length ? (
                    account.holds.map((hold) => (
                      <p key={hold.reason + String(hold.channel)}>
                        {hold.channel ?? "全部渠道"} · {hold.reason}
                      </p>
                    ))
                  ) : account.state === "RESTRICTED" ? (
                    "账号受限，登录不能解除限制"
                  ) : (
                    "暂无独立风险记录；不代表平台允许发送。"
                  )}
                </DetailItem>
              </DetailList>

              <LocalAccountDiagnostics
                key={"diagnostics:" + account.id + ":" + account.revision}
                accountId={account.id}
              />

              <div className="flex flex-wrap gap-3 border-t pt-4">
                <Button variant="outline" onClick={() => setEditing(true)}>
                  编辑账号设置
                </Button>
                <Button
                  variant="outline"
                  disabled={!account.hasSession}
                  onClick={() => setConfirm(true)}
                >
                  断开本机会话
                </Button>
              </div>

              {editing ? (
                <AccountEditor
                  key={account.id + account.revision}
                  account={account}
                  onClose={() => setEditing(false)}
                />
              ) : null}

              {confirm ? (
                <div className="flex flex-wrap gap-3 border-t pt-4">
                  <Button
                    pending={disconnect.isPending}
                    onClick={() =>
                      disconnect.mutate(
                        { id: account.id, revision: account.revision },
                        { onSuccess: () => setConfirm(false) },
                      )
                    }
                  >
                    确认断开
                  </Button>
                  <Button variant="outline" onClick={() => setConfirm(false)}>
                    保留会话
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            <EmptyState title="尚未添加账号。" />
          )}
        </SectionCard>
      </div>

      <SectionCard>
        <LocalLoginPanel
          credentialsAvailable={!!status.data?.credentialsAvailable}
        />
      </SectionCard>
    </>
  );
}
