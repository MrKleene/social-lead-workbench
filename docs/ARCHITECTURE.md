# 架构与权限边界

## 数据模型

User → Session：会话 ID 是浏览器随机 token 的 SHA-256 摘要；CSRF token 是独立随机值。Session 过期和用户禁用均在每次服务端请求验证。

PlatformIdentity (platform,userId) → Lead：一条平台身份对应一条线索，昵称仅展示，不作身份键。SourcePost (platform,postId) → SourceComment (platform,commentId)，评论关联身份并保留原文、上级评论 ID 字段、观察时间。只有 `ingestDemo` 内部种子服务，没有开放真实导入端点。

Lead → FollowUp / Task：跟进作者独立记录；任务权限跟随线索当前 owner。AuditLog 保存操作者、动作、实体和最少元数据，不复制密码、会话 token 或评论全文。

## 权限表

|操作|管理员|销售|
|---|---|---|
|列表/详情/跟进/核验/任务|全部线索|仅 ownerId=当前用户|
|分配/转交|允许，目标必须有效销售|拒绝|
|用户目录/审计|允许|拒绝|
|平台能力状态|允许读取|允许读取|
|暂停平台账号|允许|拒绝|
|平台采集/评论/私信/聊天|未实现且禁用|未实现且禁用|

所有入口经 SessionGuard；service 再校验 owner。锁住 Lead 行后再次核对权限，因此跟进写入和管理员转交不能交错绕过 owner 检查。版本号避免两个管理员或陈旧表单覆盖彼此。任务更新也锁定父线索。读取详情先按角色约束查询，非授权 ID 返回 404。

## 请求和通知

Web 同源 `/api` → Vite dev proxy 或 nginx → Nest → Prisma → PostgreSQL。无 CORS 放行。写请求要求指定 APP_ORIGIN；登录要求 JSON；已登录写请求另需 `x-csrf-token`。Cookie 在开发 HTTP 下 Secure=false；生产 HTTPS 必须改为 true。

SSE 每 15 秒发无敏感数据 refresh，随后客户端只通过权限接口重取数据。流每次核对 session 仍有效，退出后不再传递刷新。此为最小通知骨架，不提供消息事件持久化、跨实例扇出和断点补发。

Redis/BullMQ 仅用于独立 worker 的内部健康任务，CRM 事务不依赖 Redis。agent 的共享协议只接受 HEALTHCHECK，RESTRICTED/PAUSED 均 SKIPPED。无自动换号、无平台 API client、无浏览器自动化。

## 本机隔离

开发环境使用本项目目录、命名为 lead-workbench 的容器网络/数据卷和回环端口 5173/3100/55432/56379。整栈容器验收另用 crm-compose-qa-20261018 项目、新数据卷与回环端口 5184；临时 PostgreSQL/Redis/API 不发布宿主端口。没有读取现有 MCP 的配置或凭据。Compose 的 full profile 已完成本机整栈构建与启动验收，本次未公网发布。

## 接口摘要

- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- `GET /api/leads`, `GET /api/leads/:id`
- `PATCH /api/leads/:id/owner` `{ownerId,version}`
- `PATCH /api/leads/:id/review` `{note,version}`（确认需求，不是联系同意）
- `POST /api/leads/:id/followups` `{content,nextFollowUpAt,status,version}`
- `GET/POST /api/tasks`, `PATCH /api/tasks/:id` `{status}`
- `GET /api/users`, `GET /api/audit`
- `GET /api/platforms`, `POST /api/platforms/:id/pause`
- `GET /api/events`（SSE）
- `GET /api/agent/protocol`, `POST /api/agent/claim`（503 AGENT_DISABLED）
- `GET /api/health`（进程探针，非数据库就绪探针）
- `GET /api/health/ready`（查询 PostgreSQL，成功 200；不可用 503，不返回连接详情）

## 后续需完善

生产级任务分发和 agent 短期身份、事务 outbox、分页与搜索索引、外部来源的一致性校验、按业务团队隔离、管理员用户管理/恢复流程、速率桶和会话过期清理、告警与备份恢复、审计保留周期、HTTPS/代理与集中限流。不存在已完成真实获客的宣称。
