# 单人本地桌面版：实现与交接

2026-11-06。桌面框架仍在 Electron/Tauri/Flutter 比较阶段。已有 Electron 壳只作可撤回的技术预览，未合并或发布；暂停扩展框架绑定部分。核心存储/任务/安全模块采用 Node CommonJS，不依赖 Electron API；若选 Tauri/Flutter，可将其作为随包的 Node sidecar，或将协议和规则移植为 Rust/Dart，不能声称源码无需调整即可直接复用。

本分支是隔离开发的桌面迁移预览，**尚不能替代原工作台**。目前能初始化、管理本地配置、保存受系统保护的模型密钥、创建一致性备份及恢复到独立副本。小红书登录、采集、模型匹配、评论/私信发送和收件尚未接入桌面版。界面明确显示此限制，正式 Windows 安装包命令会被发布检查阻止。

## 已实现的边界

| 部分 | 实现位置 | 当前行为 |
| --- | --- | --- |
| SQLite | `runtime/local/database.cjs`, `schema.sql` | Node 内置 SQLite，WAL/FULL、外键、同步 `BEGIN IMMEDIATE` 事务；schema 版本及校验和；拒绝接管未知数据库 |
| 持久任务 | `runtime/local/queue.cjs`, `runner.cjs` | SQLite 持久化、单任务领取、租约与 fencing、请求幂等、范围绑定授权；过期执行转中断/未知，绝不自动重放 |
| 发送保护 | `runtime/local/send-safety.cjs` | 账号身份与版本、精确目标、授权消费、共享日额度/当日覆盖值、勿联系、跨账号及渠道去重、未知保留额度并暂停 |
| 单人模式 | `runtime/local/service.cjs` | 新桌面数据库无 User/Session/密码；审计用 LOCAL_USER/AUTOMATION/RECOVERY/IMPORT 来源和安装标识，无需伪造管理员账户 |
| 凭据 | `runtime/local/credentials.cjs` | 系统加密提供者、原子密文保存、绑定凭据种类和引用、无明文降级、前端无密钥读取接口 |
| 桌面边界 | `apps/desktop/src` | 单实例、沙箱 renderer、contextIsolation、固定 IPC 方法、发送窗口/mainFrame/origin 检查、禁止导航与新窗口；不开本机 HTTP 管理端口 |
| 配置界面 | `apps/web/src/features/local-workbench` | 初始化、多组配置、每组 1–100 条关键词、匹配目标及渠道模板、版本冲突检查；独立入口，无应用账号密码页 |
| 备份恢复 | `runtime/local/backup.cjs` | 空闲时 SQLite backup API；SHA256、schema/完整性/FK 检查；仅写新副本，保留额度和历史去重，撤销授权并要求重新登录平台 |
| 离线导入 | `runtime/local/legacy-import.cjs` | 只读显式提供的离线 JSON，凭据/用户表排除；全部允许业务行保留到 legacy_records，部分配置/账号及风险保护转入原生表；不恢复旧任务 |
| 打包 | `scripts/desktop/stage.mjs`, `apps/desktop/electron-builder.cjs` | 固定源码白名单、Electron 自带 Node/SQLite；不带 PostgreSQL、Redis、Docker、`.env`、数据库或 node_modules；Windows NSIS 每用户安装、卸载保留数据 |

发送保护核心仍不等于原业务资格判断全部迁移完成。原有整轮屏障、模型评分规则、入站身份、目标评论核验、平台账号观察证据及各 MCP 回执合同必须在适配时继续保留。目前没有注册任何真实执行器，也没有向桌面 IPC 暴露 enqueue/authorize/dispatch/result，不能通过本预览发起真实业务。

## 数据与系统保护

Windows 目标为 Windows 11 x64、本机 NTFS。程序资源与业务数据分开：程序安装目录只放可替换资源；`%LOCALAPPDATA%\SocialLeadDesktop` 放数据库、备份、恢复副本、密文凭据。macOS 预览用 `~/Library/Application Support/SocialLeadDesktop`。二者均与原工作台数据目录独立。

Windows 复用 `native/windows/WindowsHost.cs` 检查目录和已有文件 ACL、拒绝重解析点/云同步位置，并由 Electron safeStorage 使用用户范围的 DPAPI。辅助程序在开发/发布机器编译后随包携带，普通用户不应需要装编译器、Node 或数据库服务。干净 Windows 的 .NET 运行时、NTFS/路径限制、ACL 与杀毒软件行为尚需实测。Windows ARM64、Windows Server、WSL 和网络磁盘未支持。

DPAPI 主要保护静态密文免受其他系统用户读取；不能声称可以防住同一 Windows 用户权限下的恶意程序。数据库和业务备份本身未整体加密，依靠用户目录权限保护，不应自动同步或上传。备份不包含 credentials 目录；跨电脑恢复应重新输入模型 Key、重新登录小红书。密钥不会写入 URL、命令行参数或 Git。

官方依据：[Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)、[Electron 安全指南](https://www.electronjs.org/docs/latest/tutorial/security)、[Node SQLite backup](https://nodejs.org/api/sqlite.html#sqlitebackupsource-db-path-options)。当前固定 Electron 45.2.3；所用同步 safeStorage API 已公告将在 46 移除，升级 Electron 前须改用异步接口并验证密钥兼容。macOS 密钥长期稳定性还需要一致的正式签名；本次未访问真实系统凭据。

## 离线迁移约束

`npm run local:import:offline -- /绝对路径/export.json /私有目录/new.sqlite` 只接受新目标文件，不连接旧 PostgreSQL、不加载 `.env`、不运行采集或发送。源格式为 `{tables: {PlatformAccount: [...], ...}}` 或直接表名到行数组的映射；也接受已清理的 `social-lead-business-export-v1`。禁止覆盖或合并当前本地库，失败回滚并清理仅由本命令创建的目标。

用户、会话、刷新令牌、模型设置、设备密钥和平台登录凭据表不导入。业务历史中的旧 actorId 等只作为历史文本保留，不创建 User 关系或登录身份。原先缺少可靠入站身份的收件历史只存档，不能由导入制造“可回复”资格。未知、占用中的尝试跨渠道拦截，已知终态按原渠道拦截；勿联系、已联系和有兴趣的历史线索继续拦截；暂停账号按限制状态导入；当天限额（含 0）及已占用次数保留。

**这不是完整的数据迁移工具。** 目前没有旧库一致性导出器、所有旧表到新表的原生映射、迁移核对 UI 或新库激活。legacy_records 是保护原始业务历史的存档，不代表这些行已经能在新界面继续使用。备份恢复同样先生成独立副本，没有切换正在使用的数据库。正式切换前需停止旧实例所有执行器，取得同一时点导出、核对数量与风险证据、在新副本试运行，之后才选择激活；旧库和原备份必须保留。不能复制运行中的 SQLite 单个主文件来代替 backup API。

## 开发与验证

数据、安全及队列的独立测试在 `tests/local`；运行 `node --test tests/local/*.test.cjs` 只用 Node 内置模块，无需安装 Electron、React 或其他 npm 依赖。

开发机使用 Node 24.11+（用户安装包不需要另装 Node）：

```sh
npm ci
npm run local:test
npm run desktop:test
npm run desktop:build
npm run desktop:test:ui
npm run desktop:start
npm run desktop:package:preview
npm run desktop:release-check
```

`desktop:start` 会打开**独立的**桌面用户数据目录；无业务适配器，不会自动启动旧服务。`desktop:test:ui` 使用 `/tmp` 下专用、带标记的合成目录，显式禁用系统凭据访问，测试后清理。`--test-fixture` 在已打包应用中被拒绝。UI 证据写入被 Git 忽略的 `.local/desktop-qa/`。

本次实际结果：

- 35 项 Node 合成测试通过：事务回滚、两个独立进程竞争同一任务、进程退出无半写、授权撤销与 fencing、额度与未知状态、跨账号/渠道去重、备份恢复、凭据隔离及离线迁移保护。
- Web TypeScript 检查和 Vite 桌面生产构建通过。
- macOS Electron 实际 UI 通过：初始化、3 个关键词保存、键盘启动新增操作、创建备份、刷新后持久化、390px/320px 无横向溢出，无页面/console 错误。
- 构建未签名 macOS arm64 目录预览；仅用于开发验证，不是 Windows 安装包。打包后的真实平台链路、OS 凭据和升级恢复未验收。
- `desktop:release-check` 预期失败，列明待完成的发布条件，禁止将预览当正式成品。

依赖扫描记录：整个 monorepo 的 npm audit 返回 9 项（6 moderate、3 high）。其中新增打包链的 minimatch 带来 6 项传递告警；Nest/Express 的 body-parser、multer 链有 3 项原服务告警。旧服务依赖不在桌面 asar 中，构建链告警不等于桌面运行时入口，但仍列为正式发布前待处理事项。未用强制降级/跨主版本升级修改原服务依赖。审核输出未包含凭据。

## 剩余实现顺序与验收门槛

1. 将原服务的业务仓储迁到 SQLite：采集轮次/覆盖证据、模型审核、规则版本与整轮屏障、自动回复/手动处理、收件增量与可靠身份。不能直接把 PostgreSQL URL 换成 SQLite：行锁、advisory lock、jsonb/数组查询、LISTEN/NOTIFY、xmin 证明等需逐项替代。
2. 接入现有业务界面与受限 IPC 服务；只有本机明确操作能创建范围绑定授权。完整移除桌面旧 User/角色依赖，保留历史归属与安全审计。原服务器路径目前仍保留原 User/认证体系，不能把新入口无登录误说成整个项目已删完。
3. 实现并合成测试 XHS 扫码登录和密文 Cookie 适配、账号租约/子进程生命周期、采集、千问审核、精确评论/私信、收件。旧 MCP 仍期待 Cookie 文件，不能把 `.sealed` 直接当 Cookie JSON 使用；需完成适配后才注册执行器。
4. 完成一致性导出、原生数据映射、逐项核对、恢复副本激活和升级迁移。当前 schema v1 是预览，不能把后续修改 v1 校验和当生产迁移；开始发布后必须冻结已发布 migration 并新增版本。
5. Windows 11 x64 真机验收：干净机器安装、首次初始化、离线启动、不需 Docker/PG/Redis/Node、中文路径、普通账户、DPAPI 重启/跨用户失败、ACL/重解析点拒绝、休眠/崩溃/重启、双实例、辅助进程退出、升级保留数据、卸载保留数据、备份恢复、真实浏览器能力。
6. 完成依赖告警处理、安装包签名与分发、资源校验和及平台授权范围内的实际验收，再更新 `apps/desktop/release-readiness.json` 并构建 `desktop:package:win`。本次没有签名、上传、发布或调用任何真实平台/付费模型。
