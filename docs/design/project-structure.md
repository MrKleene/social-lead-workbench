# 工程结构与依赖约定

当前产品是 Electron 桌面工作台。目录按模块职责划分，不按开发阶段划分。
根目录只保留应用、共享包、异构集成、原生源码、工具、跨模块测试、文档和必要配置。

## 模块归属

| 模块 | 内容 | 允许依赖的工作区 |
| --- | --- | --- |
| `@crm/contracts` | 跨模块协议、校验、数据结构 | 无 |
| `@crm/domain` | 业务规则、证据校验、纯计算；不执行数据库、文件或网络操作 | contracts |
| `@crm/local-runtime` | SQLite、队列、服务；`adapters/` 放平台与模型调用，`bundles/` 放打包入口 | contracts、domain |
| `@crm/web` | React 页面和客户端状态 | contracts |
| `@crm/desktop` | Electron、IPC 白名单、原生进程与系统能力装配 | local-runtime |
| `@crm/legacy-migration` | 旧 PostgreSQL 模型、兼容仓储与显式导出工具 | contracts、domain、local-runtime |

每个 `apps/*`、`packages/*` 目录必须有自己的 `package.json`。通过包名和显式 `exports`
引用其他包，不使用相对路径穿透其他包的 `src/`。依赖必须声明在消费模块中。
纯业务规则不能反向依赖运行时、Electron、Prisma 或平台 SDK。

`npm run structure:check` 自动检查上述依赖、导出入口和 CommonJS 语法。
新增公开入口须更新对应包的 `exports`；新增模块须同时登记本表和结构检查的依赖规则。
测试使用公开入口映射到同一份源码，避免源码与编译版本产生两个错误类实例。

## 源码与产物

- `src/` 保存手写源码；纯业务 TS 由 TypeScript 编译，现有 CommonJS 不为目录调整而重写。
- 模块 `dist/` 保存编译结果、运行时 bundle、必要 SQL、构建清单及第三方许可证，不提交 Git。
- `apps/web/dist-desktop/` 保存网页产物；`apps/desktop/dist/native/` 保存原生构建产物。
- `.local/` 保存私有临时构建、桌面装配、安装包和合成验收证据，不提交 Git。
- `integrations/` 保存 Go 源码及桌面构建适配，`native/` 保存 Swift、C、C# 源码。
- 手写的版本锁定和安全策略仍属于源码，不作为临时构建产物删除。

构建顺序：contracts → domain → local-runtime → web。domain 构建不编译原生程序。
本地运行时 bundle 通过源码导出入口构建，并拒绝旧数据库适配进入依赖图。
策略 bundle 不包含可执行模型请求。历史发送限制继续以哈希清单进入运行产物。

桌面 staging 只复制白名单文件。`node_modules/@crm/local-runtime` 是单独装配的自包含运行包，
不复制开发环境的依赖树；其依赖已进入受验证的 provider bundle。
数据库、凭据、符号链接、旧系统兼容包、测试及适配器 TS 源码不进入安装包。
`stage-layout.cjs` 同时用于组装和最终包核对，避免两套白名单漂移。

## 测试与检查

模块测试放在各模块的 `test/`。根 `tests/integration/` 验证跨模块交互与打包装配，
`tests/e2e/` 验证实际 Electron 界面。测试夹具留在消费模块的测试目录；跨模块测试可显式复用。

| 命令 | 范围 |
| --- | --- |
| `npm run build` | 核心模块和网页构建 |
| `npm run check` | 结构、UI、设计文档、类型及全部默认离线测试 |
| `npm run local:test` | 本地运行时、适配器与队列恢复测试 |
| `npm run desktop:test` | 桌面边界和具备资源的原生测试 |
| `npm run test:real:offline` | 合成 loopback MCP 会话，拒绝发送并验证清理 |
| `npm run desktop:test:ui` | 使用临时数据的 Electron 界面流程 |
| `npm run check:legacy` | 可选旧系统 Prisma 生成、类型检查和兼容测试；不连接数据库 |

默认测试不调用真实平台、模型或登录凭据。原生测试明确报告缺少的资源和跳过项；
静态检查和合成测试不能替代 Windows 真机、签名、安装升级或真实平台验收。

## 旧系统兼容范围

Prisma 只保留在 `packages/legacy-migration`，用于旧模型类型与显式 PostgreSQL 导出。
默认构建和类型检查不需要生成 Prisma 客户端；默认测试包含使用模拟仓储的兼容测试。
旧采集仓储代码保留用于这些兼容测试，不是桌面写入路径。

导出需显式提供只读来源和新目标路径，仍执行原有授权与文件保护检查。
本地 JSON 导入、历史证据核对、发送限制、去重和 UNKNOWN 状态处理属于当前运行时能力，继续保留。
没有调用方的旧审计写入函数、过期执行脚本和编辑备份已移除，历史由 Git 管理。


## 前端入口与依赖维护

业务路由放在 `apps/web/src/routes/_workbench`，首次使用界面放在 `features/onboarding`。
不保留演示认证、模板社交图标、未接入的表格组件或仅供它们使用的依赖。
新增共享组件时应有实际调用方；清理依赖时同时核对 CSS 导入、构建配置和类型扩展。

UI 检查将文件 URL 转为本机路径；结构检查使用平台分隔符；ASAR 清单在比较前统一为 `/`。
`tests/integration/tooling-regressions.test.cjs` 覆盖空格/中文路径、Windows/POSIX 边界判断、ASAR 通配与解包、跨平台清单和陈旧文件拒绝。

`minimatch` 仅对 7–10 主版本范围覆盖到 11.0.1，保留 ASAR/glob 所需的 3.x 和 filelist 所需的 5.x API。
该覆盖针对 [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)；不能重新改为所有版本的全局覆盖。
升级打包依赖后同时运行安全扫描和归档回归测试，不能只凭 `npm audit` 判断兼容性。

旧 `model:vault:init` 和无调用方的文件主密钥模块已退役；当前凭据使用桌面系统保护。
保留只读旧库导出和历史导入兼容能力，不读取或删除旧设备上的密钥文件。
