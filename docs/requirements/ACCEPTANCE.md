# 当前验收范围

## 首次使用与桌面入口

- 空白本地数据首次打开显示「欢迎使用线索工作台」，不要求工作台注册、密码或验证码。
- 「连接账号」初始化成功后进入账号中心；「先进入工作台」初始化成功后进入概览。
- 初始化失败显示错误并允许重试；等待期间阻止重复操作。
- 重启后直接进入工作台；侧栏底部「本地工作台」菜单可再次打开使用引导，不重复初始化。
- 原演示认证页面、账号密码、退出登录、表单和专用依赖不再存在。平台账号扫码与会话保护继续保留。
- 引导在 320px、390px 和桌面宽度下可操作，没有页面级横向滚动；同时验证浅色、暗色和键盘焦点。

## 业务与安全边界

- 联系去重、额度、UNKNOWN 和恢复保护保持；旧线索的勿联系与已联系证据在导入时转为联系阻断（只读，不写回线索记录）；不删除或改写历史生产记录。
- 配置保存、平台连接、模型付费调用和外发分别授权，首次引导不替代任何业务授权。
- 工作台、自动化、审核、回复、待处理、消息、配置、账号、备份和恢复仍可从桌面导航进入。
- 模型 Key、平台 Cookie 和来源引用使用系统凭据保护，不进入业务备份或安装包。

## 评论匹配真实调用记录（2026-11-18）

- 账号与范围：单账号「采集专用账号」，一轮 3 篇，自动审核开、自动回复关。
- 采集：3 篇全部完整，430 条评论；其中 427 条正文非空、可送审。
- 审核：429 条帖按 50 条/批切 9 段，最终 427/427 完成；单批失败自动重试 3 次后暂停该帖，人工预览/授权恢复后完成，未重复计费。
- 平台：全程无风控限制记录（error_code=300013 计数 0）。
- 未覆盖：多账号、多轮稳定性、真实评论发送与自动回复链路（私信首联见下）。

## 私信发送实测（2026-11-23）

- 本机唯一可用账号向 3 个评论作者发送首联私信，平台消息回执 3/3 确认，队列行均转已发送。
- 其中 1 条最初因回读消息 ID 参与方顺序被误判为结果未知；修正回读后完成平台确认，恢复队列行并解除发送暂停。
- 未覆盖：评论回复、批量发送、多账号、自动发送长期运行与自然新消息。

## 评论发送实测（2026-11-23）

- 从「待处理」手动发送 1 条首联评论（发送队列行 `89d9293e`、来源 `MANUAL_REVIEW`、`manual_now=1`），目标帖子 `6afc6b0f…`、目标评论 `6afff5f8…`、收件作者 `661226…0375`。
- 平台回执新评论 `6b045cee…`，`send_attempts` 转 `CONFIRMED`，回读证据 `{"kind":"CONFIRMED","stopped":true,"submissions":1}`，队列行转 `SENT`。
- 同一时段 3 条评论行由人工取消（`DISMISSED`），2 条仍因自动回复总开关关闭停在 `WAITING_SWITCH`，1 条超 7 天 `EXPIRED`。
- 未覆盖：总开关开启后的自动派发、评论回复、批量与多账号、长期运行。

## 追加发送实测（2026-11-24）

- 从「待处理」手动发送 1 条评论（队列行 `4fd8eb61`、来源 `MANUAL_REVIEW`），目标帖子 `6aff3036…`、目标评论 `6b034ea5…`、收件作者 `5dd7bf…562d`；平台回执新评论 `6b04712c…`，`send_attempts` 转 `CONFIRMED`，队列行转 `SENT`。
- 从「待处理」手动发送 1 条首联私信（队列行 `1bcef603`、来源 `MANUAL_REVIEW`），收件作者 `661226…0375`；平台回执 `5bbf06da…1eb0475f206501d`，`CONFIRMED`，队列行转 `SENT`。
- 当日额度占用 2/10（评论与私信首联都占额度）；剩余队列 3 条等待自动发送总开关（1 评论 + 2 私信），1 条评论超 7 天过期。
- 收件仍为 0（`received_messages` 0、`inbox_receivers` 0）。

## 作者本机实测记录（2026-11-22 ~ 2026-11-24）

数据源为本机数据库 `workbench.sqlite`（含 WAL）的只读核对。

- 采集：3 轮真实采集落库，`collection_runs` 3 条、`run_posts` 16 条、`run_comments` 1347 条。11-22 23:43 完成 3 帖 34 条；11-23 18:25 完成 3 帖 2 条；11-23 18:26 部分完成 10 帖 1311 条。
- 审核：11 个 `review_batches` 全部 `COMPLETED`，`review_results` 43 条评论级判定（MATCH 9、NO_MATCH 27、UNCERTAIN 14），`model_submissions` 11 次真实付费调用。
- 入队：7 条评论行与 7 条私信行进入队列。评论行 2 条已发送、3 条人工取消、1 条因总开关关闭停在 `WAITING_SWITCH`（等待，不是失败）、1 条超过 7 天转 `EXPIRED`；私信行 5 条已发送、2 条等待开关。
- 发送：`send_attempts` 共 7 条，全部 `CONFIRMED` 且均取得平台回执：私信首联 5 条、评论 2 条。
- 账号：本机 2 个账号记录。
- 未覆盖：收件（`received_messages` 0 条、`inbox_receivers` 0 个）、平台会话回复、评论自动派发、多账号、多轮长期稳定性与自然新消息。

## macOS 预览包重建与钥匙串修复（2026-11-24）

- 0.1.0 首次启动会请求钥匙串条目 `SocialLeadDesktop Safe Storage`。该条目来自 Electron 的 Cookie 加密 fuse，不是平台登录态：平台会话使用临时 `cookies.json` 并在停止后封入项目 vault，`~/Library/Application Support/SocialLeadDesktop/Cookies` 为 0 条记录。
- 已关闭 `enableCookieEncryption`（`apps/desktop/electron-builder.cjs`），包校验期望值同步改为 48。
- 包：`Social-Lead-Desktop-0.1.0-mac-arm64.dmg`，287,919,082 字节，SHA-256 `bab04aaf6057eaecad51d132ec42bccdf8cb54812d26fcf5802910b32c0e49ba`。`verify-package.cjs` 输出 135 个文件、0 个禁用文件、fuse 与原生资源校验通过。
- 从 DMG 复制到 `/private/tmp` 后 `--self-test` 回执通过；正常启动到仪表盘，未出现钥匙串授权弹窗。
- 未覆盖：其他机器安装/升级、Gatekeeper 下载隔离、Intel Mac。

## Windows 预览包构建与虚拟机验证（2026-11-24）

- 环境：Parallels Desktop 中的 Windows 11 ARM64 虚拟机（build 26300.9974），x64 程序经系统模拟运行；Node.js 24.22.3 x64、Go 1.27.4 windows/amd64、.NET Framework `csc.exe`。
- 原生：`scripts/test-windows-native.mjs` 通过 DPAPI 往返、ACL、junction 拒绝与 owned 子进程终止；`windows-host.exe` 与 `desktop-mcp.exe` 均为 x64 原生构建。
- 包：`Social-Lead-Desktop-0.1.0-win-x64.exe`，276,067,636 字节，SHA-256 `286716bd67857d197226f50974fdf15b98e55f584c0e921ba5bb5453286e6b40`。`verify-package.cjs` 输出 135 个文件、0 个禁用文件、fuse 与原生资源校验通过。
- 本包在关闭 Cookie 加密 fuse 后重建（`enableCookieEncryption=false`）；win-unpacked 与安装目录的 `--self-test` 均回执通过。
- 安装：以 `/S /D=C:\SocialLeadInstalled2` 安装到自定义目录后，安装目录的 `--self-test` 回执通过。
- 未覆盖：Windows 11 x64 真机、默认用户安装路径、升级/卸载、干净机器安装、签名与真实平台链路。

## 工程验证

运行 `npm run check`、`npm run build`、`npm run desktop:stage` 和 `npm run desktop:test:ui`。
路径与打包回归必须覆盖含空格/中文路径、Windows 模拟路径、ASAR 通配归档、解包和内容白名单。

离线测试使用临时 SQLite、模拟兼容仓储及合成平台数据；实际 Electron 界面测试禁用真实平台、付费模型和系统凭据。
Windows 路径模拟不等于 Windows 真机验收；缺失原生资源导致的跳过项、签名、安装升级和真实收发仍需单独记录。
