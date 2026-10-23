# MCP 转换前头像诊断候选补丁（未安装、未运行）

这是诊断补丁，不是头像取值修复。它不增加平台请求、不读取账号文件、不映射猜测别名、不下载图片。

## 来源与边界

- 来源：本机已安装 MCP 对应的既有源码目录 `xiaohongshu-mcp-a5c8f7799980ba1fdd501999843eb2d17e4c9a9f`，包含之前的本地搜索提交诊断修改；目录名不是此本地修改树的 Git 提交证明。
- 安装版本：`v2.5.5-local-search-submit-diagnostics`，安装文件 SHA-256：`17d57acd1a4f4cad3f2525bd13de40e112cb34594231a10b54b05ced9485cf80`。
- `source-manifest.json` 固定本次读取的 69 个源码、模块、许可和嵌入资源文件哈希。准备工具拒绝文件漂移和符号链接，只复制这些文件；不会复制 Cookie、会话、配置 JSON、日志或二进制。
- 原项目许可 Apache-2.0，随附 `LICENSE.upstream`。不向上游仓库推送。

## 补丁内容

`integration.patch` 仅改两处：在 `extractFeedDetail` 的 Go 固定结构反序列化之前调用检查；在 `FeedDetailResponse` 增加可选 `avatarSourceDiagnostic`。新增两个 Go 文件实现和测试诊断。

诊断处理的是浏览器 `JSON.stringify(noteDetailMap)` 已返回的 JSON，不是任意浏览器对象：因此 `undefined`、不可枚举属性或此前页面逻辑已删除的字段，不能据此证明原始页面不存在。诊断不改变已有反序列化失败规则；原响应若整体解码失败，不会返回成功诊断。

只保留当前请求帖子的评论与回复汇总，不含帖子/评论/用户标识：

- `USER_INFO`、`FIXED_AVATAR`：缺失、null、空串、空白串、非空串及类型计数。
- `AVATAR_CASE_VARIANT`：检查 Go 原本就接受的大小写变体，不改变现有解码。
- `IMAGE_NAMED_MEMBER`：仅表示未识别字段名包含 image/avatar。既不输出字段名，也不证明它是头像或 URL，更不将其映射到头像。
- `OTHER_MEMBER`：其他未映射字段的类型计数，不输出名称或值。
- `conversion`：实际 `User` 类型解码及 JSON 往返后，固定 avatar 为空、保留非空、解码失败或序列化异常的计数。

诊断最多检查 2 MiB JSON、1000 条评论/回复、16 层回复及每个用户 64 个字段；达到限制标记 `truncated`，只限制诊断，不截断业务数据。结果排序稳定，不新增原始数据日志。

同批项目修改加入可选白名单接收：仅接受固定枚举、有限计数和一致总数，沿现有 `imageDiagnostics.avatarSource` JSON 存档保存。非法诊断整体丢弃，不改变正常评论；旧 MCP 无此字段仍兼容。既有存档代码将 `imageDiagnostics` 排除于内容哈希之外，不引入新的内容版本、线索或提醒。没有数据库迁移。本次不重启后台，因此接收代码尚未加载。

## 离线复现

需要已经审阅的本地 Go 1.24.13（darwin/arm64）及已缓存依赖；工具不下载依赖。目标目录必须不存在，且必须在原源码树之外。参数均为路径，不要输入任何凭据。

```sh
node scripts/mcp-avatar-diagnostics/test-prepare.mjs /absolute/path/to/reviewed-source
node scripts/mcp-avatar-diagnostics/build-candidate.mjs /absolute/path/to/reviewed-source /absolute/path/to/new-output /absolute/path/to/go/bin/go /absolute/path/to/existing/go/pkg/mod
```

构建器使用干净环境、独立 HOME/cache/tmp、`GOPROXY=off`、`GOSUMDB=off`、`GOTOOLCHAIN=local`、`CGO_ENABLED=0`、`-mod=readonly -trimpath -buildvcs=false`；版本为 `v2.5.5-local-avatar-source-diagnostics`。只运行独立文件形式的 Go 单元测试，不加载平台包、不运行主程序。随后编译完整 MCP，输出二进制和 `BUILD.json`、测试/编译日志；绝不执行产物。原安装版本 CGO_ENABLED=1，本候选为纯 Go 构建，因此运行兼容性仍需获准后的验收。

本机两次独立构建 SHA-256 相同：`f1124a3fb0819725828bac70b28f1510359953a5f7bf99025d52e3eb379e5a5f`。6 个 Go 测试组（含 9 种字段子用例）、5 项准备保护检查通过。实际平台数据与运行兼容性未验证。

## 上线与回滚（本轮不执行）

需要用户对安装/运行另行当次确认。安装目标是当前用户的 `~/.local/bin/xiaohongshu-mcp`，不是登录工具；确认无活动采集/扫码后，保留旧二进制及其校验值，再按已审核流程原子替换。还需分别更新 `runtime/platform.cjs` 与 `scripts/real-mcp/core.mjs` 的审核哈希，并正常加载 API/worker 接收代码；本次两处哈希均未修改。保留前端、DB、Redis、账号会话和密钥，不自动采集。

回滚应恢复旧 MCP 文件和两处旧哈希（见上文），必要时通过现有控制通道恢复旧 API/worker 构建；无需删除会话或数据库数据。新诊断接收字段本身兼容旧 MCP。

本补丁只能为后续获准的有限采集提供证据。当前评论头像缺失的真实来源仍未确认，不能把离线通过或 `IMAGE_NAMED_MEMBER` 非零说成头像已经修复。
