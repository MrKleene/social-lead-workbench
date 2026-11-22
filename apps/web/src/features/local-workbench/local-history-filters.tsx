import { useEffect, useState } from "react";
import { Link, useSearchParams } from "@/lib/router-compat";
import { Disclosure } from "@/components/disclosure";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { ErrorNotice } from "@/components/feedback";
import { useLocalRecords } from "./use-local-records";

const runStates: Array<[string, string]> = [
  ["RUNNING", "进行中"],
  ["COMPLETE", "完整"],
  ["PARTIAL", "部分完成"],
  ["FAILED", "失败"],
  ["CANCELLED", "已取消"],
  ["INTERRUPTED", "已中断"],
];

export function LocalHistoryFilters({ tab }: { tab: "runs" | "reviews" }) {
  const [params, setParams] = useSearchParams();
  const configs = useLocalRecords("configurations");
  const accounts = useLocalRecords("accounts");
  const workflow = useLocalRecords("workflowOverview");

  const get = (key: string) => params.get(key) || "";
  const query = get("query");
  const [search, setSearch] = useState(query);
  useEffect(() => setSearch(query), [query]);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== query) change("query", search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, query]);
  const hasFilters = [
    "query",
    "state",
    "config",
    "account",
    "policy",
    "evaluation",
    "from",
    "to",
    "decision",
    "context",
    "mode",
    "publication",
    "sort",
  ].some((key) => !!params.get(key));
  const change = (key: string, value: string) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value) next.set(key, value);
        else next.delete(key);
        next.delete("page");
        return next;
      },
      { replace: true, flushSync: true },
    );

  return (
    <div className="flex flex-col gap-3">
      <FilterBar>
        <FilterField
          label={tab === "runs" ? "搜索配置或笔记标题" : "搜索评论原文"}
        >
          <Input
            type="search"
            maxLength={200}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </FilterField>

        {tab === "runs" ? (
          <>
            <FilterField label="采集状态">
              <Select
                value={get("state")}
                onValueChange={(value) => change("state", value)}
              >
                <SelectTrigger aria-label="采集状态">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SELECT_EMPTY}>全部状态</SelectItem>
                  {runStates.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                  {label}
                  </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label="来源配置">
              <Select
                value={get("config")}
                onValueChange={(value) => change("config", value)}
              >
                <SelectTrigger aria-label="来源配置">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SELECT_EMPTY}>全部配置</SelectItem>
                  {configs.data
                  ?.filter((config) => config.kind === "KEYWORDS")
                  .map((config) => (
                  <SelectItem key={config.id} value={config.id}>
                  {config.name}
                  </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label="采集账号">
              <Select
                value={get("account")}
                onValueChange={(value) => change("account", value)}
              >
                <SelectTrigger aria-label="采集账号">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SELECT_EMPTY}>全部账号</SelectItem>
                  {accounts.data?.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                  {account.name}
                  </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
          </>
        ) : (
          <>
            <FilterField label="匹配方案筛选">
              <Select
                value={get("policy")}
                onValueChange={(value) => change("policy", value)}
              >
                <SelectTrigger aria-label="匹配方案筛选">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SELECT_EMPTY}>全部方案</SelectItem>
                  {workflow.data?.policies.map((policy) => (
                  <SelectItem key={policy.id} value={policy.id}>
                  {policy.name}
                  </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label="评估记录">
              <Select
                value={get("evaluation")}
                onValueChange={(value) => change("evaluation", value)}
              >
                <SelectTrigger aria-label="评估记录">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SELECT_EMPTY}>已评分</SelectItem>
                  <SelectItem value="ALL_UNREVIEWED">未评分原文</SelectItem>
                  <SelectItem value="UNANALYSED">尚无请求</SelectItem>
                  <SelectItem value="FAILED">请求失败或取消</SelectItem>
                  <SelectItem value="UNKNOWN">请求结果未知</SelectItem>
                  <SelectItem value="PROCESSING">请求处理中</SelectItem>
                </SelectContent>
              </Select>
            </FilterField>
          </>
        )}
      </FilterBar>

      {tab === "runs" || !get("evaluation") ? (
        <Disclosure title="更多筛选">
          <div className="flex flex-col gap-3">
            <FilterBar>
              <FilterField
                label={tab === "runs" ? "采集开始日期" : "评论发布开始日期"}
              >
                <DatePicker
                  ariaLabel={tab === "runs" ? "采集开始日期" : "评论发布开始日期"}
                  value={get("from")}
                  placeholder="不限"
                  onChange={(value) => change("from", value)}
                />
              </FilterField>
              <FilterField
                label={tab === "runs" ? "采集结束日期" : "评论发布结束日期"}
              >
                <DatePicker
                  ariaLabel={tab === "runs" ? "采集结束日期" : "评论发布结束日期"}
                  value={get("to")}
                  placeholder="不限"
                  onChange={(value) => change("to", value)}
                />
              </FilterField>
              {tab === "reviews" ? (
                <>
                  <FilterField label="最高匹配分">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={get("maxScore") || "100"}
                      onChange={(event) =>
                        change("maxScore", event.target.value)
                      }
                    />
                  </FilterField>
                  <FilterField label="模型判断">
                    <Select
                      value={get("decision")}
                      onValueChange={(value) =>
                      change("decision", value)
                      }
                    >
                      <SelectTrigger aria-label="模型判断">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SELECT_EMPTY}>全部</SelectItem>
                        <SelectItem value="MATCH">匹配</SelectItem>
                        <SelectItem value="NO_MATCH">不匹配</SelectItem>
                        <SelectItem value="UNCERTAIN">不确定</SelectItem>
                      </SelectContent>
                    </Select>
                  </FilterField>
                  <FilterField label="上下文">
                    <Select
                      value={get("context")}
                      onValueChange={(value) => change("context", value)}
                    >
                      <SelectTrigger aria-label="上下文">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SELECT_EMPTY}>全部</SelectItem>
                        <SelectItem value="SUFFICIENT">充分</SelectItem>
                        <SelectItem value="INSUFFICIENT">不足</SelectItem>
                      </SelectContent>
                    </Select>
                  </FilterField>
                  <FilterField label="审核来源">
                    <Select
                      value={get("mode")}
                      onValueChange={(value) => change("mode", value)}
                    >
                      <SelectTrigger aria-label="审核来源">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SELECT_EMPTY}>全部</SelectItem>
                        <SelectItem value="FROZEN_RUN">本轮审核</SelectItem>
                        <SelectItem value="INDEPENDENT">独立审核</SelectItem>
                      </SelectContent>
                    </Select>
                  </FilterField>
                  <FilterField label="评论发布时间">
                    <Select
                      value={get("publication")}
                      onValueChange={(value) =>
                      change("publication", value)
                      }
                    >
                      <SelectTrigger aria-label="评论发布时间">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SELECT_EMPTY}>全部</SelectItem>
                        <SelectItem value="known">已知</SelectItem>
                        <SelectItem value="unknown">未记录</SelectItem>
                      </SelectContent>
                    </Select>
                  </FilterField>
                  <FilterField label="审核排序">
                    <Select
                      value={get("sort")}
                      onValueChange={(value) => change("sort", value)}
                    >
                      <SelectTrigger aria-label="审核排序">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SELECT_EMPTY}>审核记录：新到旧</SelectItem>
                        <SelectItem value="oldest">审核记录：旧到新</SelectItem>
                        <SelectItem value="score-desc">分数：高到低</SelectItem>
                        <SelectItem value="score-asc">分数：低到高</SelectItem>
                        <SelectItem value="comment-newest">评论时间：新到旧</SelectItem>
                        <SelectItem value="comment-oldest">评论时间：旧到新</SelectItem>
                      </SelectContent>
                    </Select>
                  </FilterField>
                </>
              ) : null}
            </FilterBar>
          </div>
        </Disclosure>
      ) : null}

      <div>
        <Button
          variant="ghost"
          disabled={!hasFilters}
          onClick={() =>
            setParams(
              params.get("run") ? { run: params.get("run")! } : {},
              { replace: true },
            )
          }
        >
          清除筛选
        </Button>
      </div>
    </div>
  );
}

export function LocalUnreviewed() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const state = params.get("evaluation") || "";
  const data = useLocalRecords("unreviewedComments", {
    page,
    runId: params.get("run") || "",
    policyId: params.get("policy") || "",
    query: params.get("query") || "",
    state: state === "ALL_UNREVIEWED" ? "" : state,
  });

  const items = data.data?.items ?? [];

  return (
    <>
      {data.error ? (
        <ErrorNotice error={data.error} />
      ) : null}
      {items.length ? (
        <RecordList>
          {items.map((comment) => (
            <RecordItem
              key={comment.id}
              title={comment.body}
              meta={`${comment.post_title || "未保存标题"} · ${comment.batch_state ?? "尚无请求"}`}
            >
              {comment.error_code ? (
                <p className="text-body text-destructive">读取失败</p>
              ) : null}
              <Link
                to={`/automation?run=${comment.run_id}&stage=review`}
                className="text-body text-primary underline-offset-4 hover:underline"
              >
                查看原轮次审核与保护状态
              </Link>
            </RecordItem>
          ))}
        </RecordList>
      ) : data.isPending ? (
        <EmptyState title="正在读取评论原文。" />
      ) : data.data ? (
        <EmptyState title="没有符合条件的评论原文。" />
      ) : null}
      <Pagination
        page={page}
        total={data.data?.total ?? 0}
        onPageChange={(next) =>
          setParams((previous) => {
            previous.set("page", String(next));
            return previous;
          })
        }
        label="未评分原文分页"
      />
    </>
  );
}
