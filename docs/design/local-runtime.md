# 可独立测试的本地运行时

`packages/local-runtime/src` 使用 Node 内置模块和已生成的纯业务规则包（内含 Zod），不导入 Electron、React、Prisma、PostgreSQL 或 Redis。Node 24.11+ 可直接运行：

```sh
npm test
```

本地运行时测试由 `npm test` 统一执行（先构建核心模块，再跑各模块测试），以当前输出为准。只跑本模块用 `npm run build:core && npm run test -w @crm/local-runtime`。所有测试创建自己的临时目录，未访问真实账号、数据库、模型或平台。迁移工具在 `scripts/local/import-offline.mjs`，只读显式指定的离线 JSON，不连接原数据库。

该实现为 Node CommonJS，**不等于语言无关的可直接复用库**。Electron 可在 main process 中直接使用；Tauri/Flutter 需选择随包 Node sidecar，或按相同表结构、状态机和测试契约移植为 Rust/Dart。安装用户不应承担运行时安装。用户已确认 Electron 桌面方案。

关键边界：

- 所有决定授权、去重、配额或任务所有权的写入在同步 SQLite `BEGIN IMMEDIATE` 事务中完成；事务内禁止 await/外部请求。
- QUEUED → RUNNING 使用 owner/fence/expiry；过期工作必须先对账，不能抢占后盲目重放。Mac 原生监督器退出证明和清理已接入；Windows Job Object 代码仍待真机验收。
- SEND 必须经 SendSafety 预留和派发；授权绑定精确内容、账号及版本、目标；发送 intent 与授权消费同一事务提交，然后才能执行外部操作。
- RESERVED/DISPATCHED/UNKNOWN 阻止同对象跨渠道重复触达；CONFIRMED 阻止同渠道跨账号重复触达。UNKNOWN 保留额度并暂停，不当作失败退款。只有可信执行器证明零次提交且已停止才能释放占用。
- 新建库与迁移备份拒绝任何已存在的目标及 WAL/SHM/journal；一致性快照使用 SQLite backup API，升级前备份走同一路径。桌面端不再提供恢复副本、切换副本与备份文件入口：需要副本时由离线迁移 CLI 生成新库。"数据管理"页只提供按类删除测试数据（`reset.cjs`），运行中的采集/审核会拒绝删除。
- 凭据存储接受系统 protector 接口；没有可用系统加密时拒绝保存，不生成明文主密钥或退回明文。通用核心本身不提供操作系统加密实现。
- schema v1 已冻结，v2–v9 迁入收件、采集审核、自动联系、模型提交及分块检查点；升级前生成一致性备份，后续必须新增迁移，不修改旧校验和。

已迁入采集/审核/收件仓储、整轮屏障、原模型证据规则、精确回执和冻结规则发送资格。桌面已注册模型、采集、收件和 SEND 执行器；平台操作经专用 Mac 原生 MCP 托管，UI 单独预览/授权。旧任务不在启动时恢复，内部 LocalQueue 不能作为 renderer 授权接口。账号 VERIFIED 只由本机平台身份核验流程产生。

人工审核联系和可靠入站回复 UI 已接入；自动规则编排、独立审核、跨轮检查点恢复及 UNKNOWN 只读核对已接入并用合成数据验证。旧采集与审核原始行完整归档、可证明归属的捕获/审核映射只读原生历史，无法确定归属的行保留并计数。详见 [本轮范围与实测证据](../requirements/DESKTOP-LOCAL.md)。不把合成测试或完整档案数量视为真实平台/完整产品验收。

2026-11-06 后续：v7 新增 automation_decisions，规则按轮冻结、整轮审核后幂等派生任务；收件在停止证明后仅续用原授权窗口。恢复核对仅解除无未知结果的导入/恢复暂停，保留所有风险和历史去重。见 ../requirements/DESKTOP-LOCAL.md。

本轮 v8 增加独立审核与证据核对表，v9 增加精确绑定旧 UNKNOWN 的只读核对链接。核对必须两个独立已停止会话；不清除额度、账号限制，不重放旧任务。仍无法证明的历史与模型 UNKNOWN 保持阻塞。
