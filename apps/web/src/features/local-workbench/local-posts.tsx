import { useState } from "react";
import { safeRunCoverage } from "@crm/contracts";
import { Disclosure } from "@/components/disclosure";
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
import { EmptyState } from "@/components/patterns/empty-state";
import { FormField } from "@/components/patterns/form-field";
import { Pagination } from "@/components/patterns/pagination";
import { RecordItem, RecordList } from "@/components/patterns/record-list";
import { BoundedReadEvidence, BoundedReadWindows } from "@/features/collection/bounded-read-evidence";
import { ImageDiagnostics } from "@/features/collection/image-diagnostics";
import { ErrorNotice } from "@/components/feedback";
import { LocalPostComparison } from "./local-post-comparison";
import { LocalReviewDialog } from "./local-review-dialog";
import { useLocalPosts } from "./use-local-posts";

export function LocalPosts({
  runId,
  onClose,
}: {
  runId: string;
  onClose: () => void;
}) {
  const posts = useLocalPosts(runId);
  const [reviewId, setReview] = useState<string | null>(null);
  const [readId, setRead] = useState("");
  const [resume, setResume] = useState(false);
  const [configId, setConfig] = useState("");
  const [accountId, setAccount] = useState("");
  const [policyIds, setPolicies] = useState<string[]>([]);

  const reset = () => {
    posts.setPlan(null);
    posts.setConsent(false);
  };
  const searchPlan = posts.progress.data
    ? safeRunCoverage(posts.progress.data.run.coverage)?.searchPlan
    : undefined;

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-section font-semibold">本轮笔记与历史恢复</h3>
        <Button variant="outline" onClick={onClose}>
          收起笔记
        </Button>
      </div>

      {searchPlan?.length ? (
        <p className="break-words text-body text-muted-foreground">
          本轮关键词：
          {searchPlan
            .map((item) => item.keyword + "（" + item.found + " 篇）")
            .join("、")}
        </p>
      ) : null}

      {posts.error ? (
        <ErrorNotice error={posts.error} />
      ) : null}
      {posts.notice ? (
        <p role="status" className="text-body text-muted-foreground">
          {posts.notice}
        </p>
      ) : null}

      {posts.posts.data?.length ? (
        <RecordList>
          {posts.posts.data.map((post) => (
            <RecordItem
              key={post.id}
              title={post.title || "无标题笔记"}
              meta={`${post.comments} 条评论 · ${post.coverage === "COMPLETE" ? "完整" : post.readAvailable ? "待补读" : "完整性未确认"} · ${post.observedAt ? new Date(post.observedAt).toLocaleString() : "历史时间未知"}`}
              action={
                <>
                  <Button
                    variant="outline"
                    onClick={() => posts.selectHistory(post.id)}
                  >
                    查看原文与评论
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!post.independentReady}
                    onClick={() => setReview(post.id)}
                  >
                    独立审核历史原文
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!post.readAvailable}
                    onClick={() => {
                      setRead(post.id);
                      setResume(false);
                      reset();
                    }}
                  >
                    重新读取此笔记
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!post.readAvailable || !post.resumeReady}
                    onClick={() => {
                      setRead(post.id);
                      setResume(true);
                      reset();
                    }}
                  >
                    按已验证检查点续读
                  </Button>
                </>
              }
            >
              {!post.readAvailable ? (
                <p className="text-caption">来源凭据不可用，请用关键词重新查找。</p>
              ) : null}
            </RecordItem>
          ))}
        </RecordList>
      ) : (
        <EmptyState title="本轮还没有保存的笔记。" />
      )}

      {posts.historyId && posts.history.data ? (
        <div className="flex flex-col gap-3 border-t pt-4">
          <h3 className="text-section font-semibold break-words">
            {posts.history.data.post.title || "历史笔记原文"}
          </h3>
          <p className="text-body leading-relaxed whitespace-pre-wrap break-words">
            {posts.history.data.post.body}
          </p>

          <Disclosure title="查看保存的读取与图片诊断">
            <div className="flex flex-col gap-3">
              <ImageDiagnostics value={posts.history.data.post.imageDiagnostics} />
              <BoundedReadEvidence value={posts.history.data.post.boundedRead} />
              <BoundedReadWindows
                values={posts.history.data.post.boundedReadWindows}
              />
            </div>
          </Disclosure>

          <ol className="divide-y">
            {posts.history.data.comments.items.map((comment) => (
              <li key={comment.id} className="flex flex-col gap-1 py-4">
                <p className="text-caption text-muted-foreground break-words">
                  {comment.nickname || "未命名用户"}
                  {comment.parent_id ? " · 楼中回复" : ""} ·{" "}
                  {comment.published_at
                    ? new Date(comment.published_at).toLocaleString()
                    : "评论发布时间未记录"}
                </p>
                <p className="text-body leading-relaxed break-words">
                  {comment.body}
                </p>
                <Disclosure title="查看头像诊断">
                  <ImageDiagnostics value={comment.image_diagnostics} />
                </Disclosure>
              </li>
            ))}
          </ol>

          <Pagination
            page={posts.historyPage}
            total={posts.history.data.comments.total}
            onPageChange={posts.setHistoryPage}
            label="历史评论分页"
          />

          <LocalPostComparison
            key={posts.historyId}
            postId={posts.historyId}
            versions={posts.history.data.versions}
          />

          <h4 className="text-body font-semibold">同一笔记的历史快照</h4>
          <div className="flex flex-wrap gap-3">
            {posts.history.data.versions.map((version) => (
              <Button
                key={version.id}
                variant="outline"
                onClick={() => posts.selectHistory(version.id)}
              >
                {new Date(version.created_at).toLocaleString()} ·{" "}
                {version.reason === "LEGACY_HISTORY_READ_ONLY"
                  ? "旧档案"
                  : version.coverage === "COMPLETE"
                    ? "完整"
                    : "部分或未知"}
              </Button>
            ))}
            <Button variant="outline" onClick={() => posts.selectHistory(null)}>
              收起原文
            </Button>
          </div>
        </div>
      ) : null}

      {reviewId ? (
        <LocalReviewDialog
          key={reviewId}
          independent
          runId={runId}
          postId={reviewId}
          onClose={() => setReview(null)}
        />
      ) : null}

      {readId ? (
        <div className="flex flex-col gap-3 border-t pt-4">
          <h3 className="text-section font-semibold">
            {resume ? "新轮次继续验证历史检查点" : "单笔记重新读取"}
          </h3>
          <FormField label="本次配置">
            <Select
              value={configId}
              onValueChange={(value) => {
              setConfig(value);
              reset();
              }}
            >
              <SelectTrigger aria-label="单笔记配置">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SELECT_EMPTY}>选择配置</SelectItem>
                {posts.configs.data
                ?.filter((config) => config.kind === "KEYWORDS")
                .map((config) => (
                <SelectItem key={config.id} value={config.id}>
                {config.name}
                </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="读取账号">
            <Select
              value={accountId}
              onValueChange={(value) => {
              setAccount(value);
              reset();
              }}
            >
              <SelectTrigger aria-label="单笔记读取账号">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SELECT_EMPTY}>选择已登录账号</SelectItem>
                {posts.accounts.data?.accounts
                .filter((item) => item.state === "VERIFIED" && item.hasSession)
                .map((item) => (
                <SelectItem key={item.id} value={item.id}>
                {item.name}
                </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {posts.workflow.data?.policies
            .filter((rule) => rule.enabled)
            .map((rule) => (
              <CheckboxField
                key={rule.id}
                checked={policyIds.includes(rule.id)}
                onCheckedChange={(checked) => {
                  setPolicies((previous) =>
                    checked
                      ? [...previous, rule.id]
                      : previous.filter((id) => id !== rule.id),
                  );
                  reset();
                }}
              >
                {rule.name}
              </CheckboxField>
            ))}

          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              disabled={!configId || !accountId}
              pending={posts.preview.isPending}
              onClick={() =>
                posts.preview.mutate({
                  savedPostId: readId,
                  configId,
                  accountId,
                  policyIds,
                  resume,
                })
              }
            >
              预览单笔记读取
            </Button>
          </div>

          {posts.plan ? (
            <div className="flex flex-col gap-3 border-t pt-4">
              <p className="text-body leading-relaxed break-words">
                {posts.plan.title} · {posts.plan.accountName} ·{" "}
                {posts.plan.reviewTargets} 个评论匹配规则
              </p>
              <CheckboxField
                checked={posts.consent}
                onCheckedChange={posts.setConsent}
              >
                {resume
                  ? "授权在新轮次续读此检查点，重新核对历史锚点，保留原轮次。"
                  : "授权读取此笔记一次，保留原历史。"}
              </CheckboxField>
              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={!posts.consent}
                  pending={posts.read.isPending}
                  onClick={() => posts.read.mutate()}
                >
                  授权单笔记读取
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
