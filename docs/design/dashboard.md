# 首屏仪表盘

入口路由 `/`，侧栏「仪表盘」。旧 `/work` 直接重定向到 `/`，不再单独渲染总览。
实现：`packages/local-runtime/src/workspace.cjs` 的 `dashboard()`，渲染层
`apps/web/src/features/local-workbench/local-overview.tsx`。

## 数据口径

- 只读本机 SQLite，不调用平台、不启动任务、不改变未读状态。
- 「收到回复」只统计**对我们发出内容的回复**：`received_messages` 中必须存在一条
  同平台、同发送对象的 `send_attempts`，状态为 `CONFIRMED`，且发送时间不早于
  回复时间。普通评论、别人对我们笔记的留言不进入该口径，仍留在消息通知。
- 「采集笔记」按 `run_posts.platform_id` 去重，同一篇跨轮重复采集只计一篇；
  轮次数仍按 `collection_runs` 原样显示。
- 「符合评论」取 `review_results.decision` 的 `MATCH`；详情行同时给出
  `NO_MATCH` 与 `UNCERTAIN` 数；`PENDING` 不在此处累计。
- 14 天趋势与最近 5 条回复使用同一回复口径；日期按北京时间切日。
- 「最近一轮采集」附状态与原因，`FAILED`、`PARTIAL`、`INTERRUPTED` 在页头下方提示，
  链接到采集历史。

## 边界

- 数字是本地库快照，不代表平台全量；`asOf` 是查询时刻。
- 未读数是本地库的 `is_new`，不是平台未读数；打开消息页不等于已读。
- 仪表盘不提供操作按钮，除「进入获客数据采集」外只做只读跳转。
