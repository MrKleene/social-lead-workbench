import { boundedReadLabels, safeBoundedReadReport } from "@crm/contracts";
import { Disclosure } from "@/components/disclosure";
import { SectionCard } from "@/components/patterns/section-card";
import { coverageProgressSummary } from "./coverage-progress-summary";
import { coverageReadingSummary } from "./coverage-reading-summary";

type Report = NonNullable<ReturnType<typeof safeBoundedReadReport>>;

/**
 * 读取范围正文（不含卡片外壳）。
 *
 * 抽出来是因为它有两个出口：`BoundedReadEvidence`（单独一张卡）和
 * `BoundedReadWindows`（多窗折叠在同一张卡里）。共用一个正文可以保证两处
 * 文案永远一致，也避免卡片套卡片。
 */
function BoundedReadBody({ report }: { report: Report }) {
  const retained = report.retained;
  const progress = coverageProgressSummary(report);

  return (
    <div className="flex flex-col gap-2">
      {report.window ? (
        <p className="text-body">读取窗口 {report.window}</p>
      ) : null}
      <p className="text-body">{coverageReadingSummary(report)}</p>
      <p className="text-body">
        {boundedReadLabels[report.reason]}。不代表平台全部评论。
      </p>
      {progress?.counts ? (
        <p className="text-body">{progress.counts}</p>
      ) : null}
      {progress?.growth ? (
        <p className="text-body">{progress.growth}</p>
      ) : null}
      <p className="text-body">{progress?.actions}</p>
      {progress?.boundary ? (
        <p className="text-body">{progress.boundary}</p>
      ) : null}
      <p className="text-body">
        主评论：{boundedReadLabels[report.rootStop]}；回复：
        {boundedReadLabels[report.replyStop]}。
      </p>
      <p className="text-body">
        {report.chunkSummary
          ? `本次页面已加载 ${report.chunkSummary.roots} 条主评论、${report.chunkSummary.replies} 条回复`
          : retained.loaded
            ? `本次保留 ${retained.loaded.roots} 条主评论、${retained.loaded.replies} 条回复`
            : "保留数量未知"}
        {report.excludedRoots
          ? `；${report.excludedRoots} 条范围外主评论未纳入`
          : ""}
        。
      </p>

      {retained.relations ? (
        <Disclosure title="回复目标字段检查">
          <div className="flex flex-col gap-2">
            <p className="text-body">
              检查 {retained.relations.scanned} 个节点，
              {retained.relations.fields.length} 项结构记录
              {retained.relations.limited ? "（已到诊断上限）" : ""}。
            </p>
            {retained.relations.fields.map((field, index) => (
              <p key={index} className="text-body break-words">
                节点 #{field.ordinal} · {field.path} · {field.shape}
                {field.commentOrdinals.length
                  ? ` · 对应评论节点 ${field.commentOrdinals.map((x) => "#" + x).join("、")}`
                  : ""}
                {field.userMatches
                  ? ` · 对应 ${field.userMatches} 个已加载作者记录`
                  : ""}
              </p>
            ))}
          </div>
        </Disclosure>
      ) : null}

      <Disclosure title="各层回复范围">
        <div className="flex flex-col gap-2">
          {retained.groups.map((group) => (
            <p key={group.ordinal} className="text-body break-words">
              节点 #{group.ordinal}
              {group.parent !== null ? ` · 父节点 #${group.parent}` : ""}
              ：声明 {group.declared.value ?? "未知"}，已加载{" "}
              {group.loaded.value ?? "未知"}
            </p>
          ))}
        </div>
      </Disclosure>
    </div>
  );
}

/** 单轮读取范围。独立成卡。 */
export function BoundedReadEvidence({ value }: { value: unknown }) {
  const report = safeBoundedReadReport(value);
  if (!report) return null;
  return (
    <SectionCard title="本轮读取范围">
      <BoundedReadBody report={report} />
    </SectionCard>
  );
}

/**
 * 多窗读取记录。2–8 次分窗，每次一个 `Disclosure`——8 段完整正文默认展开
 * 会把页面拉得很长。
 */
export function BoundedReadWindows({ values }: { values: unknown }) {
  if (!Array.isArray(values) || values.length < 2 || values.length > 8) {
    return null;
  }
  const reports = values.map(safeBoundedReadReport);
  if (reports.some((report) => !report)) return null;

  return (
    <SectionCard title={`分窗读取记录（${reports.length} 次）`}>
      {reports.map((report, index) => (
        <Disclosure key={index} title={`第 ${index + 1} 次`}>
          <BoundedReadBody report={report!} />
        </Disclosure>
      ))}
    </SectionCard>
  );
}
