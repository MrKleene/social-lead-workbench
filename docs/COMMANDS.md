# 日常命令与兼容边界

适用于已初始化的本机 Mac 持久实例。在 `/Users/kleene/projects/social-lead-workbench` 执行：

```sh
npm start          # 后台启动整套工作台；成功返回前检查 API 和网页就绪
npm run status     # 实例、地址、API/网页状态；不读取凭据
npm stop           # 停网页和 API/worker，DB/Redis/卷/配置/vault 保留
npm restart        # 等旧进程组完全退出再启动
npm run dev        # 仅前端切换为前台开发，Ctrl+C 只停止此前端
```

`start` 会补齐缺少的服务，已健康运行时只报告已运行。并行启停通过独立命令锁串行化，另一条进行中时安全失败，先查看 status。`dev` 会先正常停止已有的**新受管前端**，再用同一端口前台运行；不停止后台。退出 dev 后，`npm start` 只补回网页。后台不是系统常驻代理，不安装 launchd、不自动开机启动；Mac 重启后手动 start。

网页仍为 `http://127.0.0.1:63968`，后台63967，数据库/Redis仍原卷。stop 不删除任何业务数据、已有备份、会话文件或主密钥，也不停止容器。命令不创建主密钥、不读取 API Key，不产生新的采集或模型任务，不开放发送。开始/继续业务仍有各自的授权与开关。

## 为什么不直接 kill PID

后端和前端分别持有现有原生 supervisor 的 `.operation.guard` / `.web.guard`，进程组清理逻辑仍由原 supervisor 处理。新私有控制记录只保存实例身份、运行代次和 Unix socket 地址；socket 权限0600、记录在私有实例目录。控制消息核对仓库、实例、服务角色与代次，发给实际服务，由它执行正常退出。PID仅供状态展示，命令不按 PID 发信号、不使用 pkill/nohup。

restart 在控制通道消失、端口关闭后继续等待对应系统运行锁可取得，证明原受管进程组已退出，再释放探测锁并启动。最终互斥仍由服务自己的 supervisor 取得；并发旧入口也不能形成双 worker。它不删除遗留锁，不伪造退出证明。

控制通道对同一 macOS 用户开放，不能防御已完全控制该用户的恶意进程；其他用户不能访问私有 socket。不新增网络控制 HTTP 端点。异常残留控制记录不等于活跃服务，实际运行互斥仍由系统锁决定。

## 当前原 main 的一次性切换

本轮按用户范围仅修改代码并测试隔离实例，**不停止当前 main**。它是新代码提交前启动的旧后台/前端，没有新控制通道。因此：

- status 能显示端口仍响应，但标记 `legacy-or-unmanaged`，不会伪称新管理机制已接管。
- start 遇旧/未知端口占用时报告并退出，绝不启动第二份；stop/restart/dev 拒绝盲发信号。
- 首次切换要在单独批准后，重新核验原启动器/前端身份并正常退出原实例，再 `npm start`。不需要重启 Mac；不能直接用文档里的历史 PID。
- 切换后日常即可只使用上方五条命令。首次切换尚未在原 main 验收，不能把隔离成功说成原实例已切换。

## 哪些旧命令保留，为什么

本轮**没有删除仍有用途或广泛文档引用的 npm 入口**。精简的是日常入口和文档推荐，避免删掉恢复/测试能力。旧默认 `dev` 的 API+网页混合启动行为迁为 `dev:legacy`，明确标注另一套手动 Compose 开发环境，不要与 main 混用。

| 类别 | 命令 | 处理与原因 |
| --- | --- | --- |
| 日常 | start / stop / restart / status / dev | 新推荐，采用原 main、原端口和可靠监督机制 |
| 旧长入口 | dev:persistent、dev:persistent:background、dev:persistent:backend、dev:persistent:web | 日常推荐已废弃，兼容仍保留；首次管理员交互初始化、恢复参数、历史操作说明及测试仍使用底层脚本 |
| 独立离线 | dev:persistent:offline、dev:mock:isolated、dev:mcp:offline | 分别保留持久虚构库、临时CRM、离线MCP协议夹具，不能相互替代 |
| 手动 Compose | dev:legacy、dev:collector、local:env | 保留独立开发职责；compose.yaml直接引用 local:env，旧原始采集worker需独立启动 |
| DB/用户 | db:generate、db:migrate、db:seed、admin:init、user:create | Dockerfile/Compose/初始化流程仍引用，播种只供虚构数据 |
| 验收/构建 | build、typecheck、test、test:*、agent:check、pretest、pretypecheck | 覆盖DB、队列、平台拒绝、权限、设备、锁、UI等；不是给日常用户逐个运行的清单 |
| 主密钥初始化 | model:vault:init | 仅首次明确批准初始化，不是日常启动步骤，不能随意重复 |

工作区 `@crm/api` / `@crm/web` 的原始 dev 命令不变；工具或 Compose 仍可显式选择工作区。没有删除历史验收中实际执行过的命令记录。仓库当前无 CI 工作流；已核对 Dockerfile/Compose 引用。

全新 Mac 尚无持久实例时，先准备已安装依赖及 Docker，再 `npm run dev:persistent` 完成交互管理员初始化；正常退出后采用短命令。命令不静默创建替代实例。带 `--instance NAME` 保留同名隔离，测试只允许 `--offline --test-fixture --instance acceptance-<UUID>`，不得将 main 传给验收脚本。

## 验收

2026-10-21 本机验证结果：

- `npm run test:commands`：最终 9 组通过，覆盖后台 start、重复/并发 start、stop 后立即 start、restart 等待旧进程组释放、真实 npm dev 的 Ctrl+C、补回前端、重复 stop 和安全状态输出。
- 隔离 PostgreSQL/Redis 容器启动时间及卷标识未变；虚构业务配置、数据库凭据及隔离假密钥库字节保持，虚构密文仍可解密。新命令验收的采集、模型调用、联系记录均为零。仅清理该测试自己的资源。
- `node --test scripts/workbench-control.test.mjs`：3 项通过，覆盖身份/代次/私有权限、旧 PID 不用于发送信号、初始化失败清理及通道关闭竞态。
- 原生监督器/后台回归 12 项、锁/诊断回归 26 项通过；`npm run test:persistent` 的 17 组离线检查通过，包含桌面/窄屏、正常停启、前端独立退出、隔离 manager 异常终止恢复、业务与语义配置保留。只有该既有回归显式运行虚构 MCP/业务样本，没有真实平台或模型请求。
- `npm run typecheck` 全工作区通过；修改的入口语法检查及 `git diff --check` 通过。项目没有单独 lint 命令。

测试中修复两处启停边界：健康探测不再复用 Node fetch 连接池（当前运行时在关停竞争中曾抛出未捕获的 `setTypeOfService EINVAL`）；控制通道空关闭与非法响应分开处理，停止确认先完成写出再触发退出。旧业务回归另显式选择 3 帖，匹配其原验收目标；不更改现有 UI 默认 1 帖。

本机临时证据：新命令 `/var/folders/q6/b2g8k11x23g_cf3ql0ky_v140000gn/T/crm-command-tests-h4digm/checks.json`；既有持久化/UI 回归 `/var/folders/q6/b2g8k11x23g_cf3ql0ky_v140000gn/T/crm-persistent-evidence-LPQcF5/checks.json`。临时证据不提交仓库，也不承诺长期保留。

原 main 只读核验：63967 API 返回数据库 ready、`platformCallsEnabled:false`，63968 HTTP 200；启动器、监督器、API 与前端 PID 与本轮前一致。当前仍为 `legacy-or-unmanaged`，未接管、未停启、未修改数据库或生产 vault。本轮没有数据库结构迁移。首次原实例切换仍待单独授权，不能把隔离成功说成原实例已切换。
