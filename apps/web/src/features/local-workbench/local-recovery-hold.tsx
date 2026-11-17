import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/patterns/checkbox-field";
import { SectionCard } from "@/components/patterns/section-card";
import { ErrorNotice } from "@/components/feedback";
import { useRecovery } from "./use-recovery";

export function LocalRecoveryCheck() {
  const data = useRecovery();

  return (
    <SectionCard title="恢复核对">
      {data.error ? <ErrorNotice error={data.error} /> : null}
      {data.notice ? (
        <p role="status" className="text-body text-muted-foreground">
          {data.notice}
        </p>
      ) : null}

      {data.recovery.data ? (
        <p className="text-body leading-relaxed text-muted-foreground break-words">
          未知发送 {data.recovery.data.unknownSends} · 旧未知发送{" "}
          {data.recovery.data.unknownLegacy} · 未知模型请求{" "}
          {data.recovery.data.unknownModels} · 账号限制{" "}
          {data.recovery.data.accountRestrictions} · 联系去重／禁发记录{" "}
          {data.recovery.data.contactBlocks}
        </p>
      ) : null}

      <div>
        <Button
          variant="outline"
          pending={data.inspect.isPending}
          onClick={() => data.inspect.mutate()}
        >
          重新核对恢复状态
        </Button>
      </div>

      {data.plan ? (
        data.plan.resumable ? (
          <>
            <CheckboxField
              checked={data.consent}
              onCheckedChange={data.setConsent}
            >
              确认解除副本核对暂停。
            </CheckboxField>
            <div>
              <Button
                disabled={!data.consent}
                pending={data.resume.isPending}
                onClick={() => data.resume.mutate()}
              >
                允许重新授权新任务
              </Button>
            </div>
          </>
        ) : (
          <p className="text-body text-muted-foreground">当前无需解除暂停。</p>
        )
      ) : null}
    </SectionCard>
  );
}
