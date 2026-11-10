# Social Lead 工作台

本机平台工作台：采集帖子和评论、评论匹配、评论回复与私信、接收消息、平台内会话。界面方向为紧凑石墨黑白，具体样式规范见 [apps/web/DESIGN.md](apps/web/DESIGN.md)。账号中心、设备和配置管理为这些流程提供支持。

## 当前功能

- 首页介绍项目；首页的开始采集只跳转自动化页面，不执行任务。
- 自动化按整轮采集、整轮评论匹配、自动回复三个阶段执行。缺失覆盖、失败、暂停和未知结果不会显示为成功。
- 评论和私信分别选择模板、派生任务和记录结果；同渠道跨账号去重，额度与风险保护保持有效。
- 待处理支持单条选择、指定兼容账号及渠道模板、预览确认；未知结果不能盲目重发。
- 采集信息、评论审核、回复记录保留当前和历史任务的可靠关联。单帖重新读取仅更新采集与审核，不派生自动发送。
- 接收消息通过项目受管 MCP 能力接入，按账号隔离及去重。平台是否推送、是否读全、是否已读均按实际证据显示，不能把历史读取当作新消息实时验收。平台内会话能力边界见 [接收说明](docs/requirements/inbox-reception.md)。
- 配置管理集中关键词、匹配方案、评论模板、私信模板和模型；默认查看，显式新增或编辑。

## 本机开发

开发需要 Node.js 24.11+ 和 npm。当前产品入口是 Electron 桌面应用，数据库使用内置 SQLite；
日常开发不需要 PostgreSQL 或 Redis。平台操作还需要经过验证的本机原生资源；构建成功不代表已接通真实平台。

```sh
npm ci
npm run desktop:dev    # 构建核心模块，启动 Vite 和 Electron
```

开发模式在原终端按 Ctrl+C 退出。需要查看构建后的界面时使用 `npm start`，它会先构建再启动 Electron。
应用正常退出时交还任务和进程所有权；不要直接强杀持有任务或设备租约的进程。

## 工程目录

| 目录 | 职责 |
| --- | --- |
| `apps/web` | React 界面，通过桌面 IPC 使用本地能力 |
| `apps/desktop` | Electron 主进程、受控 IPC、系统能力装配 |
| `packages/contracts` | 跨模块协议、数据结构和校验 |
| `packages/domain` | 业务规则、状态判断和纯计算，不依赖数据库或平台 SDK |
| `packages/local-runtime` | SQLite、队列、业务服务与模型/平台适配 |
| `packages/legacy-migration` | 隔离的旧 PostgreSQL 兼容实现与显式导出工具 |
| `integrations` | Go MCP 实现及桌面源码适配 |
| `native` | macOS / Windows 原生源码 |
| `scripts` | 跨模块构建、检查、发布和迁移编排 |
| `tests` | 跨模块集成与桌面端到端测试；模块测试留在各模块内 |
| `docs` | 当前需求、实现说明与工程约定 |

源码位于各模块 `src/`，编译结果位于 `dist/`（网页为 `dist-desktop/`），均不提交 Git。
`.local/` 存放本机临时构建和验证产物。目录与依赖规则见 [工程结构](docs/design/project-structure.md)。

## 构建与检查

```sh
npm run build             # contracts → domain → local-runtime → web
npm run check             # 结构、UI、设计文档、类型和离线测试
npm run desktop:test:ui   # Electron 合成界面测试，禁用真实平台与模型执行
npm run desktop:stage     # 已构建内容按白名单组装到 .local/desktop-stage
npm run check:legacy      # 可选：生成旧 Prisma 客户端并检查兼容代码，不连接数据库
```

`npm run check` 包含本地数据库、队列恢复、桌面边界和合成 MCP 通信测试。
原生平台测试按可用资源执行，跳过项不等于已验收。原生构建、系统凭据与安装包验证命令见
[桌面说明](docs/requirements/DESKTOP-LOCAL.md)。Windows 真机、签名和真实平台验收仍须单独完成。

[文档索引](docs/README.md) · [当前需求](docs/requirements/REQUIREMENTS.md) · [模块说明](docs/requirements/MODULES.md) · [实现状态](docs/requirements/IMPLEMENTATION-STATUS.md) · [验收](docs/requirements/ACCEPTANCE.md)

线索分配、销售跟进、人工 CRM 任务已退出产品，前后端入口及执行代码已移除。数据库中既有历史表和审计不物理删除；发送仍只读检查历史勿联系和已联系证据，防止升级造成重复联系。没有新的线索或跟进记录写入。2026-10 之前的带日期交付报告已删除，只保留在 git 历史中，不定义当前需求。

本仓库不包含登录凭据、Cookie、模型密钥或真实消息内容。模拟测试不等于最新版本真实全流程验收。部署服务器和桌面打包的能力需要单独核验，不因本机通过即承诺支持。
