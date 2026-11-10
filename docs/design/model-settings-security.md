# 管理员模型设置：本机密钥库、部署与恢复

## 范围和状态

本功能只管理 Qwen 评论匹配参数和 Key。保存不会访问千问，不启用 LLM、采集、评论或私信；分析仍由独立开关、脱敏预览、逐批确认、预算和限流保护。

2026-10-21 14:07 UTC 用户另行批准初始化与部署，并明确跳过本轮数据库备份。14:10 UTC 原 main 已按下述流程初始化主密钥、正常停启后台并完成新增表迁移，保留原数据。模型配置仍为空，真实 Key、实际连通性与质量均未验收。原 Chrome 登录会话过期，登录后的生产表单还待用户重新登录后核验；离线表单验收已通过。

## 存储与边界

- PostgreSQL `ModelSettings` 单例存型号、固定北京端点档案、每日请求上限、价格确认版本、北京处理同意、备注、更新时间、乐观版本和 Key 密文。
- Key 用 Node.js `crypto` 的 AES-256-GCM 认证加密；每次替换生成随机 96-bit IV，128-bit tag。AAD 绑定格式版本、用途 ID、主密钥指纹。数据库中没有明文 Key；API 不返回密文、指纹、前缀、后缀或任何部分 Key。
- 256-bit 随机主密钥单独存于当前用户应用数据目录，绝不放 DB、`.env`、仓库或启动参数。私有子目录 0700、文件 0600；验证当前 uid、regular file、32 字节、单硬链接，拒绝符号链接和不安全祖先路径，不自动改权限。
- 主密钥仅 API 后端读取，采集 worker 只读非秘密型号元数据；前端、构建和迁移不接收 Key。没有全局解密 Key 缓存；每个实际请求重新核验并按需解密。
- 此方案防止“只得到数据库或数据库备份”时直接得到 Key。**它不能抵御已完全控制同一 macOS 用户、管理员/root、浏览器恶意扩展或进程内存的攻击者。** JavaScript 字符串及 HTTP 客户端内存不能保证主动擦除；主密钥 Buffer 在使用后清零。不是硬件密钥库或全盘灾备。
- 应用不把 Key 写浏览器 localStorage/sessionStorage、URL、React Query 缓存、审计或日志；密码输入非受控，保存/关闭时清空。浏览器自己的密码管理器/开发者工具由用户控制；不要保存、分享含请求体的 HAR 或截图。

密码框禁用自动完成并给常见密码管理器忽略提示。后端管理员鉴权、同源 Origin 和 CSRF 必须通过；凭据写操作仅允许直接 HTTPS，或 HTTP loopback Origin + loopback 连接（有转发链时必须全为 loopback）。不信任 `X-Forwarded-Proto` 冒充 HTTPS。前端在远程 HTTP 上禁用输入/提交，避免在服务器拒绝前就把 Key 经明文网络发出。未支持任意反向代理 TLS 终止；此 Mac 推荐本机 loopback。

只允许受控模型目录和北京官方标准端点：`https://cn-beijing.maas.qianwenaiapi.com/compatible-mode/v1/chat/completions`。不接受自定义地址，不跟随重定向。价格/型号未知或确认过期时阻断；每日请求数 1–100，UTC 日、全项目共享，不是人民币上限。

参考：[Node crypto/GCM](https://nodejs.org/api/crypto.html#class-cipheriv)、[Node 文件打开标志](https://nodejs.org/api/fs.html#file-system-flags)。

## 原实例部署流程（本次已获批准并执行）

原实例：`/Users/kleene/projects/social-lead-workbench` 的 `main`，ID `c892ae82-8dc7-4f40-889b-a45eae67b3e8`。保留原端口、容器、卷、业务数据和教培配置。

本次在下列位置创建了新的随机主密钥（不是千问 API Key），未输出内容：

```text
/Users/kleene/Library/Application Support/SocialLeadWorkbench/model-vault/c892ae82-8dc7-4f40-889b-a45eae67b3e8/master.key
```

**本次已执行，日常使用不要重复执行。** 仅首次初始化且已确认不应恢复旧主密钥时使用：

```sh
cd /Users/kleene/projects/social-lead-workbench
npm run model:vault:init -- --instance main --confirm-create
```

命令验证本机 main manifest 与仓库位置；仅 macOS 当前方案可用。使用排他创建，不覆盖现有文件、不改已有目录权限、不配置第三方 Key、不迁移 DB、不启动服务。

通用部署顺序（本次第 1 步备份由用户明确选择跳过，未删除已有备份）：

1. 复核原进程身份、无运行任务和真实调用关闭；创建受保护的原数据库备份并验证可恢复。不得盲用历史 PID，不删除未知锁。
2. 首次生成上述本机主密钥；独立保护备份。若存在历史密文却主密钥丢失，先恢复旧主密钥，不直接初始化。
3. 按现有 v3 正常停止机制停止身份确定的后台，数据库/Redis 原卷保留。通过 `npm run dev:persistent:background -- --backend` 恢复原实例；其正常启动应用 `202610210005_model_settings` 增量迁移（仅新增表），传递主密钥路径，不生成主密钥。前端仍使用既有 `npm run dev:persistent:web`，无需重复启动已运行的前端。
4. 核验 API63967、网页63968、迁移记录、原业务计数和教培配置不变；模型设置未配置、LLM 保持关闭。随后由用户在管理员页面自行输入 Key。本轮代理不读取/填写真实 Key。

没有获批准部署前，不能将“提交已推送”描述为“原实例已可用”。配置保存、真实收费调用是不同授权；初始化和部署本身不授权实际调用。

## 替换、删除和竞态

保存有版本前提并在事务中加锁；加密/验证/审计任一步失败回滚，旧值保留。读取到不同主密钥指纹、认证失败或权限异常时不允许悄悄覆盖旧密文。备注拒绝完整 Key 与常见凭据格式。

删除需页面二次明确勾选确认及服务器固定确认标识。删除把密文置空、清空备注、取消处理同意、增加版本；保留单例墓碑和所有历史模型结果。新版运行时无环境 Key 回退，连无记录也不导入旧 `QWEN_API_KEY`。

保存/删除与请求预算预留和真正 HTTP 启动共享全局短事务锁。实际发出前再核验设置版本、型号、独立开关和规则。删除完成后新请求不能取得旧 Key；在删除前已开始的 HTTP 请求可能完成、收费并保留结果。数据库事务与外部 HTTP 不是分布式原子操作；若发出后本地提交失败，按失败/用量未知处理并计入预留，不自动重试。删除不等于撤销千问平台 Key。

## 备份、迁移和恢复

数据库备份不包含主密钥，主密钥备份也不包含数据库；应分别保护、离线加密保存，不上传仓库或聊天。恢复需匹配的数据库密文与原主密钥。备份保留历史密文，删除当前 Key 不会擦除过去备份；需要撤销能力应另去千问控制台吊销。

- `MASTER_MISSING`：文件/路径不可用。恢复原文件到对应实例路径，或首次使用经确认初始化；不自动生成替代主密钥。
- `MASTER_UNSAFE` / `MASTER_UNAVAILABLE`：权限、属主、链接、尺寸或访问异常，停用调用。由管理员核查安全部署，系统不自动 chmod/放宽权限。
- `MASTER_MISMATCH`：主密钥变化、密文损坏或用途不符，停用调用/替换。优先恢复匹配备份。不要覆盖文件来试错。
- 确定原主密钥不可恢复时，可经二次确认删除本机密文（不需成功解密）；由用户另行确认安全初始化/主密钥恢复方案后，自己重新输入千问 Key。历史业务/语义结果保留，旧密文不会被“修复”。本轮不实现静默主密钥轮换。

迁往另一台 Mac 时需安全转移原主密钥并保持应用目录权限与实例 ID；普通复制/共享目录可能改变权限或引入符号链接，应先验证。不能只恢复数据库就宣称 Key 可用。

## 验收记录

2026-10-21 本轮最终验证：

- `npm run typecheck`：全部工作区通过；`git diff --check` 通过。项目没有独立 lint 命令。
- `npm test`：API 161、agent 4、前端规则 28 项通过。最终凭据解析保护修改后 API 161 项再次通过。含独立子进程读取同一加密配置、认证标签/用途校验、错误主密钥、链接/权限和传输限制。
- `npm run test:mcp`：隔离 PostgreSQL 156 项、队列 14 项通过（1 项仅 mock 模式适用而跳过）、Redis 2 项通过；临时无持久卷容器 2/2 已清理。新增 7 项管理员凭据集成覆盖真实 Session/CSRF、销售权限、加密后 DB、无 Key 响应/审计、缺失/改变主密钥、替换失败、并发版本冲突、删除后无环境回退、预留后删除阻断 HTTP、在途删除保留结果。全部 Key、主密钥及 HTTP 都为测试数据。
- `node --test scripts/persistent-background.test.mjs scripts/persistent-supervision.test.mjs`：12 项通过，仅隔离进程；没有停止原服务。
- `npm run build -w @crm/web`：通过，既有 bundle 大小提示仍在；没有为本功能重构无关打包。
- `scripts/test-model-settings-ui.mjs`：11 个场景通过，1440px/390px 的保存、刷新、失败替换、清空/关闭、取消删除/二次确认、缺失主密钥、旧 API 404、销售角色，以及远程 HTTP 输入阻断；6 次虚构保存/删除请求，无模型/采集/发送/外部网络请求。独立浏览器上下文，检查无 Key 回显或应用浏览器持久存储。
- `scripts/test-semantic-review-ui.mjs`：原有 8 个桌面/窄屏审核流程通过，mock API/LLM，真实调用为零。
- 原实例只读核验：API `/api/health/ready` 返回 `ok=true,database=ready,platformCallsEnabled=false`，网页 HTTP200；已登录 Chrome 的设置入口显示“后台尚未部署”，原教培仍原搜索词/排除词/每轮3帖，未点击编辑保存、开关或采集。

本地测试日志：`/tmp/model-settings-{types-final,api-final,db-final,lifecycle,ui-final,semantic-ui}.log`。桌面/窄屏截图及检查报告位于临时目录 `crm-model-settings-ui-GlLcFl`；原审核截图为 `crm-semantic-review-ui-fsFCqu`，均只含虚构数据，不提交仓库。

以上是部署前的隔离验收。真实收费模型质量仍未验收；后续获批准的生产部署记录如下。


## 原 main 部署实录 · 2026-10-21 14:10 UTC

- 代码 `665070a12c9f6db0e43ec827e77eb0ebdcbec7b0`，用户明确同意创建独立主密钥、增量迁移和后台停启，同时跳过数据库备份。不删除原数据或已有备份，不配置第三方 Key，不进行模型/采集/发送调用。
- 初始化前检查目标文件与 model-vault 子目录不存在；执行排他初始化成功。实际目录均 0700、主密钥文件 0600、32 字节、uid 501、单链接、非符号链接；后端检查函数仅输出 `READY`，未输出内容。主密钥未复制或提交。
- 停止前：原采集均 PARTIAL、无任务、无 RESERVED 模型请求、无有效设备执行租约。核对启动器 PID 17223 的命令、启动时间与仓库 cwd 后，仅发一次 SIGINT。管理日志记录子进程退出、`CLEANUP_COMPLETE`、退出码 0；没有手工删锁。
- `npm run dev:persistent:background -- --backend` 正常恢复原实例。新 launcher26995 / supervisor26996 / manager26997，API27385；仅作为本次证据，今后停止前仍需重新核验，不能盲用这些 PID。
- 原 PostgreSQL/Redis 容器、卷与启动时间（10:02:58 UTC）未变；前端 PID3438、63968 端口未重启。后端仍用63967。没有重启 Mac。
- 迁移 `202610210005_model_settings` 已成功，完成迁移数13→14；`ModelSettings` 行数0、已存 Key 数0。未自动创建配置或启用模型。
- 前后只读校验相同：用户1、账号2、采集2、观察50；线索/联系/语义结果/模型调用/帖子原文/评论原文均0。整个 CollectionConfig 摘要 `8211d7bd6d97bbf992fa9180465f3e4e` 不变；SemanticControl 仍无记录，保持默认关闭。
- API `/api/health/ready` 返回 `ok=true,database=ready,platformCallsEnabled=false`；网页 HTTP200；新 `/api/model-settings` 匿名请求401，管理员鉴权生效。
- 原 Chrome 页面刷新后显示登录页；只读查询2个历史 Session、0个未过期 Session。未读取密码或 token，也未绕过认证。因此本次登录后的“Key未配置 / 密钥库就绪”页面尚待重新登录后验收，不能把离线测试称作本次生产页面验收。
- 本次未进行新备份，未删除旧备份；业务计数/配置摘要校验不是备份。主密钥尚未单独备份，恢复说明仍适用。
