# Social Lead

本机运行的社媒获客工作台：采集帖子与评论 → 模型匹配潜在客户 → 人工审核 →
发送评论回复或私信首联 → 收进回复记录。界面紧凑、以黑白为主，全部数据留在本机，
没有账号服务器，也不需要 Docker、PostgreSQL 或 Redis。

> 当前为 0.1.0 预览版。安装包未签名、未公证，Windows 安装包尚未在真机完成安装验证；
> 具体缺口语见[已知限制](#已知限制)。

## 功能

- **账号**：平台扫码登录，多账号各自独立会话；登录成功不等于获得发送或任务权限，额度与设备租约按账号管理。Cookie 与模型 Key 通过系统安全存储加密，不写入业务数据库。
- **采集**：关键词组 → 笔记 → 评论。单帖重读只更新采集与审核，不派生自动发送；部分覆盖、失败与暂停按实际状态显示，不当作成功。
- **评论匹配**：模型按批审核评论，同一作者任一评论判定为匹配即整组已符合；审核结果可在页面逐条复核，匹配方案负责阈值与入队规则。
- **回复与私信**：评论回复与私信首联分别使用各自模板池，可多选并在批内随机分配；同一人对同一渠道只做一次首次联系；日额度、去重与风险保护始终生效。
- **待处理**：分「发送队列」与「需要处理」两个视图，支持批量立即发送、重试、移出待发送、过期重新排队；结果未知时自动只读核对，确认前不显示已发送，未确认不重发。
- **收件与记录**：按账号隔离、去重读取评论通知与私信会话，手动刷新获取快照；平台上的已读状态只在平台侧变化，本地只统计本地未读。采集、审核、发送、收件与回复记录保留可靠关联。
- **配置**：关键词组、匹配方案、评论/私信模板、模型、自动入队与自动发送集中管理，默认只读，显式编辑后保存。

## 下载与安装

安装包发布在本仓库的 Releases 页面，文件名形如：

- macOS：`Social-Lead-Desktop-<版本>-mac-arm64.dmg`（macOS 13 及以上，Apple Silicon）
- Windows：`Social-Lead-Desktop-<版本>-win-x64.exe`（Windows 11 x64）

安装包内已固定浏览器、平台组件与原生监督器，普通使用者无需安装 Node.js、Go 或浏览器。

**macOS 首次打开**：应用未使用 Apple Developer ID 签名。首次启动请在 Finder 中右键应用 →
「打开」，或执行：

```sh
xattr -dr com.apple.quarantine "/Applications/Social Lead Desktop.app"
```

**Windows 首次运行**：SmartScreen 可能提示「Windows 已保护你的电脑」，选择
「更多信息 → 仍要运行」。安装为当前用户级目录，卸载不删除业务数据。

## 首次使用

1. 启动后按引导连接平台账号，或先进入工作台完成本地初始化。
2. 在「配置管理」中保存关键词组、匹配方案、评论与私信模板；需要使用模型时再填写模型 API Key。
3. 在「自动化任务」执行整轮采集，再执行整轮评论匹配。
4. 在「评论审核」复核匹配结果，确认后按方案写入待处理队列。
5. 在「待处理」查看队列，手动发送，或按需开启自动发送开关（额度与开关条件不满足时排队等待）。
6. 在「接收消息」手动刷新收件快照，在「回复记录」与平台内会话中处理回复。

## 数据与隐私

- 业务数据保存在本机 SQLite：macOS 为 `~/Library/Application Support/SocialLeadDesktop`，Windows 为 `%LOCALAPPDATA%\SocialLeadDesktop`。备份、迁移与删除都以该目录为准。
- 模型 API Key 与平台 Cookie 使用系统安全存储（macOS 钥匙串 / Windows DPAPI）加密，保存为独立密文文件，不进入业务数据库或业务备份。
- 本产品没有自有服务器，不上传业务数据。打开需要模型的能力时，评论内容会直接发送给你所配置的模型服务商，受其条款与计费约束。
- 仓库与安装包不包含任何真实账号、Cookie、模型 Key 或客户数据。

## 系统要求

| 平台 | 要求 |
| --- | --- |
| macOS | 13 及以上，Apple Silicon |
| Windows | Windows 11 x64（NTFS 本地磁盘） |

## 从源码构建

开发需要 Node.js 24.11+ 与 npm；打包还需要 Go 工具链、原生编译器与固定版本的浏览器。

```sh
npm ci
npm run build            # contracts → domain → local-runtime → web
npm run check            # 结构、UI、设计文档、类型与离线测试
npm run desktop:dev      # 构建核心模块并启动 Vite + Electron
```

打包前需要按当前平台准备原生资源（详见 [桌面实现说明](docs/requirements/DESKTOP-LOCAL.md)）：

```sh
npm run desktop:build:native                       # device-vault 与进程监督器
npm run desktop:prepare:mcp                        # Go MCP（需要 DESKTOP_GO 与模块缓存）
npm run desktop:prepare:browser -- /绝对路径/Chromium.app
npm run desktop:package:mac:preview                # 或 desktop:package:win:preview
```

`desktop:release-check` 会按 [release-readiness.json](apps/desktop/release-readiness.json)
拦截尚未实测的能力；预览命令跳过该门禁，产物只用于本机验证。

## 已知限制

- 安装包未签名、未公证：macOS 需手动放行，Windows 会出现 SmartScreen 提示；没有 Intel Mac 与 Windows ARM64 版本。
- Windows 安装包尚未在真机完成安装、升级、卸载验证。
- 收件为一次性可见范围快照，没有平台推送订阅；私信消息不参与新消息判定。
- 评论自动派发、批量发送、多账号并发与多轮长期稳定性尚未完整验收。
- 平台页面改版可能导致采集或发送失效，届时需要更新随包组件。

## 许可

本项目以 [PolyForm Noncommercial License 1.0.0](LICENSE) 发布：允许个人使用、
研究、试验与爱好者项目；不允许商业用途。商业使用需要单独授权。

随包第三方组件与修改声明见 [NOTICE](NOTICE)。

## 开发文档

[文档索引](docs/README.md) · [状态总览](docs/requirements/OVERVIEW.md) ·
[模块说明](docs/requirements/MODULES.md) · [界面规范](apps/web/DESIGN.md) ·
[工程结构](docs/design/project-structure.md)
