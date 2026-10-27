# 线索工作台

面向大学生选题、开题与论文帮助业务的线索发现与销售跟进工作台。先搜索公开帖子、查看评论和专业/需求线索，由人工核查后组织联系与销售交接。**评论留专业或关键词命中只表示可能有需求，不等于同意营销。**

## 需求、进度与后续开发

| 文档 | 用途 |
| --- | --- |
| [需求主文档](docs/REQUIREMENTS.md) | 35个稳定需求ID、业务目的、验收标准、依赖、待确认项和分阶段路线图。 |
| [实现状态表](docs/IMPLEMENTATION-STATUS.md) | 已实现/待真实验证/部分实现/未实现/平台能力待确认；每项代码、测试证据和下一步。 |
| [开发维护约定](docs/DEVELOPMENT.md) | 后续每次实现与验收如何同步需求、状态、证据和使用说明。 |

本轮基于`c26f97e`续做Windows适配分支；Windows实机与浏览器依赖审阅仍待完成。带日期的验收文档保留历史事实，当前状态以[实现状态表](docs/IMPLEMENTATION-STATUS.md)为准；不能把mock、接口预留或UI开关当作真实功能可用。

## 当前能做什么

- 自动联系与账号矩阵：规则、队列、跨账号去重、共享日额度和联系台账已实现并通过隔离验证，待批准迁移部署；真实发送适配器未接通，默认关闭，内容留空。[范围、证据和更新步骤](docs/AUTO-CONTACT-2026-10-27.md)。

- 中文CRM：管理员/销售会话登录、归属权限、来源核查、人工联系/意向记录、客户分配、备注/跟进/任务与审计；已在本地隔离环境验证。
- B 引力场工作台：以“自动化采集”为唯一突出主操作，按缺项引导关键词/账号；固定独立“采集结果”直接查看原文，LLM 可关闭。设置、审核、话术与销售入口保留；[使用与验收](docs/ORBIT-COLLECTION-2026-10-22.md)。
- 简洁采集任务页：一个「采集设置」入口、按真实数据更新的进度消息，结束直达结果；未启动时显示「尚未开始」，旧结果在「上次采集」展开；[使用与验收边界](docs/COLLECTION-TASK-2026-10-22.md)。
- 一级菜单「采集信息」：封面卡片点击查看已保存评论、回复及父评论，保留原文分页与返回位置；[使用及接口范围](docs/COLLECTION-INFORMATION-2026-10-22.md)；[封面存档与待加载后端](docs/COLLECTION-COVERS-2026-10-22.md)。
- 简洁账号中心：添加/恢复/设置抽屉；独立落盘确认与同账号重新扫码更新已完成代码及隔离验证，正式后端待批准重启；[保存与更新边界](docs/SESSION-SAVE-2026-10-22.md)。
- 采集安全诊断与完全相同载荷去重已完成代码和隔离验证，`12bbf20` 已获批加载到正式后台，真实重采仍待完成；[边界与部署状态](docs/COLLECTION-DIAGNOSTICS-2026-10-22.md)。
- 关键词/排除词/有限帖子预算可配置，模板可管理和纯文本预览；专业结构化识别尚未实现。
- 账号元数据、负责人、内部额度、模拟全局联系账本与勿联系约束已验证；真实消息发送未实现，模拟成功不等于平台确认。
- Mac ARM64/APFS下的管理员单设备批准、签名认证、撤销、私有凭证目录、账号互斥和持久实例已离线验证。
- 小红书本人扫码、指定账号的**单次只读采集入口已实现，真实联调尚未完成**。当前最多3篇、可获取评论窗口，明确partial；无定时采集、自动换号或真实评论/私信发送。

仍需实现或确认：约1分钟持续监控、约10个真实账号并用、真实发送适配器与账号用途真实验收、平台回复同步/自动回复/可选聊天、服务器与专用电脑分离、销售跨电脑生产部署、Windows原生验收/浏览器依赖审阅和抖音真实适配。内部默认10次预算不是平台安全保证，遇风控必须停止。

## 日常启停

在项目目录使用以下短命令（已初始化的 Mac 持久实例）：

| 命令 | 行为 |
| --- | --- |
| `npm start` | 后台启动 API/worker 与网页；就绪后返回，关闭终端仍运行；重复执行不会启动第二份 |
| `npm stop` | 正常停止网页、API/worker；**不停止或删除 PostgreSQL/Redis、数据卷、配置、会话或密钥库** |
| `npm restart` | 等待原受管进程组全部退出，再后台启动 |
| `npm run status` | 查看实例、网页地址及各服务状态，不读取凭据 |
| `npm run dev` | 只把受管网页切换为前台开发；Ctrl+C 仅停此前端，API/worker/DB不受影响 |

原 main 地址仍为 `http://127.0.0.1:63968`。`dev` 退出后用 `npm start` 补回后台网页即可。命令不安装系统代理，Mac 重启后需手动 `npm start`；不自动创建模型 Key、采集或发送。

**当前旧进程还在运行，本轮没有替你停启。** 新命令需要新控制通道；遇 `legacy-or-unmanaged` 会保留旧进程并拒绝 stop/restart，不能按旧 PID 或进程名杀进程。首次切换需要先正常结束原前端和后台，再 `npm start`，可单独安排确认后执行；不需重启 Mac。具体状态、边界和隔离测试见[简短命令说明](docs/COMMANDS.md)。

首次全新环境没有实例/管理员时，仍用兼容前台入口 `npm run dev:persistent` 完成交互初始化，然后正常 Ctrl+C，再采用上表。不会重置现有管理员或替换已有库。旧长命令保留给首次初始化、恢复与兼容，不再作为日常推荐。

帖子搜索、原文采集、独立语义开关和每批外发确认仍互相独立；任何启动命令都不授予平台或发送权限。真实评论/私信发送仍关闭。升级代码后，在授权且无需保留当前任务运行时使用 `npm restart`；正常启动仍沿用原有增量迁移/构建流程，数据库保持原卷。

### Windows状态

目标环境为Windows11原生x64、当前普通用户、系统盘NTFS及原生Node/npm；已有Docker Linux容器用于业务库。Windows默认私有目录、DPAPI和进程清理代码已加入，但本轮没有Windows原生编译/实测；固定版本配套浏览器来自尚未审阅的第三方包，真实启动会明确阻断。不得把单独DPAPI代码当成整链已经可用。使用[Windows独立验收流程](docs/WINDOWS-ADAPTER-2026-10-20.md)，不要复制Mac凭据或修改校验绕过。

## 数据存在哪里

`dev:persistent` 使用本机持久业务实例，数据库名为 `crm`；可以用于当前功能联测，但不是一次性测试库，也尚未部署到服务器。测试登录后添加的账号、配置、线索和跟进会保留，正常停止后再次启动同一实例仍可使用。

| 入口 | 数据与隔离 | 正常停止 |
| --- | --- | --- |
| `dev:persistent` | 默认实例 `.local/persistent/main`；独立 PostgreSQL `crm` 与 Redis 命名卷 | 保留业务数据、配置、设备与会话引用 |
| `dev:persistent:offline` | `.local/persistent-offline/main`；另一组容器、端口与卷，库名也可为 `crm` | 保留虚构演示数据，不接平台 |
| `dev:mock:isolated` / `dev:mcp:offline` / 队列测试 | 每次随机容器、端口，`crm_test` 在 tmpfs | 只清理本轮自有临时资源 |
| `test:persistent` | 随机离线验收实例，`crm_persistent_test`；备份恢复另用 `crm_restore_test` | 测试结束清理该测试自有资源 |

持久启动器直接管理带实例归属标签的 Docker 容器，**没有使用 Compose 项目**。卷名是 `crm-persist-<实例UUID>-pg-data` 和 `crm-persist-<实例UUID>-redis-data`，挂载到容器 `/var/lib/postgresql/data`、`/data`。macOS 上卷内容由 Docker Desktop 存储管理，不是项目目录内的数据库文件。`.local` 保存实例配置和私有凭据引用，不应删除或提交。

新Mac绑定把设备私钥存入当前用户默认钥匙串，公开元数据仍在实例目录；平台会话另存于 `~/Library/Application Support/SocialLeadWorkbench/devices/<设备ID>/credential-roots/default`，使用私有目录/文件权限，未新增应用层加密。旧设备及会话不自动迁移。Windows已提供DPAPI CurrentUser密文存储分支，尚未原生编译实测，完整边界见[Windows适配](docs/WINDOWS-ADAPTER-2026-10-20.md)。

旧的手动 Compose 开发路径是另一套环境：项目名 `lead-workbench`，默认卷 `lead-workbench_crm_pg` / `lead-workbench_crm_redis`，也可能叫 `crm`。**数据库名相同不代表同一个实例**；持久入口不会自动迁移这些旧数据。

## 离线开发和验证

```sh
npm run dev:persistent:offline # 独立持久离线演示，不连接平台
npm run dev:mock:isolated     # 临时虚构CRM/模拟采集
npm run dev:mcp:offline      # 临时离线MCP协议服务，不是真实平台
npm run typecheck
npm run build
npm test
npm run test:mock:isolated
npm run test:mcp
npm run test:persistent
npm run test:device:vault    # Mac临时钥匙串，虚构凭据
npm run test:xhs:entry:offline
npm run test:platform         # 跨平台策略/模拟测试
npm run test:windows:native   # 仅Windows11 x64；Mac明确跳过
```

测试资源和浏览器依赖说明见[开发维护约定](docs/DEVELOPMENT.md)。本轮134项单元、8项跨平台策略、9项预检、132项数据库/HTTP、14项队列（1项模式跳过）、2项worker、12组持久浏览器及13组账号UI检查在Mac通过；Mac临时钥匙串通过，Windows原生测试明确跳过。详见[Windows交付与剩余阻塞](docs/WINDOWS-ADAPTER-2026-10-20.md)。

## 项目结构

| 目录 | 内容 |
| --- | --- |
| `apps/api/src/` | NestJS：CRM权限/来源/跟进/话术/账号/设备/采集等模块。 |
| `apps/api/src/collection/worker.ts` | 独立有限采集worker，按模式和账号授权执行。 |
| `apps/web/src/` | React/Vite/TypeScript工作台，功能共置与统一API层。 |
| `apps/worker/` | 原内部健康任务worker，不能冒充平台发送执行器。 |
| `apps/agent/` | 远程执行协议预留/自检，领取接口尚未开放。 |
| `packages/contracts/` | 共享协议与校验。 |
| `prisma/` | PostgreSQL模型与增量迁移。 |
| `scripts/` | 初始化、持久启动、隔离测试和验收脚本。 |
| `docs/` | 当前需求/状态及历史阶段验收。 |

## 操作说明与历史证据

- [账号只读联测与启动](docs/ACCOUNT-READ-COLLECTION-2026-10-20.md)：当前P1操作入口及真实未验收边界。
- [专用电脑说明](docs/DEVICE-SETTINGS-2026-10-20.md)、[持久化说明](docs/PERSISTENT-WORKBENCH-2026-10-20.md)：设备/目录/恢复规则；其中早期“采集关闭”描述已由账号只读入口更新。
- [账号中心初版](docs/ACCOUNT-CENTER-2026-10-20.md)、[联系与模板](docs/CONTACT-AND-TEMPLATES-2026-10-20.md)：模拟账本与人工业务流程历史验收，不代表真实发送。
- [只读MCP离线验收](docs/MCP-READONLY-OFFLINE-2026-10-20.md)、[菜单过渡](docs/ORB-TRANSITIONS-2026-10-20.md)：协议与UI历史证据。
- [Compose历史验收](docs/COMPOSE-VALIDATION.md)、[原始架构](docs/ARCHITECTURE.md)、[初始验收](docs/ACCEPTANCE.md)：阶段资料，不代表当前远程/生产部署可用。
- [旧扫码协议说明](docs/XHS-QR-WORKBENCH-2026-10-20.md)、[旧分阶段登录准备](docs/XHS-REAL-LOGIN-2026-10-20.md)：仅保留协议历史；其中过时启动命令已移除，日常使用持久账号中心。

不把凭据、Cookie、二维码、Webhook或真实客户信息提交到仓库。外部任务完成通知不属于工作台功能交付范围。

持久实例锁报错时，请按[Mac锁安全恢复步骤](docs/PERSISTENT-LOCK-RECOVERY-2026-10-20.md)保留原数据库和端口；不要手删锁或切换新实例。

锁恢复成功后仍退出时，查看[启动失败诊断](docs/PERSISTENT-STARTUP-DIAGNOSTICS-2026-10-20.md)。Docker引擎不可连接应先打开Docker Desktop并等待就绪，无需重复重启或恢复锁。

独立评论规则与零匹配修复见[2026-10-21交付说明](docs/COMMENT-RULES-2026-10-21.md)。旧配置需用户主动启用并保存；新增迁移仅添加三个可空JSON字段，正常启动时应用，不会自动回补或重跑历史评论。

连续Ctrl+C或关闭终端造成反复残留锁的修复与当前恢复边界见[锁生命周期说明](docs/PERSISTENT-LOCK-LIFECYCLE-2026-10-21.md)。此为历史修复；新v3监督与旧v2迁移边界以[生命周期分离说明](docs/PERSISTENT-SUPERVISION-2026-10-21.md)为准。

## 评论语义审核（可选）

打开「评论审核」并保存目标。保存不会调用模型，历史目标与模型结果保持原版本。

- **手动测试**：自动识别关闭时也可使用。在可搜索、分页的弹窗选择一篇已采集帖子，确认全部已保存评论（包括回复）的范围、模型、目标和费用后，后台每批最多 5 条处理，无需逐批确认或重新采集。预览分页不限制任务范围，已尝试内容跳过，任务可取消。
- **审核结果**：展示原评论、帖子、相关度、理由、证据和历史目标/模型版本。可按相关度排序，调整分数范围，并按帖子、评论文字、人工状态、评估状态筛选与分页。无评分不伪造分数；模型完成不等同人工确认或已联系。
- **采集后自动识别**：新增开关默认关闭，旧总授权不会迁移为自动开启。明确确认持续调用、费用和数据范围后，只处理随后完成且单篇覆盖检查通过的已保存评论。每批最多 5 条，仍受全局并发、30 秒间隔和每日预算约束。覆盖未知、失败或取消显示原因。
- 关闭自动识别阻止尚未开始的新调用。在途请求可能已产生费用；失败与中断不自动重试。修改目标或模型配置会关闭自动识别，须重新确认。不会自动回补历史帖子或发送评论/私信。

整帖测试与相关度列表已获批准更新正式实例，兼容迁移、正常停启、数据保留与实页只读验收通过；自动识别保持关闭，真实模型连通性、费用与效果未验收。后续升级仍须获得运行时授权，并在快进源码前先正常停止 Vite，避免热更新造成新旧 API 混用。详见[整帖测试与相关度交付说明](docs/WHOLE-POST-REVIEW-2026-10-26.md)；上一轮已部署的自动/手动解耦见[历史交付](docs/COMMENT-REVIEW-AUTOMATION-2026-10-26.md)。

### 从终端或工具会话运行

日常统一使用 `npm start` / `npm stop` / `npm restart` / `npm run status`。后台日志保存在原实例私有目录，控制请求通过当前用户专用 Unix socket 送达实际持锁进程，不依据存储的 PID 杀进程。原 `dev:persistent:*` 长命令仍兼容，新的独立启停建议见[命令说明](docs/COMMANDS.md)。

Qwen 评论匹配的用户本地配置、预算、逐批脱敏预览和未接入边界见 [Qwen 接入说明](docs/QWEN-COMMENT-MATCHING.md)。自动识别默认关闭；手动批次需明确确认，真实发送保持关闭。


评论原文输入策略已获批准部署：手动整帖、手动批次和自动审核均按保存的评论原文判断，其他上下文保持原处理。旧预览需重新确认原文外发范围，历史结果不改写；自动识别仍关闭，尚未进行真实模型调用。见[原文策略与正式验收](docs/ORIGINAL-COMMENT-INPUT-2026-10-26.md)。

账号矩阵现已部署：在「评论审核」或「账号中心」进入「自动联系与账号矩阵」。规则、账号共享日额度和联系台账可查看/配置；真实发送仍不可用、默认关闭。当前 MCP 回复工具尚缺准确目标和可靠回执，私信无已接通入口。安全精确回复源码、独立 transport 和默认 OFF 的运行时接线已完成离线验证；候选未安装/执行，可靠平台提交回执映射仍待核实，未替换 MCP。见 [部署与接入核查](docs/AUTO-CONTACT-DEPLOYMENT-AND-SENDER-2026-10-27.md)。

帖子可访问状态与独立联系历史已完成代码和离线验证，尚待批准迁移/同步重启：待检查、正常、不可访问、确认已删除分别展示；404 不当作删除，原文和台账保留，失效任务阻断，恢复不自动补发。当前平台独立重检不可用，可在部署后人工记录可靠来源。[功能、测试与部署方案](docs/POST-AVAILABILITY-2026-10-27.md)。
