# 账号矩阵部署与真实发送接入核查

范围：REQ-011/015/016/020/021/024。2026-10-27 用户批准部署，以及不实际发送的源码检查、开发和离线测试。本轮没有平台写请求、发送表单提交、重新采集、收费模型调用、凭据扩权或新 MCP 安装。

## 已完成部署

正式运行源码为 `a6699d7fc13abb4e47c7bc6e8b65ae4430466e61`，功能实现提交为 `db42af24021225de3626f14857cae0c20b2413c2`。地址 `http://127.0.0.1:63968/auto-contact`。

- 通过正常工具审批运行 `npm run status`，旧 API/网页均健康。前轮 `LOCAL_STATE_UNAVAILABLE` 本次未重现，没有改系统权限或读取被拒绝的进程列表。
- 先确认采集、模型、审核、登录、设备租约、会话核验及 Redis 工作队列均无活动，再做私有数据库备份。dump 244122 字节，230 行目录清单可读；备份不进入 Git。
- 正常 `npm stop` 保留 PostgreSQL/Redis 容器与卷。第一次 fast-forward 因正式仓库没有提交对象未执行；正常 fetch 已核对远端 main 后完成 fast-forward 和 `npm start`。没有强杀、清库、回滚或重复部署。
- `202610270001_auto_contact` 应用成功。API readiness、数据库、worker 心跳、网页 200、正式 API/worker 构建与已测隔离树一致。
- 31 张保护表的行数不变，30 张逐行聚合摘要完全相同。唯一差异为 `AccountSessionReference.checkedRuntimeId` 清空及 `updatedAt` 更新，符合既有 `account-login.service.ts` 启动核验逻辑；从升级前 dump 逐字段比较其余引用字段不变。平台会话文件与数据库秘密/模型 vault 的元数据不变，不读取或公开秘密内容。
- 实际部署基线：2 个账号、4 次模型调用、51 条审核、107 条已保存评论。当前自动审核 `autoEnabled=0`，升级未更改。不能套用前轮 3 次调用/12 条分数的旧基线。
- 新规则、任务、控制表均为 0。自动联系 OFF、内容空白、sender UNAVAILABLE。已登录实页桌面和 390px 设置抽屉只读核验通过；未保存规则，未启用，窄屏 documentWidth=390。页面明确区分模拟完成与平台确认。
- 已批准 MCP SHA256 仍为 `cc5b85852ff379140d3a1bb6b33273b9ea9b85ec7a2cbd348dccc27d95183a7d`。

环境曾短暂 unavailable，恢复后再次 `npm run status`，后台和网页 generation 未变且 healthy=true。没有为恢复环境重复重启。部署核验的私有证据在当前任务 `auto-contact-deploy/{before,after,health,session-diff}.json`。

## 当前 MCP 的具体缺口

核查对象是与上述已安装哈希对应的 `root-scope-candidate-3/source` 及其 BUILD.json，不把上游 main 当成当前安装内容。上游项目为 [xpzouying/xiaohongshu-mcp](https://github.com/xpzouying/xiaohongshu-mcp)，它不是小红书官方发送 API。

| 路径 | 已查事实 | 接入结论 |
| --- | --- | --- |
| 私信 | `mcp_server.go` 注册工具没有私信发送或送达查询 | UNAVAILABLE；不能凭登录或通知功能推断可私信 |
| `reply_comment_in_feed` | 接受 feed/token/comment/user/content；`lookupComment` 评论 ID 不存在后退回作者匹配；按 ID 命中也未核对作者 | 可能回复同作者的其他评论，不能直接开放 |
| 回复确认 | `commentRendered` 仅检测整个评论区 innerText.includes(content)；service 返回成功和输入的目标 ID；MCP handler 输出成功文本 | 旧同文评论可能误判成功，没有平台新回复 ID与准确目标回执 |
| 取消 | `ReplyToComment` 注释明确不继承 ctx，页面超时 5 分钟；工作台 60 秒后 UNKNOWN | 不能认为 AbortSignal 已停止浏览器；不确认停止就释放平台执行锁可能重叠 |
| `reply_notification` | 只定位通知中的 comment ID，以昵称 placeholder 检查；输入框收起即认为接受 | 不是任意高相关评论回复入口，也不是 DM 或可靠回执 |

项目 `collection/mcp/policy.ts` 继续只允许 login/search/detail 三个读取工具。没有开放发送工具。官方开放平台页面本次未提供可核实的私信/评论授权和回执文档，因此只记录官方路径未确认，不声称平台绝无此能力。

## 已完成的安全发送源码（尚未部署或真实验收）

本轮从纯协议继续完成实际 transport、工作台 DI 接线及 MCP 精确回复候选。运行中的正式服务仍是 `a6699d7`；以下源码未部署，新 binary 未安装、未执行，没有真实发送。

- `local-xhs-reply-sender.ts` 已注册为源码中的真实 sender。只有源码部署记录明确启用且批准哈希与受审工具 pin 一致才可能具备 COMMENT 能力；当前 `xhs-reply-deployment.ts` 固定 OFF/null，原 MCP pin 未改。DM、非 XHS、非 Mac 均不可用。安装候选本身也不会启用发送。
- 从持久化 ATTEMPTED 任务再次核对规则版本/授权哈希、管理员、账号池、当前模型和审核政策、充分证据、选中评论自身 ID/作者/帖子、勿联系历史、当前日共享额度、设备许可及本运行时已验证会话。MCP 协商完成后再核对一次；不读取营销话术或凭据自 HTTP 发送入口，不创建用户规则。
- `xhs-reply-transport.ts` 是独立有限 transport，限定受管 loopback、Bearer、受审 binary 哈希、新能力协商和三个专用工具。原读取白名单不变，不调用旧 `reply_comment_in_feed`。每个进程仅一次提交，不重试，不重新连接补发。超时/取消后确认本次自有进程组退出；停止不明则 BLOCKED 并暂停平台相关规则，保留收件人与原日额度。旧 MCP 缺新能力时不提交。
- `scripts/mcp-exact-reply` 提供可审源码覆盖包、完整基础源文件哈希清单、原许可证、离线测试与无下载构建脚本。专用操作要求稳定 sender/post/comment/recipient ID，精确命中唯一评论和对应作者、精确回复按钮、唯一输入框及原文。找不到或内容/身份改变即拒绝；不按作者/昵称/文本兜底，不把旧 `targetComment` 当发送目标，不自动扩大到滚动全帖。
- Go 状态机继承调用 context；查找、输入、点击和回读有界且只提交一次。请求指纹防重复、并发拒绝、崩溃或关闭异常使实例暂停；取消后必须由工作台自有进程监督确认结束。浏览器构造的上游调用仍依赖外层进程截止/停止，尚未做真实浏览器取消验证。
- 回读使用明确的新评论 ID、帖子、父评论、收件人、发送者及文字哈希。CONFIRMED 还必须有独立的、本次提交响应中的一致 ID，不能拿回读同时冒充响应。平台限制保留 RISK；接受迹象仅 ACCEPTED；错误、超时、未知结构均 UNKNOWN。
- 新增服务保护：适配器异常、60 秒截止、已尝试任务崩溃或停止不明暂停相关流程；即使控制行丢失也重建暂停状态，不能自动换号继续。未知占用不因跨天释放，历史模拟结果仍与真实确认分开。

## 真实技术边界及候选

现有受审源码没有可核实的“本次提交响应 → 新回复 ID”结构。候选 Rod 驱动不猜 endpoint、签名或响应字段，因此实际不会产出 CONFIRMED：新鲜回读仅可产生 ACCEPTED，工作台仍记 UNKNOWN。能力协商明确 `confirmedResponseMapping=false`，即使服务错误返回确认格式，transport 也不升级为成功。独立响应与回读一致的确认分支只经过合成 fixture 验证。

当前只支持已加载且能唯一定位的选中评论；深层/未加载目标会在提交前拒绝，不回退作者搜索。会话/DOM 结构、真实取消与平台风控提示尚未实测。状态工具只查询当前进程内存，不启动浏览器；进程退出后无持久化真实回执核验入口，UNKNOWN 不自动补发。这些是具体未验证/未完成边界，不能宣称真实自动触达已接通。

最终候选版本 `v2.5.5-local-exact-reply-v1`，SHA256：

`ee0901efc70426a8d44eef00e731cf474447967057d3b50df4727bb1cf032d96`

候选保存在本次任务 `exact-reply-candidate-5/`；`BUILD.json`、`SOURCE-OVERLAY.json`、源码与构建/测试日志可审查。用既有 Go 1.24.13、既有 module cache、GOPROXY/GOSUMDB=off 构建，没有下载依赖。已在两个独立目录重复构建，二进制 SHA256 完全相同。候选未安装、未执行，已批准旧 MCP 哈希仍不变。

验证：720 项 API 离线测试通过（31 文件），338 项隔离数据库/API 测试通过，9 项真实 MCP 测试跳过；兼容迁移和数据保护 fixture 通过。Go 15 项状态机及 2 项纯数据测试通过；覆盖目标冲突、重复请求、并发、取消、回执不一致、风险、构造/关闭异常。全项目类型检查、构建通过。没有用真实浏览器/平台证明这些 fixture 的结构有效，没有重新操作正式业务或重复 UI 模拟。

后续须分别批准：先审查并明确批准上述确切候选的安装（保留 OFF，不包含发送）；任何有限真实发送验证还须给定测试账号、收件人/帖子/选中评论稳定 ID、确切文字、次数/时间范围与许可。验证获得可审的响应结构后才能补齐响应映射、重新构建/核验哈希。正式自动启用另需用户实际阈值、账号、渠道与允许内容规则；不由代码填默认营销内容，也不要求逐条人工审批。

## 私信研发路径与最小输入

优先取得用户可用的小红书官方/合作方企业账号接口文档和权限范围，只读检查是否允许首次触达评论作者、稳定 ID映射、会话限制、回执查询和限流。当前开放平台网页抓取不足以确认这些能力，不下载未知私信工具、不复用消费账号 Cookie 构造猜测 API。

如果官方授权只支持用户先发消息后的客服回复，它不能完成本任务的首次自动私信，应保持 DM 禁用并明确产品边界。只有确认支持且用户明确批准相应授权后，才能实现独立 DM transport，沿用现有跨渠道去重/共享额度/风控暂停，不需逐条人工审核。现阶段缺的是具体可授权渠道的接口文档与权限依据；用户发送内容、账号池、阈值和渠道规则也尚未给定。

## CI 与恢复

已部署确切 SHA 的 GitHub combined status 为 pending、total_count=0；check runs=0、Actions runs=0、workflows=0。表示未配置 CI，不是通过。GitHub 连接器读取私有仓库返回404，现有 gh 凭据的只读 API 核查成功，无权限修改。

兼容迁移保留既有历史；后续优先前向修复。不能直接恢复旧 Prisma 客户端或删除新模式记录。完整备份恢复须另行核对新历史并批准。本轮未恢复任何数据。
