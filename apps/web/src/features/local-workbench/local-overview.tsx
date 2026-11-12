import { Link } from "@/lib/router-compat";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DetailItem, DetailList } from "@/components/patterns/detail-sheet";
import { PageHeader } from "@/components/patterns/page-header";
import { SectionCard } from "@/components/patterns/section-card";
import { ErrorNotice } from "@/components/feedback";
import { LocalDataManagement } from "./local-data-management";
import { LocalJobs } from "./local-record-pages";
import { useLocalRecords } from "./use-local-records";
import { useLocalWorkbench } from "./use-local-workbench";

export function LocalOverview() {
  const query = useLocalRecords("workspaceOverview");
  const overview = query.data;

  const metrics: Array<[string, number | undefined, string]> = [
    ["采集轮次", overview?.runs, "/work/archive"],
    ["保存评论", overview?.comments, "/work/archive"],
    ["待审核决定", overview?.pendingReviews, "/comment-review"],
    ["已确认发送", overview?.confirmed, "/reply-history?state=CONFIRMED"],
    ["结果未知", overview?.unknown, "/auto-contact/pending"],
    ["活动任务", overview?.active, "/automation"],
  ];

  return (
    <>
      <PageHeader
        title="工作台"
        actions={
          <Button asChild>
            <Link to="/automation">进入自动化任务</Link>
          </Button>
        }
      />

      {query.error ? (
        <ErrorNotice error={query.error} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map(([name, value, url]) => (
          <Card key={name} asChild className="gap-2 p-6 transition-colors hover:bg-accent">
            <Link to={url}>
              <span className="text-caption text-muted-foreground">{name}</span>
              <strong className="text-title font-semibold tabular-nums">
                {value ?? "—"}
              </strong>
            </Link>
          </Card>
        ))}
      </div>

      {overview?.holds.length ? (
        <SectionCard title="需要核对的暂停">
          {overview.holds.map((hold) => (
            <p key={hold.id} className="text-body break-words">
              {hold.id} · {hold.reason}
            </p>
          ))}
          <Link
            to="/data"
            className="text-body underline underline-offset-4"
          >
            查看核对入口 →
          </Link>
        </SectionCard>
      ) : null}

      <LocalJobs />
    </>
  );
}

export { LocalInboxPage } from "./local-inbox-page";

export function LocalDataPage() {
  const workbench = useLocalWorkbench();
  return (
    <>
      <PageHeader title="数据与恢复" />
      {workbench.error ? (
        <ErrorNotice error={workbench.error} />
      ) : null}
      {workbench.notice ? (
        <p role="status" className="text-body text-muted-foreground">
          {workbench.notice}
        </p>
      ) : null}
      <SectionCard title="备份与恢复">
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            pending={workbench.backup.isPending}
            onClick={() => workbench.backup.mutate()}
          >
            创建本地备份
          </Button>
          <Button
            variant="outline"
            pending={workbench.restore.isPending}
            onClick={() => workbench.restore.mutate()}
          >
            校验并恢复副本
          </Button>
        </div>
      </SectionCard>
      <LocalDataManagement />
    </>
  );
}

export function LocalCapabilities() {
  const status = useLocalRecords("status");
  const workflow = useLocalRecords("workflowOverview");

  const capabilities: Array<[string, boolean | undefined]> = [
    ["账号登录", status.data?.platform.ready],
    ["有界采集", workflow.data?.capabilities.collect],
    ["限时收件", workflow.data?.capabilities.inbox],
    ["精确评论与私信", workflow.data?.capabilities.send],
    ["模型审核适配器", workflow.data?.capabilities.review],
    ["系统凭据保护", status.data?.credentialsAvailable],
  ];

  return (
    <>
      <PageHeader title="平台能力" />
      <SectionCard title="小红书">
        <DetailList className="gap-3 sm:grid-cols-2">
          {capabilities.map(([label, ready]) => (
            <DetailItem key={label} label={label}>
              {ready ? "可用" : "不可用"}
            </DetailItem>
          ))}
        </DetailList>
        <Link to="/work/accounts" className="text-body underline underline-offset-4">
          查看账号与额度 →
        </Link>
      </SectionCard>
      <SectionCard title="抖音">
        <p className="text-body text-muted-foreground">未接入</p>
      </SectionCard>
    </>
  );
}
