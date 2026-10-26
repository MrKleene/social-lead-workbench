# 评论审核结果工作区验收（2026-10-26）

实现提交：`c80513933a7775cc935d53ca701e112faf343bd3`。正式页面 `http://127.0.0.1:63968/comment-review` 已通过现有 Vite 热更新。仅前端特性模块和隔离 UI 测试变更；没有数据库迁移、后台重启、API/worker/contracts 改动。

## 截图审视与改动

已通过 Library 官方物化流程获取用户附件并实际查看像素；同时查看已登录正式页面及选帖弹窗的改前截图。发现：设置与任务历史占据首屏；每条记录重复展开备注和版本，遮蔽评论及相关度；失败任务的绿色进度条容易误读为成功。

- 首屏为审核结果，顶部只有紧凑状态摘要、手动测试、识别设置和最新任务摘要。已评分和未评分分别计数。任务结束不等于评估成功。
- 列表突出原文与真实相关度，未评分显示破折号和“未评分”。原因、证据、目标/模型版本、历史输入与人工备注进入详情抽屉；不产生发送入口或销售线索。
- 默认“已评分”；全部、待分析、失败/中断、处理中分开。搜索和排序在列表旁，分数范围、人工状态、来源帖子放入单一筛选抽屉，保留分页。
- 手动测试在同一个抽屉完成选帖、范围确认、外发文本核对和开始；文本预览分页不限制完整 56 条执行范围。返回、取消、重复打开与关闭焦点均验证。原文外发、价格和预算确认保持。
- 设置抽屉管理目标和自动开关。目标草稿关闭后保留；保存不调用模型。持续调用同意仅在开启动作后显示，仍在同一个抽屉。自动默认关闭。
- 未新增箭头折叠；保留全站雾白绿色视觉与既有导航。

## 验证

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck`（所有工作区） | 通过 |
| `npm run test:workbench` | 14 文件 / 152 测试通过 |
| `npm run build -w @crm/web` | 通过；既有第三方注释与大包提示仍存在 |
| `node --check scripts/test-independent-review-ui.mjs`、`git diff --check` | 通过 |
| 隔离 Playwright 1440px / 390px | 18 组流程通过，0 页面异常、0 非预期外部请求 |
| 精确实现提交 GitHub checks / Actions runs | 均 0；仓库没有该提交的 CI 执行，不能宣称 CI 通过 |
| lint | 仓库没有独立 lint 脚本；未虚构执行 |

隔离 UI 覆盖空状态、56 条/三页原文预览、搜索/排序/分数范围/人工状态/帖子筛选/分页、已评分与未评分分离、长评论与 Unicode/联系方式合成文本、原文/旧脱敏输入标识、人工排除、提交忙碌及 Escape 守卫、取消任务、失败/旧确认错误、设置草稿保存、自动同意返回、无模型配置/无目标/非管理员、焦点恢复和窄屏溢出。预览查询从页面移入子流程时的通知缺陷在隔离测试发现并修复。

所有带评分、真实执行按钮、取消和写状态的验证均为合成 API mocks；没有向正式系统写演示数据。API/worker 业务代码未改，本轮没有重跑数据库或模型集成测试，也没有执行真实模型调用。

可复核的合成证据：[检查结果](evidence/comment-review-workspace-2026-10-26/ui-checks.json)、[桌面已评分列表](evidence/comment-review-workspace-2026-10-26/synthetic-results-desktop.png)、[390px 范围确认](evidence/comment-review-workspace-2026-10-26/synthetic-scope-mobile.png)。同目录包含类型、测试及构建日志。

## 正式只读验收与数据

正式页已查看结果首页、识别设置、已采集帖列表、未评分条目和失败详情；桌面及 390px 截图已保存并实际查看。未选择帖子（避免创建持久预览），未开启自动，未确认测试，未写人工状态。详情关闭回到原“查看详情”按钮；设置关闭返回入口；浏览器错误日志为空。临时窄屏视口已恢复。

更新前后只读计数、记录 ID 摘要一致：1 用户、2 平台账号、1 采集任务、3 帖、68 评论、6 审核记录、1 模型配置、2 手动任务、0 自动任务、0 联系记录。6 审核记录为 5 FAILED + 1 UNANALYSED，已评分 0。模型调用记录 **1 → 1**，自动开启数 **0 → 0**，活跃采集/模型请求/审核任务均 0。

这 1 次调用和 INVALID_EVIDENCE 失败是本轮修改前已存在的用户执行结果。本轮只重排界面并如实展示，没有修复或重试该模型评估，也没有把失败当评分。

后台 PID 20980 / generation `2d2847a2-a3cc-4e97-94ea-88404b524dab`，前端 PID 21384 / generation `fc8f0e20-e278-417a-a85d-9ee1327d46ba`，更新后均 running/healthy，与此前相同。后台继续运行既有 `799e52d` 构建，本轮前端与其 API 契约兼容。无需新部署批准或后台操作。

真实截图与私有聚合验收文件仅保存在本机，不提交 Git（其中可能含用户已保存正文）：

- `/Users/kleene/Documents/Codex/2026-10-26/task-5/review-ui-audit/reference/user-reference.png`
- `.../review-ui-audit/before/01-review-page.jpg`、`02-post-picker.jpg`
- `.../review-ui-audit/after/01-results-home.jpg`、`02-settings.jpg`、`03-manual-post-picker.jpg`、`05-failed-detail.jpg`、`08-picker-390.jpg`、`09-home-viewport.jpg`、`10-home-390.jpg`
- `.../review-ui-audit/baseline.json`、`after.json`、`service-status-after.txt`

部分长截图会将固定导航捕获在滚动位置，最终首页另用顶部正常视口补拍（09/10）；窄屏 DOM scrollWidth 375 ≤ innerWidth 390。没有读取或更改 Key、平台凭据；没有安装 MCP 补丁、采集、发送或清理历史数据。

首次受限环境 `npm run status` 返回 LOCAL_STATE_UNAVAILABLE；授权的只读扩展检查确认既有服务健康，无遗留权限阻塞。剩余限制是正式没有已评分记录，评分视觉仅能用明确标识的合成数据验收。
