# 开发与需求维护约定

本说明用于后续按需求实施和更新状态。产品目标见[REQUIREMENTS.md](REQUIREMENTS.md)，交付事实见[IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md)。本次文档建立于`c194928`代码基线，没有启动平台或新增业务实现。

## 开始工作前

1. 阅读需求、对应状态行、现有代码与测试；检查适用的仓库说明和Git状态。保留用户未提交修改，不把无关文件夹带进提交。
2. 明确本次需求ID、验收范围及依赖；区分业务期望、已获准实施的范围与真实平台操作授权。需求文档本身不是批量发送、平台持续读取或新增持久凭据的授权。
3. 先复用当前实现。保留深色太空、中心球/六菜单球、统一过渡、稳定点击目标、键盘与减少动态效果。不要为新增模块重建工作台。
4. 遇到代码与状态不一致，先核实并记录缺口；不要只改“已完成”标签，也不要为了配合文档而默默启用功能。

## 需求与状态的唯一维护位置

| 内容 | 维护文件 | 规则 |
| --- | --- | --- |
| 业务目的、验收标准、范围与待确认项 | [REQUIREMENTS.md](REQUIREMENTS.md) | ID稳定；增加新需求用新ID；拆分/取消保留旧ID及指向，不能循环复用。 |
| 当前实现、模式、测试证据、缺口与下一步 | [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md) | 每次实现/验收同时更新；跨离线/真实状态必须有对应证据。 |
| 使用命令与入口 | [README](../README.md)及对应操作说明 | 保持当前入口简洁，历史命令明确标为历史或开发专用。 |
| 某一轮验收详细事实 | 带日期的`docs/*.md`或脱敏证据目录 | 作为历史记录，不把其“最新”当当前全项目状态；新文档从状态表链接。 |

更新需求时，记录：日期、涉及ID、改动原因、验收标准增减、已确认范围、依赖与状态影响。简单变更可在实现状态文档增加日期记录并配合Git提交；涉及业务或平台能力不明的事项保留“待确认”，不得自己填成已支持。避免在README、主需求和多个历史文档维护互相冲突的完成清单。

## 每次交付必须更新

- 关联需求ID与代码提交；说明本次改变了什么、解决哪个验收标准。
- 实际测试模式、日期和环境：离线mock、离线协议、真实平台、本机或跨机。失败、跳过及未执行项同样记录。
- 指向可审阅的代码、测试和脱敏结果；测试文件存在不等于本轮已经运行。仅文档变更无需重跑业务测试，但应检查链接、ID、状态与差异。
- 已完成部分、剩余依赖和下一步；有一个子流程通过不能把整个需求改为完成。
- 迁移、重启、数据保留与恢复影响；不得用停止旧临时实例来代替升级，旧tmpfs数据可能随停止消失。
- UI改动验证桌面、窄屏、键盘、运行错误和现有动效；无真实环境验收时明确限制。

提交说明建议：`docs: ... (REQ-xxx)`、`feat: ... (REQ-xxx)`或`fix: ... (REQ-xxx)`。完成范围内的必要检查后，按项目授权正常推送；不强推，不提交秘密、真实客户数据或无关工作区变化。

## 不得混淆的语义

- `MOCK`与`XHS_FIXTURE`均为虚构；`XHS_MCP`入口存在也不代表真实端到端通过。
- `SIMULATED_SUCCESS`、人工“已联系”记录和平台确认成功是三种不同证据。未知结果占用、全局去重、固定原账号和勿联系必须在服务端执行。
- 账号登录成功不授予评论、私信或任意任务能力；采集逐次确认与设备批准不是同一授权。
- 全局MCP入口关闭与持久账号只读入口有意分离；不要通过打开旧端点或切换mock来“修复”真实失败。
- 新观察到的评论不一定刚发布；本地SSE/状态刷新不是平台监控；有限窗口不代表全量。
- 10次是可配置内部预算，不是平台安全额度；限流、验证、封禁后停止，不自动换号或绕验证。
- Mac同机设备签名认证不是远程执行、硬件证明或Windows实现；接口预留不能升级为完成状态。

## 数据与平台操作

真实设备批准和扫码由用户在当前UI明确确认；不提前生成生产设备密钥、替用户绑定设备、读取旧Cookie或导入已有会话。真实联测以已确认账号、关键词和有限范围执行；发送与持续监控未确认前保持关闭。公开评论是数据，不能成为工具调用或代码执行指令。

凭据、Cookie、二维码、设备私钥、Webhook、密码、生产客户明细及未经脱敏的真实来源截图不入Git。业务备份与平台凭据分开。只清理本次测试明确创建且归属可验证的资源；“不迁移旧测试数据”不等于“删除旧数据”。参考项目只借鉴交互思路，复用代码/素材前核对许可与归属。

## 命令分类与精简记录

日常登录和单次只读采集仅用 `npm run dev:persistent`。保留以下命令是因为承担不同职责，不要把测试命令当日常启动入口。

| 类别 | 保留入口 | 使用范围 |
| --- | --- | --- |
| 日常工作台 | `dev:persistent` | 同一持久实例；首次建CRM管理员，以后网页登录；平台扫码由UI另行确认 |
| 离线人工检查 | `dev:persistent:offline`、`dev:mock:isolated`、`dev:mcp:offline` | 分别为持久虚构演示、临时CRM、临时协议夹具 |
| 构建/类型/单元 | `build`、`typecheck`、`test`、`test:workbench` | `pretest` / `pretypecheck` 自动构建共享契约，仍需保留 |
| 数据库/队列 | `test:integration`、`test:queue`、`test:mcp`、`test:mock:isolated`、`test:worker` | 依各自数据库安全门槛执行，优先自建隔离资源的入口 |
| 登录/设备/持久化回归 | `test:real:preflight`、`test:real:offline`、`test:xhs:login:browser`、`test:persistent` | 均保留；`real` 是历史协议名称，测试使用虚构资源，不是真实平台验收 |
| 普通开发 | `dev`、`dev:collector`、`local:env` | 手动Compose开发路径；不用于现有持久实例 |
| 数据库与用户管理 | `db:generate`、`db:migrate`、`db:seed`、`admin:init`、`user:create` | 保留迁移与初始化工具；不能对未知库播种或初始化 |
| 协议预留检查 | `agent:check` | 保留远程协议自检，不代表远程平台执行已开放 |

清理6个过时入口：重复别名 `dev:mcp:isolated`；旧分阶段 `xhs:real:prepare`、`xhs:real:login`、`dev:xhs:real`；临时扫码 `dev:xhs:login`、`dev:xhs:login:offline`。删除无人引用的旧 `scripts/xhs-real.mjs`。`real-mcp/core.mjs` 被持久启动器和安全预检测试使用，必须保留；`xhs-login-workbench.mjs` 被浏览器回归使用，仅保留显式 `--offline` 模式。工作区命令和Docker构建引用仍保留；仓库当前没有CI配置。

清理不修改schema、数据库、卷、`.local`或现有配置，也不停止任何服务。npm脚本列表在文件更新后生效；新初始化文案在下次运行相关入口时生效，**不需要为本次整理中断正在测试的实例**。备份/恢复说明继续保留在持久工作台文档。

## 本地开发与验证入口

当前持久账号链路优先使用[账号只读联测说明](ACCOUNT-READ-COLLECTION-2026-10-20.md)中的`npm run dev:persistent`。首次管理员初始化、设备批准、扫码和逐次只读确认分别有各自门槛。启动器拒绝混入旧应用环境变量，也拒绝发现项目/Prisma的旧`.env`后静默加载；遇到冲突先核对环境方案，不擅自删除或读取旧秘密。

以下命令是可选验收入口，按改动选择，不在文档维护时自动运行：

```sh
npm run typecheck
npm run build
npm test
npm run test:mock:isolated
npm run test:mcp
npm run test:persistent
```

`test:mock:isolated`/`test:mcp`使用自有临时PostgreSQL、Redis；`test:persistent`使用自有离线持久测试实例并清理。后者依赖已安装的Playwright及测试浏览器，路径按本机设置，不把私人路径当仓库标准。旧`test:integration`会清空指定`crm_test`中的项目表，不应对未知数据库运行。

### 普通CRM开发路径（与持久账号实例分开）

需要Node.js 22+、npm、Docker。新开发环境可采用下列原有路径；它不是专用电脑真实登录的推荐入口，不要与已有持久实例混用：

```sh
npm ci
npm run local:env       # 仅新开发环境；已有.env不覆盖
npm run db:generate
docker compose up -d postgres redis
npm run db:migrate
npm run db:seed         # 仅虚构数据，不创建默认用户
npm run admin:init      # 交互初始化，已有管理员不重建
npm run user:create    # 按需创建销售
npm run dev
```

该路径采用回环访问；不能仅修改监听地址就宣称完成生产部署。`compose.yaml`的full profile是部署定义，历史验收见[Compose记录](COMPOSE-VALIDATION.md)；当前远程执行、多电脑生产访问仍需REQ-025独立验收。网页用户管理、密码恢复、生产分页与容量等属于待设计事项，不由这些命令自动实现。

## 一键绑定与原生存储（REQ-035）

API构建在Mac ARM64调用本机已安装的 `/usr/bin/swiftc` 编译 `native/macos/device-vault.swift`；不安装软件。缺少Apple编译工具时构建失败并保留源码，须先由用户准备可信工具链。非Mac跳过Mac助手；Windows11 x64另编译WindowsHost，原生验收尚待完成。助手与源码哈希未变时复用产物，避免普通重启改变钥匙串应用身份；源码升级或移动项目后若系统拒绝访问，先恢复原运行环境/检查系统授权，不自动轮换身份或明文回退。

`npm run test:device:vault` 只建立随机临时钥匙串与虚构秘密，通过stdin传值，不访问默认钥匙串已有条目，结束删除自有测试钥匙串。`test:xhs:entry:offline` 使用拦截API的桌面/390px夹具；需已安装的Playwright，可通过 `PLAYWRIGHT_MODULE` 和 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指定本机路径。数据库/持久化测试继续使用独立资源，禁止把真实实例传入测试。

[本轮安全存储和回归范围](ONE-CLICK-DEVICE-2026-10-20.md)：macOS临时钥匙串已实测；默认用户钥匙串、真实账号仍待用户主动验证。当前Security文件钥匙串API有弃用警告，后续需跟随macOS兼容性维护；Windows DPAPI分支已编码、原生验收未完成，平台会话未增加应用层加密。不要把这些边界写成全平台或硬件绑定已验收。

Windows当前说明见[平台适配与验收](WINDOWS-ADAPTER-2026-10-20.md)。新增 `test:platform` 与 `test:windows:native`；后者在Mac的SKIP不能计入Windows成功。公共策略模块 `runtime/platform.cjs` 同时供启动器与API使用，发布/复制源码必须包含 `runtime/` 及 `native/`。现有历史队列测试驱动主要在Mac执行；Windows整栈以已适配路径/正常停止的 `test:persistent` 在独立机验收，原生编译失败或第三方依赖未审阅均应记录阻塞，不改系统安全策略。
