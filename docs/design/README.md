# 机制设计

本目录描述**当前实现**的技术细节：约束、预算、协议与边界。
产品范围见 [`../requirements/`](../requirements/README.md)。

这里不放验证过程、部署记录或候选状态——那些只写在提交说明里。

| 文件 | 内容 |
| --- | --- |
| [comment-read-through.md](comment-read-through.md) | 评论读取窗口的实际预算：主评滚动 3 次、4 次回复操作、40 根 / 100 唯一 / 15 秒；单帖另有按声明评论数计算的兜底时限（60 秒 + 每评 1.2 秒，90 秒~40 分钟）；整轮上限为各帖预算之和加 5 分钟余量、硬顶 150 分钟，连续读取每满 10 分钟插入 20~40 秒停顿；预算由 `packages/domain/src/collection/comment-read-policy.cjs` 固定，请求方不能扩大 |
| [comment-reply-target.md](comment-reply-target.md) | 回复目标怎么选：直接目标取 `targetComment`，`subComments` 是讨论关系不是目标；嵌套语义仍待真实页面比对 |
| [dm-templates-and-day-limit.md](dm-templates-and-day-limit.md) | 私信模板独立分类；`AccountDay.dailyLimitOverride` 只作用于 `REAL:Asia/Shanghai:YYYY-MM-DD` 单日桶，不动永久额度与占用数 |
| [qwen-comment-matching.md](qwen-comment-matching.md) | 模型调用节奏：全局并发 1、两次开始至少间隔 1 秒、429 后退避 60 秒；脱敏、预算与证据守卫 |
| [send-queue.md](send-queue.md) | 发送队列：审核完成/人工通过按评论所属匹配方案的入队规则（阈值+渠道）入队，入队时冻结规则版本、模板池与账号池；总开关和渠道开关关闭时停留待发送；同账号 30~60 秒、换号 3~5 分钟且每次只派一条 SEND；页面分「发送队列 / 需要处理」，等待额度与发送中为行内状态；UNKNOWN 自动延迟只读核对，确认后转已发送，未确认自动关闭且不重发；入队或评论发布满 7 天过期，过期 30 天清理 |
| [review-batching.md](review-batching.md) | 评论审核分批：50 条/批、单批最多 3 次尝试、可重试错误、耗尽暂停、结果未知暂停、评论级完成判定与失败原因展示 |
| [model-settings-security.md](model-settings-security.md) | 桌面模型凭据：系统保护、保存与授权边界、备份和跨设备恢复 |
| [dashboard.md](dashboard.md) | 首屏仪表盘：只读本机 SQLite 聚合，`/` 入口；「收到回复」必须有同对象 CONFIRMED 发送且回复晚于发送，14 天趋势与最近 5 条同口径；`/work` 重定向到 `/` |
| [search-plan.md](search-plan.md) | 每轮采集在预览时打乱全部关键词、冻结 32 位种子与平台筛选（最多点赞 + 一周内），写进 scope 的 `readPlan.keywordPlan`；执行按种子确定性抽每词 1~剩余篇数配额，词间停 3~8 秒，每个词只读一页，搜完不足 batchLimit 时记「结果不足」 |
| [local-runtime.md](local-runtime.md) | `packages/local-runtime/src` 的结构：只用 Node 内置模块，不依赖 Electron / React / Prisma / PostgreSQL / Redis；测试入口 `npm test` |
| [conversation-replies.md](conversation-replies.md) | 收件会话与回复的边界 |

## 写新文档时

- 只写**现在是什么**，不写"这次改了什么"。变更原因写在提交说明里。
- 数字要能对应到代码：预算写进 `packages/domain/src/collection/comment-read-policy.cjs` 之类的常量，不要只写在文档里。
- 标注失效条件：什么情况下这条规则不成立（例如"平台限制、取消、无进展时不续读"）。

## 工程结构

[project-structure.md](project-structure.md) 定义目录归属、依赖方向、构建产物和验证入口；调整工程边界时同步维护。
