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

- 中文CRM：管理员/销售会话登录、归属权限、来源核查、人工联系/意向记录、客户分配、备注/跟进/任务与审计；已在本地隔离环境验证。
- 深色太空中心球与六菜单球，搜索设置、采集任务、匹配线索、回复话术、账号中心、销售跟进保持统一切换；桌面、窄屏和键盘已有离线验收。
- 关键词/排除词/有限帖子预算可配置，模板可管理和纯文本预览；专业结构化识别尚未实现。
- 账号元数据、负责人、内部额度、模拟全局联系账本与勿联系约束已验证；真实消息发送未实现，模拟成功不等于平台确认。
- Mac ARM64/APFS下的管理员单设备批准、签名认证、撤销、私有凭证目录、账号互斥和持久实例已离线验证。
- 小红书本人扫码、指定账号的**单次只读采集入口已实现，真实联调尚未完成**。当前最多3篇、可获取评论窗口，明确partial；无定时采集、自动换号或真实评论/私信发送。

仍需实现或确认：约1分钟持续监控、约10个真实账号并用、账号采集/评论/私信用途配置与自动调度、平台回复同步/自动回复/可选聊天、服务器与专用电脑分离、销售跨电脑生产部署、Windows原生验收/浏览器依赖审阅和抖音真实适配。内部默认10次预算不是平台安全保证，遇风控必须停止。

## 日常只需这个命令

在已准备好依赖的项目目录运行：

```sh
npm run dev:persistent
```

打开终端输出的loopback地址。只有当前库没有任何CRM管理员时，终端才会提示创建账号：邮箱、显示名称、设置密码、再次确认。邮箱只是本地CRM登录标识，不发送邮件，不是小红书账号。已有管理员时不会每次重新输入这些信息；启动器只检查是否有启用的管理员，网页仍需正常登录。全部管理员停用时拒绝启动，不会自动新建或重置。按[完整操作说明](docs/ACCOUNT-READ-COLLECTION-2026-10-20.md)执行：

1. 管理员在账号中心展开“专用电脑设置”，核对实际执行电脑并点击“一键绑定这台电脑”；OS和私有目录自动确定，再由本人扫码。
2. 登录及稳定平台ID验证成功后，配置“小红书只读”、关键词“无偿选题”、上限3篇。
3. 采集任务选择账号并逐次确认一轮读取，查看来源、计数、去重及部分覆盖/失败原因。
4. 在明确安排下正常重启持久实例，验证业务保留并主动核验会话恢复。

**以上真实验收尚待完成。** 没有真实证据前不改为“已验证”。平台缺少稳定ID或出现限制时停止，不回退mock、不自动换号。已有实例不能直接重启代替升级，尤其旧临时实例退出可能丢数据；不主动迁移或删除旧测试数据。

持久入口会生成Prisma客户端、应用自己的迁移并启动API/前端/专用采集worker；业务卷与本地引用正常停止后保留。全局旧MCP入口仍关闭，账号绑定只读入口单独受逐次授权控制。已有旧环境文件或实例锁冲突时先核对，不擅自读取秘密或清理未知资源。

### 本轮升级

后端需要由用户在原启动终端按 Ctrl+C，再在同一项目运行 `npm run dev:persistent`（若原来带 `--instance`，保留同名参数）。同一实例复用保存的数据库卷与端口；不重新初始化管理员、不删除 `.local` 或卷。当前页面应继续使用63968，若地址变化先停止核对。仅前端更新时会提示加载新版后端并禁用一键绑定。完整说明见[升级与恢复](docs/ONE-CLICK-DEVICE-2026-10-20.md#升级与用户操作)。

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

连续Ctrl+C或关闭终端造成反复残留锁的修复与当前恢复边界见[锁生命周期说明](docs/PERSISTENT-LOCK-LIFECYCLE-2026-10-21.md)。正常退出现在等待自有子进程结束再解锁；缺少退出证明的既有残留仍不会自动删除。
