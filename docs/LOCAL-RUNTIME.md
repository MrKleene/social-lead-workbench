# 可独立测试的本地运行时

`runtime/local` 只使用 Node 内置模块，不导入 Electron、React、Prisma、PostgreSQL 或 Redis。Node 24.11+ 可直接运行：

```sh
node --test tests/local/*.test.cjs
```

当前 34 项合成测试通过。所有测试创建自己的临时目录，未访问真实账号、数据库、模型或平台。迁移工具在 `scripts/local/import-offline.mjs`，只读显式指定的离线 JSON，不连接原数据库。

该实现为 Node CommonJS，**不等于语言无关的可直接复用库**。Electron 可在 main process 中直接使用；Tauri/Flutter 需选择随包 Node sidecar，或按相同表结构、状态机和测试契约移植为 Rust/Dart。安装用户不应承担运行时安装。桌面框架选型尚未锁定。

关键边界：

- 所有决定授权、去重、配额或任务所有权的写入在同步 SQLite `BEGIN IMMEDIATE` 事务中完成；事务内禁止 await/外部请求。
- QUEUED → RUNNING 使用 owner/fence/expiry；过期工作必须先对账，不能抢占后盲目重放。外部执行器的退出证明和原生子进程托管尚未接入。
- SEND 必须经 SendSafety 预留和派发；授权绑定精确内容、账号及版本、目标；发送 intent 与授权消费同一事务提交，然后才能执行外部操作。
- RESERVED/DISPATCHED/UNKNOWN 阻止同对象跨渠道重复触达；CONFIRMED 阻止同渠道跨账号重复触达。UNKNOWN 保留额度并暂停，不当作失败退款。只有可信执行器证明零次提交且已停止才能释放占用。
- 首次备份/恢复/新库拒绝任何已存在的目标及 WAL/SHM/journal；一致性备份使用 SQLite backup API。恢复只生成新的独立副本，验证 schema/完整性，撤销活动授权，重新要求平台身份，保留历史证据。无自动激活。
- 凭据存储接受系统 protector 接口；没有可用系统加密时拒绝保存，不生成明文主密钥或退回明文。通用核心本身不提供操作系统加密实现。
- schema v1 尚属预览。发布后必须冻结 migration 并新增版本，不得编辑旧校验和接管旧数据库。

本运行时尚未实现全部原业务仓储、平台登录/采集/收件、模型、精确回复、整轮屏障和历史回显。没有默认真实执行器、没有自动启动的后台循环、没有对外管理 API。直接使用 LocalQueue 内部方法不构成用户授权；将来桌面桥接必须验证调用来源并执行完整业务资格判断。`accounts` 的 VERIFIED 状态也只能由可信的平台身份验证流程产生。

离线导入只完成业务原始行存档、部分配置/账号映射和接触风险/额度保护；缺少一致性旧库导出、完整原生映射与切换 UI。不得把 legacy_records 数量完整误认为业务功能已迁移完成。
