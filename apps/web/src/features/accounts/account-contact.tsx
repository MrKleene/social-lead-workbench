import { FormField } from '@/components/form-field';
import { SelectField, SelectOption } from '@/components/select-field';
import { Textarea } from '@/components/ui/textarea';
import { useDraftGuard } from "@/features/work/draft-guard";
import { Button } from "@/components/ui/button";
import { ErrorNotice } from "@/components/feedback";
import type { Lead } from "@/lib/types";
import { useAccountContact } from "./use-accounts";
import { outcomes } from "./types";
export function AccountContact({ lead }: { lead: Lead }) {
  const s = useAccountContact(lead.id),
    data = s.query.data,
    pending = s.mutation.isPending;
  useDraftGuard(!!s.note, "lead");
  if (s.query.isError)
    return (
      <p className="helper-text">
        账号联系账本尚不可用；需新版 API 与数据库迁移。
      </p>
    );
  if (!data) return null;
  const ledger = data.ledger,
    active = ledger?.attempts.find((a) =>
      ["ATTEMPTED", "UNKNOWN"].includes(a.outcome),
    );
  const firstDone = data.firstContactSimulated;
  const candidates =
    s.accounts.data?.accounts.filter(
      (a) =>
        a.platform === lead.identity.platform &&
        (!ledger || ledger.accountId === a.id),
    ) || [];
  return (
    <section className="account-contact">
      <h3>联系账号与去重（模拟）</h3>
      <p className="helper-text">
        真实发送禁用。去重不代表联系同意，保留人工审核和勿联系状态。
      </p>
      <ErrorNotice error={s.mutation.error || s.accounts.error} />
      {!data.identityReady && (
        <p role="status">缺少稳定平台用户 ID · 待人工核查，不按昵称合并。</p>
      )}
      {ledger && <p>固定联系账号：{ledger.account.label}</p>}
      {data.manuallyRecorded && (
        <p>存在人工联系记录：阻止重复首次联系；不属于平台确认成功。</p>
      )}
      <FormField>
        手动选择账号
        <SelectField
          aria-label="手动选择账号"
          value={s.accountId}
          onValueChange={(e) => s.setAccountId(e)}
          disabled={pending}
        >
          <SelectOption value="">请选择账号</SelectOption>
          {candidates.map((a) => (
            <SelectOption value={a.id} key={a.id} disabled={!a.available}>
              {a.label} · {a.occupied}/{a.dailyLimit}
              {!a.available ? " · 暂停" : ""}
            </SelectOption>
          ))}
        </SelectField>
      </FormField>
      <div className="action-row">
        <Button
          size="sm"
          disabled={
            pending ||
            !s.accountId ||
            !data.identityReady ||
            !data.reviewed ||
            data.doNotContact ||
            !!active ||
            (!firstDone && data.manuallyRecorded)
          }
          onClick={() => s.reserve(firstDone ? "FOLLOWUP" : "FIRST")}
        >
          {firstDone ? "预留原账号模拟跟进" : "预留模拟首次联系"}
        </Button>
      </div>
      {!data.reviewed && <p className="helper-text">须先完成人工审核。</p>}
      <FormField>
        核查 / 勿联系依据
        <Textarea
          aria-label="核查或勿联系依据"
          minLength={5}
          maxLength={500}
          value={s.note}
          onChange={(e) => s.setNote(e.target.value)}
        />
      </FormField>
      <div className="action-row">
        <Button
          size="sm"
          variant="outline"
          disabled={pending || s.note.trim().length < 5}
          onClick={() =>
            s.mutation.mutate({
              path: `/leads/${lead.id}/account-contact/block`,
              method: "PATCH",
              body: {
                blocked: !data.doNotContact,
                note: s.note,
                version: lead.version,
              },
            })
          }
        >
          {data.doNotContact ? "经人工核查解除勿联系" : "标为勿联系"}
        </Button>
      </div>
      {data.doNotContact && <p role="status">勿联系 · 已阻止新任务</p>}
      {active && (
        <div className="account-reconcile">
          <p>{outcomes[active.outcome]}</p>
          <div className="action-row">
            {(["UNKNOWN", "FAILED", "SIMULATED_SUCCESS"] as const).map(
              (outcome) => (
                <Button
                  key={outcome}
                  size="sm"
                  variant="outline"
                  disabled={pending || s.note.trim().length < 5}
                  onClick={() =>
                    s.mutation.mutate({
                      path: `/leads/${lead.id}/account-contact/${active.id}`,
                      method: "PATCH",
                      body: { outcome, note: s.note, version: active.version },
                    })
                  }
                >
                  {outcome === "UNKNOWN"
                    ? "标记未知"
                    : outcome === "FAILED"
                      ? "核查失败"
                      : "模拟确认成功"}
                </Button>
              ),
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={pending || s.note.trim().length < 5}
              onClick={() =>
                s.mutation.mutate({
                  path: `/leads/${lead.id}/account-contact/${active.id}`,
                  method: "PATCH",
                  body: {
                    outcome: "UNKNOWN",
                    note: s.note,
                    version: active.version,
                    pauseReason: "RATE_LIMITED",
                  },
                })
              }
            >
              模拟限流并暂停
            </Button>
          </div>
        </div>
      )}
      {ledger?.attempts.slice(0, 5).map((a) => (
        <p className="helper-text" key={a.id}>
          {a.day} · {a.kind === "FIRST" ? "首次" : "跟进"} ·{" "}
          {outcomes[a.outcome]}
          {a.resolutionNote && ` · ${a.resolutionNote}`}
        </p>
      ))}
    </section>
  );
}
