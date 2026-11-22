import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormField } from "@/components/patterns/form-field";
import { SectionCard } from "@/components/patterns/section-card";
import { ErrorNotice } from "@/components/feedback";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useDraftGuard } from "@/features/work/draft-guard";
import { localApi } from "./local-api";
import { useLocalWorkbench } from "./use-local-workbench";

/**
 * 模型配置：只有两件事——选模型、存 API Key。
 * 审核授权随 Key 自动建立（型号与价格版本取自受控目录），不再要求用户二次确认。
 * 一次保存先写密钥再写型号，避免「密钥没存但型号保存了」这种半状态。
 */
export function LocalModelSettings({ keyConfigured }: { keyConfigured: boolean }) {
  const client = useQueryClient();
  const workbench = useLocalWorkbench();
  const info = useQuery({
    queryKey: ["local", "workflow"],
    queryFn: () => localApi("workflowOverview"),
  });
  const [model, setModel] = useState("");
  const [key, setKey] = useState("");

  useDraftGuard(!!key, "modal");

  const save = useMutation({
    mutationFn: (input: unknown) => localApi("saveModelProfile", input),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["local"] }),
  });

  const data = info.data;
  const selected = data?.choices.find(
    (choice) => choice.id === (model || data.model?.model || data.choices[0]?.id),
  );
  const error = info.error ?? save.error ?? workbench.key.error;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    try {
      if (key) await workbench.key.mutateAsync(key);
      await save.mutateAsync({
        version: data?.model?.version ?? 0,
        model: selected.id,
      });
      setKey("");
    } catch {
      // 错误由 ErrorNotice 显示；已输入的密钥保留，方便直接重试。
    }
  };

  return (
    <SectionCard title="评论审核模型配置">
      {error ? <ErrorNotice error={error} /> : null}

      {data?.modelPaused ? (
        <Alert variant="warning">
          <AlertDescription>
            存在结果未知的模型请求，须核对后才能继续。
          </AlertDescription>
        </Alert>
      ) : null}

      <form className="flex max-w-xl flex-col gap-4" onSubmit={submit}>
        <FormField label="模型选择">
          <Select value={selected?.id ?? ""} onValueChange={setModel}>
            <SelectTrigger aria-label="模型选择">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data?.choices.map((choice) => (
                <SelectItem key={choice.id} value={choice.id}>
                  {choice.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label="模型 API Key">
          <Input
            type="password"
            aria-label="模型 API Key"
            value={key}
            autoComplete="off"
            placeholder={keyConfigured ? "已保存" : undefined}
            onChange={(event) => setKey(event.target.value)}
          />
        </FormField>

        <div className="flex flex-wrap gap-4">
          <Button
            type="submit"
            pending={save.isPending || workbench.key.isPending}
            disabled={
              (!keyConfigured && !key) ||
              !data?.capabilities.review ||
              !workbench.status.data?.credentialsAvailable
            }
          >
            保存
          </Button>
        </div>

        {!workbench.status.data?.credentialsAvailable ? (
          <p className="text-caption text-muted-foreground">系统凭据保护未就绪</p>
        ) : null}
        {data && !data.capabilities.review ? (
          <p className="text-caption text-muted-foreground">模型请求未启用</p>
        ) : null}
      </form>
    </SectionCard>
  );
}
