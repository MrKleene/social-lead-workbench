import type { AvatarSourceDiagnostic, ImageReason } from "@crm/contracts";
import { safeImageDiagnostics } from "@crm/contracts";
import { Disclosure } from "@/components/disclosure";
import { DetailItem, DetailList } from "@/components/patterns/detail-sheet";
import { SectionCard } from "@/components/patterns/section-card";

const labels: Record<ImageReason, string> = {
  NOT_RETURNED: "字段未返回",
  EMPTY: "空值",
  UNSUPPORTED_FORMAT: "格式不支持",
  URL_FORMAT: "网址格式不支持",
  PROTOCOL: "非允许协议",
  HOST: "非允许域名",
  URL_COMPONENTS: "含查询或其他受限信息",
  PATH: "非允许路径",
  ACCEPTED: "已接受",
};

const coverLabels = {
  searchCover: "搜索封面",
  detailCover: "详情首图",
  authorAvatar: "头像",
} as const;

const shapes: Record<string, string> = {
  MISSING: "未返回",
  NULL: "null",
  EMPTY_STRING: "空字符串",
  WHITESPACE_STRING: "空白字符串",
  NONEMPTY_STRING: "非空字符串",
  OBJECT: "对象",
  ARRAY: "数组",
  BOOLEAN: "布尔值",
  NUMBER: "数字",
  INVALID: "无效",
};

const transitions: Record<string, string> = {
  EMPTY_AFTER_DECODE: "固定头像转换后为空",
  NONEMPTY_PRESERVED: "固定头像非空且保留",
  WIRE_CHANGED: "序列化前后不一致",
  USER_DECODE_FAILED: "用户结构转换失败",
  WIRE_FAILED: "序列化失败",
  USER_UNAVAILABLE: "无可用用户对象",
  COMMENT_SHAPE_INVALID: "评论结构无效",
};

const restrictionLabels: Record<string, string> = {
  query: "查询参数",
  fragment: "片段",
  userinfo: "网址凭据",
  port: "显式端口",
  encodedPath: "路径编码",
  encodedElsewhere: "其他位置编码",
};

const queryPolicies: Record<string, string> = {
  NONE: "无查询段",
  IMAGE_VIEW2_THUMBNAIL: "受控缩略格式",
  UNSUPPORTED: "查询格式不支持",
};

const filteredReasons: Record<string, string> = {
  INVALID_KEY: "名称格式超限",
  SENSITIVE_KEY: "敏感字段名",
  UNLISTED_IMAGE_KEY: "未列入白名单的图片字段",
};

/** 图片字段诊断：解释「为什么这条记录没有封面/头像」。 */
export function ImageDiagnostics({ value }: { value: unknown }) {
  const data = safeImageDiagnostics(value);
  if (!data || !Object.keys(data).length) {
    return (
      <p className="text-body text-muted-foreground">
        此次记录没有图片诊断，无法追溯缺图原因。
      </p>
    );
  }

  return (
    <SectionCard title="图片字段诊断">
      <DetailList>
        {(["searchCover", "detailCover", "authorAvatar"] as const).map((key) => {
          const diagnostic = data[key];
          if (!diagnostic) return null;
          return (
            <DetailItem key={key} label={coverLabels[key]}>
              {diagnostic.shape === "NOT_RETURNED"
                ? "来源字段未返回"
                : diagnostic.shape === "EMPTY"
                  ? "来源为空"
                  : diagnostic.shape === "UNSUPPORTED"
                    ? "来源格式不支持"
                    : `收到 ${diagnostic.fieldCount} 个候选字段`}
              {diagnostic.outcomes.length
                ? " · " +
                  diagnostic.outcomes
                    .map((outcome) => `${labels[outcome.reason]} ${outcome.count}`)
                    .join("，")
                : ""}
              {diagnostic.truncated ? " · 仅检查前 8 个附加候选" : ""}
              {diagnostic.urlClasses?.length ? (
                <p className="mt-1 text-caption text-muted-foreground">
                  {diagnostic.urlClasses
                    .map(
                      (entry) =>
                        `${entry.protocol} / ${
                          entry.host === "ALLOWED"
                            ? "域名在允许列表"
                            : entry.host === "OTHER"
                              ? "域名不在允许列表"
                              : "无可识别域名"
                        } ${entry.count}`,
                    )
                    .join("；")}
                  {diagnostic.httpsUpgrades
                    ? ` · ${diagnostic.httpsUpgrades} 个候选已安全升级 HTTPS`
                    : ""}
                </p>
              ) : null}
            </DetailItem>
          );
        })}
      </DetailList>
      {data.avatarSource ? (
        <AvatarSourceEvidence value={data.avatarSource} />
      ) : null}
    </SectionCard>
  );
}

/**
 * MCP 转换前的头像来源结构。
 *
 * 只在 v2 才有逐候选明细；v1 只有转换结果计数。两种结构差异大，用同一个
 * `Disclosure` 收起来——它是排障用的，正常使用不会展开。
 */
function AvatarSourceEvidence({ value }: { value: AvatarSourceDiagnostic }) {
  return (
    <Disclosure title={`MCP 转换前结构 · v${value.version}`}>
      <div className="flex flex-col gap-2">
        <p className="text-body">
          主评论 {value.roots} · 回复 {value.replies}
          {value.truncated ? " · 诊断已截取" : ""} ·{" "}
          {value.status === "OK" ? "检查完成" : value.status}
        </p>

        {value.version === 2 ? (
          <>
            <DetailList>
              {value.candidates.map((candidate) => (
                <DetailItem
                  key={[
                    candidate.role,
                    candidate.name,
                    candidate.shape,
                    candidate.protocol,
                    candidate.host,
                    candidate.components,
                    candidate.path,
                    candidate.queryForm,
                    candidate.queryPolicy,
                    JSON.stringify(candidate.restrictions),
                  ].join(":")}
                  label={`${candidate.role === "ROOT" ? "主评论" : "回复"} · userInfo.${candidate.name}`}
                >
                  {shapes[candidate.shape]} · {candidate.count}
                  {candidate.protocol !== "NONE"
                    ? ` · ${candidate.protocol} / ${
                        candidate.host === "ALLOWED"
                          ? "允许头像域名"
                          : candidate.host === "OTHER"
                            ? "其他域名"
                            : "无可识别域名"
                      } / ${
                        candidate.path === "AVATAR_PATH"
                          ? "头像路径"
                          : candidate.path === "OTHER"
                            ? "其他路径"
                            : "无路径"
                      }${
                        candidate.components === "RESTRICTED"
                          ? ` / ${
                              candidate.restrictions
                                ? Object.entries(candidate.restrictions)
                                    .filter(([, on]) => on)
                                    .map(
                                      ([key]) =>
                                        restrictionLabels[key] || "受限组成",
                                    )
                                    .join("、")
                                : "含受限网址组成"
                            }`
                          : ""
                      }`
                    : ""}
                  {candidate.queryPolicy
                    ? ` · ${queryPolicies[candidate.queryPolicy]}`
                    : ""}
                </DetailItem>
              ))}
            </DetailList>

            {value.filtered.map((entry) => (
              <p
                key={entry.role + entry.reason}
                className="text-body break-words"
              >
                {entry.role === "ROOT" ? "主评论" : "回复"} ·{" "}
                {filteredReasons[entry.reason]}：{entry.count}
              </p>
            ))}
            {value.transitions.map((entry) => (
              <p key={entry.role + entry.state} className="text-body break-words">
                {entry.role === "ROOT" ? "主评论" : "回复"} ·{" "}
                {transitions[entry.state]}：{entry.count}
              </p>
            ))}
          </>
        ) : (
          value.conversion.map((entry) => (
            <p key={entry.state} className="text-body break-words">
              {transitions[entry.state]}：{entry.count}
            </p>
          ))
        )}
      </div>
    </Disclosure>
  );
}
