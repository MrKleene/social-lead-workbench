import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  SELECT_EMPTY,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FilterField } from "@/components/patterns/filter-bar";
import { Pagination } from "@/components/patterns/pagination";
import { RecordItem, RecordList } from "@/components/patterns/record-list";
import { ErrorNotice } from "@/components/feedback";

import {
  localApi,
  type PostHistory,
  type PostVersionReview,
} from "./local-api";

const kinds: Record<string, string> = {
  UNCHANGED: "正文与身份相同",
  CHANGED: "正文、作者或父评论变化",
  ONLY_LEFT: "仅左侧观察到",
  ONLY_RIGHT: "仅右侧观察到",
};

function Reviews({ items }: { items: PostVersionReview[] }) {
  if (!items.length) {
    return (
      <p className="text-caption text-muted-foreground">
        此快照尚无保存的审核批次。
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((batch) => (
        <li
          key={batch.id}
          className="text-caption leading-relaxed text-muted-foreground break-words"
        >
          {batch.policy_name} · 目标修订 {batch.policy_revision} / 授权版本{" "}
          {batch.policy_version} · {batch.model} 版本 {batch.model_version} ·{" "}
          {batch.review_mode === "INDEPENDENT" ? "独立历史审核" : "当轮冻结审核"}{" "}
          · {batch.state}
          <br />
          {batch.result_count} 条结果，{batch.matching_source_count}{" "}
          条与该快照原文一致 ·{" "}
          {batch.current_configuration ? "配置版本仍一致" : "历史配置版本"}
        </li>
      ))}
    </ul>
  );
}

export function LocalPostComparison({
  postId,
  versions,
}: {
  postId: string;
  versions: PostHistory["versions"];
}) {
  const [other, setOther] = useState("");
  const [page, setPage] = useState(1);
  const data = useQuery({
    queryKey: ["local", "post-comparison", postId, other, page],
    queryFn: () =>
      localApi("comparePostVersions", { leftId: postId, rightId: other, page }),
    enabled: !!other,
  });
  const d = data.data;

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <h4 className="text-body font-semibold">跨轮快照与审核版本比较</h4>

      <FilterField label="对比快照">
        <Select
          value={other}
          onValueChange={(value) => {
          setOther(value);
          setPage(1);
          }}
        >
          <SelectTrigger aria-label="对比快照">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SELECT_EMPTY}>选择另一个历史快照</SelectItem>
            {versions
            .filter((version) => version.id !== postId)
            .map((version) => (
            <SelectItem key={version.id} value={version.id}>
            {new Date(version.created_at).toLocaleString()} ·{" "}
            {version.coverage === "COMPLETE" ? "完整" : "部分或未知"}
            </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterField>

      {versions.length < 2 ? (
        <p className="text-body text-muted-foreground">目前只有一个保存的快照。</p>
      ) : null}
      {data.error ? (
        <ErrorNotice error={data.error} />
      ) : null}

      {d ? (
        <>
          <p className="text-body leading-relaxed text-muted-foreground break-words">
            左侧：{new Date(d.left.observedAt).toLocaleString()}；右侧：
            {new Date(d.right.observedAt).toLocaleString()}。
            {d.postChanged ? "笔记标题或正文有变化。" : "笔记标题和正文一致。"}
          </p>
          <p className="text-body leading-relaxed text-muted-foreground break-words">
            单侧出现只表示该次观察结果，不能证明平台新增或删除。
            {d.warning === "PARTIAL_COVERAGE"
              ? "至少一侧读取不完整。"
              : d.warning === "LEGACY_ARCHIVE_MAY_LACK_HISTORICAL_SNAPSHOTS"
                ? "旧档案可能没有保留全部历史原文版本。"
                : "完整性仅针对当次有界读取。"}
          </p>
          <p className="text-body leading-relaxed text-muted-foreground break-words">
            {Object.entries(d.totals)
              .map(([kind, count]) => `${kinds[kind]} ${count} 条`)
              .join(" · ")}
          </p>

          {d.postChanged ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1 rounded-md border p-4">
                <h5 className="text-caption text-muted-foreground">左侧笔记</h5>
                <p className="text-body font-medium break-words">{d.left.title}</p>
                <p className="text-body leading-relaxed text-muted-foreground break-words">
                  {d.left.body}
                </p>
              </div>
              <div className="flex min-w-0 flex-col gap-1 rounded-md border p-4">
                <h5 className="text-caption text-muted-foreground">右侧笔记</h5>
                <p className="text-body font-medium break-words">
                  {d.right.title}
                </p>
                <p className="text-body leading-relaxed text-muted-foreground break-words">
                  {d.right.body}
                </p>
              </div>
            </div>
          ) : null}

          <RecordList>
            {d.items.map((item, index) => (
              <RecordItem key={index} title={kinds[item.kind]}>
                <p>
                  左侧：
                  {item.left
                    ? `${item.left.nickname ?? "未命名用户"}：${item.left.body}`
                    : "未观察到"}
                </p>
                <p>
                  右侧：
                  {item.right
                    ? `${item.right.nickname ?? "未命名用户"}：${item.right.body}`
                    : "未观察到"}
                </p>
              </RecordItem>
            ))}
          </RecordList>

          <Pagination
            page={page}
            total={d.total}
            onPageChange={setPage}
            label="快照比较分页"
          />

          <h5 className="text-body font-semibold">左侧审核版本</h5>
          <Reviews items={d.leftReviews} />
          <h5 className="text-body font-semibold">右侧审核版本</h5>
          <Reviews items={d.rightReviews} />
        </>
      ) : null}
    </div>
  );
}
