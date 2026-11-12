import { Button } from "@/components/ui/button";
import {
  SELECT_EMPTY,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckboxField } from "@/components/patterns/checkbox-field";
import { FormField } from "@/components/patterns/form-field";
import { Pagination } from "@/components/patterns/pagination";
import { RecordItem, RecordList } from "@/components/patterns/record-list";
import { SectionCard } from "@/components/patterns/section-card";
import { ErrorNotice } from "@/components/feedback";
import { useLocalData } from "./use-local-data";

export function LocalDataManagement() {
  const data = useLocalData();

  return (
    <SectionCard title="迁移与数据副本">
      {data.error ? (
        <ErrorNotice error={data.error} />
      ) : null}
      {data.notice ? (
        <p role="status" className="text-body text-muted-foreground">
          {data.notice}
        </p>
      ) : null}

      <div>
        <Button
          variant="outline"
          pending={data.importFile.isPending}
          onClick={() => data.importFile.mutate()}
        >
          选择旧业务导出文件
        </Button>
      </div>

      <RecordList>
        {data.copies.data?.map((copy) => (
          <RecordItem
            key={copy.id}
            title={`${copy.kind === "LEGACY_IMPORT" ? "旧数据导入" : "备份恢复"}${copy.active ? " · 当前使用" : ""}`}
            meta={new Date(copy.createdAt).toLocaleString()}
            action={
              <Button
                variant="outline"
                disabled={copy.active}
                onClick={() => data.selectCopy(copy)}
              >
                核对副本
              </Button>
            }
          />
        ))}
      </RecordList>

      {data.selected ? (
        <div className="flex flex-col gap-3 border-t pt-4">
          <h3 className="text-section font-semibold">切换前核对</h3>
          {data.selected.report.counts ? (
            <ul className="flex flex-col gap-1">
              {Object.entries(data.selected.report.counts).map(
                ([entity, count]) => (
                  <li
                    key={entity}
                    className="text-caption text-muted-foreground break-words"
                  >
                    {entity}：{count} 条
                  </li>
                ),
              )}
            </ul>
          ) : null}
          <CheckboxField
            checked={data.consent}
            onCheckedChange={data.setConsent}
          >
            确认切换当前业务数据。
          </CheckboxField>
          <div className="flex flex-wrap gap-3">
            <Button
              pending={data.activate.isPending}
              disabled={!data.consent}
              onClick={() => data.activate.mutate()}
            >
              备份当前数据并切换
            </Button>
          </div>
        </div>
      ) : null}

      {data.overview.data?.entities.length ? (
        <section
          aria-label="旧业务档案"
          className="flex flex-col gap-3 border-t pt-4"
        >
          <h3 className="text-section font-semibold">旧业务档案</h3>
          <FormField label="历史记录类型">
            <Select
              value={data.entity}
              onValueChange={(value) => data.selectEntity(value)}
            >
              <SelectTrigger aria-label="历史记录类型">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SELECT_EMPTY}>选择记录类型</SelectItem>
                {data.overview.data.entities.map((row) => (
                <SelectItem key={row.entity} value={row.entity}>
                {row.entity}（{row.count}）
                </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          {data.rows.isFetching && data.entity ? (
            <p className="text-body text-muted-foreground">正在读取档案…</p>
          ) : null}
          <ol className="max-h-136 list-decimal overflow-auto ps-5">
            {data.rows.data?.items.map((row) => (
              <li key={row.import_id + ":" + row.ordinal}>
                <pre className="max-w-full text-caption whitespace-pre-wrap break-words">
                  {JSON.stringify(row.record, null, 2)}
                </pre>
              </li>
            ))}
          </ol>
          <Pagination
            page={data.page}
            total={data.rows.data?.total ?? 0}
            onPageChange={data.setPage}
            label="历史档案分页"
          />
        </section>
      ) : null}

      <div className="flex flex-col gap-3 border-t pt-4">
        <h3 className="text-section font-semibold">恢复后安全核对</h3>
        {data.recovery.data ? (
          <>
            <p className="text-body leading-relaxed text-muted-foreground break-words">
              未知发送 {data.recovery.data.unknownSends} · 旧未知发送{" "}
              {data.recovery.data.unknownLegacy} · 未知模型请求{" "}
              {data.recovery.data.unknownModels} · 账号限制{" "}
              {data.recovery.data.accountRestrictions} · 联系去重／禁发记录{" "}
              {data.recovery.data.contactBlocks}
            </p>
            {data.recovery.data.holds.map((hold) => (
              <p key={hold.id} className="text-body break-words">
                {hold.id}：{hold.reason}
              </p>
            ))}
            {data.recovery.data.imports.map((mapping, index) => (
              <p
                key={index}
                className="text-caption leading-relaxed text-muted-foreground break-words"
              >
                历史映射：
                {Object.entries(mapping)
                  .map(([key, value]) => `${key} ${value}`)
                  .join("；")}
                。未映射记录保留在旧业务档案中。
              </p>
            ))}
          </>
        ) : null}

        <div>
          <Button
            variant="outline"
            pending={data.inspectRecovery.isPending}
            onClick={() => data.inspectRecovery.mutate()}
          >
            重新核对恢复状态
          </Button>
        </div>

        {data.recoveryPlan ? (
          data.recoveryPlan.resumable ? (
            <>
              <CheckboxField
                checked={data.recoveryConsent}
                onCheckedChange={data.setRecoveryConsent}
              >
                确认解除副本核对暂停。
              </CheckboxField>
              <div>
                <Button
                  disabled={!data.recoveryConsent}
                  pending={data.resume.isPending}
                  onClick={() => data.resume.mutate()}
                >
                  允许重新授权新任务
                </Button>
              </div>
            </>
          ) : (
            <p className="text-body text-muted-foreground">
              当前无需解除暂停。
            </p>
          )
        ) : null}
      </div>
    </SectionCard>
  );
}
