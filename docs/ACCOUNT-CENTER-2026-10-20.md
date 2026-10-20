# 账号中心第一版（2026-10-20）

## 本次范围

现有暗色太空工作台新增第六个“账号中心”菜单球。各球的材质持续柔和旋转/呼吸，文字和点击目标保持稳定；沿用统一展开切换、系统减少动态效果和非活动面板 inert。账号使用卡片列表和右侧详情，不逐账号增加小球。

管理员可新增、编辑别名、分配有效销售负责人、设置内部日额度、暂停/恢复模拟分配、归档。归档是可追溯软删除，不删除联系占用和核查历史。销售只能读取自己的账号并处理自己线索，使用账号时再次核对账号归属。元数据与勿联系、联系预留和核查操作均写 AuditLog，可通过现有管理员只读 `/api/audit` 接口查看。

所有账号均显示登录未接入；没有二维码、密码/Cookie字段、持久授权或发送能力。UNCONNECTED 表示平台未连接，在模拟工作流里可按额度分配，不表示平台在线。账号“可用”摘要仅表示模拟任务可用，真实平台可用账号数始终未验证。

## 服务端联系约束

- PlatformIdentity 已有 `(platform, platformUserId)` 唯一约束；ContactLedger 对 identityId 唯一，覆盖所有账号。昵称只展示。空白 ID 显示待人工核查并拒绝预留。
- 每次手动模拟预留先取得请求键事务 advisory lock，再锁线索、账号；重新核对线索/账号归属、人工审核、勿联系、模拟来源、平台和账号状态。HTTP 保留 SessionGuard、Origin、CSRF 和严格输入校验。
- 全局唯一请求键绑定操作者、身份、账号及 FIRST/FOLLOWUP。相同请求重试返回原尝试，不再占额度；不同内容或操作者复用键返回冲突。
- FIRST 占用后固定原账号。失败也不自动换号；首次模拟成功后不允许再次 FIRST。FOLLOWUP 必须已有原账号模拟首次成功，并继续固定原账号。没有自动分配、批量私信、自动重试或真实发送路由。
- ATTEMPTED 和 UNKNOWN 均占用内部日额度并阻止该身份再次尝试。FAILED 核查只释放一次；SIMULATED_SUCCESS 保留占用，明确不等于平台确认成功。核查带版本和依据，终态不可覆盖。
- 同一账号额度在账号行锁内检查和递增。取日使用锁后数据库 clock_timestamp 的 UTC 日期；跨日核查失败只释放尝试最初所属日期，绝不减新日期额度。默认 10、范围 0–1000，仅内部管理额度，不是平台安全额度保证。额度耗尽时服务端拒绝新预留，日期变化后按新日账本计算。
- RATE_LIMITED / VERIFICATION / BANNED 核查事件将账号置 RESTRICTED；未明确失败时保持 UNKNOWN 占用，不轮转给其他账号。
- 已有 contactedAt 人工记录阻止新的 FIRST，即使人工阶段被改回 MATCHED。人工记录不能自动成为平台成功或模拟成功凭证；无既有账号关联的历史记录保持人工处理。
- 审核不代表收件人同意；勿联系是独立字段，保留版本检查与审计，也阻止旧人工联系状态入口继续标记 CONTACTED/INTERESTED。

本轮验证的是服务端模拟任务不会并发重复占用，不宣称已验证真实消息投递。将来接入发送必须另行验证平台接口、授权、回执和故障恢复，并让发送执行始终通过此事务入口；本轮不存在发送执行器。

## API

- GET/POST `/api/accounts`
- PATCH/DELETE `/api/accounts/:id`（版本检查；DELETE 软归档）
- GET/POST `/api/leads/:id/account-contact`（读取状态 / 手动模拟预留）
- PATCH `/api/leads/:id/account-contact/block`（勿联系）
- PATCH `/api/leads/:id/account-contact/:attemptId`（人工核查模拟结果）
- `/api/health` 新增 `accountCenter: true`；旧 `/api/platforms` 账号列表同步应用销售归属范围，旧暂停入口递增版本。

## 验证与证据

独立 tmpfs PostgreSQL/Redis 运行 `npm run test:mock:isolated`：数据库 62 项通过（含新账号 15 项）、队列 12 项通过、健康队列 2 项通过。MOCK_ONLY 故意跳过 9 项 MCP 数据库和 3 项 MCP 队列集成测试。`npm test` 共 93 项通过（API 71、agent 4、工作台 18）。全工作区 `npm run typecheck`、`npm run build` 通过。

新测试覆盖 CRUD 管理员权限、销售归属与转交、归档、版本冲突、HTTP 会话/CSRF/输入白名单、全局并发首次联系、幂等重放与键冲突、同名用户/跨平台 ID/缺失 ID、审核与勿联系、真实身份拒绝、并发额度耗尽、固定原账号后续会话、人工记录防重复、限流/验证/封禁暂停、未知核查、跨 UTC 日期及重复核查释放、超过 30 条展示历史后仍可原账号跟进。

浏览器使用另建独立模拟预览和一次性测试账户，**不是用户 127.0.0.1:63445 页面验收**。未读取该栈密码、Cookie、数据库或客户数据，未停止或重启它。截图与逐项结果见 [evidence/accounts-2026-10-20](evidence/accounts-2026-10-20)。预览资源清理记录为 preview-cleanup.json。

可重跑 `scripts/test-accounts-browser.mjs`；需提供本机 Playwright 模块和 Chromium（可通过 PLAYWRIGHT_MODULE 与 PLAYWRIGHT_CHROMIUM_EXECUTABLE 指定）。脚本仅创建自己的隔离栈，临时登录信息仅驻留内存，停止时清理自身资源，不生成持久浏览器会话。覆盖 UI 新增、草稿、六球动画/稳定点击目标、系统减少动态效果、键盘、390px 无横向溢出、未知阻止首次联系与销售页面范围。

## 升级与剩余边界

新增迁移 `202610200005_account_center`，需在计划升级时先生成 Prisma 客户端、部署迁移、构建，再重新启动 API/worker 和前端资源。现有用户临时栈未执行迁移或重启；其启动器退出可能删除 tmpfs 数据，不能直接用停止重启当升级。本轮没有主动破坏旧数据；先由用户决定需要保留哪些临时数据与正式升级路径。

仍未实现真实登录/扫码、账号凭据保存、真实消息发送、聊天同步或自动批量私信。XHS_MCP_ENABLED 保持默认关闭，本次所有动态验收均为 MOCK。Fast 由上游创建任务时请求；当前执行工具不提供可核实的实际 service tier，不能宣称已验证实际 Fast。
