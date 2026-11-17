import { useEffect, useRef, useState } from "react";
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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LocalLoginPanel } from "./local-platform";
import { useLocalAction, useLocalRecords } from "./use-local-records";
import { localApi, type AccountDetails } from "./local-api";

/** 风险记录的原因码：库里存枚举，界面上必须是可读状态。 */
const holdLabels: Record<string, string> = {
  LEGACY_REPLY_RESTRICTION: "历史回复限制",
  LEGACY_ACCOUNT_OBSERVATION: "历史账号观测",
  RESTRICTED: "账号受限",
  VERIFY_REQUIRED: "需要重新核验",
  RATE_LIMITED: "触发频率限制",
  REPLY_DISABLED: "平台关闭了回复",
  PLATFORM_REFUSED: "平台拒绝",
};

/** 三档判定的界面措辞：平台限制 / 我们这边 / 判断不了。 */
const verdictLabel: Record<string, string> = {
  PLATFORM: "平台限制",
  LOCAL: "本机问题",
  UNKNOWN: "判断不了",
};

/** 判定命中的原因码里，有些不在风险记录表里（额度、暂停），这里补齐。 */
const reasonLabel: Record<string, string> = {
  DAILY_QUOTA_EXHAUSTED: "今日额度已用完",
  SENDING_PAUSED: "发送已暂停",
  ACCOUNT_HAS_ACTIVE_TASKS: "有正在跑的任务",
  UNKNOWN_SEND_REQUIRES_EVIDENCE: "有一次发送结果未知",
  TARGET_PREFLIGHT_REQUIRED: "评论回复需要先预检目标",
};

/** 下一步动作：用户层只说做什么，不解释为什么。 */
const nextStepLabel: Record<string, string> = {
  RECHECK_ACCOUNT: "重新检查回复权限",
  WAIT_NEXT_DAY: "明天再试",
  RELOGIN: "重新登录",
  WAIT_TASK: "等当前任务结束",
  CLEAR_PAUSE: "到运行异常里核对",
  SEND_ONE: "先单独发一条",
  DISCARD_UNKNOWN_SEND: "到运行异常里核对未知发送",
};

const channelLabel: Record<string, string> = { COMMENT: "评论回复", DM: "私信" };

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
              {account.hasSession ? "本机已登录" : "待重新登录"}
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
  const client = useQueryClient();
  const data = useLocalRecords("accountDetails");
  const status = useLocalRecords("status");
  const disconnect = useLocalAction("disconnectAccount");
  const remove = useLocalAction("deleteAccount");
  const reconcile = useLocalAction("reconcilePlatform");
  const check = useLocalAction("checkReplyEligibility");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [pauseNote, setPauseNote] = useState<string | null>(null);
  const [checkNote, setCheckNote] = useState<string | null>(null);
  const [sweep, setSweep] = useState<{ done: number; total: number; restricted: number; failed: number; current: string; stopped?: boolean } | null>(null);
  const sweepCancelled = useRef(false);
  const [editing, setEditing] = useState(false);
  /** null = 关闭；"" = 添加新账号；账号 id = 在该账号上重新登录。 */
  const [loginFor, setLoginFor] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const accounts = data.data ?? [];
  // 暂停解除后提示一并收起，避免旧结论挂在页面上。
  useEffect(() => {
    if (!status.data?.platformPause) setPauseNote(null);
  }, [status.data?.platformPause]);
  // 从列表里现取：账号被删或数据刷新后抽屉自动失效，不会停在旧快照上。
  const selected = accounts.find((item) => item.id === detailId) ?? null;
  // 抽屉里要讲清「为什么不能发 + 下一步」，这份判定由运行时按三档给出。
  const diagnostics = useLocalRecords(
    "accountDiagnostics",
    { accountId: selected?.id ?? "" },
    { enabled: !!selected, refetchInterval: 15000 },
  );
  const failure = data.error ?? disconnect.error ?? remove.error;
  const credentialsAvailable = !!status.data?.credentialsAvailable;
  const checkable = accounts.some((item) => item.hasSession);

  /**
   * 全部检查：串行跑一遍，每条都要起一次无头浏览器（10–20 秒），所以不能并发，
   * 中途允许停止，单条失败不影响后面的账号。间隔 2 秒，别把平台访问压成一阵。
   */
  const sweepAll = useMutation({
    mutationFn: async () => {
      const list = accounts.filter((item) => item.hasSession);
      let checked = 0;
      let restricted = 0;
      let failed = 0;
      for (const item of list) {
        if (sweepCancelled.current) break;
        setSweep({ done: checked, total: list.length, restricted, failed, current: item.nickname ?? item.name });
        try {
          if ((await localApi("checkReplyEligibility", { id: item.id })).restricted) restricted++;
        } catch {
          failed++;
        }
        checked++;
        if (checked < list.length) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
      return { total: checked, restricted, failed, cancelled: sweepCancelled.current };
    },
    onSuccess: (result) => {
      setSweep({
        done: result.total,
        total: result.total,
        restricted: result.restricted,
        failed: result.failed,
        current: "",
        stopped: result.cancelled,
      });
      void client.invalidateQueries({ queryKey: ["local"] });
    },
  });

  const sweepLabel = sweepAll.isPending
    ? sweep
      ? `正在检查「${sweep.current}」 · 已完成 ${sweep.done}/${sweep.total}`
      : "正在检查…"
    : sweep
      ? `已检查 ${sweep.total} 个账号 · 新增 ${sweep.restricted} 条限制${sweep.failed ? ` · ${sweep.failed} 个未完成` : ""}${sweep.stopped ? " · 已停止" : ""}`
      : null;
  const sweepPercent =
    sweepAll.isPending && sweep && sweep.total
      ? Math.round((sweep.done / sweep.total) * 100)
      : 0;

  const closeDetail = () => {
    setDetailId(null);
    setEditing(false);
    setCheckNote(null);
    setConfirmDisconnect(false);
    setConfirmRemove(false);
  };

  return (
    <>
      <PageHeader
        title="账号中心"
        actions={
          <>
            <Button
              variant="outline"
              disabled={!checkable || check.isPending}
              onClick={() => {
                if (sweepAll.isPending) {
                  sweepCancelled.current = true;
                  return;
                }
                sweepCancelled.current = false;
                setSweep(null);
                sweepAll.mutate();
              }}
            >
              {sweepAll.isPending
                ? sweep
                  ? `停止检查 ${sweep.done}/${sweep.total}`
                  : "停止检查"
                : "全部检查"}
            </Button>
            <Button disabled={sweepAll.isPending} onClick={() => setLoginFor("")}>
              添加账号
            </Button>
          </>
        }
      />

      {sweepLabel ? (
        <div className="flex flex-col gap-2">
          <p role="status" className="text-body text-muted-foreground break-words">
            {sweepLabel}
          </p>
          {sweepAll.isPending ? (
            <div
              role="progressbar"
              aria-valuenow={sweepPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="账号检查进度"
              className="h-1 w-full overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${sweepPercent}%` }}
              />
            </div>
          ) : null}
        </div>
      ) : null}

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
                setCheckNote(null);
                setDetailId(account.id);
              }}
            />
          ))}
        </div>
      ) : (
        <SectionCard>
          <EmptyState
            title="还没有账号"
            action={<Button onClick={() => setLoginFor("")}>添加账号</Button>}
          />
        </SectionCard>
      )}

      <Dialog
        open={loginFor !== null}
        onOpenChange={(open) => {
          if (!open) setLoginFor(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{loginFor ? "重新登录" : "添加账号"}</DialogTitle>
            <DialogDescription className="sr-only">
              {loginFor
                ? "扫码重新登录该账号，昵称与头像会重新读取"
                : "扫码登录一个新的小红书账号"}
            </DialogDescription>
          </DialogHeader>
          <LocalLoginPanel
            key={loginFor ?? "new"}
            credentialsAvailable={credentialsAvailable}
            defaultAccountId={loginFor || undefined}
            onVerified={() => setLoginFor(null)}
            onCancelled={() => setLoginFor(null)}
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
              <DetailItem label="本机登录">
                {selected.hasSession
                  ? "已登录；执行前再次核验"
                  : "未登录"}
              </DetailItem>
              <DetailItem label="今日额度（北京时间）">
                {selected.occupied} / {selected.todayLimit} · {selected.day}
              </DetailItem>
              <DetailItem label="默认每日上限">
                {selected.daily_limit}
              </DetailItem>
              <DetailItem label="能不能发">
                {diagnostics.data ? (
                  diagnostics.data.channels.map((channel) => (
                    <p key={channel.channel} className="break-words">
                      {channelLabel[channel.channel] ?? channel.channel} ·{" "}
                      {channel.verdict ? (
                        <>
                          {verdictLabel[channel.verdict.level]}
                          {" · "}
                          {holdLabels[channel.verdict.reason] ??
                            reasonLabel[channel.verdict.reason] ??
                            channel.verdict.reason}
                          {" · "}
                          {nextStepLabel[channel.verdict.nextStep] ??
                            channel.verdict.nextStep}
                        </>
                      ) : (
                        "可以发送"
                      )}
                    </p>
                  ))
                ) : (
                  <p>{diagnostics.isPending ? "正在读取…" : "未读取"}</p>
                )}
                {diagnostics.data?.poolStopped ? (
                  <p>
                    今天已有 {diagnostics.data.poolRestrictedToday}{" "}
                    个账号被限制，本轮剩余回复转入待处理。
                  </p>
                ) : null}
              </DetailItem>
              <DetailItem label="风险记录">
                {selected.holds.length ? (
                  selected.holds.map((hold) => (
                    <p key={hold.reason + String(hold.channel)}>
                      {hold.channel ?? "全部渠道"} ·{" "}
                      {holdLabels[hold.reason] ?? hold.reason}
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

            {checkNote ? (
              <p role="status" className="text-body text-muted-foreground break-words">
                {checkNote}
              </p>
            ) : null}
            {check.error ? <ErrorNotice error={check.error} /> : null}

            <div className="flex flex-wrap gap-3 border-t pt-4">
              <Button
                variant="outline"
                disabled={sweepAll.isPending}
                onClick={() => setLoginFor(selected.id)}
              >
                重新登录
              </Button>
              <Button
                variant="outline"
                pending={check.isPending}
                disabled={!selected.hasSession || sweepAll.isPending}
                onClick={() =>
                  check.mutate(
                    { id: selected.id },
                    {
                      onSuccess: (result) =>
                        setCheckNote(
                          result.restricted
                            ? `已记录回复限制 · ${holdLabels[result.reason ?? ""] ?? result.reason}`
                            : result.released
                              ? `未发现回复限制提示 · 已解除 ${result.released} 条风险记录`
                              : "未发现回复限制提示",
                        ),
                    },
                  )
                }
              >
                重新检查回复权限
              </Button>
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
                    退出本机登录
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>退出本机登录</AlertDialogTitle>
                    <AlertDialogDescription>
                      退出后需要重新扫码才能继续使用该账号，引用该账号的自动回复规则会被停用。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={() =>
                        disconnect.mutate(
                          { id: selected.id, revision: selected.revision },
                          { onSuccess: () => setConfirmDisconnect(false) },
                        )
                      }
                    >
                      退出登录
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
