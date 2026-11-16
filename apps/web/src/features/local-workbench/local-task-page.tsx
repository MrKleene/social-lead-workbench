import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/patterns/page-header";
import { SectionCard } from "@/components/patterns/section-card";
import { ErrorNotice } from "@/components/feedback";
import { JourneyStepper } from "@/features/work/journey-stepper";
import { followStage, type StageFollow } from "@/features/work/journey-follow";
import type { JourneyStage } from "@/features/work/journey-model";
import type { JourneyStep } from "@/features/work/journey-step-state";
import { AutomationSettingsDialog } from "./automation-settings-dialog";
import {
  MissingConfigDialog,
  type MissingItem,
} from "./missing-config-dialog";
import { LocalPosts } from "./local-posts";
import { LocalReviewDialog } from "./local-review-dialog";
import { LocalRunReview } from "./local-run-review";
import { StartCollectionDialog } from "./start-collection-dialog";
import { localApi, type LocalMethods } from "./local-api";
import { useLocalRecords } from "./use-local-records";

const STAGES = ["collect", "review", "contact"] as const;
const ACTIVE_RUN = ["QUEUED", "RUNNING"];

type RunProgress = LocalMethods["runProgress"];

/** 还没有任何轮次时的步骤条：三步都在「待开始」，和真实轮次的视觉保持一致。 */
const IDLE_STEPS: JourneyStep[] = [
  { id: "collect", label: "采集内容", state: "idle", status: "待开始" },
  { id: "review", label: "评论匹配", state: "idle", status: "等待采集完成" },
  { id: "contact", label: "自动回复", state: "idle", status: "等待匹配完成" },
];

/**
 * 自动化任务页。
 *
 * 结构：页头三个动作（查看采集历史 / 采集设置 / 开始自动化采集）+ 本轮进度步骤条 +
 * 当前步骤内容。「查看采集历史」跳独立页面（`/work/archive`），不在本页弹窗——历史需要
 * 筛选、分页和每轮多个动作，弹窗装不下，也会挡住步骤条。
 *
 * 「采集设置」是三步各自的设置（采集 / 评论匹配 / 自动回复），不是全局配置页。
 *
 * 步骤会自己往前走：采集完成后自动进「评论匹配」，匹配完成后自动进「自动回复」。
 * 判定在 `followStage` 里，只跟随本次挂载中观察到的跃迁——打开历史轮次不会自己跳。
 */
export function LocalTaskPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get("stage") || "";
  const stage = (
    STAGES.includes(requested as JourneyStage) ? requested : "collect"
  ) as JourneyStage;

  const runs = useLocalRecords("runs");
  const status = useLocalRecords("status");
  const selection = useLocalRecords("workspaceSelection");
  const steps = useLocalRecords("automationSteps");
  const latestId = runs.data?.items[0]?.id ?? "";
  const runId = params.get("run") || latestId;
  const progress = useLocalRecords(
    "runProgress",
    runId ? { runId } : undefined,
    { enabled: !!runId, refetchInterval: 2000 },
  );
  const credentialsAvailable = !!status.data?.credentialsAvailable;
  const [startOpen, setStartOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<JourneyStage>("collect");
  const [missingOpen, setMissingOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const running = ACTIVE_RUN.includes(progress.data?.run.status ?? "");
  const viewingHistory = !!runId && !!latestId && runId !== latestId;

  /** 开始采集前必须配好的东西。缺几项就列几项，点「开始自动化采集」时弹出来。 */
  const configId = selection.data?.configId ?? "";
  const preferences = useQuery({
    queryKey: ["local", "collectionPreferences", configId],
    queryFn: () => localApi("collectionPreferences", { configId }),
    enabled: !!configId,
  });
  const accounts = useLocalRecords("accountOverview");
  const account = accounts.data?.accounts.find(
    (item) => item.id === preferences.data?.accountId,
  );

  const missing: MissingItem[] = [];
  const accountCount = accounts.data?.accounts.length ?? 0;
  if (!configId) {
    missing.push({ tab: "collect", text: "采集关键词组" });
  } else if (!accountCount) {
    // 一个账号都没有时，「采集设置」里只有空下拉——账号只能去账号中心登录。
    missing.push({ to: "/work/accounts", action: "去登录", text: "采集账号" });
  } else if (!preferences.data?.accountId) {
    missing.push({ tab: "collect", text: "采集账号" });
  } else if (account?.state !== "VERIFIED" || !account?.hasSession) {
    missing.push({ to: "/work/accounts", action: "重新登录", text: "采集账号未验证" });
  }
  if (
    (steps.data?.autoReview || steps.data?.autoReply) &&
    !steps.data?.policyId
  ) {
    missing.push({ tab: "review", text: "评论匹配规则" });
  }
  if (
    steps.data?.autoReply &&
    !steps.data.commentTemplateId &&
    !steps.data.dmTemplateId
  ) {
    missing.push({ tab: "contact", text: "回复模板" });
  }
  if (steps.data?.autoReply && !steps.data.replyAccountIds.length) {
    missing.push({ tab: "contact", text: "回复账号" });
  } else if (steps.data?.autoReply && accounts.data) {
    // 账号池里有一个掉登录就不放行：池子的意义是配额耗尽后换号，不是拿不可用账号顶。
    const unusable = steps.data.replyAccountIds.some((id) => {
      const item = accounts.data?.accounts.find((entry) => entry.id === id);
      return !item || item.state !== "VERIFIED" || !item.hasSession;
    });
    if (unusable) {
      missing.push({ to: "/work/accounts", action: "重新登录", text: "回复账号未验证" });
    }
  }
  if (accounts.data && !accounts.data.runtime.ready) {
    missing.push({ text: "平台组件未就绪" });
  }
  if (status.data && !credentialsAvailable) {
    missing.push({ text: "系统凭据保护未就绪" });
  }

  const setParam = (key: string, value: string) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  /**
   * 一次算完两个改动：`setParams` 基于本次渲染的 params 快照，同一 tick 里连调两次
   * 会让后一次覆盖前一次。
   *
   * `replySkipped` 非空表示这轮采集起来了、但自动回复没进去（例如回复账号受限）。
   */
  const handleStarted = (replySkipped: string | null) => {
    setNotice(
      replySkipped
        ? `已加入队列 · 本轮未包含自动回复 · ${replySkipped}`
        : "已加入队列",
    );
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete("run");
        next.set("stage", "collect");
        return next;
      },
      { replace: true },
    );
  };

  return (
    <>
      <PageHeader
        title="自动化任务"
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/work/archive">查看采集历史</Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSettingsTab(stage);
                setSettingsOpen(true);
              }}
            >
              采集设置
            </Button>
            <Button
              disabled={running}
              onClick={() => {
                if (missing.length) {
                  setMissingOpen(true);
                  return;
                }
                setStartOpen(true);
              }}
            >
              {running ? "本轮进行中" : "开始自动化采集"}
            </Button>
          </>
        }
      />

      {runs.error ? <ErrorNotice error={runs.error} /> : null}
      {notice ? (
        <p role="status" className="text-body leading-relaxed break-words">
          {notice}
        </p>
      ) : null}

      {runId ? (
        <RunWorkspace
          runId={runId}
          stage={stage}
          progress={progress}
          viewingHistory={viewingHistory}
          onStage={(next) => setParam("stage", next)}
          onLatest={() => setParam("run", "")}
        />
      ) : (
        /* 还没有轮次时步骤条也要在：它是这个页面的主体，不能等到有数据才出现。 */
        <SectionCard title="本轮进度" description="尚未开始">
          <JourneyStepper
            steps={IDLE_STEPS}
            selected={stage}
            onSelect={(next) => setParam("stage", next)}
            caption="未开始"
            attention={false}
          />
        </SectionCard>
      )}

      <AutomationSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        tab={settingsTab}
        onTab={setSettingsTab}
        credentialsAvailable={credentialsAvailable}
      />

      <MissingConfigDialog
        open={missingOpen}
        onOpenChange={setMissingOpen}
        items={missing}
        onLocate={(tab) => {
          setSettingsTab(tab);
          setSettingsOpen(true);
        }}
      />

      <StartCollectionDialog
        open={startOpen}
        onOpenChange={setStartOpen}
        credentialsAvailable={credentialsAvailable}
        onStarted={handleStarted}
      />
    </>
  );
}

function RunWorkspace({
  runId,
  stage,
  progress,
  viewingHistory,
  onStage,
  onLatest,
}: {
  runId: string;
  stage: JourneyStage;
  progress: { data?: RunProgress; error: unknown };
  viewingHistory: boolean;
  onStage: (stage: JourneyStage) => void;
  onLatest: () => void;
}) {
  const data = progress.data;
  const collectFollow = useRef<StageFollow | undefined>(undefined);
  const reviewFollow = useRef<StageFollow | undefined>(undefined);

  const runStatus = data?.run.status ?? "";
  const reviews = data?.reviews ?? {};
  const jobs = data?.jobs ?? [];
  const reviewReady = !!data?.reviewReady;
  const collectActive = ACTIVE_RUN.includes(runStatus);
  // 采到了笔记但评论树被读取预算截断：仍是有效轮次，不能一直显示「等待采集完成」。
  const collectPartial = runStatus === "PARTIAL" && (data?.posts ?? 0) > 0;
  const collectSettled =
    (runStatus === "COMPLETE" && !data?.run.reason) || collectPartial;
  const reviewActive =
    (reviews.DISPATCHED ?? 0) > 0 ||
    (stage === "review" && !!data && !reviewReady);

  // 依赖只用原始值：轮询每次都可能返回等价但不同引用的对象，用对象做依赖会重复推进判定。
  useEffect(() => {
    const result = followStage(collectFollow.current, {
      key: runId + ":collect",
      active: collectActive,
      ready: collectSettled,
      stage,
      from: "collect",
    });
    collectFollow.current = result.follow;
    if (result.advance) onStage("review");
  }, [runId, collectActive, collectSettled, stage, onStage]);

  useEffect(() => {
    const result = followStage(reviewFollow.current, {
      key: runId + ":review",
      active: reviewActive,
      ready: reviewReady,
      stage,
      from: "review",
    });
    reviewFollow.current = result.follow;
    if (result.advance) onStage("contact");
  }, [runId, reviewActive, reviewReady, stage, onStage]);

  const sendUnknown = jobs.some(
    (job) => job.kind === "SEND" && job.state === "UNKNOWN",
  );
  const sendQueued = jobs.some(
    (job) =>
      job.kind === "SEND" && ["QUEUED", "RUNNING"].includes(job.state),
  );
  const sendFailed = jobs.some(
    (job) => job.kind === "SEND" && job.state === "FAILED",
  );
  const sendConfirmed = jobs.some(
    (job) => job.kind === "SEND" && job.state === "SUCCEEDED",
  );
  const sendStopped = jobs.some(
    (job) =>
      job.kind === "SEND" && ["CANCELLED", "INTERRUPTED"].includes(job.state),
  );

  const steps: JourneyStep[] = [
    {
      id: "collect",
      label: "采集内容",
      state: !data
        ? "loading"
        : collectActive
          ? "running"
          : runStatus === "FAILED"
            ? "failed"
            : runStatus === "COMPLETE"
              ? data.run.reason
                ? "partial"
                : "complete"
              : runStatus === "PARTIAL"
                ? "partial"
                : "paused",
      status: data
        ? `${data.posts} 篇笔记 · ${data.comments} 条评论`
        : "正在读取",
    },
    {
      id: "review",
      label: "评论匹配",
      state: !data
        ? "loading"
        : reviews.UNKNOWN
          ? "unknown"
          : (reviews.DISPATCHED ?? 0) > 0
            ? "running"
            : reviewReady
              ? "complete"
              : "idle",
      status: !data
        ? "正在读取"
        : reviewReady
          ? "整轮审核已完成"
          : (reviews.DISPATCHED ?? 0) > 0
            ? "整轮审核进行中"
            : collectSettled
              ? "等待本轮审核"
              : "等待采集完成",
    },
    {
      id: "contact",
      label: "自动回复",
      state: !data
        ? "loading"
        : sendUnknown
          ? "unknown"
          : sendQueued
            ? "queued"
            : sendFailed
              ? "failed"
              : sendConfirmed
                ? "complete"
                : sendStopped
                  ? "partial"
                  : "idle",
      status: !data
        ? "正在读取"
        : sendUnknown
          ? "结果未知 · 勿重发"
          : sendQueued
            ? "任务执行中"
            : sendFailed
              ? "回复存在失败"
              : sendConfirmed
                ? "已确认发送"
                : sendStopped
                  ? "已结束 · 有未发送"
                  : "查看本轮回复记录",
    },
  ];

  const meta = data
    ? `${data.run.name} · ${new Date(data.run.createdAt).toLocaleString()}`
    : "正在读取本轮…";

  return (
    <>
      {progress.error ? <ErrorNotice error={progress.error} /> : null}

      <SectionCard
        title="本轮进度"
        description={meta}
        actions={
          viewingHistory ? (
            <Button variant="outline" size="sm" onClick={onLatest}>
              返回最近一轮
            </Button>
          ) : undefined
        }
      >
        <JourneyStepper
          steps={steps}
          selected={stage}
          onSelect={onStage}
          caption={
            collectPartial
              ? "已采集 · 覆盖不完整"
              : data?.run.reason
                ? "本轮已停止"
                : "进行中"
          }
          attention={!!data?.run.reason && !collectPartial}
          details={data?.run.reason ? [data.run.reason] : []}
        />
      </SectionCard>

      {stage === "collect" ? (
        <LocalPosts runId={runId} onClose={() => onStage("review")} />
      ) : null}

      {stage === "review" ? (
        <>
          <LocalRunReview runId={runId} />
          <LocalReviewDialog runId={runId} onClose={() => onStage("collect")} />
          <Link
            to={`/comment-review?run=${runId}`}
            className="text-body underline underline-offset-4"
          >
            查看本轮审核结果 →
          </Link>
        </>
      ) : null}

      {stage === "contact" ? (
        <SectionCard title="本轮回复">
          <Link
            to={`/reply-history?run=${runId}`}
            className="text-body underline underline-offset-4"
          >
            查看本轮回复记录 →
          </Link>
          <Link
            to="/auto-contact/pending"
            className="text-body underline underline-offset-4"
          >
            查看待处理及未知结果 →
          </Link>
        </SectionCard>
      ) : null}
    </>
  );
}
