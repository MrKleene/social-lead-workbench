# 恢复计数与当前审核观察修复（2026-10-27）

## 已证实事实与边界

- 恢复任务保存增量为 0，但检查点和本轮覆盖报告共同确认 6 条原文（3 主评论、3 回复）。旧界面直接使用保存增量和本轮新归档关联，因而显示 0，并与覆盖报告产生冲突。这不是读取失败，也不能仅凭数量相等证明覆盖完整。
- 旧归档评论保留当时的 PARTIAL 快照。旧审核准备代码直接使用这个快照，导致之后已证实 COMPLETE 的读取仍把 partial=true 发送给模型。
- 前次手动 6 条成功与本次自动 6 条成功属于不同帖子。已有只读证据显示 capture/contentHash/analysisKey 无交集；目标、模型、原文策略相同不代表评论相同。这次未证实重复付费缺陷，未重写去重键。
- 先前自动结果的 context 为 INSUFFICIENT，保存的 decision 为 UNCERTAIN。校验器会把不充分上下文规范为 UNCERTAIN，但原始 decision 未独立留存，不能证明旧 partial 是本次模型判断的唯一原因，更不能把 95 分改成人工确认。
- 2ca1771544fe69c0e9199731639b9cc3529c3ac3 相比 d95a4c45ce67e34283fa233f9ec66cc93e0e1db5 仅变动 runtime/platform.cjs 与 scripts/real-mcp/core.mjs 的两个 MCP 哈希常量，激活已批准候选。没有隐藏业务改动。

## 实现

1. 恢复计数采用本轮不可变覆盖报告：合法 COMPLETE、恢复锚点为 0、确认数量与严格校验的报告一致时，界面显示“本次确认 6 条评论/回复”“新存 0 · 复用 6”。原始数据库增量不覆盖，历史任务不伪造归档关联。
2. 新增 current-capture-observation-v1。逐条核对当前运行、覆盖报告、检查点归属/版本/序号、评论与父节点标识以及内容摘要；缺失、取消、失败、身份不符或未完整核对保持 UNKNOWN/PARTIAL。恢复检查点里的私人标识仅服务端核验，不进入模型输入。
3. 在内存中为新审核构造当前 partial 和 observation，不修改旧评论快照、历史结果输入或人工状态。原文及其他上下文范围保持既有策略；收集完整与语义充分分别判断，不强制把 UNCERTAIN 改成 MATCH。
4. 手动预览、确认、排队、最终模型调用前都校验观察版本/证据。旧预览和旧自动队列不会默默升级为新输入；证据变化在调用前阻止。新结果详情展示观察版本和覆盖状态，旧结果明确标为历史输入未记录当前观察版本。
5. 自动真实采集链路额外要求所有保存评论当前观察为 COMPLETE。成功记录继续跨手动、自动、搜索来源复用；仅观察变化不隐式产生新付费重评。已有目标修订/内容变更版本机制保留。

## 验证结果

全部使用合成数据、mock provider 或临时隔离数据库，不是真实模型验收。

| 验证 | 结果 |
| --- | --- |
| npm run test | API 643、agent 4、前端 156、覆盖终止信号 2、vault 路由 2，全部通过 |
| npm run typecheck | 全 workspace 通过 |
| npm run build | 全 workspace 通过；Vite 既有大 chunk 提示仍在 |
| 隔离 PostgreSQL 集成 | 299 通过、9 跳过；迁移、schema diff、升级数据保留均通过 |
| 采集任务浏览器隔离测试 | 40 组通过，含桌面/390px、快速刷新、恢复 6/0/6、详情关闭返回焦点 |
| 审核页浏览器隔离测试 | 22 组通过，含新旧观察版本、历史输入、排序分页、焦点、失败和单次整帖流程 |
| git diff --check | 通过 |

9 个跳过项来自 CRM_MOCK_ONLY 下禁用的 MCP 离线传输集成组，不称为通过。本轮没有重测真实平台或模型。仓库无 lint 脚本；以类型检查、测试及构建验证。

新增针对性验证包括：恢复 0 新增/6 复用，快照不变，新观察 COMPLETE 与原文一致；unknown/partial/未完锚点/计数、序号、归属和摘要冲突/取消/失败仍挡；确认后及预约与外发间证据变化阻止调用；历史旧预览失效；手动成功到自动、自动成功到手动、跨搜索来源不再调用；新目标修订合法生成新待评范围。原预算、取消、并发、人工状态、56 条整帖一次请求测试继续通过。

证据：[全部测试](evidence/current-observation-2026-10-27/tests.txt)、[集成测试](evidence/current-observation-2026-10-27/integration-tests.txt)、[采集页检查](evidence/current-observation-2026-10-27/task-ui-checks.json)、[审核页检查](evidence/current-observation-2026-10-27/review-ui-checks.json)。

已实际查看合成截图：[恢复任务桌面](evidence/current-observation-2026-10-27/recovered-desktop.png)、[恢复任务 390px](evidence/current-observation-2026-10-27/recovered-390.png)、[审核详情 390px](evidence/current-observation-2026-10-27/review-detail-390.png)。截图是隔离合成数据，不代表正式结果。

## 正式状态与待批准部署

本轮仅在 /tmp/social-review-20261026 修改；正式源代码仍是 2ca1771544fe69c0e9199731639b9cc3529c3ac3，工作区干净，没有热更新或重启。最近已核验业务基线为 3 runs / 3 posts / 68 comments / 12 scored / 3 calls，auto OFF、无活跃任务、联系记录 0。本轮未读取或改写正式业务数据库，未产生新模型/采集/发送操作；这些业务数值属于上次验收基线，不能冒充本轮重新查询。

无需新 schema 迁移，无需更换 MCP。保留已安装 SHA256 cc5b85852ff379140d3a1bb6b33273b9ea9b85ec7a2cbd348dccc27d95183a7d。

待本轮更新批准后：

1. 只读核对服务/空闲任务和业务基线，若用户有任务先等待；私有本地业务备份，保留 Key/账号/历史。
2. 正常 npm stop，先停前端以避免混版；正式源码 fast-forward 到交付 main，保留用户改动，不强杀。
3. npm start 按项目受管流程检查既有兼容迁移、构建和启动（本次无新 migration）。
4. 只读核验 API/worker/web、确切运行版本、auto OFF、任务无残留和历史数值；检查任务卡 6/0/6、新旧结果详情。无需额外模型调用验证本次展示与版本变化。
5. 如启动失败，正常停新服务并使用部署前保留的 checkout/构建恢复旧服务；本次无 schema 变化，不能为回滚覆盖新产生的业务数据。MCP 不动。

本轮没有部署授权，暂不执行上述动作。已有 12 条结果不会被修复程序批量改判，也不会自动重审。
