# 同会话账号主页限制取证

## 实际入口证据

2026-10-27，本轮用不承载发送账号保存会话的 IAB 查看目标公开主页 `https://www.xiaohongshu.com/user/profile/[TARGET_ID]`。页面显示与本轮目标一致的昵称，并在 `.user-page > .ban > .content` 内显示：

> 接相关投诉该账户违反 《社区规范》 其内容无法查看

这是目标公开主页的内容限制证据；不是同 MCP 保存会话的现场检查，不提供封禁期限、处罚原因详情、评论权限或历史发送结果。随后该访客页面出现“电脑设备登录超限，请重新登录”；停止继续操作，未登录、解挑战或绕过。访客会话提示与目标账号限制分开记录，不能归因于发送账号。因登录界面及遮挡，没有尝试导出截图。

公开网页“更多 → 帮助与客服”实测打开问题/图片/手机号/提交的反馈表单，不是处罚查询。官方社区规范指引在 App 的帮助与客服内申诉。蒲公英官方《作者健康等级规范》确有 PC“我的 → 健康等级”，但仅适用于已开通博主合作的用户，并按月更新，不能冒充普通账号的实时评论许可；未登录蒲公英、未开通任何权限。

官方参考：
- https://agree.xiaohongshu.com/h5/terms/ZXXY20221213003/-1
- https://pgy.xiaohongshu.com/help/detail?id=1e77b1987d1646def00d556d9879f19f&userType=4

## 实现与边界

新增协议 `workbench.xhs.account-profile-inspection.v1`，沿用唯一工具 `workbench_account_restriction_inspect` 和 exclusive inspection mode。旧帖子协议保留。新协议只接受 accountId、senderId，无 post/reference/review/content/url；不重复旧 UNKNOWN 帖子检查。

同一 owned browser/page 最多导航两次：先 `/explore`，读取现有登录身份及可见“我”链接；只有身份 MATCH、准确同源 self link、无限制/登录挑战才导航到该 self profile。再次核对身份及路径，仅在目标主页读取实际观察到的 `.user-page .ban .content`。没有任意 URL、脚本执行接口或菜单按钮，也没有通知、私信、发送、申诉、登录或保存 cookie 动作。出现 mismatch/unknown/挑战/外部跳转/限制即停止。

`ACCOUNT_CONTENT_RESTRICTED` 表示主页内容被限制，`SESSION_LIMIT` 表示会话限制，均不伪装成更具体的永久封号。identity UNKNOWN 的提示仍保持 ACCOUNT_UNVERIFIED；空主页不等于正常，缺入口明确 PROFILE_ENTRY_UNAVAILABLE。没有警告的完整主页观察也明确 NOT_A_SEND_PERMISSION_CHECK，绝不恢复发送。

每个已完成导航记录 UTC、去 query 且隐藏 ID 的路径和身份；结果绑定 accountId/senderId/protocol。中断时保留已完成导航。截图仅允许可见警告区域，通过 QR/媒体/编辑内容/敏感文本等检查，并新增 LOGIN_CHALLENGE、OCCLUDED_NOTICE、UI_CHANGED 子码。截图后再读 DOM，比对区域、身份及提示，变化则丢弃内存图像；无安全截图保留文本和原因。不保证任意动态 UI 均有截图。

新 operator `scripts/run-profile-restriction-inspection.mjs --inspect-profile-restriction-approved-once PRIVATE_SCOPE PRIVATE_EVIDENCE_DIRECTORY` 使用已有保存会话与 DeviceService lease。scope purpose 为 `inspect-saved-account-profile-read-only-once-v1`，绑定账号、sender、完整 binary hash、单次 UUID、30 分钟内过期。无实际有效 scope 随源码交付。仅允许一次工具调用、零提交；检查 PAUSED、OFF、无 contact job；持久同意/dispatch/result，关闭后才释放 lease。无历史、quota、锁或账号状态写入。

## 安装兼容性及批准范围

本源码没有更新安装 pin、正式环境或现有程序。新候选需要**配套更新 transport/API 构建与安装 hash pin**；不能把 binary 单独换到仍采用旧严格结果 schema 的正式 runtime。隔离分支基于上一轮 reliability 提交 35e66bb；若部署整个分支，范围也包含该提交的可靠性修复，不能称为只更换检查器。

批准请求应指定最终完整 hash、正式项目目标、配套源码范围和仅一次该账号保存会话的 profile inspection。最长20秒工具操作/60秒operator总信号，最多两个固定页面、一个工具调用、零发送。需要正常消费新 scope、独占 lease 和私有证据目录；不启用自动联系、不解除 PAUSED、不触及 UNKNOWN/额度/recipient lock，不调整用户规则/Key/身份。没有 schema migration。发生验证/登录/访问限制即停止，不重试或切号。

这次取证可以观察主页处罚提示，不能保证取到 App 内处罚详情，也不构成任何真实试发许可。真实发送仍受正向许可及平台回执映射未验收阻塞。
