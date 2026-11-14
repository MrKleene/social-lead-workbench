import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DetailItem,
  DetailList,
  DetailSheet,
} from "@/components/patterns/detail-sheet";
import { EmptyState } from "@/components/patterns/empty-state";
import { FormField } from "@/components/patterns/form-field";
import { PageHeader } from "@/components/patterns/page-header";
import { SectionCard } from "@/components/patterns/section-card";
import { useDraftGuard } from "@/features/work/draft-guard";
import { ErrorNotice } from "@/components/feedback";
import { cn } from "@/lib/utils";
import { LocalLoginPanel } from "./local-platform";
import { useLocalAction, useLocalRecords } from "./use-local-records";
import type { AccountDetails } from "./local-api";

/** 卡片只放基础信息；完整字段与操作在详情抽屉里。
 *
 *  `Card asChild` 把卡片样式落到真正的 `<button>` 上——整张卡可点，且键盘 Tab / Enter /
 *  焦点环都是原生行为，不用给 div 补 role 与 keydown。
 */
function AccountCard({
  account,
  onOpen,
}: {
  account: AccountDetails;
  onOpen: () => void;
}) {
  const restricted = account.state === "RESTRICTED";
  const title = account.nickname ?? account.name;
  return (
    <Card asChild className="transition-colors hover:bg-accent">
      <button
        type="button"
        onClick={onOpen}
        className="text-start outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <CardContent className="flex items-center gap-3">
          <Avatar className="size-10">
            {account.avatar_url ? (
              <AvatarImage src={account.avatar_url} alt="" />
            ) : null}
            <AvatarFallback className="text-caption">
              {title.slice(0, 1)}
            </AvatarFallback>
          </Avatar>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="text-section font-semibold break-words">
              {title}
            </span>
            <span
              className={cn(
                "text-caption break-words",
                restricted ? "text-attention" : "text-muted-foreground",
              )}
            >
              {restricted ? "账号受限 · " : ""}
              {account.hasSession ? "已有本机会话" : "待重新登录"}
              {" · 今日 "}
              {account.occupied}/{account.todayLimit}
            </span>
          </span>
        </CardContent>
      </button>
    </Card>
  );
}

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
      className="flex flex-col gap-4 border-t pt-4"
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
      <FormField label="本地名称">
        <Input
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </FormField>
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
 * 账号中心：页头一个「添加账号」，账号以卡片网格排列，点卡片开详情抽屉。
 *
 * 卡片只放基础信息（名称、会话状态、今日额度）；完整字段与编辑/断开/删除都在抽屉里，
 * 十几个账号时主列表也不会变成一屏长列表。
 */
export function LocalAccountPage() {
  const data = useLocalRecords("accountDetails");
  const status = useLocalRecords("status");
  const disconnect = useLocalAction("disconnectAccount");
  const remove = useLocalAction("deleteAccount");
  const reconcile = useLocalAction("reconcilePlatform");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [pauseNote, setPauseNote] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const accounts = data.data ?? [];
  // 暂停解除后提示一并收起，避免旧结论挂在页面上。
  useEffect(() => {
    if (!status.data?.platformPause) setPauseNote(null);
  }, [status.data?.platformPause]);
  // 从列表里现取：账号被删或数据刷新后抽屉自动失效，不会停在旧快照上。
  const selected = accounts.find((item) => item.id === detailId) ?? null;
  const failure = data.error ?? disconnect.error ?? remove.error;
  const credentialsAvailable = !!status.data?.credentialsAvailable;

  const closeDetail = () => {
    setDetailId(null);
    setEditing(false);
    setConfirmDisconnect(false);
    setConfirmRemove(false);
  };

  return (
    <>
      <PageHeader
        title="账号中心"
        actions={<Button onClick={() => setAddOpen(true)}>添加账号</Button>}
      />

      {status.data?.platformPause ? (
        // 暂停的判据是「上次的浏览器进程可能没退干净」。这由系统自己核对：主进程在启动时
        // 和停止未确认后都会对账（会话目录里的 .owner.json），进程不在了就自动清除。
        // 这里的按钮只是重新触发一次对账，不要求用户声明"我已核对"。
        <Alert variant="warning">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>平台操作已暂停：上次的浏览器进程未确认退出。</span>
            <Button
              size="sm"
              variant="outline"
              pending={reconcile.isPending}
              onClick={() =>
                reconcile.mutate(
                  {},
                  {
                    onSuccess: (result) =>
                      setPauseNote(
                        result.cleared
                          ? null
                          : result.live
                            ? "仍有浏览器进程在运行，退出后会自动恢复。"
                            : "暂时无法确认，稍后会自动重试。",
                      ),
                  },
                )
              }
            >
              重新检查
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {pauseNote ? (
        <p role="status" className="text-caption text-muted-foreground">
          {pauseNote}
        </p>
      ) : null}

      {failure ? <ErrorNotice error={failure} /> : null}

      {accounts.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              onOpen={() => {
                setEditing(false);
                setDetailId(account.id);
              }}
            />
          ))}
        </div>
      ) : (
        <SectionCard>
          <EmptyState
            title="还没有账号"
            action={<Button onClick={() => setAddOpen(true)}>添加账号</Button>}
          />
        </SectionCard>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>添加账号</DialogTitle>
            <DialogDescription className="sr-only">
              扫码登录一个新的小红书账号
            </DialogDescription>
          </DialogHeader>
          <LocalLoginPanel
            credentialsAvailable={credentialsAvailable}
            onVerified={() => setAddOpen(false)}
            onCancelled={() => setAddOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <DetailSheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) closeDetail();
        }}
        title={selected ? (selected.nickname ?? selected.name) : ""}
      >
        {selected ? (
          <>
            <DetailList>
              {selected.nickname ? (
                <DetailItem label="平台昵称">{selected.nickname}</DetailItem>
              ) : null}
              {selected.nickname ? (
                <DetailItem label="本地名称">{selected.name}</DetailItem>
              ) : null}
              <DetailItem label="平台账号 ID">
                {selected.platform_user_id ?? "尚未取得可靠身份"}
              </DetailItem>
              <DetailItem label="登录与会话">
                {selected.hasSession
                  ? "本机已保存；实际执行前再次核验"
                  : "本机未保存有效会话"}
              </DetailItem>
              <DetailItem label="今日额度（北京时间）">
                {selected.occupied} / {selected.todayLimit} · {selected.day}
              </DetailItem>
              <DetailItem label="默认每日上限">
                {selected.daily_limit}
              </DetailItem>
              <DetailItem label="风险记录">
                {selected.holds.length ? (
                  selected.holds.map((hold) => (
                    <p key={hold.reason + String(hold.channel)}>
                      {hold.channel ?? "全部渠道"} · {hold.reason}
                    </p>
                  ))
                ) : selected.state === "RESTRICTED" ? (
                  "账号受限，登录不能解除限制"
                ) : (
                  "暂无独立风险记录；不代表平台允许发送。"
                )}
              </DetailItem>
            </DetailList>

            {editing ? (
              <AccountEditor
                key={selected.id + selected.revision}
                account={selected}
                onClose={() => setEditing(false)}
              />
            ) : null}

            <div className="flex flex-wrap gap-3 border-t pt-4">
              <Button
                variant="outline"
                onClick={() => setEditing((value) => !value)}
              >
                {editing ? "取消编辑" : "编辑账号设置"}
              </Button>

              <AlertDialog
                open={confirmDisconnect}
                onOpenChange={setConfirmDisconnect}
              >
                <AlertDialogTrigger asChild>
                  <Button variant="outline" disabled={!selected.hasSession}>
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
                          { id: selected.id, revision: selected.revision },
                          { onSuccess: () => setConfirmDisconnect(false) },
                        )
                      }
                    >
                      确认断开
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">删除账号</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>删除账号</AlertDialogTitle>
                    <AlertDialogDescription>
                      删除后该账号从列表移除，发送与收件记录保留。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>保留账号</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={() =>
                        remove.mutate(
                          { id: selected.id, revision: selected.revision },
                          { onSuccess: closeDetail },
                        )
                      }
                    >
                      确认删除
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </>
        ) : null}
      </DetailSheet>
    </>
  );
}
