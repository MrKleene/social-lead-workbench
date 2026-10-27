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

## 本轮新增可离线验证的协议代码

`apps/api/src/auto-contact/xhs-reply-protocol.ts` 是未接线的纯协议边界，不是已连通的 sender：

- 仅接受 XHS COMMENT，要求当前账号、稳定发送者、帖子/选中评论/作者 ID 及匹配的已有帖子引用；DM、抖音、缺失或冲突目标发送前拒绝。保留用户文字原样，不补营销内容。
- 每次生成独立 attemptId，并绑定原 requestKey。要求平台新回复 ID、准确父评论、作者/收件人、发送者、原文哈希在提交响应和随后读取中全部一致；不能把旧 `targetComment` 或输入 ID 回显当回执。
- 旧 MCP 成功文本、单个 success 布尔值、内容碰巧可见、缺字段、错账号/目标/请求、不同响应/读取 ID 均 UNKNOWN。只存平台回复 ID，不把帖子 token 放入台账回执。
- 确认已停止且发生在提交前的拒绝才 FAILED；提交后超时不释放收件人占用。明确限流/验证/封禁/拒绝始终 RISK，即使停止尚未确认也不能丢掉平台暂停信号。
- 该 envelope 是给未来受审 transport 的校验格式，不是“字段写成 true 就可信”的授权。没有 HTTP 接收入口、网络实现、binary 启动、DI 注册、白名单变更或开启生产能力。

本轮只在隔离代码树增加协议及合成测试；运行中的正式服务仍是上述部署提交。旧实现的 816 单元、334 数据库/API、14 UI 与类型/构建结果见 [原交付](AUTO-CONTACT-2026-10-27.md)。本轮新增协议 34 项，连同既有自动联系 9 项定向回归共 43 项通过；API 全量 686 项通过（29 文件），API 源码/测试类型检查及构建通过，git diff --check 通过。未更改数据库、正式运行依赖或 UI，未重复跑旧数据库/UI模拟测试；真实 MCP 测试未运行。

## 接通评论回复的最小后续实现

1. 新 MCP 源码专用 exact-reply 操作：三个稳定目标 ID 必填；评论 ID 找不到、帖子或作者不符立即拒绝。取消按作者兜底，不使用昵称作为身份，不使用历史 targetComment。
2. 在提交前绑定本次账号和当前登录的稳定发送者 ID，核对最终回复框实际选中目标；监听本次提交响应，取得平台新回复 ID。再有界核对该 ID、发送者、父评论、收件人和原文。无法取得可靠证据时 UNKNOWN，不能使用 DOM 全文包含或框消失代替。
3. 所有查找/点击/等待继承取消上下文；提供受管进程终止确认。工作台 transport 直到终止确认前保留平台互斥，无法确认则暂停相关流程。不能仅因 60 秒 Promise.race 结束就让另一个账号继续。
4. 请求关联和回执只读核查须支持崩溃后判定；禁止重试未知、换号补发或按日重发同用户。把平台限制映射为结构化 RISK 并暂停全部相关发送规则；额度不是平台许可。
5. 离线合成 DOM/协议/取消和并发测试后，交付可审源码差异和新 binary 确切哈希，单独批准安装该候选。生产替换前仍保持当前 binary 和 sender 不可用；不需要真实发送才能完成源码开发。

上述第 2 步真实平台响应/回执格式尚未验证，不能编造 endpoint、字段或私有签名协议。既有源码不足以证明它；可以继续实现接口和离线反例，但实际 transport 的可靠证据映射必须另行核查。安装和任何真实发送是独立批准项。

## 私信研发路径与最小输入

优先取得用户可用的小红书官方/合作方企业账号接口文档和权限范围，只读检查是否允许首次触达评论作者、稳定 ID映射、会话限制、回执查询和限流。当前开放平台网页抓取不足以确认这些能力，不下载未知私信工具、不复用消费账号 Cookie 构造猜测 API。

如果官方授权只支持用户先发消息后的客服回复，它不能完成本任务的首次自动私信，应保持 DM 禁用并明确产品边界。只有确认支持且用户明确批准相应授权后，才能实现独立 DM transport，沿用现有跨渠道去重/共享额度/风控暂停，不需逐条人工审核。现阶段缺的是具体可授权渠道的接口文档与权限依据；用户发送内容、账号池、阈值和渠道规则也尚未给定。

## CI 与恢复

已部署确切 SHA 的 GitHub combined status 为 pending、total_count=0；check runs=0、Actions runs=0、workflows=0。表示未配置 CI，不是通过。GitHub 连接器读取私有仓库返回404，现有 gh 凭据的只读 API 核查成功，无权限修改。

兼容迁移保留既有历史；后续优先前向修复。不能直接恢复旧 Prisma 客户端或删除新模式记录。完整备份恢复须另行核对新历史并批准。本轮未恢复任何数据。
