# 单人本地桌面版：实现与验证

2026-11-06，隔离分支 `desktop-local-sqlite`。目标是 macOS 13+ Apple Silicon 和 Windows 11 x64；共享 Electron 45.2.3、React、内置 SQLite、本地持久队列。安装用户无需另装 Docker、PostgreSQL、Redis、Node、Go 或浏览器。

**Mac 已有包含平台组件的可安装测试版；两平台完整产品交付仍未完成。** 不应替换原工作台。当前没有迁移、覆盖或启动真实业务数据，没有真实平台采集、消息发送或付费模型调用。原工作区 1612 个基线文件复核无变动。

## 已接入的实际代码

- 无工作台账号密码；首次初始化后进入本地工作台。小红书账号身份、发送权限与独立风险限制继续保留。
- 多组关键词（每组最多 100 条）、多条匹配目标、评论/私信模板，模型配置和逐批费用/原文授权。
- 扫码登录：主进程启动固定 LOGIN 模式；二维码有界；稳定平台 ID 校验、重登不能换人或清除限制；原生进程确认退出后才加密保存 Cookie。取消/过期清理临时目录。
- 有界采集：UI 预览账号、关键词、笔记数和匹配目标；确认后冻结版本，注册原有限采集器/XhsMcpAdapter；HTTP 稳定身份证明、原文与分块检查点同事务；来源访问引用保存在系统密文库。
- 模型审核：固定北京接口，原整帖输入/证据校验、预算、等待间隔和持久提交意图。无重试、换模型或隐式环境 Key。
- 限时收件：显式同意可能标记已读，最多 15 分钟；分段受管原生会话、历史补读、推送帧解析、身份/代次/租约/去重、自然新消息与历史基线分开。UI 可通过任务列表取消。不会自动回复。
- 私信回复：只有可靠入站身份和最新锚点才能预览；逐条确认账号、对象、内容。原精确 DM 协议最多一次，平台 ID 和新页面读回必须绑定同一目标及内容。
- 人工审核联系：原生新轮次的审核结果须明确通过，且完整性屏障、原文和证据仍有效；UI 选择账号、渠道、模板及内容，再确认单次联系。评论先执行只读精确目标预检，证明绑定当前会话/账号/构建且最多有效 5 分钟。
- SEND 执行器已注册。先在 SQLite 持久记录发送意图；发送前再次检查资格，结束后先确认原生进程停止、保存原阶段日志再删除临时目录。错误回执、日志缺失、断线或停止无法确认均保留 UNKNOWN/额度并暂停，不自动重发。

以上链路不是空适配器或占位页面；代码已经接到 Electron 主进程。但真实平台页面、扫码、自然新消息和真实发送效果仍未做本次验收，不能把合成成功当作平台验收。

## 系统与安全边界

`runtime/local/database.cjs` 使用 SQLite WAL/FULL/FK 和同步 BEGIN IMMEDIATE；队列按 owner/fence/expiry 领取。重启撤销旧会话未消费授权及排队工作，已提交未知不重放。模型与平台执行器在合成测试模式全部禁用。

Mac 随包包含固定 Chromium 148.0.7778.215、源代码构建的专用 Go MCP 和 C 监督器。MCP 每次只开放 LOGIN/COLLECT/INBOX/DM/COMMENT/PREFLIGHT 对应工具或登录路由，禁止旧发布、点赞等通用接口。只监听随机数字回环地址，随机 Bearer 凭据不进入 renderer。主应用没有管理 HTTP 服务，使用固定 IPC、受信主窗口/mainFrame/origin 检查、请求大小限制、renderer 沙箱及 contextIsolation。

Mac 监督器持有独占操作锁，按本次创建的进程组托管子孙；控制器 EOF/取消后停止，再发送肯定退出证明，给主进程短暂密封凭据/保留日志窗口，最后清理。修正了原依赖另建进程组和默认关闭浏览器沙箱的问题；现在保留沙箱且关闭嵌套 leakless。不会使用历史存盘 PID 杀进程。

Windows 新增 `WindowsDesktop.cs`：挂起创建后加入 kill-on-close Job Object，再启动；父进程退出/控制通道关闭时停止，确认 Job 清空后做凭据交接和目录清理。共享 JS 已实现 Windows stdin/CRLF 生命周期协议，但 C#、ACL、DPAPI、Chromium 和安装仍必须真机验证。现有 Windows 浏览器审核门槛保留；不会因为 Mac 测试通过就开启 Windows 平台操作。

Mac 数据位于 `~/Library/Application Support/SocialLeadDesktop`，Windows 预定 `%LOCALAPPDATA%\SocialLeadDesktop`。安装目录仅程序资源。Key/Cookie/来源访问引用通过 Electron safeStorage 密封，不进 Git、业务备份或日志。Cookie 仅在受限操作临时目录中为浏览器短暂解密，停止证明后清理。系统加密不可用时拒绝保存，无明文降级。Mac 合成 Key 已实际完成系统加密往返；Windows safeStorage 对应用户 DPAPI 尚未验收。

SQLite/备份不做整库加密，使用私有用户目录；不自动同步。系统加密不能防御同一用户权限的恶意程序。跨电脑恢复后需要重新输入模型 Key、扫码登录；来源访问引用需重新采集。同步 safeStorage API 在固定 Electron 45.2.3 可用但有弃用提示，后续升级需迁移异步 API并重测兼容。

## 迁移、备份和旧数据

业务 JSON → 独立新库 → 核对逐表计数 → 明确确认 SHA256 → 备份当前库 → 原子切换活动库指针。SQLite 恢复也先到新副本。原库保留，不重命名打开中的 SQLite，不从运行中的主文件直接复制。升级前保留一致性副本并校验 v1–v6 迁移摘要。

白名单全部业务行在 `legacy_records` 保留并可分页查阅，排除登录用户、令牌、设备授权、模型 Key 和 Cookie。原生映射包括账号、配置/模板/目标、每日额度（含 0）、勿联系/去重、独立账号风险、收件和历史已回复标记，以及可证明归属的采集轮次、笔记、评论、带分数审核结果。

旧库的共享捕获记录可能由后续轮次更新，因此无法凭最后快照重建每一轮的完整原文。无法可靠映射的记录保留在档案并计入 unmapped 计数，绝不编造归属。原生历史轮次标记 `LEGACY_HISTORY_READ_ONLY`，审核自动联系资格为 0；不能重启旧任务或借旧审核发送。历史 actorId 仅为档案文字，没有创建工作台用户体系。

导入/恢复后的全局发送暂停仍需完成独立核对与恢复流程；目前没有可随意清除 UNKNOWN 或旧限制的 UI。**完整旧业务可操作迁移仍未完成**，原始行存档完整不等于业务功能全部迁入。

只读导出命令 `npm run local:export:readonly -- --ack-readonly-source /私有目录/business-export.json`；连接串仅从显式 `LOCAL_LEGACY_EXPORT_DATABASE_URL` 获取，不自动加载 .env。导出使用 REPEATABLE READ + READ ONLY。此轮仅用合成数据库客户端验证，没有连接真实 PostgreSQL。正式切换前还需停止旧执行器并核对快照后新增的发送证据。

## 构建与证据

- `npm run desktop:build`：规则包、TypeScript 和 Vite 通过。
- `node --test tests/local/*.test.cjs`：135 项通过。
- `node --test apps/desktop/test/*.test.cjs`：IPC、真实 Mac 监督器/崩溃清理、原生 MCP 模式目录、实际 SDK + 本机合成服务边界，共 12 项。
- `scripts/desktop/test-ui.cjs`：真实 Electron 窗口，初始化、三条关键词、两条匹配目标、历史私信只读、已读持久化、备份、导入/核对/切换、关闭重启和 320/390px 布局通过。
- `scripts/desktop/test-os-credentials.cjs`：Electron 系统加密合成密钥往返，磁盘无该明文，不读取旧凭据。
- `scripts/desktop/test-native-browser.cjs`：固定浏览器保留沙箱、本地页面、DNS 关闭、内置完整开源许可提取、子进程和临时目录清理通过。
- `scripts/desktop/test-mcp-browser.cjs /绝对路径/App/Contents/Resources/native/darwin-arm64`：直接使用安装包内 Go → 浏览器 → CDP 渲染本地页面，通过；没有平台导航。
- `verify-package.cjs`：ASAR 与源码逐文件比对、无 node_modules/环境/业务文件、fuses 和原生资源 SHA 校验。
- `test-package.cjs`：安装包内固定离线自检通过；自建临时数据库、初始化、配置、备份，凭据和外部执行器禁用。

构建者需准备固定 Go 1.24.13、项目依赖模块缓存和经审核浏览器程序；普通安装用户不需要这些开发依赖。`build-supervisor.mjs`、`build-mcp.mjs`、`prepare-browser.mjs` 生成本机原生资源；Mac 再执行 `desktop:package:mac:preview`。原生组件许可随包附带。`build-mcp.mjs --windows-x64` 已在 Mac 交叉编译生成 PE32+ x86-64 MCP；不是 Windows 运行验收。

本次 Mac 文件：`.local/desktop-packages/Social-Lead-Desktop-0.1.0-preview.2-mac-arm64.dmg`。未有 Developer ID 签名/公证，仅本机开发测试；不声称通过下载隔离属性/Gatekeeper、安装升级或其他 Mac 机器验收。Intel Mac 无验证构建。

剩余重点：自动联系规则完整管理及编排 UI；采集跨轮恢复/独立审核完整流程；收件自动让出账号给发送和状态 UI；旧数据发送暂停核对恢复；Windows 浏览器审核、C# 编译/ACL/DPAPI/Job 清理及干净机器 NSIS 安装；正式签名、公证、升级兼容；明确授权后的真实平台验收。`desktop:release-check` 继续阻止正式发布。
