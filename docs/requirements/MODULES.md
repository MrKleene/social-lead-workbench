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
| 已移除 | 代码与页面已删，只保留数据库历史 |

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

**代码**：`apps/api/src/collection`（`collector.ts`、`run-coverage.ts`、`capture-archive.ts`、
`comment-checkpoint.ts`、`adapters/`、`mcp/`）；`runtime/local/collection-executor.cjs`、
`collection-provider.cjs`

**状态**：已接入 + 合成验证；平台实际覆盖依赖可见数据，真实未验收

**延伸**：[BOUNDED-COMMENT-READ.md](../BOUNDED-COMMENT-READ.md)、[COMMENT-CHUNKS.md](../COMMENT-CHUNKS.md)、[COMMENT-CONTINUATION.md](../COMMENT-CONTINUATION.md)、[COMMENT-READ-THROUGH.md](../COMMENT-READ-THROUGH.md)

---

## 2. 评论匹配

**职责**：用模型对整帖评论打分，产出可审核的结果。

- 输入：本轮可靠成员、评论规则、模型设置
- 输出：`SemanticReview`、`SemanticModelCall`、`AutoReviewJob`

**关键约束**

- 只用可靠的本轮成员，不混入历史评论
- 整轮采集完成后才开始（阶段屏障）
- 展示全部评论与真实分数，不人为截断；超过模型容量时整帖停止，不偷偷抽样
- 模型失败与费用按实际调用记录，不用估算冒充账单
- 审核目标带版本，目标版本变化后回复草稿必须显式确认

**代码**：`apps/api/src/collection`（`semantic-evaluator.ts`、`qwen-provider.ts`、`comment-rules.ts`、
`whole-post-capacity.ts`、`model-cost-estimate.ts`、`semantic-redaction.ts`、`comment-checkpoint.ts`）；
`runtime/local/automatic-review.cjs`、`review.cjs`、`run-review.cjs`

**状态**：已接入 + 合成验证；付费模型调用需单独授权，未做真实付费验收

**延伸**：[QWEN-COMMENT-MATCHING.md](../QWEN-COMMENT-MATCHING.md)、[MODEL-SETTINGS-SECURITY.md](../MODEL-SETTINGS-SECURITY.md)

---

## 3. 自动回复

**职责**：审核到明确终态后，派生发送任务并执行，记录回执。

- 输入：审核目标版本、门槛、原文内容、渠道（评论 / 私信）、发送账号池、每账号共享日额度
- 输出：`AutoContactJob` → `SendAttempt` / `ContactLedger`

**关键约束**

- 评论与私信分别选模板，模板按渠道隔离
- 双选派生各渠道任务，**不回填历史**
- 账号锁、共享日额度（`AccountDay`）、跨渠道去重、勿联系/已联系检查都在服务端执行
- 未知结果保留占用与去重，不盲目重发；未知不当失败
- 平台限流、验证、封禁后即停，不自动换号绕验证
- 保存规则保持关闭；发送需独立授权

**代码**：`apps/api/src/auto-contact`（`contact-policy.ts`、`contact-sender.ts`、`reply-stage-journal.ts`、
`live-journal-progress.ts`、`xhs-reply-protocol.ts`、`xhs-reply-transport.ts`、`xhs-restriction-transport.ts`）；
`runtime/local/contact.cjs`、`send-safety.cjs`、`send-executor.cjs`

**状态**：评论回复已接入 + 合成验证；真实发送需逐次授权

**注意**：私信渠道在本机只有协议定义与本地预览，**没有接通发送**，见模块 6

**延伸**：[COMMENT-REPLY-TARGET.md](../COMMENT-REPLY-TARGET.md)、[DM-TEMPLATES-AND-DAY-LIMIT.md](../DM-TEMPLATES-AND-DAY-LIMIT.md)

---

## 4. 待处理

**职责**：把自动流程没跑完的可操作任务集中起来，允许单条人工处理。

**关键约束**

- 每条显示渠道、对象、原因
- 单条选择兼容账号与渠道模板，预览后确认
- 成功与未知结果禁止直接重发

**代码**：`apps/web/src/features/local-workbench/local-record-pages.tsx`（`LocalPending`）；
页面 `/auto-contact/pending`

**状态**：已接入

---

## 5. 接收消息

**职责**：在限时窗口内接收平台推送的评论通知与私信，落库去重，提供系统内未读。

- 输入：管理员显式选账号 + 读确认
- 输出：`InboxReceiver`、`InboxMessage`、`InboxRead`

**关键约束**

- 窗口 15 分钟，受管浏览器每 5 分钟租约轮换；部署、页面加载、API 重启都不自动启动接收
- 只用项目受管 MCP 浏览器，独立哈希固定的接收专用二进制；恰好四个工具：`start` / `drain` / `snapshot` / `stop`
- 账号隔离、稳定身份、增量去重
- 区分平台主动事件与补偿读取；不宣称零轮询或全量历史
- 历史上限：100 条评论通知、10 个可见单聊会话 × 50 条入站消息
- 读取会改变平台未读状态；系统未读是独立的一套
- 只做增量迁移，不动原业务记录与 UNKNOWN 证据

**代码**：`integrations/inbox-mcp`（Go）；`apps/api/src/inbox/protocol.ts`；
`runtime/local/inbox-executor.cjs`、`inbox.cjs`；页面 `/inbox`

**状态**：合成验证；自然新消息及时性与长期低资源认证待真实验收

**延伸**：[inbox-reception.md](inbox-reception.md)

---

## 6. 平台会话与私信

**职责**：展示已有账号、会话、消息，并提供私信内容的**本地预览**。

**关键约束**

- 服务端**没有 DM 发送路由**；预览返回 `PREVIEW_ONLY`、`sent:false`、`canSend:false`、
  `authorizationCreated:false`、`conversation:null`
- 收件人取自已存审核/评论的稳定作者，不接受客户端传 ID 或昵称
- 版本不匹配、绑定缺失直接失败；关键词/职业缺失如实报告，不从后一条评论推断
- 本地策略包里有 DM 协议定义与校验（`dm-protocol.cjs`），但没有接入发送执行
- 放开真实发送的前置：可验证的 API/工具契约、真实会话绑定、收件人校验、额度原子预留、
  单次派发与 UNKNOWN、DM 专属队列与回执映射

**代码**：`apps/api/src/direct-messages`（`dm-send-protocol.ts`、`dm-transport.ts`、`dm-readback.ts`）；
`runtime/local/dm-protocol.cjs`；入口：配置管理 → 私信模板 → 私信预览

**状态**：仅预览

**延伸**：[direct-messages.md](direct-messages.md)

---

## 7. 配置管理

**职责**：集中管理关键词组、匹配方案、评论模板、私信模板、模型设置。

**关键约束**

- 默认只读，显式新增或编辑
- 分组分别保存，没有跨接口原子提交，也不提示"全部保存成功"
- 切换页签保留草稿，关闭需确认丢弃；保存失败保留该组草稿并报错
- 启动校验只要求已开启阶段的必要条件；读取失败不能误判为"开关关闭"
- 采集操作区只保留"开始采集"和"采集设置"，不重复配置

**代码**：`apps/web/src/features/local-workbench/local-configurations.tsx`；页面 `/configuration`；
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

**代码**：`apps/api/src/accounts/account-execution-policy.ts`；`runtime/local/accounts.cjs`、
`account-safety.cjs`、`credentials.cjs`、`platform-protocol.cjs`；页面 `/platforms`、`/work/accounts`

**状态**：已接入 + 合成验证

---

## 9. 任务进度推送

**职责**：把任务阶段变化推到前端，让页面显示当前动作、完成、暂停、失败与未知。

**关键约束**

- 走已鉴权的 SSE `/api/events`，数据库是权威源
- 只推失效标识，不推帖子/评论文本、账号身份、凭据或执行权
- 客户端先订阅再取快照；120ms 防抖；重复事件丢弃；乱序只触发重读
- 15 秒心跳、60 秒快照修复、30 秒读兜底
- **不是**持久事件日志，也不是执行队列；重载只恢复当前真值

**代码**：`journey_push` 迁移 + `apps/api` 事件层；前端 `lib/journey-event-sync.ts`

**状态**：已接入

**延伸**：[journey-events.md](../journey-events.md)

---

## 10. 已退出模块

线索池、销售分配、销售跟进、人工 CRM 任务、旧模拟联系、线索通知：

- 前后端入口与执行代码已删除，相关 API 没有处理器
- `Lead`、`FollowUp`、`Task`、`CollectionNotice` 等表仅为历史外键、归档与审计兼容保留
- 没有管理界面，也不写入新记录
- 发送侧仍**只读**检查勿联系/已联系与 `ContactLedger`，防止升级后重复联系

不要为了"文件名零命中"移除这些只读检查。

---

## 页面与模块对照

当前页面统一由 `apps/web/src/features/local-workbench` 的 `Local*` 组件承载。

| 路由 | 组件 | 对应模块 |
| --- | --- | --- |
| `/` | 首页介绍 | — |
| `/automation` | `LocalTaskPage` | 1 / 2 / 3 三步自动化 |
| `/comment-review` | `LocalHistory` | 2 评论匹配（历史与审核） |
| `/auto-contact` | `LocalAutomation` | 3 自动回复 |
| `/auto-contact/pending` | `LocalPending` | 4 待处理 |
| `/configuration` | `LocalConfigurations` | 7 配置管理 |
| `/inbox` | `LocalInboxPage` | 5 接收消息 |
| `/platforms` | `LocalCapabilities` | 8 账号与设备 |
| `/reply-history` | `LocalReplyHistory` | 3 回复记录 |
| `/data` | `LocalDataPage` | 数据与导出 |
| `/work` | `LocalOverview` | 工作台总览 |
| `/work/accounts` | `LocalAccountPage` | 8 账号 |
| `/work/archive` | `LocalHistory` | 历史归档 |
| `/work/notices` | `LocalNotices` | 本地通知记录 |

## 已知不一致（待处理）

1. `README.md` 提到 `apps/worker`，该目录不存在。
2. `docs/ARCHITECTURE.md` 提到 `apps/api/src/replies`，该目录不存在；`auth`、`audit`、`agents`、
   `leads`、`followups`、`sources`、`tasks` 是空目录。
3. `REQUIREMENTS.md` 写"评论与私信可分别选择"，但私信实际只有本地预览，没有发送通道。
   按模块 6 理解，不要据需求文档认为 DM 已可发。
