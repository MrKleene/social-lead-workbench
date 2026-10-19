import { useState, useRef, FormEvent } from "react";
import { CheckCircle2, UserRound, CalendarClock, MessageSquare, FileText, ListChecks } from "lucide-react";
import { useLead } from "./use-leads";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { ErrorNotice } from "@/components/feedback";
import { formatDate, statusLabel, Lead } from "@/lib/types";
export function DetailForms({
  lead,
  state,
  admin,
}: {
  lead: Lead;
  state: ReturnType<typeof useLead>;
  admin: boolean;
}) {
  const [saveCount, setSaveCount] = useState(0);
  const [ownerDraft, setOwner] = useState<string | undefined>(),
    [note, setNote] = useState(""),
    [content, setContent] = useState(""),
    [statusDraft, setStatus] = useState<Lead["status"] | undefined>(),
    [taskTitle, setTaskTitle] = useState(""),
    [success, setSuccess] = useState("");
  const owner = ownerDraft ?? lead.owner?.id ?? "";
  const status = statusDraft ?? lead.status;
  const nextInput = useRef<HTMLInputElement>(null);
  const [draftVersion, setDraftVersion] = useState<number | null>(null);
  const beginEdit = () => setDraftVersion((v) => v ?? lead.version);
  const run = (path: string, method: string, body: unknown, message: string) =>
    state.mutation.mutate(
      { path, method, body },
      {
        onSuccess: () => {
          setSaveCount(v => v + 1);
          setSuccess(message);
          setDraftVersion(null);
          setOwner(undefined);
          setStatus(undefined);
          setContent("");
          setNote("");
          if (path === "/tasks") setTaskTitle("");
        },
      },
    );
  const followup = (e: FormEvent) => {
    e.preventDefault();
    run(
      `/leads/${lead.id}/followups`,
      "POST",
      {
        content,
        nextFollowUpAt: nextInput.current?.value
          ? new Date(nextInput.current.value).toISOString()
          : null,
        status,
        version: draftVersion ?? lead.version,
      },
      "跟进已保存",
    );
  };
  return (
    <div className="detail-sections">
      <div className="detail-facts">
        <div><UserRound size={16} /><span>当前负责人<strong>{lead.owner?.name || "待分配"}</strong></span></div>
        <div><CalendarClock size={16} /><span>下次跟进<strong>{formatDate(lead.nextFollowUpAt)}</strong></span></div>
      </div>
      <ErrorNotice error={state.mutation.error} />
      {success && (
        <p role="status" key={saveCount} className="success-note">
          <CheckCircle2 size={17} />{success}
        </p>
      )}
      <div className="detail-panel">
      <section>
        <h3><FileText size={16} />需求依据</h3>
        {lead.identity.comments?.map((comment) => (
          <blockquote key={comment.id}>
            <div className="source-flags">{comment.parentPlatformCommentId&&<span className="soft-tag">楼中楼回复</span>}{comment.matches?.map((m,i)=><span className="soft-tag" key={i}>规则 · {m.classification==='POSSIBLE_HELP'?'可能求助':'仅专业相关'} · {m.keywords.join('、')}{m.isBaseline?' · 基线':''}</span>)}</div>
            <p>{comment.originalText}</p>
            <footer>
              {comment.post.title}
              <br />
              帖子 {comment.post.platformPostId} · 评论{" "}
              {comment.platformCommentId}
            </footer>
          </blockquote>
        ))}
        <p className="helper-text">
          专业相关和明确求助均不代表同意联系。此处确认仅记录人工核验，不启用发送。
        </p>
        {lead.reviewedAt ? (
          <div className="review-record">
            <strong>已人工核验 · {formatDate(lead.reviewedAt)}</strong>
            <p>{lead.reviewNote}</p>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(
                `/leads/${lead.id}/review`,
                "PATCH",
                { note, version: draftVersion ?? lead.version },
                "人工核验已记录",
              );
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="review">人工核验说明</FieldLabel>
                <Textarea
                  id="review"
                  value={note}
                  onChange={(e) => {
                    beginEdit();
                    setNote(e.target.value);
                  }}
                  minLength={5}
                  maxLength={2000}
                  required
                  placeholder="记录明确求助的原文依据与判断，不将专业相关视为同意联系"
                />
              </Field>
              <Button variant="outline" disabled={state.mutation.isPending}>
                保存人工核验
              </Button>
            </FieldGroup>
          </form>
        )}
      </section>
      <section>
        <h3><UserRound size={16} />负责人分配</h3>
        {admin && <ErrorNotice error={state.usersError} />}
        {admin && !state.usersLoading && !state.usersError && state.users.length === 0 && <p className="helper-text">尚无可分配销售，请由管理员在本机创建销售账号。</p>}
        {admin ? (
          <form
            className="owner-form"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                `/leads/${lead.id}/owner`,
                "PATCH",
                {
                  ownerId: owner || null,
                  version: draftVersion ?? lead.version,
                },
                "负责人已更新",
              );
            }}
          >
            <label className="sr-only" htmlFor="owner">
              销售负责人
            </label>
            <select
              id="owner"
              value={owner}
              onChange={(e) => {
                beginEdit();
                setOwner(e.target.value);
              }}
            >
              <option value="">未分配</option>
              {state.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <Button
              disabled={
                state.mutation.isPending || state.usersLoading || !!state.usersError || owner === (lead.owner?.id || "")
              }
            >
              分配 / 转交
            </Button>
          </form>
        ) : (
          <p>{lead.owner?.name || "未分配"}</p>
        )}
        <p className="helper-text">
          转交后，原负责人立即失去该线索与关联任务的访问权限。
        </p>
      </section>
      </div>
      <div className="detail-panel">
      <section>
        <h3><MessageSquare size={16} />添加跟进</h3>
        <form onSubmit={followup}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="followup">跟进记录</FieldLabel>
              <Textarea
                id="followup"
                value={content}
                onChange={(e) => {
                  beginEdit();
                  setContent(e.target.value);
                }}
                required
                maxLength={4000}
                placeholder="记录人工沟通或核验情况，不在此发送平台消息"
              />
            </Field>
            <div className="form-pair">
              <Field>
                <FieldLabel htmlFor="next">下次跟进时间</FieldLabel>
                <Input
                  id="next"
                  type="datetime-local"
                  ref={nextInput}
                  key={lead.nextFollowUpAt || "none"}
                  defaultValue={
                    lead.nextFollowUpAt ? localDate(lead.nextFollowUpAt) : ""
                  }
                  onInput={beginEdit}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="stage">线索阶段</FieldLabel>
                <select
                  id="stage"
                  value={status}
                  onChange={(e) => {
                    beginEdit();
                    setStatus(e.target.value as Lead["status"]);
                  }}
                >
                  {Object.entries(statusLabel).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Button disabled={state.mutation.isPending}>
              {state.mutation.isPending ? "保存中…" : "保存跟进"}
            </Button>
          </FieldGroup>
        </form>
      </section>
      <section>
        <h3>
          跟进时间线{" "}
          <span className="muted">{lead.followups?.length || 0}</span>
        </h3>
        <div className="timeline">
          {lead.followups?.length ? (
            lead.followups.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.author.name}</strong>
                  <time>{formatDate(item.createdAt)}</time>
                </div>
                <p>{item.content}</p>
                {item.nextFollowUpAt && (
                  <small>下次跟进 · {formatDate(item.nextFollowUpAt)}</small>
                )}
              </article>
            ))
          ) : (
            <p className="muted">尚未添加跟进记录。</p>
          )}
        </div>
      </section>
      </div>
      <div className="detail-panel">
      <section>
        <h3><ListChecks size={16} />创建人工任务</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(
              "/tasks",
              "POST",
              {
                leadId: lead.id,
                title: taskTitle,
                dueAt: nextInput.current?.value
                  ? new Date(nextInput.current.value).toISOString()
                  : null,
              },
              "任务已创建",
            );
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="task">任务名称</FieldLabel>
              <Input
                id="task"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                required
                maxLength={200}
                placeholder="例如：核对需求范围"
              />
            </Field>
            <p className="helper-text">
              使用上方跟进表单中的下次跟进时间作为任务到期时间。
            </p>
            <Button variant="outline" disabled={state.mutation.isPending}>
              创建任务
            </Button>
          </FieldGroup>
        </form>
      </section>
      </div>
    </div>
  );
}
function localDate(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
