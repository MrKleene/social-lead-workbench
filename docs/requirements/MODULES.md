# 模块说明

本文件回答"每个模块做什么、边界在哪、代码在哪"。产品范围见 [REQUIREMENTS.md](REQUIREMENTS.md)，
实际验证程度见 [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md)。
文档与代码冲突时**以代码和测试为准**，并回头修本文。

## 状态词表

| 词 | 含义 |
| --- | --- |
| 已接入 | 代码在主路径上，可被实际调用 |
| 合成验证 | 有隔离测试（mock / fixture / 本地库），**未碰真实平台** |
| 真实未验收 | 需要真账号、真平台确认，当前没有证据 |
| 仅预览 | 只能本地读数据生成结果，不能发 |

## 证据等级（不要混用）

- `MOCK` / `XHS_FIXTURE` 都是虚构数据，通过不代表平台可用。
- `SIMULATED_SUCCESS`、人工"已联系"记录、平台确认成功是**三种不同证据**，只有最后一种是真实回执。
- 接口存在、开关打开、登录成功，都不等于该能力已接通。
- 未知结果保留占用与去重，不能当失败重发，也不能当成功。

## 主链路

```
CollectionConfig → CollectionRun → CapturedPost / CapturedComment
   → AutoReviewJob / SemanticReview
   → AutoContactJob → SendAttempt / ContactLedger

InboxReceiver → InboxMessage → InboxRead        （独立支线，不参与上面的阶段屏障）
```

整轮阶段屏障控制采集、审核、回复三段：上一段没有明确终态，下一段不放行。
当前执行任务与页面查看任务是两套数据，查看历史不触发执行。

---

## 1. 采集

**职责**：按保存的账号与范围主动跑一轮，落帖子、评论和覆盖证据。

- 输入：`CollectionConfig`（关键词组、平台、模式、默认采集账号、单轮帖子上限、本轮范围）
- 输出：`CollectionRun` + `CapturedPost` / `CapturedComment` + 覆盖证据

**关键约束**

- 每次手动一轮；真实采集当前最多 3 帖
- 评论采集是有限窗口，不宣称读尽全平台
- 历史查看不执行新任务；失败或部分读取照实显示，不算成功
- 单帖重读只更新采集与审核，**不派生自动发送**

**代码**：`packages/domain/src/collection`（`collector.ts`、`run-coverage.ts`、`comment-checkpoint.ts`）；
`packages/local-runtime/src/adapters/collection`、`packages/local-runtime/src/collection-executor.cjs`；
采集 bundle 入口为 `packages/local-runtime/src/bundles/collection-provider.ts`

**状态**：已接入 + 合成验证；平台实际覆盖依赖可见数据，真实未验收

**延伸**：[comment-read-through.md](../design/comment-read-through.md)（有限读取窗口的实际预算）

---

## 2. 评论匹配

**职责**：用模型对整帖评论打分，产出可审核的结果。

- 输入：本轮可靠成员、评论规则、模型设置
- 输出：`SemanticReview`、`SemanticModelCall`、`AutoReviewJob`

**关键约束**

- 只用可靠的本轮成员，不混入历史评论
- 整轮采集完成后才开始（阶段屏障）
- 展示全部评论与真实分数，不人为截断；按 50 条/批调用，单批失败最多自动重试 3 次，耗尽后暂停等待人工恢复，不偷偷抽样
- 模型失败与费用按实际调用记录，不用估算冒充账单
- 审核目标带版本，目标版本变化后回复草稿必须显式确认

**代码**：`packages/domain/src/collection`（`semantic-evaluator.ts`、`qwen-result.ts`、`comment-rules.ts`、
`whole-post-capacity.ts`、`model-cost-estimate.ts`、`semantic-redaction.ts`、`comment-checkpoint.ts`）；
`packages/local-runtime/src/adapters/collection/qwen-provider.ts`；
`packages/local-runtime/src/automatic-review.cjs`、`review.cjs`、`run-review.cjs`

**状态**：已接入 + 合成验证 + 真实单轮验证（2026-11-18，单账号 3 帖 427 条评论）；付费模型调用仍需单独授权，多轮与发送未验收

**延伸**：[qwen-comment-matching.md](../design/qwen-comment-matching.md)、[model-settings-security.md](../design/model-settings-security.md)

---

## 3. 自动回复

**职责**：审核到明确终态后，按当时配置冻结发送计划并入队；开启自动发送后按队列调度执行，记录回执。

- 输入：审核目标版本、门槛、原文内容、渠道（评论 / 私信）、发送账号池、每账号共享日额度、额度刷新时间
- 输出：`send_queue` → `AutoContactJob` → `SendAttempt` / `ContactLedger`

**关键约束**

- 评论与私信分别选模板，模板按渠道隔离
- 双选派生各渠道任务，**不回填历史**
- 账号锁、共享日额度（`AccountDay`）、跨渠道去重、已联系检查都在服务端执行
- 旧线索的勿联系与已联系证据在离线导入时转成 `contact_ledger` 阻断，只读转换，不写回线索记录
- 未知结果保留占用与去重，不盲目重发；未知不当失败
- 平台限流、验证、封禁后即停，不自动换号绕验证
- 开关关闭时审核仍入队等待；人工通过绕过阈值但保留真实评分；评论与私信同一收件人各自独立首联
- 队列条目在入队时冻结模板池、账号池、规则版本与阈值；过期后可由人工覆盖重新排队
- 保存规则保持关闭；发送需独立授权

**代码**：`packages/domain/src/auto-contact`（`contact-policy.ts`、`contact-sender.ts`、`reply-stage-journal.ts`、
`live-journal-progress.ts`、`xhs-reply-protocol.ts`、`xhs-reply-transport.ts`、`xhs-restriction-transport.ts`）；
`packages/local-runtime/src/contact.cjs`、`send-safety.cjs`、`send-executor.cjs`、`send-queue.cjs`

**状态**：评论回复已接入 + 合成验证；真实发送需逐次授权

**注意**：私信渠道可对评论作者首联发送（模板、额度、跨渠道去重）；收到入站私信后不自动回复，见模块 6

**延伸**：[send-queue.md](../design/send-queue.md)、[comment-reply-target.md](../design/comment-reply-target.md)、[dm-templates-and-day-limit.md](../design/dm-templates-and-day-limit.md)

---

## 4. 待处理

**职责**：集中展示自动回复队列中待发送、等待额度、发送失败、结果未知与已过期的条目，并允许单条或同渠道批量人工处理。

**关键约束**

- 每条显示渠道、对象、原因；待发送与等待额度可取消，发送中不可取消
- 失败可重试或忽略；过期可重新排队，评论发布超过 7 天需显式覆盖
- 批量「立即发送」一次只接受同一渠道，并选择账号与模板；自动发送期间不可用
- 成功与未知结果禁止直接重发

**代码**：`apps/web/src/features/local-workbench/local-pending.tsx`；
页面 `/auto-contact/pending`

**状态**：已接入

---

## 5. 接收消息

**职责**：按需一次性读取平台可见的评论通知与单聊会话，落库去重，提供系统内未读与账号级会话入口。

- 输入：本机用户显式选账号 + 读确认
- 输出：`InboxReceiver`、`InboxMessage`、`InboxRead`

**关键约束**

- 手动“获取消息”触发一次性快照；部署、页面加载、API 重启都不自动启动，也不维持常驻窗口
- 只用项目受管 MCP 浏览器；收件进程只暴露接收工具
- 账号隔离、稳定身份、增量去重；平台会话单例，与采集、发送、登录互斥
- 覆盖仅限平台可见数据：最多 100 条评论通知、10 个可见单聊会话 × 50 条入站消息；不宣称全量历史
- 读取会改变平台未读状态；系统未读是独立的一套
- 只做增量迁移，不动原业务记录与 UNKNOWN 证据

**代码**：`integrations/inbox-mcp`（Go）；`packages/domain/src/inbox/protocol.ts`；
`packages/local-runtime/src/inbox-executor.cjs`、`inbox.cjs`；页面 `/inbox`

**状态**：合成验证；自然新消息及时性与长期低资源认证待真实验收

**延伸**：[inbox-reception.md](inbox-reception.md)

---

## 6. 平台会话与私信

**职责**：账号级收件箱；展示入站与已联系会话，逐条授权发送私信；评论回复在评论收件箱内完成。

**关键约束**

- `/inbox` 账号列表进入账号两栏（私信 / 评论）；未读数来自本地库，不依赖平台未读
- 私信列表合并入站与已确认出站；新建私信只列本账号联系过的人，不接受任意收件人
- 跨账号、跨渠道已联系与勿联系拦截在服务端执行；同一时刻同一收件人只允许一条发送在途
- 未回复的入站私信走精确回复；已回复后继续聊天走 MANUAL_DM；不设会话条数上限
- 评论回复要求审核记录匹配且有原帖引用，复用评论发送链；缺引用直接拒绝
- 每条发送单独预览与授权；连续输入在本地排队，平台确认后才显示已发送
- 关闭应用前确认取消未发送消息；异常退出恢复为未发送，不自动续发
- 不承诺平台全量历史；打开会话与获取消息都可能改变平台未读

**代码**：`packages/local-runtime/src/inbox.cjs`、`inbox-executor.cjs`、`send-safety.cjs`、`send-executor.cjs`；
页面 `/inbox`、`/inbox?account=`

**状态**：合成验证；真实发送待验收

**延伸**：[direct-messages.md](direct-messages.md)、[conversation-replies.md](../design/conversation-replies.md)

---

## 7. 配置管理

**职责**：集中管理关键词组、匹配方案、评论模板、私信模板、模型设置与自动回复配置。

**关键约束**

- 默认只读，显式新增或编辑
- 内置配置（`configurations.builtin=1`）由应用维护：不可编辑、不可删除；启动时按
  `packages/local-runtime/src/builtin-configurations.cjs` 的定义强制同步，内容变化会连带
  使该匹配规则的审核与自动化授权失效，需要用户重新确认
- 分组分别保存，没有跨接口原子提交，也不提示"全部保存成功"
- 切换页签保留草稿，关闭需确认丢弃；保存失败保留该组草稿并报错
- 启动校验只要求已开启阶段的必要条件；读取失败不能误判为"开关关闭"
- 采集操作区只保留"开始采集"和"采集设置"，不重复配置
- 自动回复配置维护自动发送阈值、额度刷新时间（默认 00:00）、回复账号池、评论模板池与私信模板池；采集设置弹窗只保留采集、评论匹配两步，不再单独保存回复账号与模板

**代码**：`apps/web/src/features/local-workbench/local-configurations.tsx`、`reply-settings.tsx`；页面 `/configuration`、`/configuration?tab=reply`；
后端 `ModelSettings`、`CommentReviewPolicy`、`ReplyTemplate`

**状态**：已接入

**延伸**：[three-step-automation.md](three-step-automation.md)

---

## 8. 账号与设备

**职责**：平台账号登录（扫码）、执行授权、设备绑定与租约、按账号计额度。

**数据**：`PlatformAccount`、`PlatformIdentity`、`AccountLogin`、`AccountSessionReference`、
`ExecutionDevice`、`DeviceExecutionLease`、`AccountDay`

**关键约束**

- 登录成功**不授予**评论、私信或任意任务能力
- 采集逐次确认与设备批准是两种不同授权
- 共享日额度按账号计算，预留与成功数量分开记
- 凭据、Cookie、二维码、设备私钥存受系统保护目录，不入 Git
- 同机设备签名认证不等于远程执行、硬件证明或 Windows 实现

**代码**：`packages/domain/src/accounts/account-execution-policy.ts`；`packages/local-runtime/src/accounts.cjs`、
`account-safety.cjs`、`credentials.cjs`、`platform-protocol.cjs`；页面 `/platforms`、`/work/accounts`

**状态**：已接入 + 合成验证

---

## 9. 任务进度显示

**职责**：读取持久化的任务与阶段状态，让页面显示当前动作、完成、暂停、失败与未知；首屏仪表盘聚合采集笔记、审核结论、已回复与收到回复。

**关键约束**

- 通过受限的 `workbench:call` IPC 读取本地服务，SQLite 是权威源
- 任务列表每 2 秒刷新，通用记录查询每 5 秒刷新；不依赖旧 PostgreSQL SSE 服务
- 历史查看与执行授权分离，刷新页面不能启动或重放任务
- 失败、暂停、部分结果与 UNKNOWN 按实际持久化证据显示
- 仪表盘「收到回复」只认同对象已确认发送且回复晚于发送的记录，普通评论不冒充回复成果；`/work` 永久重定向到 `/`

**代码**：`apps/web/src/features/local-workbench/use-local-workbench.ts`、`use-local-records.ts`；
`apps/desktop/src/preload.cjs`；`packages/local-runtime/src/workspace.cjs`

**状态**：已接入 + 合成验证

**延伸**：[local-runtime.md](../design/local-runtime.md)

---

## 页面与模块对照

当前页面统一由 `apps/web/src/features/local-workbench` 的 `Local*` 组件承载。

| 路由 | 组件 | 对应模块 |
| --- | --- | --- |
| `/` | `LocalOverview` 仪表盘；未初始化时显示首次使用引导 | 9 任务进度显示（首屏聚合） |
| `/welcome` | 使用引导，可从侧栏底部菜单重新打开 | 本地初始化不授予平台或模型执行权限 |
| `/automation` | `LocalTaskPage` | 1 采集 + 2 评论匹配；自动回复在待处理发送 |
| `/comment-review` | `LocalHistory` | 2 评论匹配（历史与审核） |
| `/auto-contact` | `LocalAutomation` | 3 自动回复 |
| `/auto-contact/pending` | `LocalPending` | 4 待处理发送 |
| `/configuration` | `LocalConfigurations` | 7 配置管理 |
| `/inbox` | `LocalInboxPage` | 5 接收消息 / 6 平台会话 |
| `/platforms` | `LocalCapabilities` | 8 账号与设备 |
| `/reply-history` | `LocalReplyHistory` | 3 回复记录 |
| `/data` | `LocalDataPage` | 数据与导出 |
| `/work` | 重定向到 `/` | — |
| `/work/accounts` | `LocalAccountPage` | 8 账号 |
| `/work/archive` | `LocalHistory` | 历史归档 |
| `/work/notices` | `LocalNotices` | 本地通知记录 |

## 已知不一致（待处理）

1. `REQUIREMENTS.md` 写"评论与私信可分别选择"，但私信实际只有本地预览，没有发送通道。
   按模块 6 理解，不要据需求文档认为 DM 已可发。
