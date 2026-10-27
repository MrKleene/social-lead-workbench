# 评论头像兼容补丁与离线构建

本目录包含既有 v1/v2 安全诊断和 `userInfo.image` 兼容补丁。只准备源码、测试和候选构建；安装运行须另行确认。不会新增平台请求、读取会话、访问个人主页或下载图片。

## 来源与证据

- 本机已审核源码基础：`xiaohongshu-mcp-a5c8f7799980ba1fdd501999843eb2d17e4c9a9f`，包含原有本地搜索提交诊断；目录名不是本地修改树的提交证明。
- `source-manifest.json` 固定 69 个源码、依赖清单、许可与嵌入资源哈希。准备工具拒绝漂移、符号链接和重叠目录，不复制 Cookie、会话、配置或日志。
- Apache-2.0 许可保留于 `LICENSE.upstream`，不向上游仓库推送。
- 最新已核查的 37 条评论/回复中，固定 `avatar` 缺失，`userInfo.image` 均为非空字符串，属于 HTTPS、允许的专用头像域名和 `/avatar/` 路径。这支持字段兼容，但不等同图片实际加载成功。
- 这 37 条地址的组成分类均为 `RESTRICTED`。现有存档没有原地址，也未细分限制来自 query、fragment、credentials、port 或编码字符，因此无法确定实际限制项。**本补丁不会让这批受限地址通过，也不会删除参数、猜测签名或回填旧记录。**

## 最小映射范围

`integration.patch` 保留既有提取前诊断接入，并仅将 `Comment.UserInfo` 改为独立 `CommentUser`。帖子/个人主页的全局 `User` 类型不变。

- 原 `avatar` 为非空白字符串时按原值保留，标记来源 `avatar`。即使它不符合图片网址政策，也不会以回退值悄悄覆盖；工作台继续独立校验。
- 原值缺失、空白、null 或非字符串时，仅考虑已确认的精确字段 `image`。不猜其他大小写或别名。
- 回退只接受原生 `https://sns-avatar-qc.xhscdn.com/avatar/` 地址，长度、字符、路径须通过既有严格规则；拒绝凭据、显式端口、query、fragment、百分号编码、反斜杠、空白、路径穿越。不会协议升级、重写或剥离参数。
- 回退成功标记 `avatarSource: image`。主评和所有嵌套回复共用此规则。错误的可选头像类型不再阻断正常评论；身份、昵称字段类型和评论结构仍按原规则解码。
- 工作台只接受来源枚举 `avatar | image`，保存于现有 JSON 的 `imageDiagnostics.authorAvatar.sourceField`。没有数据库迁移，旧 MCP/旧记录仍兼容。来源诊断不参与内容哈希、去重或 LLM 上下文。

## 安全诊断边界

v2 检查的是浏览器已序列化的 `noteDetailMap` JSON，不是任意页面对象。仅记录受控字段名、类型/空值、ROOT/REPLY、协议/域名类别、路径类别和转换结果。诊断词表的其他图片键不是已确认的映射别名。

本次在 v2 候选中可选增加 `restrictions`：query、fragment、userinfo、port、encodedPath、encodedElsewhere 六个布尔标志。`queryForm` 仅为 NONE、EMPTY、KEY_VALUE、BARE、MIXED，既不保存参数名也不保存参数值。旧 v2 没有这些字段仍可读取；新字段必须完整且与原 RESTRICTED 分类一致，未知字段或矛盾组合丢弃诊断，不丢评论。证据详情仅按需显示固定中文标签。

这些事实在原始值转换前生成；原映射规则、允许域名、协议和参数拒绝规则均不放宽。已存记录不能恢复缺失的细分类别。候选仍包含上一轮已准备但未安装的 image 映射，不重复实现该补丁。

上限为 2 MiB JSON、1000 条评论/回复、16 层回复、每用户 64 字段、256 个候选组合；达到上限只标记诊断截断，不截断业务原文。不输出任意字段、URL、身份、原文或凭据。转换统计使用实际 `CommentUser` 解码/序列化逻辑；旧字段名 `NONEMPTY_PRESERVED` 表示解码后的非空 avatar 经序列化保留，不证明原字段就是 avatar，精确来源看 `sourceField`。

## 离线复现

使用已经审核的本地 Go 1.24.13 darwin/arm64 和已有模块缓存；输出目录必须不存在，且位于原源码树外。

```sh
node scripts/mcp-avatar-diagnostics/test-prepare.mjs /absolute/path/to/reviewed-source
node scripts/mcp-avatar-diagnostics/build-candidate.mjs /absolute/path/to/reviewed-source /absolute/path/to/new-output /absolute/path/to/go/bin/go /absolute/path/to/existing/go/pkg/mod
```

构建环境隔离 HOME/cache/tmp，设置 `GOPROXY=off GOSUMDB=off GOTOOLCHAIN=local CGO_ENABLED=0`，使用 `-mod=readonly -trimpath -buildvcs=false`。独立文件 Go 单测不加载平台包；随后编译完整 MCP，但不执行产物。版本 `v2.5.5-local-avatar-url-reasons`；候选路径、SHA-256、编译参数写入各构建目录 `BUILD.json`。

测试数据全为合成，覆盖原值优先、精确字段回退、非法类型、主评回复、URL 绕过、受限地址不改写、隐私诊断、现有 JSON 保存与版本去重。不把离线测试称为真实图片验收。

## 安装与回滚（本轮不执行）

当前已安装诊断 v2 SHA-256：`0beb819c1b9d3579d1190e19ef48807b2bc2701a6eec80c6629eff56737a1de9`。准备过程不更改安装文件、`runtime/platform.cjs` 或 `scripts/real-mcp/core.mjs` 的运行审核哈希。

获得另一次安装运行确认后，先复核候选哈希和无活跃任务，备份当前 v2 二进制及哈希，原子替换 `~/.local/bin/xiaohongshu-mcp`，更新两处审核哈希并通过已有控制通道加载 API/worker。保留前端、DB、Redis、会话和配置，不自动采集。

回滚恢复部署前备份的 **v2** 二进制和两处 `0beb819…a1de9` 哈希，不误用更早的 v1/原版备份。新接收字段兼容旧 MCP，不需删除数据库或会话。

映射缺口可以离线修补；实际受限网址是否能安全使用仍未确定。未获必要证据前保持拒绝，不能声称本轮已修好真实头像。

要获得实际限制原因，仍需另行批准安装运行该候选并加载接收端，再对同一个已采帖子做一次有限只读检查；不需要整轮重采。该检查只会辨明限制组成，不保证这些组成可以安全放行。当前准备过程没有发起该请求。


## 搜索错误原因候选（2026-10-23，仅准备）

`v2.5.5-local-search-failure-reasons` 在已审核 bounded-comment-read 补丁链后增加 `search-integration.patch`。不改变搜索关键词、次数、筛选、评论读取预算或账号权限。将明确失败的页面导航、就绪等待、读取和反序列化阶段转换为封闭 JSON 原因码；无证据时 UNKNOWN。登录失效/限流/限制/超时仍保留原停止分类，不返回错误原文或地址。

工作台兼容旧 MCP 的已知错误格式，新的 `searchReason` 沿既有严格 schema 进入任务指标和脱敏审计，再供任务摘要/详情展示。旧历史不回填。搜索无数据不等于没有匹配帖子；本地失败退避不等于已知平台冷却。此改动增强诊断，不能追溯证明旧任务的具体搜索失败原因。

候选两次离线构建一致：SHA-256 `72f9e42ecafaa905d6e11af873f2713a23ad469bfaff834053a5216e3f2566da`。产物位于 `/Users/kleene/Documents/Codex/2026-10-21/task-2/mcp-search-failure-review-1/xiaohongshu-mcp-candidate`（review-2 为第二次构建）。未安装、未执行 MCP 候选，也未请求小红书。当前已安装及两处审核哈希仍为 `53774562ae853ac7643e7556eb2cbcc54586a4f1ab565b2e250aafa054757e08`。

安装需要当次确认：确认任务/扫码/检查空闲，核验候选完整哈希，保留原二进制及 `runtime/platform.cjs`、`scripts/real-mcp/core.mjs`，按既有流程原子替换 MCP 和对应两处审核哈希，然后正常重启 API/worker。无需迁移或改账号会话。回退恢复这三份对应文件并正常重启，不能只换二进制而留错误审核哈希。安装本身不执行平台请求；后续仅经批准手动有限测试，不自动重试。


### 搜索诊断候选已批准部署（2026-10-23 16:50 UTC）

用户随后批准安装上述精确候选，并把一次真实 1 轮/1 篇验证交由浏览器线程执行。已核验构建来源及 `72f9e42ecafaa905d6e11af873f2713a23ad469bfaff834053a5216e3f2566da`，原子替换本机 MCP，两处审核哈希同步；版本为 `v2.5.5-local-search-failure-reasons`。没有自行启动 MCP 平台读取。

旧 `53774562…57e08` 程序保留为 `~/.local/bin/xiaohongshu-mcp.backup-53774562ae85`；原审核文件、策略快照及回退清单在独立构建目录 `mcp-search-failure-review-1/deployment-rollback/`。本次未修改读取策略。

API/worker 从 43058/43057 正常退出（API SIGTERM，worker 0，supervisor CLEANUP_COMPLETE/EXIT 0），恢复为 43710/43709。原前端 PID 3438 和数据库/Redis 启动时间不变；健康与网页 200、队列空闲、worker 等待任务，17 项审核策略离线测试通过。前后均 1 条失败采集历史、0 帖/评论、2 个账号、1 份本机会话和配置，模型调用/联系记录 0；14 项既有迁移无新增执行。

后续测试入口：`http://127.0.0.1:63968/work?module=runs`，教培 → 采集设置把本轮最多帖子数选为 1 → 完成设置 → 开始采集 → 选择原账号并确认本轮只读授权 → 确认并开始一次。保留 1 轮、1 评论窗口及服务端 0 次主评翻页/8 次回复尝试/15 秒预算；LLM 和外发仍关闭。测试由协调的浏览器线程执行，本部署线程未发起搜索或采集；搜索真实故障仍待该次结果验证。


## 根讨论范围闭合候选（2026-10-27，未安装）

`v2.5.5-local-root-reply-scope` 保留缺失回复字段，只有根讨论声明/加载/实际归属一致且页尾、范围、无按钮、hasMore=false、总数等证据共同成立，才接受根列表闭合证明。嵌套未知与中断仍拒绝。可选 `rootScopedLeafGroups` 需要配套工作台契约。完整测试、哈希和待授权安装步骤见 [交付记录](../../docs/ROOT-REPLY-COVERAGE-2026-10-27.md)。
