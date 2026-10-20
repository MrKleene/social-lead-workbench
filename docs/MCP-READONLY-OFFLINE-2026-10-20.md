# 默认关闭的小红书只读 MCP：离线交付与验收

接续 main `81269706ac491af72ffdc0c6bfcbb2ccf5bb750b`；开始时工作区干净。保留现有项目、权限、数据和已认可的空间视觉；不做新项目重建或抖音参考研究。本轮仅代码、虚构数据与独立本地服务。未查询或调用真实平台账户、未读取复制 cookies/tokens、未访问原18060服务、未创建持久凭据、未真实自动轮询/发送、未公开部署。

## 已交付和未验证

| 项目 | 已实现并离线验证 | 尚不能据此断言 |
| --- | --- | --- |
| 实际协议 | SDK 1.32.1 Streamable HTTP，initialize → initialized → tools/list → tools/call → DELETE session，JSON及SSE响应 | 真实部署版本、账号状态或平台允许性 |
| 工具范围 | 只允许 check_login_status、search_feeds、get_feed_detail；即使工具发现广告其他工具也不能调用 | 二维码登录、通知、评论、私信、点赞、关注、发布能力 |
| 数据链 | 有限搜索、帖子、已返回的根评论与递归回复、规则匹配、稳定ID、来源及命中依据、去重线索 | 评论游标续读、完整搜索/评论覆盖、真实发布时间或删除语义 |
| 基线/提醒 | 首次成功读取有限窗口只建立窗口起点；后续此前未观察到的相关评论提醒一次 | 不能称“刚发布的新评论”，不能保证全部新评论均被发现 |
| 异常 | 局部覆盖、来源暂不可用、格式冲突、超时、登录失效、账号限制、HTTP429、会话失效、预算、暂停分别记录 | 真实平台错误文案穷举或长期运行稳定性 |
| 工作台 | 三种来源标记、管理员就绪/手动检查、配置模式、总览快捷执行、提醒直达、统一侧栏核验/分配/跟进 | 无LLM；规则命中不是意向确认或同意联系 |
| 抖音/发送 | 保留统一接口与抖音mock，沿用发送禁用 | 无真实抖音实现或发送入口 |

真实 MCP 默认关闭，未在本轮启用。离线 `XHS_FIXTURE` 使用真正的 HTTP MCP 客户端连接自建假服务；它不是内置 `MOCK` 的别名，也不是对真实小红书的验收。

## 契约来源与安全边界

根据上游固定提交 [`7797fd375aba02dcd33afe143f6bee13e5870859`](https://github.com/xpzouying/xiaohongshu-mcp/tree/7797fd375aba02dcd33afe143f6bee13e5870859) 的 [mcp_server.go](https://github.com/xpzouying/xiaohongshu-mcp/blob/7797fd375aba02dcd33afe143f6bee13e5870859/mcp_server.go)、[mcp_handlers.go](https://github.com/xpzouying/xiaohongshu-mcp/blob/7797fd375aba02dcd33afe143f6bee13e5870859/mcp_handlers.go)、[service.go](https://github.com/xpzouying/xiaohongshu-mcp/blob/7797fd375aba02dcd33afe143f6bee13e5870859/service.go)、[types.go](https://github.com/xpzouying/xiaohongshu-mcp/blob/7797fd375aba02dcd33afe143f6bee13e5870859/xiaohongshu/types.go)编写解析器。只读代码阅读不等于真实服务响应兼容已验证。

- 搜索只提交 `keyword`；没有虚构 `cursor` 参数或评论分页工具。
- 详情只提交 `feed_id`、本轮搜索返回的引用、`load_all_comments=false`、`click_more_replies=false`。删除旧适配骨架中的未公开 `max_comment_items` 参数。不会滚动加载全部评论或点击更多回复。
- 上游默认返回有限根评论；返回的 `hasMore=false` 也不能证明回复完整。本实现一律 `PARTIAL/MCP_WINDOW_ONLY`。`subComments` 递归读取已返回内容，最大深度8、总100项；null列表可解析，无稳定ID、重复树ID、父子/帖子冲突拒绝。
- `check_login_status` 返回人类可读文本；只提取已登录/未登录状态，不保存返回的用户名或照做正文中的登录指令。未知文案安全失败。
- 搜索引用只在单轮内存Map和实际工具参数中使用，结束清空；不写入来源、审计、运行快照、错误或客户端响应。没有Cookie、Authorization、OAuth提供者或凭据文件访问。
- 端点只由服务端进程环境配置；只接受规范的 `http://127.0.0.1:<1024..65535>/mcp`，明确排除18060。拒绝DNS、非回环地址、其他IP编码、URL账号、查询串、片段、路径变化和重定向。HTTP调用者不能提交端点。当前不支持远程/容器间MCP地址。
- 夹具初始化必须报告 `crm-xhs-offline-fixture`。客户端不订阅GET推送流、不自动重连、不跟随跳转；单会话HTTP请求上限40、单响应上限2MiB。JSON-RPC方法及工具参数独立白名单。

## 模式、预算和持久化

| 模式 | 启用条件 | 来源 |
| --- | --- | --- |
| MOCK | 默认可用；手动有限运行 | 原 `demo-collect-*` ID、isDemo=true |
| XHS_FIXTURE | XHS_MCP_ENABLED=1，PROFILE=fixture，合法独立端点 | `fixture-xhs-*` ID、isDemo=true、界面及摘要“离线MCP夹具” |
| XHS_MCP | 默认禁止；未来明确授权后由运维配置 ENABLED=1、PROFILE=real，API与worker一致 | 上游稳定ID、isDemo=false；拒绝demo/fixture前缀与既有来源类型冲突 |

`.env.example` 显式保持关闭；没有修改用户现有 `.env`。配置创建/启用/运行、worker选择适配器、最终入库均检查模式与服务端开关。抖音不能使用MCP模式。修改规则增加revision并重新建立窗口起点；关闭配置和手动暂停会阻止旧任务提交。模式切换不会把既有模拟来源改成真实来源。

现有数据库字段可表达这些状态，没有新增migration，也没有修改既有数据。原完整mock基线行为保持；MCP成功解析并遍历一个有界窗口后，只设置MonitorPost.lastRunId，baselineAt仍为空。中断窗口不能建立起点；来源暂缺不推断删除。后续提醒文字为“新观察到相关评论 · 仅已读窗口，未验证发布时间”。没有平台发布时间验证，旧历史评论首次进入窗口也可能被这样标记。

每轮读取最多32个适配器步骤（含prepare、缓存评论遍历，不等于HTTP次数）、100评论、4页/模拟分页流；单步骤3秒，总读取20秒。MCP没有可提交的评论游标，不能用4页预算推导实际分页能力。数据库事务另有20秒超时，序列化冲突最多4次事务尝试；会话清理额外最多约1秒。队列等待/数据库耗时不包含在读取20秒内，不承诺整轮一分钟或真实规模。

BullMQ每任务attempts=1，无周期调度器；处理后的业务失败存为FAILED，队列投递完成不代表采集成功。失败后30/60/120/240/300秒退避，HTTP Retry-After更长时遵循它（大于一天按受限暂停，需管理员核查）。登录失效/受限停用配置。没有换号、重登、自动重试或绕过限制。旧RUNNING因worker崩溃或数据库持久化失败残留时仍需人工暂停恢复；本轮未实现完整租约回收。

取消会中止本地HTTP等待，并在入库事务内复查配置与任务状态。远端实现是否立即停止浏览器工作未经验证，不把本地Abort当成远端已停止的证明。

## 管理员就绪状态与界面

`GET /api/collection/mcp/readiness` 只读取配置和审计，不产生MCP请求；开关开启仍显示待检查，不伪称连接成功。管理员 `POST /api/collection/mcp/check {}` 才执行有限握手、工具发现和登录状态检查。销售禁止访问；写请求受Origin/CSRF保护；任意endpoint字段被严格拒绝。

手动检查通过数据库锁和有界租约串行化，开始/结果分别追加审计，最少30秒冷却，HTTP429遵循服务给出的等待时间。重启/另一个API实例不能跳过已保存冷却。页面显示上次检查时间及范围，不把一次成功视为持续连接或完整覆盖。

配置默认内置模拟；只显示服务端允许的MCP模式可选。主控制台与总览快捷入口共用请求构造，避免快捷按钮误提交MOCK。来源在列表及统一详情侧栏显示模式；提醒直达对应对象，人工处理与销售权限沿用原实现。

浏览器发现旧界面提交后可能停留“排队中”，已补仅针对一分钟内活动运行的1.5秒本地状态刷新，后台页停止；完成后刷新线索、提醒、任务。这只GET CRM数据库状态，不再发起采集，也不查询MCP。超过一分钟可点“刷新本地任务状态”。原CRM SSE仍是本地数据更新提示，不是平台轮询。

## 验收记录

最终命令和退出码见 [checks.json](evidence/mcp-offline-2026-10-20/checks.json)，汇总见 [validation-summary.txt](evidence/mcp-offline-2026-10-20/validation-summary.txt)。全部工作区typecheck/build通过；项目未配置lint命令。构建仍有大于500kB单JS块的体积提示，不是构建失败。

| 验证 | 结果 |
| --- | ---: |
| API单元/规则/HTTP/MCP协议 | 71通过 |
| agent禁用协议 | 4通过 |
| 工作台及模式/有界刷新 | 18通过 |
| PostgreSQL + HTTP权限/业务 | 55通过 |
| 实际Redis/BullMQ + 独立worker | 14通过 |
| 健康worker集成 | 2通过 |
| 总计（不重复计重跑） | 164通过 |

协议测试覆盖JSON/SSE会话释放、禁止工具及参数、端点SSRF约束、缺失工具、错误服务器身份、限流Retry-After、会话失效、重定向拒绝、超大响应、超时、运行中暂停、有限预算、嵌套回复、损坏数据与来源不可用。集成覆盖默认关闭、销售拒绝、CSRF、就绪检查审计/跨实例退避、首次窗口零提醒、重复幂等、后续一次提醒、源标记、人工结果保留、排队后关闭开关、实际独立worker读取与暂停。

全部集成用新建tmpfs PostgreSQL17/Redis7-alpine、随机回环端口、内存随机凭据；没有复用既有库。每轮2/2容器移除，队列无自动调度、验收键清零，详见 [results.json](evidence/mcp-offline-2026-10-20/results.json)。浏览器临时栈的2/2容器也移除，临时账号/会话随库清理，见 [preview-cleanup.json](evidence/mcp-offline-2026-10-20/preview-cleanup.json)。

### 浏览器桌面与窄屏

Mac Chrome，桌面1440×1000，窄屏390×844。在独立127.0.0.1临时地址完成，不覆盖原localhost预览会话。配置“离线MCP闭环验收”，关键词“部署咨询”、排除“广告”、1帖预算；手动检查只读连接后明确显示离线夹具。

| 手动读取 | 读取 | 匹配 | 新线索 | 新提醒 | 结果 |
| --- | ---: | ---: | ---: | ---: | --- |
| 首次窗口 | 5 | 3 | 3 | 0 | PARTIAL，窗口起点；无完整基线 |
| 加入一条返回评论 | 6 | 4 | 1 | 1 | 新观察提醒 |
| 重复同一窗口 | 6 | 4 | 0 | 0 | 幂等 |
| 登录失效夹具（总览快捷入口） | 0 | 0 | 0 | 0 | FAILED、自动暂停、运行按钮禁用 |

从提醒打开 `later` 对象，加入待联系，保存说明“离线验收：评论表达部署咨询求助，仅判定可能需求，未联系。”，分配模拟销售甲，保存人工跟进，时间线1条。没有记录或发送真实平台消息。窄屏实点关闭来源、配置编辑/取消、总览快捷执行；scrollWidth=innerWidth=390，无文档横向溢出，真实模式选项禁用。

开发过程中新增Hook时出现一次HMR的旧Hook布局日志；之后冷加载并重复编辑/取消无错误。保留这一说明，不把开发日志伪称为全程零错误；[browser-checks.json](evidence/mcp-offline-2026-10-20/browser-checks.json)记录冷加载检查结果。销售浏览器角色本轮未切换，销售权限由HTTP/PostgreSQL回归验证。最终已退出临时登录、关闭临时标签页并恢复视口。

原 `localhost:54522`、node PID2144保留运行，没有重启原API/worker或改变原数据；它的旧API不会自动获得新后端能力。若旧API未提供就绪接口，新前端显示状态不可用，不声称已连接。需要看完整新功能可重新启动独立fixture预览；不在本轮擅自升级原进程。

## 主要修改文件

- `apps/api/src/collection/mcp/policy.ts`、`transport.ts`：端点/工具策略、实际MCP生命周期、大小/次数限制。
- `adapters/xhs-mcp.ts`、`contract.ts`、`collector.ts`：上游解析、模式、递归回复、有限预算与取消。
- `service.ts`、`ingestion.ts`、`module.ts`、`queue.ts`、`worker.ts`：管理员就绪、审计、真实/夹具隔离、窗口起点、入库与有限队列。
- `apps/web/src/features/collection/*`：模式与请求构造、连接状态、配置、覆盖说明、本地进度刷新。
- `apps/web/src/features/work/*`及`features/leads/lead-detail-forms.tsx`、`components/feedback.tsx`：两个执行入口、来源标记、反馈与刷新按钮；保留已认可布局和素材。
- `apps/api/test/fixtures/xhs-mcp-server.ts`、`mcp-transport.test.ts`、`collection-postgres.test.ts`、`collection-queue.test.ts`、前端`mode.test.ts`：本地协议/数据/队列/权限回归。
- `scripts/mcp-fixture.ts`、`dev-mock-isolated.mjs`、`test-queue-isolated.mjs`：可复现隔离预览与验收；package/lock文件、`.env.example`、README及本说明。

完整文件列表见 [changed-files.txt](evidence/mcp-offline-2026-10-20/changed-files.txt)。

## 后续真实接入最小授权（本轮未执行）

需要用户明确指定合法允许使用的账号/数据范围、独立本地MCP服务地址和版本（不能用原18060）、允许保存的字段与保留范围，以及人工触发的一次读取预算。不得用历史受限账号换号/重登/更换凭据绕过限制；如平台禁止目标用途则停止。

1. 先单独授权一次登录状态只读检查；用户自行处理官方登录，不让代理导出/复制cookies或tokens，不建立持久凭据。
2. 再授权1组关键词、1帖、仅服务返回窗口、最多100条已返回评论、32个逻辑读取步骤/40次协议HTTP请求、单步骤3秒/总读取20秒的一轮；包含握手、登录状态、搜索、详情及清理。若该预算不够，应先报告再另行调整，不自动扩预算。
3. 由运维在获准的隔离进程为API和worker配置一致的real模式；初始保持 `XHS_MCP_ENABLED=0`，本轮没有提供“顺手开启”脚本。来源保存仅稳定ID、昵称、正文、父子关系、规则依据与观察时间；搜索引用不落库。人工确认来源语义和平台允许性后才考虑扩大范围。
4. 分页/更多回复/发布时间仍不支持或未验证；首次仅窗口起点，第二次比较须另有授权，提醒只能称新观察到。登录失效、受限、验证码、限流或异常即停/退避并报告；不自动换号、重登、重试、评论、私信、点赞或关注。

真实平台兼容、真实账号状态、平台条款允许性、规模/延迟SLA、远端取消效果、完整分页与删除语义都仍是待验证项。本次交付没有绕过这些授权边界。

## 截图

均为虚构离线夹具：

- [桌面配置与手动就绪检查](evidence/mcp-offline-2026-10-20/01-config-desktop.jpg)
- [窗口起点和首次零提醒](evidence/mcp-offline-2026-10-20/02-window-baseline.jpg)
- [重复运行零新增](evidence/mcp-offline-2026-10-20/03-idempotent-run.jpg)
- [新观察提醒](evidence/mcp-offline-2026-10-20/04-observed-notice.jpg)
- [统一侧栏分配与跟进](evidence/mcp-offline-2026-10-20/05-followup-desktop.jpg)
- [窄屏来源和处理反馈](evidence/mcp-offline-2026-10-20/06-source-mobile.jpg)
- [窄屏登录失效暂停](evidence/mcp-offline-2026-10-20/07-paused-mobile.jpg)
- [窄屏配置入口与编辑](evidence/mcp-offline-2026-10-20/08-settings-mobile.jpg)
