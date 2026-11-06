export const evidenceMessages:Record<string,string>={
 EVIDENCE_ACCOUNT_LOGIN_REQUIRED:'请先重新登录这条记录绑定的原小红书账号，再核对发送证据。',
 UNKNOWN_ATTEMPT_REQUIRED:'这条记录已不再是未知状态，请刷新后查看结果。',
 CANDIDATE_REPLY_ID_REQUIRED:'请填写要核对的候选回复 ID；它必须与原笔记、原评论和账号 ID 不同。',
 COMMENT_REFERENCE_UNAVAILABLE:'本机缺少这篇笔记的访问凭据，请先通过新采集找到同一笔记。',
 EVIDENCE_PREVIEW_CHANGED:'账号、记录或核对范围已变化，请重新预览后授权。',
 EVIDENCE_EXECUTOR_UNAVAILABLE:'本机专用核对组件尚未就绪。',
 EVIDENCE_REQUIRES_IDLE:'请先等待其他任务结束，或取消活动任务后再核对。',
 PLATFORM_PROCESS_RECONCILIATION_REQUIRED:'此前平台进程未确认停止，当前仍保持暂停。',
 EVIDENCE_AUTHORITY_CHANGED:'核对已取消、超时，或原账号和范围发生变化；继续保留未知结果。',
 EVIDENCE_NOT_EXACT:'未取得两次完全一致的消息证据；继续保留未知结果。',
 EVIDENCE_UNVERIFIED:'本次未能完成可靠读取；继续保留未知结果。',
 PLATFORM_PROCESS_STOP_UNCONFIRMED:'无法确认平台进程已停止，继续保留未知结果并暂停平台操作。',
};
export const evidenceMessage=(code:string)=>evidenceMessages[code]||'未能完成核对，请检查账号及任务状态后重新预览。';
