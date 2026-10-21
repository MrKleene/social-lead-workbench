# Qwen 评论语义匹配：配置、控制与边界

仅评论匹配，不生成回复、不发送评论或私信。独立 LLM 开关默认关闭。保存目标、开启队列或恢复服务不会发起模型请求。原教培配置不自动改写。

## 使用路径

工作台 → 自然语言审核 · 手动评估 → 原文存档。

1. 先在搜索设置编辑自然语言目标。帖子搜索词、旧关键词规则、自然语言目标和 LLM 运行开关相互独立。旧表单“启用自然语言审核”表示保存目标，实际运行由独立开关控制。
2. 关闭 LLM 时，主动采集只增量保存实际读取到的帖子、一级评论、回复及父评论上下文；语义状态为未分析，评分为空。旧关键词命中视图继续兼容，但不会删除未命中原文。
3. 开启独立 LLM 开关后，新增原文进入待分析队列。也可选择已保存评论（每次最多5条），预览脱敏文本、加入当前目标/型号的分析队列，无需重采。
4. 下方“预览所选批次”展示真正待请求的文本。模型、价格确认、预算和独立开关都就绪，且人工逐项确认后，才允许一次模型请求。默认下一批也最多5条。自动脱敏不能可靠识别所有自然语言姓名/身份，因此目前自动入队，不无人审核自动付费。
5. 已完成的相同目标/型号/上下文版本/内容哈希复用结果。修改目标或型号后保留新旧结果与引用。失败/超时不是低分；仍待审核。未知网络结果可能已收费，只有重新预览并明确确认后才可人工重试，不能保证服务商不计费。
6. 关闭开关阻止新的模型请求；已经发出的请求不能撤回，可能完成并保留结果。真实发送始终关闭，评分与审核都不能授予发送资格。

历史仅有 ID 的观察记录不具备原文，页面显示缺口数量，不伪造或自动重新采集。原文与版本列表分开计数。采集中断后已提交的增量快照保留；覆盖仍为部分或未知，不能据此推断不存在其他评论。

## 北京接口与受控型号

标准接口：`https://cn-beijing.maas.qianwenaiapi.com/compatible-mode/v1/chat/completions`。
`QWEN_MATCH_ENDPOINT=beijing-standard` 是默认配置。Key 决定业务空间，普通调用不需要额外 workspace ID；项目的管理员权限、按配置隔离和全局预算仍保留。旧专属端点仅在显式选择 `beijing-workspace` 时要求 `QWEN_WORKSPACE_ID`。不接受任意代理、其他地域或重定向。

| QWEN_MATCH_MODEL | 北京非思考输入 / 输出，元/百万token |
| --- | --- |
| qwen3.8-flash（本轮加入的用户候选） | 0.8 / 2.7 |
| qwen3.7-flash-2026-07-15（保留原默认） | 输入≤32K：0.2 / 0.8；32K–256K：0.6 / 2.4；256K–1M：1.2 / 4.8 |
| qwen3.7-plus-2026-05-26 | 输入≤256K：2 / 8；256K–1M：6 / 24 |
| qwen3.8-max-0902 | 输入≤1M：12 / 36 |

所有请求 `enable_thinking=false`、严格 JSON Schema、最多2500输出token。业务输出保持符合/不符合/待确认、排序分、理由、上下文程度及引用。服务端复核结构与脱敏原文，缺上下文强制待确认。分数不是校准概率。

核对日期2026-10-21：[Qwen3.8-Flash官方模型页与接口](https://www.qianwenai.com/models/qwen3.8-flash#api-reference)、[JSON Schema支持](https://platform.qianwenai.com/docs/developer-guides/text-generation/structured-output)、[非思考模式参数](https://help.aliyun.com/zh/model-studio/deep-thinking)、[业务空间与Key](https://platform.qianwenai.com/docs/developer-guides/administration/workspace)、[其他型号价格](https://help.aliyun.com/zh/model-studio/model-pricing)。官方支持不等于本项目真实连通性或语义质量验收。3.8-flash是官方提供的型号名，未声称它是不可变快照；若服务商更新同名模型，需更新本地上下文版本以重新验收。

价格是有日期的核对记录，不推定免费额度、折扣或缓存优惠。每次变更型号需重新确认 `QWEN_MATCH_PRICE_ACK=<型号>:beijing-2026-10-21`；不能沿用另一型号的价格。未知型号/价格禁止调用、不回退便宜型号。预算是每日请求次数，不是精确人民币上限，费用以账单为准。

## 用户本地配置（不要发送Key到聊天）

本轮未读取/配置任何真实Key，也未执行以下命令。用户尚未批准真实费用测试。待用户选择预算后，在自己的终端先按项目正常流程停止已核对身份且无任务的后台；不得盲目重复启动、删锁或复用文档里的PID。数据库和前端可保持运行。

```zsh
cd /Users/kleene/projects/social-lead-workbench
export QWEN_MATCH_ENABLED=1
export QWEN_MATCH_CONSENT=beijing-redacted-comments-v1
export QWEN_MATCH_ENDPOINT=beijing-standard
export QWEN_MATCH_MODEL=qwen3.8-flash
read 'QWEN_MATCH_PRICE_ACK?核对价格后输入 qwen3.8-flash:beijing-2026-10-21: '
read 'QWEN_MATCH_DAILY_LIMIT?每日最多请求数（1-100，自行选择费用预算）: '
read -rs 'QWEN_API_KEY?北京空间 API Key（隐藏输入）: '
printf '\n'
export QWEN_MATCH_PRICE_ACK QWEN_MATCH_DAILY_LIMIT QWEN_API_KEY
npm run dev:persistent:background -- --backend
unset QWEN_API_KEY
```

无需额外 workspace ID。Key 仅后端环境引用，不入仓库、不下发浏览器、不写日志；持久入口不读取 `.env`。仅 API 获得Key，采集worker只接收非秘密型号和端点档案以标记队列版本，前端/迁移/构建不接收。后续重启需用户重新提供环境，无自动系统代理。不要粘贴进程环境、Key或密钥截图。页面“配置就绪”仅说明本地参数齐全，不执行联网验Key。

## 隐私、预算和故障

外发只包含目标、帖子/评论/必要父评论和缺失/部分/截断标志。去除身份元数据、原ID、URL及文本中的联系方式；可疑残留线索阻断整批。人工必须逐项确认不含姓名、昵称、身份、链接或联系方式；无法判断则取消。原文和来源快照只留本地。

全局并发1、每批最多5条/1个请求、请求间隔至少30秒、20秒超时、0次自动重试、每日1–100次。事务预留预算、请求键幂等、行版本及预览哈希防止双击或并发重复调用。预留/失败/中断占次数；记录已知token与用量未知。超时、429、模型错误和证据校验失败保留待审核和空评分。过期租约不会自动重放。评论/帖子是非可信数据，没有工具或发送能力。

## 本轮验收范围

仅本地样本、mock HTTP/mock MCP、隔离数据库和UI。真实Qwen调用为0，真实平台采集/登录验证/发送为0。实际模型质量、服务商权限/费用、真实完整评论分页均未验收。详细测试和部署结果见 `CAPTURE-ARCHIVE-2026-10-21.md`。
