const holdAreas: Record<string, string> = {
  model: "评论匹配",
  sending: "发送",
  platform: "平台",
};

const holdReasons: Record<string, string> = {
  MODEL_SUBMISSION_UNKNOWN: "模型请求结果未知",
  SUBMISSION_UNKNOWN: "发送结果未知",
  DM_SUBMISSION_UNKNOWN: "私信结果未知",
  PLATFORM_PROCESS_STOP_UNCONFIRMED: "平台进程停止状态未确认",
  RESTORE_REQUIRES_REVIEW: "恢复需要人工核对",
  LEGACY_IMPORT_REQUIRES_REVIEW: "旧数据导入需要人工核对",
  RATE_LIMITED: "平台触发频率限制",
  PLATFORM_REFUSED: "平台拒绝请求",
  ACCOUNT_RESTRICTED: "账号受限",
};

/** 暂停原因只给运营看得懂的范围与状态，不把内部 id 或枚举直接铺到界面。 */
export function holdLabel(hold: { id: string; reason: string }) {
  const area = holdAreas[hold.id] ?? "运行";
  const reason = holdReasons[hold.reason] ?? "需要人工核对";
  return area + " · " + reason;
}

const auditActions: Record<string, string> = {
  ACCOUNT_RISK_RETAINED: "账号被限制",
  ACCOUNT_RESTRICTION_RELEASED: "账号限制已解除",
  SENDING_PAUSED: "发送暂停",
  SEND_INTERRUPTED: "发送中断",
  SEND_RESULT: "发送结果",
  SEND_QUEUE_SETTLED: "发送队列已结算",
  REVIEW_QUEUE_INTERRUPTED: "审核中断",
  PLATFORM_RECONCILED: "平台状态已核对",
  DESKTOP_SESSION_RECOVERED: "桌面会话已恢复",
  INITIAL_STATE_RESTORED: "已恢复初始状态",
  REPLAY_ELIGIBILITY_RESTRICTED: "发送资格受限",
  REPLY_ELIGIBILITY_RESTRICTED: "发送资格受限",
};

/** 异常历史用中文事件名；未知动作回退成中性名称，不显示内部动作码。 */
export function auditActionLabel(action: string) {
  return auditActions[action] ?? "运行事件";
}
