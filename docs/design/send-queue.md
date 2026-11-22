# 发送队列、冻结计划与调度

审核完成或人工通过后，评论/私信发送不会直接执行，而是先写入 `send_queue`。队列表定义在 `packages/local-runtime/src/schema.sql`，入队配置表 `queue_rules` 由迁移 `packages/local-runtime/src/migrations/002-queue-rules.sql` 建立；逻辑在 `packages/local-runtime/src/send-queue.cjs` 的 `LocalSendQueue`，调度入口是 `runner.cjs` 每轮 tick 调用的 `sendQueue.schedule()`。

## 入队

- 自动入队发生在本轮审核屏障就绪之后。只读取 `review_batches.state = 'COMPLETED'` 的 `review_results`，按 `user_id + channel` 去重；同一收件人在同一渠道只入队一次。
- 每条评论按自己的 `policy_id` 找 `queue_rules`：规则启用、`decision = MATCH` 且分数不低于该方案阈值，才为规则勾选的每个渠道各生成一行；没有规则或规则停用的方案不自动入队。
- 自动入队还要求结果仍是 `PENDING` 或 `APPROVED`、评论允许自动联系；评论正文、用户与 `source_hash` 必须仍与审核时一致，证据里要有该评论的逐字引用。
- 人工通过把 `PENDING` 写成 `APPROVED + MATCH` 并按规则入队，不再卡模型分数；`NO_MATCH` 不提供通过。旧数据里的 `REJECTED` 只读保留，不再产生新的排除动作。
- 历史评论可在评论审核用「生成待发送」按各自方案的规则补入队；范围为全部历史审核，不受当前筛选影响；预览返回评论数、评论/私信行数、过期数与跳过数，应用后重复执行保持幂等。
- 已有活动队列行，或 `send_attempts` 中已有该渠道的 `RESERVED/DISPATCHED/CONFIRMED/UNKNOWN` 时跳过，不重复入队。
- 评论发布已超过 7 天的记录直接以 `EXPIRED` / `COMMENT_TOO_OLD` 入队，不会进入发送。
- 自动发送总开关或评论/私信渠道开关只决定新行是 `READY` 还是 `WAITING_SWITCH`；关闭时仍会入队并停留在「待发送」，原因为 `AUTO_REPLY_OFF` 或 `AUTO_CHANNEL_OFF`。

## 冻结计划

采集不再冻结回复规则。入队时按该评论所属 `queue_rules` 与当前自动发送配置写 `plan` JSON：规则 id 与版本、`policy_id`、阈值、渠道、来源、评论与帖子平台 id、收件人、渠道模板池、账号池和资格哈希。之后修改配置不会改动已入队行；派发时重新校验资格，失败转 `FAILED` / `ELIGIBILITY_CHANGED`，模板被删除则 `FAILED` / `TEMPLATE_CHANGED`。

## 状态

| 状态 | 含义 |
| --- | --- |
| `WAITING_SWITCH` | 已入队，自动发送总开关或该渠道开关关闭 |
| `READY` | 可被调度 |
| `WAITING_QUOTA` | 账号池今日额度已用完，等待刷新或人工处理 |
| `SENDING` | 已派发 SEND job，等待执行与回执 |
| `SENT` | 执行器确认成功 |
| `FAILED` | 明确失败，可重试或移除记录 |
| `UNKNOWN` | 提交结果未知，禁止自动重发 |
| `EXPIRED` | 入队超 7 天或评论发布超 7 天 |
| `CANCELLED` | 人工移出待发送、移除记录或规则撤销 |

活动状态是 `WAITING_SWITCH / READY / WAITING_QUOTA / SENDING`。唯一索引 `(platform, channel, recipient_id)` 只约束活动行；渠道独立，同一收件人的评论与私信可各有一条活动行。

## 调度节奏

- 同一时刻只允许一条 `SENDING`；存在 `SENDING` 时调度直接返回，不派发第二条。
- 候选按 `priority DESC, enqueued_at, id` 取最多 20 条，逐条尝试直到成功派发一条。
- 同一账号连续发送 1~5 条后才换号；同账号两条间隔 30~60 秒，换号后首条间隔 3~5 分钟。间隔由 `automation.slot` 的区间加随机偏移得出。
- 账号额度取 `daily_limit_override`、账号日额度与配置额度中的最小值；已占用数加上尚未尝试的 `QUEUED/RUNNING` SEND job 达到额度即跳过该账号。全部账号无额度时转 `WAITING_QUOTA`。
- 模板从渠道模板池选择；多模板时优先不与同一账号上一条重复。
- `safety_state` 的 `sending` 或 `platform` 有暂停原因时，调度整体暂停。
- 「立即发送」的行 `priority = 1`、`manual_now = 1`，在队首等待当前这一条发送结束后被派发；它绕过自动发送开关，但不会打断正在发送的一条。

## 授权与校验

每次派发生成精确 scope、`authorizations` 行和 `jobs` 行。basis 类型是 `AUTOMATIC_QUEUE` 或 `MANUAL_QUEUE`；issuer 对应 `AUTOMATION` 或 `LOCAL_USER`；`parent_proof` 固定为 `canonical({queueId, runId})`。执行前 `assertScope` 要求队列行仍为 `SENDING`、scope 哈希等于 `scope_hash`、issuer 与 basis 匹配、`parent_proof` 一致，并返回计划里的账号额度。授权有效期取 15 分钟与 1 小时中的较小值。

## 人工操作

- **立即发送**：同一批 1~200 条，必须同渠道；只接受可发送状态；所选账号与模板覆盖该批行的计划，状态转 `READY`、优先级提到最高。
- **重试**：只对 `FAILED`；开关打开或 `manual_now = 1` 时转 `READY`，否则转 `WAITING_SWITCH`。
- **重新排队**：只对 `EXPIRED`；评论发布已超 7 天时必须显式勾选覆盖，否则拒绝 `COMMENT_TOO_OLD`；重新计时 7 天。
- **移出待发送**：活动状态或 `WAITING_QUOTA`；`SENDING` 不允许移出。
- **移除记录**：只对 `FAILED / UNKNOWN / EXPIRED`，转 `CANCELLED`。
- **生成待发送**：扫描全部历史已完成审核，按每条评论所属方案的入队规则补齐缺失渠道，不受评论审核页筛选影响；跳过已入队、已发送、不符合或已联系的记录，过期评论仍生成并标记 `EXPIRED`。

## 恢复、过期与清理

- 启动或调度时，`SENDING` 但对应 job 已不在 `QUEUED/RUNNING` 的行转 `FAILED`；job 为 `UNKNOWN` 时原因 `SUBMISSION_UNKNOWN`，否则 `SEND_INTERRUPTED`。`UNKNOWN` 行不会自动重发。
- 活动行或 `FAILED` 行在入队满 7 天，或评论发布满 7 天时转 `EXPIRED`；原因为 `QUEUE_TOO_OLD` 或 `COMMENT_TOO_OLD`。
- `EXPIRED` 行在 `settled_at` 满 30 天后由 `purge` 删除。
- 规则被撤销时，该规则的活动队列行转 `CANCELLED` / `RULE_REVOKED`，并取消对应的排队 SEND job 与授权。

## 失效条件

- 真实平台发送未验收：以上调度、账号额度和回执处理均以合成测试验证。
- 账号存在回复限制（`holds`）、检测中或当前不可用时不会进入可发送账号池；账号池为空、账号不可用与额度用完分别显示不同原因。
- 结果未知必须人工对账；不能按失败直接重发。
