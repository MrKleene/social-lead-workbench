# 整帖手动测试与评论相关度 · 2026-10-26

代码提交：`6c0889fce961de73780cd6199260f6ba1c632ba6`；并发回归修正：`5c2d9dbc81e9f67688476fb28907e5dd48c676df`。

## 交付范围

手动测试改为「选择帖子 → 确认整帖范围 → 后台处理」。选帖弹窗支持标题搜索、每页 20 篇、标题/已有安全封面/已保存评论版本数。选定单帖后，服务端读取所有已保存评论，包括各层回复；预览每页 20 条只影响显示，任务不限制在首 5/20/30 条。覆盖不足仍可确认已有数据，明确不代表平台全量且不补采集。

确认一次锁定来源版本集合、目标 revision、模型 configurationVersion、价格版本及脱敏文本，预览有效 15 分钟。提供方数据使用及本次计费同意明确保留。每批最多 5 条、全局单并发、至少 30 秒间隔、已有每日累计预算、20 秒超时和零自动重试全部沿用。自动开关不门控手动任务，单独切换自动 OFF 不使手动确认失效。

任务持久化显示总数、成功、失败、跳过、未处理以及原因，可取消未开始的调用；已在途请求仍可能计费并保留结果。相同范围重复准备、确认双击、并发 worker 通过互斥与 requestKey 去重。已完成、已尝试或未知结果的相同内容不重复付费；失败任务停止剩余批次。再次选该帖可预览仅剩余从未尝试的内容，必须重新确认，失败/未知条目仍跳过。worker 中断超过 120 秒标记失败/未知，不自动重放。在正常批次边界重启可继续已确认待处理范围。

现有「审核结果」区域新增相关度高/低排序、可调整最低/最高分（不暗设高相关阈值）、帖子/评论文字/人工状态/评估状态筛选及每页 20 条分页。分数保持模型原有 0–100 尺度，未评分明确为空且不被分数区间选中。显示原评论、来源、匹配理由、引用证据、目标 revision 与模型版本；跨采集配置去重复用的结果也能按对应已保存帖子找到。人工确认/排除复用原审核接口和历史记录。任务卡可直接查看该帖结果。

本轮没有新增发送入口、自动发送、模型驱动销售线索或联系授权。高相关只是人工排序依据，不是概率或发送许可。保留已有历史 API 和审核证据。

## 后端与迁移

- 新增 `ManualReviewJob` 表，保存冻结范围、脱敏预览、版本、授权人、进度、当前批次及幂等请求号。只添加表、索引和策略外键，迁移不改写历史业务表、Key、模型设置、开关或预算。
- 新接口：`POST policies/:id/manual-post`、`GET policies/:id/manual-jobs`、`GET manual-jobs/:id/preview`、`POST manual-jobs/:id/confirm`、`POST manual-jobs/:id/cancel`，均位于 `/api/comment-review`，管理员会话及既有 CSRF 保护。
- 采集 worker 调度新手动任务；预算预留前和 transport 启动前都验证取消、管理员、目标/模型版本以及实际脱敏输入与确认文本。新存入评论不会扩张已确认任务。修改目标/模型阻止未开始的批次。
- 所有结果仍保存在 `SemanticReview`；不另建重复评分库。模型失败不写伪分数，不改写历史快照。

## 验证

| 检查 | 结果 | 证据 |
|---|---|---|
| 全工作区 types / build | 通过；构建保留既有大 chunk 提示 | `evidence/whole-post-review-2026-10-26/typecheck.txt`、`build.txt` |
| 单元/HTTP/前端模型/接线 | 700 通过（540 API + 4 agent + 152 web + 2 end signal + 2 vault wiring） | `unit.txt` |
| 隔离数据库/HTTP/worker | 267 通过、9 原有 MCP 环境模式跳过 | `database-integration.txt` |
| 增量迁移与 schema | 干净库与旧库升级通过，自动关闭、旧策略/模型保留，新表为空 | `database-checks.json`、`database-schema-diff.txt` |
| 浏览器 UI | 1440px / 390px 共 14 组通过，0 页面错误、0 意外网络/发送请求 | `ui-checks.json` |
| Lint | 仓库未配置 lint；`git diff --check` 通过 | `summary.json` |

隔离回归覆盖 56 条/12 次 mock 调用、跨 3 页预览、23 帖分页、嵌套回复、确认后新增评论不扩张范围、worker 重建、重复确认/worker、目标/模型/来源变化与过期确认、预算/间隔、无 Key/目标、管理员/CSRF、取消/权限/脱敏在 dispatch 边界重验、失败/未知不重试、剩余范围再次确认、原文保存、相关度包含边界/空值/排序/分页、人工排除及历史版本。模型请求使用 fake Key 与内存 transport，不能称真实模型调用通过。所有数据库测试为独立 tmpfs PostgreSQL/Redis，每轮只清理自身 2 个容器。

桌面/窄屏截图均为虚构数据：[预览](evidence/whole-post-review-2026-10-26/whole-preview-390.png)、[相关度](evidence/whole-post-review-2026-10-26/relevance-1440.png)。首次 UI 失败是测试在 reload 后未重新搜索第 23 篇帖子，修正测试选择后 14 组通过，不修改真实数据。最后一轮曾发现旧并发测试只接受第一个请求获胜，改为接受任一请求获胜但严格断言只有一个 fulfilled、一个 transport 后，267 项全部通过。

## 部署前状态与批准步骤（历史记录，下节为最终状态）

本轮仅在 `/tmp/social-review-20261026` 开发、测试和推送；没有快进 `/Users/kleene/projects/social-lead-workbench`。正式目录仍为 `cfba2f1c44ced1a50491461e03e51e6f576ea588`，干净，API/backend 与 web 受管健康。已有登录页只读确认仍为旧单批界面，自动关闭，68 条已保存评论，模型 READY、授权已存在、调用 0、审核结果 0。汇总数据库核验：1 用户、2 平台账号、1 run、3 posts、68 comments，审核/调用/联系/活跃采集/在途请求/自动任务均 0；新增 `ManualReviewJob` 表尚不存在。见 `runtime-readonly.json`。没有读取 Key、secret 内容，或修改登录保护、凭据、MCP 补丁与 Codex memories。

上线需要本轮新的明确部署批准，不能沿用上一轮一次性重启许可。获批后的具体步骤：

1. 再核对受管实例、工作区用户改动、远端 SHA、自动 OFF 与无活跃采集/审核任务；有任务则等待，不中断。
2. 按现有私有备份流程保存业务库并检查归档目录，保留现有账号、Key、会话及原 PostgreSQL/Redis 卷。备份不入 Git、不读取 Key。
3. 先用现有 `npm stop` 正常停止网页/API/worker 并确认退出，再对正式目录 `git merge --ff-only origin/main`（先 fetch 并核对批准 SHA）。这是为了在更新源码前停止 Vite HMR，避免新前端提前连接旧 API。若遇用户改动/未知进程，不强杀、不重置。
4. `npm start` 沿用项目受管启动流程生成 Prisma、应用 `202610260004_manual_post_review` 兼容迁移、构建并启动 API/worker/网页；不重启或清除数据库与 Redis 卷。
5. 核验服务健康、实际运行 SHA、迁移 checksum、数据基线/Key 元数据、自动 OFF、调用数不变。已登录页面只读查看新入口与真实空结果，不确认付费任务。

回滚：正常停止新应用，恢复之前应用版本并保留新增兼容表，再正常启动；不删表、不覆盖恢复现用数据库，不丢弃已产生审核记录。数据恢复若必要需另行确认目标与停写窗口。真实模型质量/费用、真实采集联动及新正式部署均未测。推送后的确切 commit CI 查询另存本地任务证据；没有 CI 不能报告通过。


## 已批准完成正式部署

用户批准后，重新核对 main 实例及原卷，业务库生成权限 0600 的本地私有备份并通过 `pg_restore --list` 检查（223 个目录项）。无活跃采集、在途模型请求或待处理自动任务，自动 OFF。上线前针对确切发布代码重新运行隔离回归：267 通过 / 9 原有跳过，桌面与窄屏 UI 14 组通过。

使用现有 `npm stop` 先正常停止 Vite，再停止 API/worker，确认两者 stopped 后才快进至 `ac0a1247352cb72813ecfd56f62d646e17962e64`；随后 `npm start` 沿用原实例完成兼容迁移、构建及后台启动，没有强杀、删锁、替换凭据或重建数据卷。API/backend 与 web 均 running/healthy，collector/API 进程身份核对通过，manual service/guard/evaluator/worker 的编译产物与已测试隔离发布文件逐项哈希一致，迁移 checksum 与仓库 SQL 一致。

部署后与正式只读 QA 后再次核验：用户 1、平台账号 2、采集配置/批次各 1、帖子 3、已保存评论 68；所有既有业务表及模型密文/配置的数据库端摘要不变。数据库 secret 与模型 vault 文件的 inode/大小/mtime/权限不变，未读取其内容。PostgreSQL/Redis 启动时间与原卷身份不变。审核结果、模型调用、联系记录、手动任务、自动任务、活跃采集均为 0，自动 OFF。

正式页面沿用已有登录，以临时标签只读打开新版手动入口与选帖弹窗，看到 56 / 6 / 6 条存档及覆盖不足标识；验证标题搜索、关闭返回焦点、相关度排序/分数范围和按帖子筛选后的真实空结果，页面 error 日志为空。只在结果筛选器中选帖，不提交会创建 SemanticReview 的手动准备接口，不生成预览任务、不确认付费或修改人工状态。验收标签已关闭，未改动用户原标签。一次精确 label 定位未匹配，检查 DOM 后用页面实际 combobox 角色定位成功；没有权限拒绝或服务缺陷。

脱敏证据见 [deployment.json](evidence/whole-post-review-2026-10-26/deployment.json)、[部署前数据库复验](evidence/whole-post-review-2026-10-26/deployment-recheck-integration.txt)、[UI 复验](evidence/whole-post-review-2026-10-26/deployment-recheck-ui.json)。完整基线摘要、备份位置及正常启停日志仅保存在本地任务证据。此节和 README 更新为文档提交，不改变已验收应用代码，无需额外停启。真实模型调用、费用和效果仍未测试；没有启用或实现真实发送。
