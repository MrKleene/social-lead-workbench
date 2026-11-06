# 单人本地桌面版：实现与验证

2026-11-06。目标是 **macOS Apple Silicon 与 Windows 11 x64 两版**，共享 Electron/React、SQLite 和持久本地队列。程序自带 Node/SQLite；普通使用者无需安装 Docker、PostgreSQL、Redis 或 Node。Mac 当前目标为 macOS 13+、arm64（最低系统版本取自固定 Electron 45.2.3 的 Info.plist）。Intel Mac 尚无经过验证的构建。

**这是隔离开发的迁移预览，不能替代原工作台。** 本次没有修改、迁移或启动原业务数据，也没有采集、付费模型调用或对外发送。当前可用：首次初始化、多组关键词与匹配目标、系统加密模型 Key、逐批模型授权、业务记录/人工审核、备份恢复、旧 JSON 导入核对和数据副本切换。模型执行器已注册（合成测试模式禁用），只有使用者逐批明确授权后才调用；测试仅用假响应。平台扫码登录、实际采集、发送、接收和自动联系编排仍未接通，界面明确显示限制。

## 实现与保护

| 部分 | 当前行为与代码 |
| --- | --- |
| SQLite | `runtime/local/database.cjs`：内置 SQLite，WAL/FULL/FK、同步 BEGIN IMMEDIATE；校验和迁移，升级前一致性副本；v6 新增采集分块检查点 |
| 队列 | `queue.cjs`, `runner.cjs`：持久领取、租约/fencing、范围授权、请求幂等；重启撤销旧会话未消费授权和排队工作，已提交未知不重放 |
| 发送 | `send-safety.cjs`, `contact.cjs`：账号/会话/发送人、审核与模板版本、整轮屏障、勿联系、去重、日额度和规则额度；UNKNOWN 保留占用并暂停；尚无真实平台执行器 |
| 原采集器 | `collection-executor.cjs`, `collection-provider.cjs`：复用原有限采集器、覆盖协议与 XhsMcpAdapter，原文与分块检查点同事务，来源引用加密；停止未确认使本轮失败并持久暂停平台；当前仅注入合成 runtime 验证，未在桌面注册 |
| 模型 | `model-executor.cjs`, `workflow.cjs`：固定北京接口，无重试/换模型；原文/证据、整帖预算、当前账号版本和授权再验；持久提交意图限制一批一次；UI 配置授权与逐批预览/确认分开 |
| 无工作台登录 | 新库无 User/Session/密码表；审计来源 LOCAL_USER/AUTOMATION/RECOVERY/IMPORT；平台账号与可靠入站身份仍保留 |
| 凭据 | `credentials.cjs`：Electron safeStorage，种类/引用绑定、原子密文保存、无明文降级，Key/Cookie/来源访问引用不进数据库备份。OS 凭据往返尚未实际验证 |
| 桌面 IPC | 沙箱/contextIsolation/无 Node renderer；固定方法、窗口/mainFrame/origin 与大小校验；无本机管理 HTTP；禁止新窗口、导航、下载和权限请求 |
| 数据副本 | `data-manager.cjs`：只接受本机文件选择器给出的源文件；导入新库并展示计数；显式确认和 SHA256 绑定；空闲时备份当前库、原子更新活动库指针、重建服务。原库和备份保留，不重命名打开的 SQLite 文件 |
| 打包 | 固定源码白名单、无 node_modules/环境文件/业务数据/凭据；安全 fuses；Mac DMG、Windows 每用户 NSIS（卸载保留数据）；只允许在目标系统/架构构建 |

Windows 使用 `%LOCALAPPDATA%\SocialLeadDesktop`；Mac 使用 `~/Library/Application Support/SocialLeadDesktop`，均与原工作台独立。安装目录只存程序资源。Windows 辅助程序代码检查用户 ACL、NTFS、重解析点及系统版本，safeStorage 使用用户范围 DPAPI；**Windows 未实测，不代表已验收**。Windows ARM64/Server/WSL/网络盘不支持。

静态加密不能阻止同一用户权限的恶意程序。业务 SQLite/备份本身未整体加密，依靠私有用户目录；不自动同步。跨电脑恢复后需重新输入 Key、登录小红书。macOS Keychain 稳定性、正式签名身份与升级兼容仍待测试。当前同步 safeStorage API 固定于 Electron 45.2.3，后续升级须重新核对 API 和密文兼容。

## 迁移范围与使用

桌面：选择已导出的旧业务 JSON → 生成独立副本 → 核对逐表数量 → 勾选确认 → 备份当前库并切换。恢复 SQLite 备份也先生成独立副本，再经过同一核对/切换步骤。重新启动沿活动库指针打开，不会自动恢复业务任务。

旧业务白名单全部保留到 `legacy_records` 并可分页查阅；原生映射包括账号、关键词/模板/匹配目标、当天限额（含 0）和已占用次数、联系禁用与去重、收件和已回复消息标记、账号独立风险限制。模型和自动联系授权不继承；历史 actorId 仅为档案文字，不产生登录用户。历史收件缺少可靠身份时仍只读，不能因导入制造回复资格。

**仍未完成全部旧业务原生映射**：旧采集轮、审核批次/结果、历史自动任务等目前归档可查，不能当成新轮次直接继续执行。完整业务迁移尚不能声称完成。

管理员可用只读导出器（本次仅假数据库接口测试，未连接真实 PostgreSQL）：

```sh
# 在私有目录中写新文件；连接串只从显式环境变量读取，不自动加载 .env。
# LOCAL_LEGACY_EXPORT_DATABASE_URL 由操作者在本机安全设置，不要写入命令历史或 Git。
npm run local:export:readonly -- --ack-readonly-source /私有目录/business-export.json
npm run local:import:offline -- /私有目录/business-export.json /私有目录/new.sqlite
```

导出在一个 REPEATABLE READ + READ ONLY 事务中读取白名单，排除用户/会话/设备/Key 表及凭据列，清理嵌套秘密、Cookie 和来源访问引用；失败不留下部分导出。业务一致性迁移仍需操作者停止旧执行器，防止快照以后旧实例继续产生发送，而新副本不知情。不能用运行中的 SQLite 主文件复制代替 backup API。

## 构建与实际验证

开发需要 Node 24.11+ 和构建依赖，安装用户不需要。正式发布检查保持阻断：

```sh
npm ci
npm run desktop:test
npm run desktop:build
npm run desktop:test:ui
npm run desktop:package:mac:preview
node scripts/desktop/verify-package.cjs /绝对路径/Social\ Lead\ Desktop.app
node scripts/desktop/test-package.cjs /绝对路径/Social\ Lead\ Desktop.app
npm run desktop:release-check
```

Windows 在 Windows 11 x64 上构建 `desktop:package:win`，本机编译并打包 WindowsHost 辅助程序；命令首先检查发布门槛，当前预期拒绝正式打包。不应在 Mac 上伪称生成了原生依赖完整的 Windows 安装包。

已通过：110 项本地核心测试、1 项 IPC 边界测试；规则生成/Web TypeScript/Vite 构建；Mac Electron 合成真实窗口验证（3 条关键词、2 条匹配目标、键盘操作、历史私信只读、已读持久化、备份、导入预览/确认/切换、旧库保留、应用真正关闭重启、320/390px 布局）。模型与原采集器只用合成传输，未触及真实平台。

`--test-fixture` 只用于未打包开发；`--self-test` 可在安装包执行固定离线自检，只创建自己的临时目录，禁止用户指定数据目录，禁用系统凭据和外部执行器，退出清理。安装包核对、自检和截图证据在 `.local/desktop-qa/`，不包含真实业务数据。

DMG 为未取得 Developer ID/公证的开发预览，不能作为公开签名发行版。Mac 和 Windows 的 OS 凭据、崩溃/休眠、升级保留、卸载保留、浏览器与 MCP 实际业务验收仍待完成。Windows 原浏览器审核状态为 pending；现有 inbox MCP 在入口强制只收件，不能直接当通用登录/采集/发送二进制。

桌面构建链 minimatch 先前已固定 11.0.1。旧服务器依赖审计的 3 项 high 不在桌面 ASAR 内，未以跨主版本强制升级来改动原服务；正式分发仍需完整依赖和许可证复核。

本次包验证：Mac arm64 DMG 约 119 MB；ASAR 44 个文件、8,343,435 字节，禁入文件和过期源码均为 0，fuses 读回通过。实际启动包内程序的固定离线自检通过：初始化、保存 1 组合成配置、SQLite 备份，OS 凭据和外部执行器保持禁用。
