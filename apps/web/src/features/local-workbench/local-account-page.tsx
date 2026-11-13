import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { DetailItem, DetailList } from "@/components/patterns/detail-sheet";
import { FormField } from "@/components/patterns/form-field";
import { PageHeader } from "@/components/patterns/page-header";
import { SectionCard } from "@/components/patterns/section-card";
import { useDraftGuard } from "@/features/work/draft-guard";
import { ErrorNotice } from "@/components/feedback";
import { LocalAccountDiagnostics } from "./local-diagnostics";
import { LocalLoginPanel } from "./local-platform";
import { useLocalAction, useLocalRecords } from "./use-local-records";
import type { AccountDetails } from "./local-api";
import { cn } from "@/lib/utils";

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
      className="flex max-w-xl flex-col gap-4 border-t pt-6"
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
      {/* 两个上限是同一类数字字段，并排比竖排更省纵向空间。 */}
      <div className="grid gap-4 sm:grid-cols-2">
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
      </div>
      {edit.error ? <ErrorNotice error={edit.error} /> : null}
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

/**
 * 账号中心。布局照配置管理：左侧账号列表当导航，右侧一列内容（详情 + 添加账号）。
 * 表单都限宽，避免输入框在宽屏上拉成一整行。
 */
export function LocalAccountPage() {
  const data = useLocalRecords("accountDetails");
  const status = useLocalRecords("status");
  const disconnect = useLocalAction("disconnectAccount");
  const [selected, setSelected] = useState("");
  const [editing, setEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const accounts = data.data ?? [];
  const account =
    accounts.find((item) => item.id === selected) ?? accounts[0];
  const failure = data.error ?? disconnect.error;

  return (
    <>
      <PageHeader title="账号中心" />

      {failure ? <ErrorNotice error={failure} /> : null}

      <div
        className={
          accounts.length
            ? "grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8"
            : "flex flex-col gap-6"
        }
      >
        {accounts.length ? (
          <nav
            aria-label="账号列表"
            // 账号可能到十几个：让列表自己滚（吸顶 + 限高），
            // 否则列表会把整页拉长，滚动时右侧详情跟着滚走。
            className="flex min-w-0 flex-col gap-1 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto"
          >
            {accounts.map((item) => (
              <Button
                variant="ghost"
                key={item.id}
                disabled={editing}
                aria-pressed={account?.id === item.id}
                aria-current={account?.id === item.id ? "page" : undefined}
                className="h-auto flex-col items-start justify-start gap-1 whitespace-normal px-3 py-2.5 text-start aria-pressed:bg-muted"
                onClick={() => {
                  setSelected(item.id);
                  setEditing(false);
                }}
              >
                <span className="text-body font-medium break-words">
                  {item.name}
                </span>
                {/* 受限是列表里唯一必须在展开前就看到的状态，其余信息保持次级色。 */}
                <span
                  className={cn(
                    "text-caption leading-relaxed break-words",
                    item.state === "RESTRICTED"
                      ? "text-attention"
                      : "text-muted-foreground",
                  )}
                >
                  {item.state === "RESTRICTED" ? "账号受限 · " : ""}
                  {item.hasSession ? "已有本机会话" : "待重新登录"} · 今日{" "}
                  {item.occupied}/{item.todayLimit}
                </span>
              </Button>
            ))}
          </nav>
        ) : null}

        <div className="flex min-w-0 flex-col gap-6">
          {account ? (
            <SectionCard
              title={account.name}
              actions={
                <>
                  <Button
                    variant="outline"
                    onClick={() => setEditing((value) => !value)}
                  >
                    {editing ? "取消编辑" : "编辑账号设置"}
                  </Button>
                  <AlertDialog
                    open={confirmOpen}
                    onOpenChange={setConfirmOpen}
                  >
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" disabled={!account.hasSession}>
                        断开本机会话
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>断开本机会话</AlertDialogTitle>
                        <AlertDialogDescription>
                          断开后需要重新扫码才能继续使用该账号。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>保留会话</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={() =>
                            disconnect.mutate(
                              { id: account.id, revision: account.revision },
                              { onSuccess: () => setConfirmOpen(false) },
                            )
                          }
                        >
                          确认断开
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              }
            >
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

              {editing ? (
                <AccountEditor
                  key={account.id + account.revision}
                  account={account}
                  onClose={() => setEditing(false)}
                />
              ) : null}
            </SectionCard>
          ) : null}

          <SectionCard title="添加账号">
            <div className="max-w-2xl">
              <LocalLoginPanel
                credentialsAvailable={!!status.data?.credentialsAvailable}
              />
            </div>
          </SectionCard>
        </div>
      </div>
    </>
  );
}
