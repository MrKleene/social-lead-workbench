# MCP 转换前头像诊断补丁与离线构建

这是诊断补丁，不是头像取值修复。它不增加平台请求、不读取账号文件、不映射猜测别名、不下载图片。

## 来源与边界

- 来源：本机已安装 MCP 对应的既有源码目录 `xiaohongshu-mcp-a5c8f7799980ba1fdd501999843eb2d17e4c9a9f`，包含之前的本地搜索提交诊断修改；目录名不是此本地修改树的 Git 提交证明。
- 原始源码基线对应的旧安装版本：`v2.5.5-local-search-submit-diagnostics`，安装文件 SHA-256：`17d57acd1a4f4cad3f2525bd13de40e112cb34594231a10b54b05ced9485cf80`。
- `source-manifest.json` 固定本次读取的 69 个源码、模块、许可和嵌入资源文件哈希。准备工具拒绝文件漂移和符号链接，只复制这些文件；不会复制 Cookie、会话、配置 JSON、日志或二进制。
- 原项目许可 Apache-2.0，随附 `LICENSE.upstream`。不向上游仓库推送。

## 补丁内容

`integration.patch` 仅改两处：在 `extractFeedDetail` 的 Go 固定结构反序列化之前调用检查；在 `FeedDetailResponse` 增加可选 `avatarSourceDiagnostic`。新增两个 Go 文件实现和测试诊断。

诊断处理的是浏览器 `JSON.stringify(noteDetailMap)` 已返回的 JSON，不是任意浏览器对象：因此 `undefined`、不可枚举属性或此前页面逻辑已删除的字段，不能据此证明原始页面不存在。诊断不改变已有反序列化失败规则；原响应若整体解码失败，不会返回成功诊断。

只保留当前请求帖子的评论与回复汇总，不含帖子/评论/用户标识：

- `USER_INFO`、`FIXED_AVATAR`：缺失、null、空串、空白串、非空串及类型计数。
- `AVATAR_CASE_VARIANT`：检查 Go 原本就接受的大小写变体，不改变现有解码。
- `IMAGE_NAMED_MEMBER`：仅表示未识别字段名包含 image/avatar。此旧汇总项不输出字段名，也不证明它是头像或 URL，更不将其映射到头像。
- `OTHER_MEMBER`：其他未映射字段的类型计数，不输出名称或值。
- `conversion`：实际 `User` 类型解码及 JSON 往返后，固定 avatar 为空、保留非空、解码失败或序列化异常的计数。

v2 增加 `candidates`：仅接受源码明确列出的 33 个结构键（例如 image、images、imageb、avatarUrl），分别记录 ROOT/REPLY、类型/空值、协议/允许头像域名类别、受限网址组成和路径类别。不记录实际值、URL、域名、用户资料。白名单是诊断词表，**不是已确认的头像别名**。字段名上限 32 个 ASCII 字符；敏感键、未知图片键、格式超限只记受控过滤计数。未知字段不会原样输出，因此若实际键不在词表仍需进一步评估，不能假称已定位。

v2 的 `transitions` 按主评/回复记录实际 User 转换结果；最多 256 个不同候选组合。接收端兼容 v1，并严格校验 v2 名称、枚举、唯一性和角色计数；缺失或非法诊断不妨碍正常评论。证据抽屉按需显示，诊断不进入 LLM 上下文。

诊断最多检查 2 MiB JSON、1000 条评论/回复、16 层回复及每个用户 64 个字段；达到限制标记 `truncated`，只限制诊断，不截断业务数据。结果排序稳定，不新增原始数据日志。

同批项目修改加入可选白名单接收：仅接受固定枚举、有限计数和一致总数，沿现有 `imageDiagnostics.avatarSource` JSON 存档保存。非法诊断整体丢弃，不改变正常评论；旧 MCP 无此字段仍兼容。既有存档代码将 `imageDiagnostics` 排除于内容哈希之外，不引入新的内容版本、线索或提醒。没有数据库迁移。接收代码需要随 API/worker 正常加载，构建脚本不会重启服务。

## 离线复现

需要已经审阅的本地 Go 1.24.13（darwin/arm64）及已缓存依赖；工具不下载依赖。目标目录必须不存在，且必须在原源码树之外。参数均为路径，不要输入任何凭据。

```sh
node scripts/mcp-avatar-diagnostics/test-prepare.mjs /absolute/path/to/reviewed-source
node scripts/mcp-avatar-diagnostics/build-candidate.mjs /absolute/path/to/reviewed-source /absolute/path/to/new-output /absolute/path/to/go/bin/go /absolute/path/to/existing/go/pkg/mod
```

构建器使用干净环境、独立 HOME/cache/tmp、`GOPROXY=off`、`GOSUMDB=off`、`GOTOOLCHAIN=local`、`CGO_ENABLED=0`、`-mod=readonly -trimpath -buildvcs=false`；版本为 `v2.5.5-local-avatar-source-diagnostics-v2`。只运行独立文件形式的 Go 单元测试，不加载平台包、不运行主程序。随后编译完整 MCP，输出二进制和 `BUILD.json`、测试/编译日志；绝不执行产物。源码基线对应的早期安装版本 CGO_ENABLED=1；v1 和本次 v2 候选均为纯 Go 构建，v2 运行兼容性仍需获准后的验收。

v2 两次独立构建 SHA-256 相同：`0beb819c1b9d3579d1190e19ef48807b2bc2701a6eec80c6629eff56737a1de9`。10 个 Go 测试组（包含字段类型、受控键名、主评/回复、网址分类与上限测试）、5 项准备保护检查通过。候选未安装、未运行，实际平台数据与运行兼容性未验证。

准备 v2 时仍安装的是 v1，SHA-256 `f1124a3fb0819725828bac70b28f1510359953a5f7bf99025d52e3eb379e5a5f`，本轮没有替换它，也没有更新运行审核哈希。

## 上线与回滚（需独立授权）

需要用户对安装/运行另行当次确认。安装目标是当前用户的 `~/.local/bin/xiaohongshu-mcp`，不是登录工具；确认无活动采集/扫码后，保留旧二进制及其校验值，再按已审核流程原子替换。还需分别更新 `runtime/platform.cjs` 与 `scripts/real-mcp/core.mjs` 的审核哈希，并正常加载 API/worker 接收代码；离线准备脚本不会修改审核哈希；部署时必须另行核对实际产物。保留前端、DB、Redis、账号会话和密钥，不自动采集。

回滚应恢复部署前备份的 v1 MCP 文件和两处 v1 哈希（`f1124a3…e5a5f`，完整值见上文；不能混用源码基线旧哈希），必要时通过现有控制通道恢复旧 API/worker 构建；无需删除会话或数据库数据。新诊断接收字段本身兼容旧 MCP。

本补丁只能为后续获准的有限采集提供证据。当前评论头像缺失的真实来源仍未确认，不能把离线通过或 `IMAGE_NAMED_MEMBER` 非零说成头像已经修复。
