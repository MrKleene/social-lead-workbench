# 评论自动识别与独立手动测试

2026-10-26；REQ-003 / REQ-004 / REQ-009 / REQ-017。基线 `cc34c4f`，实现提交 `a3b6dfc656658900f7d47bea3e4b58b66aee39e5`。本轮只进行代码、mock、隔离测试和正式页面只读 QA。

## 使用变化

评论审核页保留雾白底、绿色主操作、列表与抽屉，无新增箭头折叠。

1. 保存审核目标：只保存目标与不可变版本，不调用模型。
2. 手动测试：自动识别关闭也可选择已有帖子，或逐条勾选最多 5 条评论。首次确认提供方数据使用，再预览脱敏内容并确认本批费用。取消预览不外发；不需要重新采集。结果保留匹配分数、理由、原文、引用证据及当时的目标/模型版本。
3. 采集后自动识别：默认关闭；旧 `enabled` 和模型总同意均不迁移为自动开启。每次开启明确确认目标、持续调用费用、数据范围与每日上限。只在开启后单篇评论读取结束且覆盖通过时入队，分批处理该篇已保存评论（含恢复读取前已经确认保存的块）。不会因开启而回补所有历史帖子。
4. 关闭自动、修改目标或修改模型设置会停止尚未开始的自动调用；在途请求可能已产生费用并保留原版本结果。自动失败或中断不重试，管理员可另行手动预览确认。自动进度列表显示最近 20 条任务及覆盖/取消/失败/等待原因。

## 实现与守卫

- 新增 `autoEnabled`（false）、自动授权人及模型配置版本；新增 `AutoReviewJob`，按 policy/post/run 唯一约束去重。旧策略、目标版本、原文、审核记录保留。
- 采集器新增单篇完成回调，在分页/回复及块完成处理之后触发。部分/失败记录展示原因；完整任务状态本身不能充当覆盖证明。真实来源还须通过 `boundedReadReportSchema` 的完整证据校验，语义是本次页面声明范围，不能冒充平台全量。
- 既有采集 worker 每秒查看本地待处理任务。真实模型仍为全局并发 1、每批最多 5 条、至少 30 秒间隔、预算预留、20 秒超时及 0 自动重试。等预算不增加收费调用。
- 自动任务在预算预留和 transport 启动前重新检查开关、授权人、策略/模型版本、采集取消/失败、配置及覆盖。关闭自动、模型变更、采集取消/关闭和外发共享互斥锁。超时的 PROCESSING 任务标记未知/失败，不自动重放。
- 只自动选择新内容或从未外发的待分析记录；失败/过期 PROCESSING 必须手动预览。预览哈希、评论行版本和 requestKey 防止旧预览及并发双击重复付费。
- 手动 authorize、自动 control、评论分页、prepare/preview/evaluate 均在管理员会话与既有 CSRF 边界内；外部 API 无法指定内部自动模式。人工批次确认及脱敏/证据校验保留。原评论不能执行指令；不创建联系授权或真实发送。
- 每次新调用增加 `trigger` 与 `configurationVersion` 证据，历史调用新增列可空/默认值，旧结果不重算。

## 验证结果

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 类型检查 | 全工作区通过 | [typecheck.txt](evidence/review-automation-2026-10-26/typecheck.txt) |
| 构建 | 全工作区通过；保留既有前端大 chunk 提示 | [build.txt](evidence/review-automation-2026-10-26/build.txt) |
| 单元/HTTP/前端模型测试 | API 540、agent 4、web 152、end signal 2，通过 | [unit.txt](evidence/review-automation-2026-10-26/unit.txt) |
| 隔离数据库/HTTP | 250 通过、9 原有 MCP 模式测试跳过 | [integration.txt](evidence/review-automation-2026-10-26/database-integration.txt) |
| 增量迁移 | 干净库与旧授权策略升级通过；旧授权不变、自动保持关闭 | [checks.json](evidence/review-automation-2026-10-26/database-checks.json) |
| Schema 差异 | 新增表/字段匹配；既有账号/联系 FK 与 checkpoint 名称漂移未改动 | [schema-diff.txt](evidence/review-automation-2026-10-26/database-schema-diff.txt) |
| UI | 1440px / 390px 共 12 组流程通过，0 页面错误、0 意外请求 | [UI checks](evidence/review-automation-2026-10-26/ui-checks.json) |
| Lint | 仓库未配置 lint；`git diff --check` 通过 | [summary.json](evidence/review-automation-2026-10-26/summary.json) |

测试覆盖自动/手动解耦、独立持续授权、旧数据迁移、无 Key/目标、管理员/CSRF、单条选择、旧预览、并发幂等、批次/预算/间隔、取消/关闭/失败、模型/目标变更、未知调用不重试、恢复读取、窄屏和关闭返回焦点。模型 transport 全部为 mock；不能解释为真实 Qwen 调用通过。隔离 PostgreSQL/Redis 使用自有随机 tmpfs 容器，本轮结束清理 2 个自有容器。

正式 Chrome 页面只读取已有 DOM：旧审核开关已开启、68 个评论版本、暂无审核结果。没有点击预览/执行/采集/开关，没有读取 Key、平台凭据或数据库明细，没有将真实原文截图加入仓库。

截图：[桌面](evidence/review-automation-2026-10-26/ui-workspace-1440.png)、[窄屏](evidence/review-automation-2026-10-26/ui-workspace-390.png)、[持续授权](evidence/review-automation-2026-10-26/ui-first-use-390.png)、[选评论预览](evidence/review-automation-2026-10-26/ui-selected-comments-390.png)、[证据](evidence/review-automation-2026-10-26/ui-review-evidence-1440.png)。均为虚构测试数据。

## 部署与剩余边界

本轮未对正式实例应用迁移、构建或重启。README/COMMANDS 要求在获得运行时授权后再升级；本次代码推送授权不能替代运行时授权。下一步获批后先 `npm run status` 核对受管实例，再按既有 `npm restart` 流程迁移/构建/启动 API、采集 worker 和网页。若显示 legacy-or-unmanaged，保持原实例并按项目切换流程处理，不能按 PID 强杀。

真实模型连通性、费用与质量，真实采集自动触发，正式运行时迁移均未测；真实模型调用、采集和发送均为 0。仓库当前没有 GitHub Actions workflow；推送后须按最终 SHA 读取 check/status/workflow 结果，不能将无 CI 描述为 CI 通过。

权限记录：首次远端 DNS、Docker socket 和 HTTP 临时端口操作被执行沙箱拦截，未修改正式环境；相应已授权的只读/隔离执行经受控提权后通过。没有自动审批拒绝或遗留不确定写入。临时 checkout 位于 `/tmp/social-review-20261026`；没有写本机 Codex memories。


## 部署预检修正：worker vault 接线

部署预检发现持久启动器此前只向 API 传入既有 vault 路径。已将同一实例的现有路径注入采集 worker，未读取或改写 Key，未把路径传给前端。新增 `test-persistent-model-wiring.mjs` 对实际启动声明分别验证 backend-only / full 两种模式，2 项通过，并纳入 `npm test`；启动脚本语法检查通过。这里验证的是配置接线，不是真实模型调用。

同时核实 63968 为 Vite 开发服务，源码快进已使界面热更新；部署完成前曾是新前端/旧 API 与 worker 的混合状态。不能将此前“未上线”理解为前端毫无变化。正常受管服务迁移与最终数据核验结果另见部署记录。
