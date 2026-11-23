/** 账号能力的唯一中文口径：只表达当前能不能采集、能不能私信/评论。 */
export function accountCapability(account: {
  collect_state: string;
  contact_state: string;
}) {
  if (
    account.collect_state === "CHECKING" ||
    account.contact_state === "CHECKING"
  ) {
    return ["检测中"];
  }
  return [
    account.collect_state === "ALLOWED" ? "可采集" : "不可采集",
    account.contact_state === "ALLOWED" ? "可私信/评论" : "不可私信/评论",
  ];
}

/** 发送结果与队列原因的唯一中文口径。内部状态只在数据层使用。 */
export const attemptStatusLabels: Record<string, string> = {
  CONFIRMED: "已发送",
  UNKNOWN: "结果未知",
  RESERVED: "已预留",
  ATTEMPTED: "发送中",
  NOT_ATTEMPTED: "未发送",
  CANCELLED: "已取消",
  FAILED: "发送失败",
  SIMULATED_SUCCESS: "模拟完成",
};

export const attemptStatusNotes: Record<string, string> = {
  CONFIRMED: "平台已确认",
  UNKNOWN: "保留占用 · 勿重发",
  RESERVED: "等待执行",
  ATTEMPTED: "等待平台确认",
  NOT_ATTEMPTED: "提交前停止",
  CANCELLED: "已取消",
  FAILED: "提交情况见原因",
  SIMULATED_SUCCESS: "未真实发送",
};

export const attemptStatusTones: Record<
  string,
  "success" | "warning" | "destructive" | "outline"
> = {
  CONFIRMED: "success",
  UNKNOWN: "warning",
  FAILED: "destructive",
  ATTEMPTED: "outline",
};

export const attemptStatusOrder = [
  "CONFIRMED",
  "UNKNOWN",
  "RESERVED",
  "ATTEMPTED",
  "NOT_ATTEMPTED",
  "CANCELLED",
  "FAILED",
];

export const pendingReasonLabels: Record<string, string> = {
  ACCOUNT_POOL_QUOTA_EXHAUSTED: "今日额度已用完",
  ACCOUNT_POOL_EMPTY: "未配置发送账号",
  ACCOUNT_POOL_UNAVAILABLE: "发送账号当前不可用",
  WAITING_SWITCH: "等待开启",
  AUTO_REPLY_OFF: "自动发送已关闭",
  AUTO_CHANNEL_OFF: "该渠道自动发送已关闭",
  TEMPLATE_CHANGED: "模板已变化",
  ELIGIBILITY_CHANGED: "评论或配置已变化",
  COMMENT_TOO_OLD: "评论发布超过 7 天",
  QUEUE_TOO_OLD: "入队超过 7 天",
  SEND_INTERRUPTED: "发送中断",
  COMMENT_NESTED_REPLY_UNSUPPORTED: "旧记录，未发送",
  COMMENT_REFERENCE_UNVERIFIED: "原帖引用已失效",
  COMMENT_PAGE_UNAVAILABLE: "原帖页面无法打开",
  COMMENT_POST_UNAVAILABLE: "原帖不可用或已变化",
  COMMENT_TREE_UNAVAILABLE: "评论区暂时无法读取",
  COMMENT_TARGET_NOT_FOUND: "原帖中未找到这条评论",
  COMMENT_TARGET_NOT_VISIBLE: "评论当前不可见",
  COMMENT_TARGET_MISMATCH: "评论与记录不一致",
  COMMENT_TREE_TOO_LARGE: "评论过多，无法定位",
  COMMENT_PREFLIGHT_INVALID: "评论发送参数无效",
  COMMENT_PREFLIGHT_DISABLED: "评论预检未启用",
  COMMENT_PREFLIGHT_UNAVAILABLE: "评论预检暂时不可用",
  COMMENT_PREFLIGHT_FAILED: "发送前校验未通过",
  SUBMISSION_UNKNOWN: "结果未知",
  RULE_REVOKED: "自动发送配置已停用",
  REVIEW_REJECTED: "评论不符合",
};
