# 线索工作台 · CRM 与模拟采集

## 小红书：模拟、离线协议、真实登录准备

- 模拟工作台：`npm run dev:mock:isolated`。
- **离线虚构 MCP**：`npm run dev:mcp:offline`（旧名 `dev:mcp:isolated` 仍是离线服务）。
- **真实登录准备**：`npm run xhs:real:prepare`。此命令只检查，不启动登录、不读取 Cookie、不访问平台。
- 后续本人扫码与登录状态验证分为 `xhs:real:login`、`dev:xhs:real` 两步，需要在自己的终端分别确认；本轮未执行真实步骤。登录验证环境禁用采集与发送。

路径、独立端口、权限、停止/保留行为与验证范围见 [真实登录入口说明](docs/XHS-REAL-LOGIN-2026-10-20.md)。


独立本机项目。中文多人 CRM，管理员和销售使用服务端会话登录。当前支持虚构种子、可配置关键词模拟采集与人工 CRM 流程；已实现默认关闭的小红书只读 MCP 传输和任务入库，并完成离线服务验收。**真实平台联调、完整评论覆盖、自动首次联系、评论、私信和内嵌聊天未开放或未验证**。没有修改或调用旧小红书 MCP（18060）、账号、凭据或浏览器会话。

## 最新：账号中心与模拟联系账本（2026-10-20）

工作台新增第六个“账号中心”球，展开账号卡片与详情。管理员可管理别名、负责人、内部日额度、暂停和归档；销售仅可使用归属账号。全局稳定身份去重、固定原账号、未知结果占用、并发幂等与 UTC 额度账本均在服务端验证。全部联系操作仅为模拟；登录、扫码、授权保存和真实发送未接入。

类型检查、全工作区构建、93 项单元测试、62 项数据库测试、12 项队列测试和 2 项健康检查通过；独立浏览器桌面/390px、动画、键盘与销售范围通过。MOCK_ONLY 跳过 12 项 MCP 集成用例，真实 MCP 保持关闭。新增迁移尚未应用到用户现有临时栈，不会自动重启该栈。设计、升级边界、截图和验收详见 [账号中心](docs/ACCOUNT-CENTER-2026-10-20.md)。

## 默认关闭的只读 MCP（2026-10-20）

`MOCK`、`XHS_FIXTURE`、`XHS_MCP` 来源隔离。实际 MCP 初始化、工具发现、JSON/SSE、会话释放、有限任务、递归回复、入库、窗口起点和新观察提醒已通过本地假服务测试。真实模式仍关闭，不能据此宣称真实小红书已连接。当前上游没有评论游标输入，始终报告有限窗口，不建立完整真实基线。

- `npm run test:mcp`：启动全新 tmpfs PostgreSQL/Redis，运行 HTTP/权限/入库与独立 worker 回归，然后清理；不读 `.env`，不复用现有数据库。
- `npm run dev:mcp:isolated`：另开独立临时预览与离线 MCP 服务。只使用终端显示的一次性虚构账号；按 Ctrl-C 清理。不会启用真实模式。
- 最新类型检查、全工作区构建、164 项回归通过；浏览器桌面与390px窄屏闭环通过。详细契约、限制、修改清单、截图及未来最小授权见 [只读 MCP 离线验收](docs/MCP-READONLY-OFFLINE-2026-10-20.md)。

## 环境与快速启动

需要 Node.js 22+（本机使用 24.20.0）、npm、已启动的 Docker 引擎。PostgreSQL 与 Redis 都使用独立容器，不使用 SQLite。

```sh
cd /path/to/social-lead-workbench
npm ci
npm run local:env     # 仅第一次；已有 .env 时拒绝覆盖
npm run db:generate
docker compose up -d postgres redis
npm run db:migrate
npm run db:seed       # 6 条带【虚构】标识的线索，不创建任何登录用户
npm run admin:init    # 本机终端交互，邮箱/名称/隐藏密码/二次确认
npm run user:create   # 同样流程创建销售，可重复运行创建不同销售
npm run dev
```

打开 http://127.0.0.1:5173 。API 仅监听 `127.0.0.1:3100`，PostgreSQL 仅绑定 `127.0.0.1:55432`，Redis 仅绑定 `127.0.0.1:56379`。必须用此 IP 地址访问，与 CSRF Origin 配置保持一致。不要把监听地址改为公网地址。

当前工作区已安装依赖、初始化 `.env`、执行迁移和种子；重复启动时跳过 `local:env`。初始验收的临时 QA 用户与密码文件已清理，**没有默认管理员或默认销售密码**。当前已有用户自行初始化的管理员；新环境需执行 `admin:init`，已有管理员无需重建。

`.env` 由脚本生成随机数据库密码，以 0600 权限保存且不打印，已加入忽略规则。初始管理员密码只在本机终端隐藏输入，Argon2id 哈希后保存；脚本不接受密码命令行参数，不会覆盖已有管理员。默认 CRM 环境不存储平台凭据；显式启用的新登录流程仅在 Git 忽略的 `.local/xhs-real/<会话>/` 保存本人授权的会话，详见上方说明。

停止本机开发服务：在运行 `npm run dev` 的终端按 Ctrl-C。停止项目容器而保留数据：`docker compose stop`。本项目不自动删除数据库卷。

### Docker Desktop 凭据助手等待

本次原有 Docker 凭据助手导致公共镜像拉取等待。未修改原 Docker 配置和凭据；使用独立临时空配置匿名拉取官方 Redis 后成功。若再次遇到，可先检查 Docker Desktop 是否解锁，或用你自己的公开镜像拉取方式。已有 `postgres:17` 和 `redis:7-alpine` 镜像时可运行 `docker compose up -d --pull never postgres redis`。

## 新增：可配置关键词与低操作量工作台

默认首页为 `/work`，聚合新线索、待跟进、异常任务和新增提醒。关键词配置在 `/collection`，仅管理员可管理；模拟采集需要另开终端运行 `npm run dev:collector`。首轮基线不提醒，稳定 ID 去重，分页局部/超时/受限分别处理。详情统一展示原文与规则依据、分配、跟进和任务；支持列表内快速跟进、完成任务，以及最多 50 条的事务性批量分配。

2026-10-19 阶段 **84 项测试 + 2 项健康 worker 检查通过**，构建和类型检查通过。真实平台与 LLM 未接入，发送禁用。运行步骤、代码清单、操作步数、浏览器闭环和截图见 [本阶段验收](docs/COLLECTION-WORKSPACE-2026-10-19.md)。

## 已实现的 CRM 基础

- 登录 / 注销、管理员与销售角色、HttpOnly SameSite=Strict 会话 Cookie，服务端会话摘要、8 小时过期及注销撤销。
- 数据库持久化登录限速：15 分钟固定窗口，IP 30 次 / 邮箱 10 次；缺失或不匹配 Origin 的写请求被拒绝，登录后还需 session CSRF token。
- 管理员查看全部线索、分配/转交给有效销售；销售只读写分配给自己的线索及其跟进和任务。客户端传入的身份或角色不能改变权限。
- 线索列表、平台/状态/文本筛选、详情抽屉、原始评论和帖子 ID、人工核验说明、跟进记录、下次跟进时间及阶段、人工任务创建和状态变更。
- 分配、跟进、核验与审计放在事务内；行锁与版本号处理转交竞争和陈旧写入。转交后旧负责人立即无法通过 API 访问。
- 平台身份 `platform + platformUserId` 唯一；评论 `platform + platformCommentId` 唯一；同昵称不触发任何合并。来源冲突不覆盖原文。
- 管理员只读审计 API。界面展示平台能力、未连接状态及禁用发送控件。受限账号仅可暂停，没有换号或恢复发送入口。
- SSE 最小通知：15 秒会话有效性检查与通用 refresh 事件，客户端经当前权限重新获取 CRM 数据；流中不含线索内容。不是平台轮询。
- 独立 Redis/BullMQ worker，仅处理内部 `HEALTHCHECK`。协议包与 TypeScript agent 单次自检；无网络请求、定时轮询或平台调用。中心 `/api/agent/claim` 明确返回 503 禁用，尚无凭据配对。
- 浅灰蓝工作台、轻量导航、白色卡片与柔和阴影，紧凑概览及待跟进任务摘要，统一详情侧栏与状态筛选；抽屉/分段筛选/按钮/保存反馈动画，列表不重复入场，`prefers-reduced-motion` 时停用动态效果。

## 目录

```text
apps/api/src/          NestJS 模块化单体：auth/users/leads/sources/followups/tasks/audit/platforms/accounts/agents/collection
apps/web/src/          React + Vite + TypeScript + Tailwind + shadcn/ui
                       React Router 路由、TanStack Query、feature 共置与独立传输层
apps/api/src/collection/worker.ts  独立有限模拟采集 worker
apps/worker/           原独立 BullMQ worker（仅内部健康检查）
apps/agent/            本地 TypeScript agent 的禁用协议/地址校验/单次自检
packages/contracts/   Zod 共享协议与版本
prisma/               PostgreSQL schema 与已提交 SQL migrations
scripts/              安全本机初始化、虚构种子、隔离测试库与 worker 检查
compose.yaml          基础服务及 full profile 中央部署定义
```

## 验证

```sh
npm run typecheck
npm run build
npm test
npm run test:mock:isolated # 仅MOCK：临时数据库、真实队列/worker及HTTP业务回归；不启动MCP夹具或前端
npm run test:mcp       # 离线MCP验收：新建隔离数据库和队列，结束清理
npm run test:worker
npm run agent:check
npm audit
```

- `npm test`：71 项 API/规则/HTTP/MCP测试，4 项 agent 协议测试，18 项工作台测试。
- 旧 `npm run test:integration`：创建/复用本机 `crm_test`，对它运行迁移和 PostgreSQL + Nest HTTP 测试。新验收优先使用 `npm run test:mcp`。旧命令**每次清空 crm_test 内的本项目表**，不清空开发库 `crm`。数据库名/主机校验阻止误用远端或开发库。
- `npm run test:worker`：独立临时队列，验证健康任务完成、COMMENT 类型拒绝；结束后清理临时队列和测试 worker。
- 构建包括 contracts、API、web、worker、agent。测试账户由随机密码在内存中创建；不作为生产默认用户。
- 初始 npm audit 的测试工具和 Prisma CLI 传递依赖通告已修复：Vitest 5.0.5，deepmerge-ts/effect 安全版本 override；迁移、构建和测试复验兼容。

初始命令结果和浏览器验收见 [验收记录](docs/ACCEPTANCE.md)。2026-10-19 视觉改版、47项回归和最新截图见 [视觉改版验收](docs/UI-REFRESH-2026-10-19.md)。

## Compose 中央部署定义

`docker compose --profile full up --build` 定义了 postgres、redis、migration、API、worker、collector、nginx 静态站点。网页仍仅绑定 `127.0.0.1:5173`；API 无宿主端口，nginx 同源转发 `/api` 并关闭 SSE 缓冲。先停止本机 `npm run dev`，避免 5173 冲突。容器模式管理员初始化可在服务起来后运行 `docker compose exec api npm run admin:init`。

此前 CRM 阶段已实际构建 full profile 的四个应用镜像，并在独立项目、数据卷与回环端口 5184 完成整栈启动验收：迁移退出码 0，五个常驻服务 healthy，页面/代理/数据库就绪/worker 检查通过。API 的 `/api/health/ready` 查询数据库，数据库不可用时返回 503；web 等待 API 健康后启动。隔离方式、命令结果及清理记录见 [Compose 验收](docs/COMPOSE-VALIDATION.md)。新增 collector 服务本阶段仅做配置校验及本机 Node 进程验收，未重新做 full profile 启动。上述仅是此前本机部署验收；未来部署前还需 HTTPS 与 Secure Cookie、可信代理设置、真实域名 Origin、备份恢复、凭据管理、监控、会话清理与容量验收。

## 已知边界与下一里程碑

- 列表最多 500 条，筛选在已授权的返回集合上进行；下一步增加服务端分页、排序和规模测试。
- 用户创建是本机管理员 CLI；尚无网页用户管理、密码重置、MFA、团队/租户管理。当前一个工作台共享一个管理员范围。
- 已有人工 CRM 任务与手动有限模拟采集任务。没有真实平台调度、agent 配对/租约、真实分页游标与平台限额验证；模拟采集使用独立 collector，不冒充真实采集。
- 未建立跨平台“同一个人”的自动合并；未来若需统一客户实体，应人工确认关联并审计。
- 本机截图仅证明界面和虚构数据流程。旧 MCP 的小样本读取与 22.533 秒单次检测不构成规模/延迟保证。

下一里程碑在已实现但默认关闭的 XHS 只读链路之上，按新的最小授权完成真实接口兼容验证；agent 短期配对与完整任务租约回收仍未实现，用新的明确授权测试环境做有限读取验收；保留评论原文→需求判定→人工复核的证据链。主动首次联系作为独立受控环节，只在账号与能力重新验证、策略和人工确认明确后推进。抖音继续独立适配，共用 CRM 模型与权限，不复用账号会话。
