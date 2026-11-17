# 搜索计划：预览冻结顺序、种子与筛选

一轮采集在预览时生成搜索计划：把配置里的全部关键词用 Fisher-Yates 打乱作为搜索顺序，生成 32 位十六进制种子，并固定平台筛选「最多点赞 + 一周内」。计划随授权 scope 的 `readPlan.keywordPlan` 冻结（version 2：`order`、`seed`、`filters`）。

- 执行时按顺序逐词搜索，每个词只读第一页；某词本轮占用的篇数由 `keywordQuota(seed, 词序号, 当前剩余篇数)` 确定性抽出 1~剩余篇数。同一计划重放结果相同，执行时不再新抽随机数，避免与授权哈希冲突。
- 配额只是上限：该词候选不足时剩余名额顺延给后续关键词；跨关键词按帖子 ID 去重；搜索只读首页本身不算异常。
- 选帖时跳过历史 `run_posts.coverage='COMPLETE'` 的帖子，PARTIAL 记录允许本轮重采；跳过的候选不占配额、不计入 `searchPlanUsage`。
- 计划内关键词按序搜完仍不满 `batchLimit` 时，本轮记 `SEARCH_EXHAUSTED`（界面「结果不足」），不追加关键词、不重复搜同一词。
- 词与词之间停顿 3~8 秒（`comment-read-policy.cjs` 的 `searchGap`），并受整轮时间上限约束。
- `collection.cjs` 启动时用 `planSpec` 对当前配置重新校验计划：只能重排配置里已有的关键词（NFKC 规范化后匹配）、不得重复、order 长度 1~min(100, 词数)、种子合法、筛选值只能是平台面板上的选项；失败抛 `INVALID_COLLECTION_PLAN`。校验通过后快照的 `keywords` 取计划顺序，并带 `searchSeed`、`searchFilters`。
- 预览生成计划，`authorizeCollection` 用同一计划重算预览，hash 不一致即拒绝；计划不跨轮持久化，每轮重新生成。
- 开始采集弹窗不展示关键词；本轮实际搜过的词与各自新增篇数写进 coverage 的 `searchPlan`，在任务页与「采集历史 → 笔记」弹窗展示。
- 上限：每轮最多 10 篇（`MAX_LIMIT`），关键词最多 100 个。
