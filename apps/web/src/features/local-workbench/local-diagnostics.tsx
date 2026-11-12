import { useState } from "react";
import { Link } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import {
  SELECT_EMPTY,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/patterns/empty-state";
import { FilterBar, FilterField } from "@/components/patterns/filter-bar";
import { Pagination } from "@/components/patterns/pagination";
import { RecordItem, RecordList } from "@/components/patterns/record-list";
import { SectionCard } from "@/components/patterns/section-card";
import { ErrorNotice } from "@/components/feedback";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLocalAction, useLocalRecords } from "./use-local-records";

const labels: Record<string, string> = {
  RESERVED: "已预占",
  DISPATCHED: "已提交待结果",
  COMPLETED: "已完成",
  FAILED: "失败",
  UNKNOWN: "结果未知",
  CANCELLED: "已取消",
  QUEUED: "已派生任务",
  SKIPPED: "已跳过",
  RUNNING: "执行中",
  SUCCEEDED: "任务完成",
  INTERRUPTED: "已中断",
};

const reasons: Record<string, string> = {
  ACCOUNT_REQUIRES_LOGIN: "需要重新登录原账号",
  ACCOUNT_IDENTITY_UNVERIFIED: "缺少可靠平台身份",
  ACCOUNT_HAS_ACTIVE_TASKS: "存在本账号活动任务",
  ACCOUNT_HAS_RETAINED_RESTRICTION: "保留的账号或渠道限制",
  DAILY_QUOTA_EXHAUSTED: "今日发送额度已用完或设置为零",
  SENDING_PAUSED: "全局发送或平台操作已暂停",
  UNKNOWN_SEND_REQUIRES_EVIDENCE: "存在需要证据核对的未知发送",
};

export function LocalAccountDiagnostics({ accountId }: { accountId: string }) {
  const check = useLocalAction("accountDiagnostics");
  const result = check.data;

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <h3 className="text-section font-semibold">本地资格检查</h3>
      <div>
        <Button
          variant="outline"
          pending={check.isPending}
          onClick={() => check.mutate({ accountId })}
        >
          检查本地资格
        </Button>
      </div>
      {check.error ? (
        <ErrorNotice error={check.error} />
      ) : null}
      {result ? (
        <>
          <p className="text-body leading-relaxed text-muted-foreground break-words">
            检查时间：{new Date(result.checkedAt).toLocaleString()} · 今日占用{" "}
            {result.occupied}/{result.limit} · 剩余额度 {result.remaining}
          </p>
          {result.channels.map((channel) => (
            <div key={channel.channel} className="flex flex-col gap-1">
              <h4 className="text-body font-medium">
                {channel.channel === "DM" ? "私信" : "评论回复"}
              </h4>
              {channel.reasons.length ? (
                <ul className="flex flex-col gap-1">
                  {channel.reasons.map((reason) => (
                    <li
                      key={reason}
                      className="text-caption leading-relaxed text-muted-foreground break-words"
                    >
                      {reasons[reason] ?? reason}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-caption text-muted-foreground">
                  未发现阻止项。
                </p>
              )}
            </div>
          ))}
        </>
      ) : null}
    </div>
  );
}

export function LocalAutomationReport() {
  const rules = useLocalRecords("automationRules");
  const [page, setPage] = useState(1);
  const [state, setState] = useState("");
  const [channel, setChannel] = useState("");
  const [ruleId, setRuleId] = useState("");
  const data = useLocalRecords("automationReport", {
    page,
    state,
    channel,
    ruleId,
  });
  const report = data.data;
  const items = report?.items ?? [];

  return (
    <SectionCard title="规则运行统计">
      <FilterBar>
        <FilterField label="执行规则">
          <Select
            value={ruleId}
            onValueChange={(value) => {
            setRuleId(value);
            setPage(1);
            }}
          >
            <SelectTrigger aria-label="执行规则">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SELECT_EMPTY}>全部规则</SelectItem>
              {rules.data?.map((rule) => (
              <SelectItem key={rule.id} value={rule.id}>
              {rule.name}
              </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="规则结果">
          <Select
            value={state}
            onValueChange={(value) => {
            setState(value);
            setPage(1);
            }}
          >
            <SelectTrigger aria-label="规则结果">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SELECT_EMPTY}>全部</SelectItem>
              <SelectItem value="QUEUED">已派生任务</SelectItem>
              <SelectItem value="SKIPPED">已跳过</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="规则渠道">
          <Select
            value={channel}
            onValueChange={(value) => {
            setChannel(value);
            setPage(1);
            }}
          >
            <SelectTrigger aria-label="规则渠道">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SELECT_EMPTY}>全部</SelectItem>
              <SelectItem value="COMMENT">评论</SelectItem>
              <SelectItem value="DM">私信</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
      </FilterBar>

      {data.error ? (
        <ErrorNotice error={data.error} />
      ) : null}
      {report?.summary.map((entry) => (
        <p
          key={entry.state + entry.reason}
          className="text-body leading-relaxed text-muted-foreground break-words"
        >
          {labels[entry.state]} · {entry.reason}：{entry.count}
        </p>
      ))}

      {items.length ? (
        <RecordList>
          {items.map((row) => (
            <RecordItem
              key={row.id}
              title={`${row.rule_name} · ${labels[row.state]}`}
              meta={`${row.channel === "DM" ? "私信" : "评论"} · ${row.reason}${
                row.job_state ? " · " + (labels[row.job_state] ?? row.job_state) : ""
              } · ${new Date(row.created_at).toLocaleString()}`}
            >
              <Link
                to={`/reply-history?run=${row.run_id}`}
                className="underline underline-offset-4"
              >
                查看本轮实际回复结果 →
              </Link>
            </RecordItem>
          ))}
        </RecordList>
      ) : (
        <EmptyState title="当前筛选没有规则运行记录。" />
      )}

      <Pagination
        page={page}
        total={report?.total ?? 0}
        onPageChange={setPage}
        label="规则运行分页"
      />
    </SectionCard>
  );
}
