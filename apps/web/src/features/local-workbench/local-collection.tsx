import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { FilterField } from "@/components/patterns/filter-bar";
import { FormField } from "@/components/patterns/form-field";
import { AutoApplyStatus } from "@/features/work/auto-apply-status";
import { useConfirmDiscard, useDraftGuard } from "@/features/work/draft-guard";
import { useAutoApply } from "@/features/work/use-auto-apply";
import { ErrorNotice } from "@/components/feedback";
import { localApi, type CollectionPreferences } from "./local-api";
import { useLocalAction, useLocalRecords } from "./use-local-records";
import { useLocalPlatform } from "./use-local-platform";

/**
 * 本轮采集设置：关键词组、采集账号、笔记数、匹配方案。
 *
 * **只调设置，不含启动**。启动走页头的「开始自动化采集」（`StartCollectionDialog`），
 * 否则同一个「预览 → 授权 → 开始」会有两套实现。
 */
export function LocalCollectionPanel({
  credentialsAvailable,
}: {
  credentialsAvailable: boolean;
}) {
  const selection = useLocalRecords("workspaceSelection");
  const configs = useLocalRecords("configurations");
  const choose = useLocalAction("selectWorkspaceConfiguration");
  const id = selection.data?.configId ?? "";
  const preferences = useQuery({
    queryKey: ["local", "collectionPreferences", id],
    queryFn: () => localApi("collectionPreferences", { configId: id }),
    enabled: !!id,
  });
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const confirm = useConfirmDiscard();

  useDraftGuard(choose.isPending, "pending");

  const failure = choose.error ?? selection.error ?? preferences.error;

  const body = (
    <>
      <FilterField label="采集关键词配置">
        <Select
          value={id}
          disabled={choose.isPending || selection.isPending || saving}
          onValueChange={async (value) => {
          const configId = value;
          if (
          !dirty ||
          (await confirm("本组有未保存的设置，是否放弃修改并切换？"))
          ) {
          choose.mutate({ configId, version: selection.data?.version ?? 0 });
          }
          }}
        >
          <SelectTrigger aria-label="采集关键词配置">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SELECT_EMPTY}>选择采集关键词配置</SelectItem>
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

      {failure ? (
        <ErrorNotice error={failure} />
      ) : null}

      {id && preferences.data ? (
        <CollectionSetup
          key={id + ":" + reload}
          preferences={preferences.data}
          credentialsAvailable={credentialsAvailable}
          onSaving={setSaving}
          onDirty={setDirty}
          reload={() =>
            void preferences.refetch().then(() => setReload((value) => value + 1))
          }
        />
      ) : id ? (
        <p className="text-body text-muted-foreground">正在读取…</p>
      ) : (
        <p className="text-body text-muted-foreground">未选择关键词组</p>
      )}
    </>
  );

  return <div className="flex flex-col gap-3">{body}</div>;
}

function CollectionSetup({
  preferences,
  credentialsAvailable,
  reload,
  onSaving,
  onDirty,
}: {
  preferences: CollectionPreferences;
  credentialsAvailable: boolean;
  reload: () => void;
  onSaving: (value: boolean) => void;
  onDirty: (value: boolean) => void;
}) {
  const platform = useLocalPlatform();
  const client = useQueryClient();
  const version = useRef(preferences.version);
  const [batchText, setBatchText] = useState(String(preferences.batchLimit));
  const [numberError, setNumberError] = useState("");

  const auto = useAutoApply(
    {
      accountId: preferences.accountId,
      batchLimit: preferences.batchLimit,
      policyIds: preferences.policyIds,
    },
    async (value) => {
      const saved = await localApi("saveCollectionPreferences", {
        configId: preferences.configId,
        version: version.current,
        ...value,
      });
      version.current = saved.version;
      void client.invalidateQueries({
        queryKey: ["local", "collectionPreferences", preferences.configId],
      });
      return {
        accountId: saved.accountId,
        batchLimit: saved.batchLimit,
        policyIds: saved.policyIds,
      };
    },
  );

  useEffect(() => {
    onSaving(auto.busy);
    return () => onSaving(false);
  }, [auto.busy, onSaving]);

  useEffect(() => {
    onDirty(!!auto.error || !!numberError);
    return () => onDirty(false);
  }, [auto.error, numberError, onDirty]);

  useDraftGuard(auto.busy, "pending");
  useDraftGuard(!!auto.error || !!numberError, "modal");

  const account = platform.accounts.data?.accounts.find(
    (item) => item.id === auto.value.accountId,
  );
  const change = (next: typeof auto.value) => {
    auto.change(next);
  };

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      {platform.error ? (
        <ErrorNotice error={platform.error} />
      ) : null}
      {platform.notice ? (
        <p role="status" className="text-body text-muted-foreground">
          {platform.notice}
        </p>
      ) : null}
      {preferences.source === "LEGACY" ? (
        <p className="text-body text-warning">已导入旧选择，请重新核验。</p>
      ) : null}

      <FormField label="采集账号">
        <Select
          value={auto.value.accountId ?? ""}
          onValueChange={(value) =>
          change({ ...auto.value, accountId: value || null })
          }
        >
          <SelectTrigger aria-label="采集账号">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SELECT_EMPTY}>选择采集账号</SelectItem>
            {auto.value.accountId &&
            !platform.accounts.data?.accounts.some(
            (item) => item.id === auto.value.accountId,
            ) ? (
            <SelectItem value={auto.value.accountId}>
            原账号不可用，请重新选择
            </SelectItem>
            ) : null}
            {platform.accounts.data?.accounts.map((item) => (
            <SelectItem key={item.id} value={item.id}>
            {item.name}
            {item.state !== "VERIFIED" || !item.hasSession
            ? " · 需重新登录"
            : ""}
            </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField label="一轮采集笔记帖子数量" error={numberError}>
        <Input
          aria-label="一轮采集笔记帖子数量"
          type="number"
          min={1}
          max={10}
          value={batchText}
          onChange={(event) => {
            const value = event.target.value;
            setBatchText(value);
            if (
              !value ||
              !Number.isInteger(Number(value)) ||
              Number(value) < 1 ||
              Number(value) > 10
            ) {
              setNumberError("笔记数必须是 1–10 的整数。");
              return;
            }
            setNumberError("");
            auto.change({ ...auto.value, batchLimit: Number(value) }, 500);
          }}
          onBlur={auto.flush}
        />
      </FormField>

      <AutoApplyStatus {...auto} />

      {auto.busy ? (
        <p role="status" className="text-body text-muted-foreground">
          正在保存本组偏好…
        </p>
      ) : null}
      {auto.error ? (
        <div>
          <Button variant="outline" onClick={reload}>
            重新读取
          </Button>
        </div>
      ) : null}
    </div>
  );
}
