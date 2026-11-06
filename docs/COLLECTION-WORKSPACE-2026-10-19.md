# 可配置采集与待处理工作台验收（2026-10-19）

项目：`/Users/kleene/Documents/Codex/2026-10-18/task-2`。

本阶段交付的是可运行的**配置 → 有限模拟采集 → 规则筛选/去重入库 → 待处理/提醒 → 人工跟进**闭环。真实平台调用、LLM 判断、自动首次联系、评论、私信与内嵌聊天未开放。没有读取平台凭据、建立配对、调用 18060、切换平台账号或设置真实采集轮询。

## 已落地

- 管理员管理多组关键词：名称、平台、最多 100 个关键词（每词最多 40 字；本轮帖子/请求预算不变）、最多 20 个排除词、每轮 1–10 帖预算、编辑、启停、归档。服务端严格校验、版本冲突与审计；销售无配置/运行权限。编辑创建新规则版本，重新建立基线。归档保留来源证据。
- PostgreSQL 增量模型：CollectionConfig、CollectionRun、MonitorPost、CommentObservation、SourceMatch、CollectionNotice、NoticeRead。保留原有平台身份/帖子/评论/CRM 模型和唯一约束。无 SQLite 替换。
- 适配接口隔离平台。MockAdapter 提供稳定虚构 ID、搜索与评论分页、楼中楼、故障场景。XhsMcpAdapter 仅含 `search_feeds` 和 `get_feed_detail` 的注入传输/解析代码，默认关闭；没有 HTTP 传输实现、地址、凭据或运行注册。采集引擎额外拒绝非 MOCK 模式。
- 每次手动提交一个有限 BullMQ 任务，独立 `dev:collector` 进程处理，单并发。最多 32 次适配器读取、100 条评论、每流 4 页、单次 3 秒、总读取 20 秒。入库事务另有 20 秒超时；这些预算不代表完整端到端耗时保证。
- 首次完整评论快照建立基线，历史评论可以成为待核验线索，但不会冒充新增提醒。首次局部读取保持未建立基线；恢复完整后不补发历史提醒。后续新稳定评论 ID 幂等提醒。多条评论同一平台用户共用线索；跨平台同名或同 ID 字符串不合并。冲突原文拒绝覆盖。
- 单独记录完整/局部覆盖、超时、登录失效、受限、暂时缺失、明确删除信号。缺失不推断删除，证据不物理删除。真实适配器尚无验证过的分页/删除证明，始终保守标记局部覆盖；删除信号仅通过模拟测试验证。
- 失败后 30 秒起指数退避，上限 5 分钟，需手动重试；登录失效/受限自动停用配置，无换号逻辑。可暂停排队或运行中的任务，提交前再次检查配置版本和暂停状态。进程中断遗留的 RUNNING 任务需管理员暂停后手动重跑；没有冒充已完成的租约恢复功能。
- 提醒读取、已读记录均经会话和线索负责人权限校验；转交后旧负责人失去访问权限。SSE 延用每 15 秒通用 refresh、重新按权限取数，流不携带线索内容；这是工作台刷新，不是平台轮询或一分钟检测保证。

## 操作布局

默认路由 `/work`：新线索（未核验或管理员待分配）、待跟进（跟进阶段、安排时间或待办任务）、异常任务（管理员）。最新线索优先，快捷搜索与“仅未分配”，每行给出下一步。

- 右侧新增提醒直接打开统一详情侧栏。
- 同一侧栏展示来源原文、稳定 ID、楼中楼、规则命中、人工核验、负责人、跟进和任务；取消原来的三分区切换。
- 队列内展开快速跟进，默认阶段“跟进中”，一次保存记录、时间与阶段；不会自动核验需求或发送消息。
- 待跟进队列可直接完成人工任务，显示保存反馈。
- 管理员批量分配最多 50 条；版本号、有效销售校验、行锁与逐条审计同处一个事务，任意冲突整批回滚。界面不绕过权限。
- 配置属于低频入口，可保存复用；异常任务直接进入对应配置。原全部线索、任务中心、平台能力保留。

操作计数口径：一次按钮操作或一次字段填写计一步，阅读与滚动不计。改版前按原有代码/截图中的流程还原；改版后如下浏览器实测。批量提交因本机无销售账号，仅做权限和事务集成测试，步数是路径测算。

| 路径 | 原流程 | 新流程 | 验证方式 |
|---|---:|---:|---|
| 从列表新增跟进、安排时间并改为跟进中 | 打开详情→切到跟进→填记录→填时间→选状态→保存，6 步 | 展开快速跟进→填记录→填时间→保存，4 步 | 浏览器实际保存并刷新，时间仍为 10/20 09:00 |
| 读来源后写跟进（不改时间/阶段） | 打开详情→切换分区→填记录→保存，4 步 | 打开统一侧栏→填记录→保存，3 步 | 统一侧栏来源与表单同时存在；快速保存单独实测 |
| 查看一条新增提醒的来源 | 原版本无提醒入口 | 点击提醒，1 步 | 浏览器直接打开“模拟用户3”侧栏 |
| 首页完成人工任务 | 进入任务中心→完成，至少 2 步 | 待跟进→完成，2 步；已在该队列时 1 步 | 新建虚构任务后在队列完成，有成功反馈 |
| 给当前 10 条结果分配同一销售 | 每条打开→选择→保存→关闭，约 40 步 | 选择当前结果→选择销售→批量分配，3 步 | 选择 3 条实测；分配/冲突回滚/越权为 HTTP+PostgreSQL 测试 |
| 处理分页异常 | 原版本无集中入口 | 异常任务→查看并处理，2 步 | 浏览器进入具体配置与运行详情 |

## 实际浏览器验收

使用当前已登录管理员，保存配置 `【模拟验收】企业部署需求`，自定义关键词 `产品部署`，排除 `广告`，预算 1 帖。不创建新的持久登录凭据。

| 运行 | 读取评论 | 命中 | 新线索 | 新提醒 |
|---|---:|---:|---:|---:|
| 初始评论快照 | 4 | 3 | 2 | 0 |
| 增加一条求助评论 | 5 | 4 | 1 | 1 |
| 重复相同新增场景 | 5 | 4 | 0 | 0 |
| 分页不完整 | 4 | 3 | 0 | 0 |

每轮均为 6 次适配器读取。四轮经 API → Redis/BullMQ → 独立模拟 worker → PostgreSQL 实际完成。局部读取进入异常队列；已读后未读数量从 1 变为 0。模拟跟进及 10/20 09:00 下次时间持久化，创建的虚构人工任务在工作台完成。

首轮日期验收发现浏览器填入日期未被受控状态捕获；已改为提交时读取日期输入实际值，并刷新复测通过。后端开发热重载曾短暂造成页面请求失败，恢复后重新读取通过。

当前开发库保留原有 6 条虚构种子、此次 3 条模拟线索、1 组配置、4 条运行历史、来源证据、1 条已读提醒、2 条模拟跟进记录（含日期修正复测）和 1 条已完成虚构任务。没有修改原管理员凭据。本机无销售账号，所以界面分配按钮明确禁用并提示，不能宣称已做真实销售账号的浏览器分配验收。可用现有 `npm run user:create` 安全交互流程由用户创建销售后使用。

截图均为本机真实页面，不是效果图：

- [基线入库](screenshots/collection-workspace/01-baseline.jpg)
- [新增线索与提醒](screenshots/collection-workspace/02-new-comment.jpg)
- [重复去重](screenshots/collection-workspace/03-deduplicated.jpg)
- [提醒直达统一侧栏](screenshots/collection-workspace/04-notice-detail.jpg)
- [快速跟进日期复测](screenshots/collection-workspace/05-inline-followup.jpg)
- [队列内完成任务](screenshots/collection-workspace/06-task-completed.jpg)
- [异常任务队列](screenshots/collection-workspace/07-exception-queue.jpg)
- [待处理与批量选择](screenshots/collection-workspace/08-work-queue.jpg)
- [提醒已读](screenshots/collection-workspace/09-notice-read.jpg)

## 命令与真实结果

2026-10-19 最终验证：

| 命令 | 结果 |
|---|---|
| `npm run db:generate` | Prisma Client 生成成功 |
| `npm run db:migrate` | 2 个迁移，开发库无待应用迁移；新增采集迁移已应用 |
| `npm run typecheck` | 所有工作区通过，含 API 测试类型检查 |
| `npm run build` | contracts/API/web/worker/agent 均通过；web JS 约 437 kB，gzip 137 kB |
| `npm test` | API/规则/HTTP 38 项 + agent 4 项通过 |
| `npm run test:integration` | 隔离 `crm_test` 的 42 项通过（原 CRM 22 项 + 本阶段 20 项） |
| `npm run test:worker` | 原健康队列 2 项检查通过，平台任务拒绝 |
| `npm run agent:check` | `SKIPPED / PLATFORM_CALLS_DISABLED`，符合禁用预期 |
| `docker compose --profile full config --quiet` | Compose 配置验证通过 |

共 84 项测试通过，另有 2 项健康 worker 检查。HTTP 测试首次在限制回环监听的沙盒中遇到 EPERM，改用允许本机端口的执行后全部通过。集成测试只清理 `crm_test`，不清理开发库。没有为本阶段安装系统软件或新增 npm 依赖。

新增 collector Compose 服务复用现有构建，配置已校验；本阶段实际验收是本机 Node worker + 容器 PostgreSQL/Redis，没有重新完成 full profile 整栈容器启动测试，旧 Compose 验收不等于新服务的容器验收。

## 启动

已有依赖和本地环境时：

```sh
cd /Users/kleene/Documents/Codex/2026-10-18/task-2
docker compose up -d postgres redis
npm run db:generate
npm run db:migrate
npm run dev
# 另开终端（本阶段新增独立进程）
npm run dev:collector
```

入口 `http://127.0.0.1:5173/work`。关键词配置 `http://127.0.0.1:5173/collection`。所有宿主监听仍为回环。关闭模拟 worker 在对应终端 Ctrl-C；未完成任务可以在配置详情手动暂停。

## 主要修改文件

- `prisma/schema.prisma`、`prisma/migrations/202610190002_collection/migration.sql`：增量关系与唯一约束。
- `apps/api/src/collection/{contract,collector,ingestion,service,module,queue,worker}.ts`：协议、有限读取、事务去重、管理/提醒 API、独立队列 worker。
- `apps/api/src/collection/adapters/{mock,xhs-mcp}.ts`：虚构适配器与关闭的 XHS 只读解析骨架。
- `apps/api/src/leads/{leads,leads.service}.ts`：批量分配、规则证据详情、最新优先。
- `apps/api/test/collection-{unit,postgres}.test.ts`、原 HTTP/PG 测试：规则预算、权限、并发、基线/恢复/重复、错误、提醒隔离、批量回滚与回归。
- `apps/web/src/features/collection/*`：配置编辑、运行、历史、来源。
- `apps/web/src/features/work/*`：队列、快速跟进、人工任务、批量分配、提醒。
- `apps/web/src/features/leads/lead-detail-forms.tsx`、`lib/{types,use-events}.ts`、`main.tsx`、`components/app-shell.tsx`、`styles.css`：统一侧栏、路由、权限导航与刷新。
- `package.json`、`apps/api/package.json`、`compose.yaml`、`README.md`、本记录：启动与验证说明。

## 边界及下一步

规则筛选采用关键词命中、排除词及明确标注的求助词规则；不是 AI 理解，不能替代人工核验和联系授权。帖子预算按关键词顺序选取，不保证全平台或全关键词均匀覆盖。列表上限 500，配置 100，详情最多近期 20 轮/50 条命中；需要下一阶段服务端分页与规模验证。

建议下一步先完成销售账号的本机安全初始化和实际多人验收，再单独申请只读测试账号/连接范围授权，实现 agent 短期配对、租约和真实 XHS 分页契约验证。未获新授权前继续模拟，不启用任何发送。抖音真实适配独立推进，复用 CRM 权限与证据链。

XHS 骨架参考上游只读工具结构：[项目](https://github.com/xpzouying/xiaohongshu-mcp)、[类型定义](https://github.com/xpzouying/xiaohongshu-mcp/blob/main/xiaohongshu/types.go)。本机修改版 MCP 的兼容性尚未实际连接核验。
