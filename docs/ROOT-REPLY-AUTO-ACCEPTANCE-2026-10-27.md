# 根讨论覆盖候选上线与单帖自动验收

验收时间：2026-10-27 08:18–08:24 UTC。

## 正式版本与部署

- 修复基线：`d95a4c45ce67e34283fa233f9ec66cc93e0e1db5`。
- 正式运行：`2ca1771544fe69c0e9199731639b9cc3529c3ac3`，额外提交只更新两处已审核 MCP 哈希。
- 已安装 MCP SHA256：`cc5b85852ff379140d3a1bb6b33273b9ea9b85ec7a2cbd348dccc27d95183a7d`，与本次批准候选一致。
- 空闲检查、私有数据库备份及可回滚旧程序备份通过；正常 `npm stop` → fast-forward → 原子替换候选 → `npm start`。无强杀、无新 schema 迁移。
- API、采集 worker、前端均健康。部署前后业务摘要、账号与密钥文件元信息一致。未读取密钥内容。
- 哈希激活相关平台/安全预检 17/17 通过。首次沙箱测试出现 Node 本机监听异常，正常授权后的同测试通过；未改测试绕过。
- 修复完整离线测试详见 `ROOT-REPLY-COVERAGE-2026-10-27.md`。该运行提交 GitHub check-runs / Actions runs 均为 0，没有 CI，不能记为 CI 通过。

## 有界真实验收

仅重新读取此前已批准的同一篇 6 评论帖子，无搜索、无其他帖子、无发送。沿用原账号、目标版本 1、`qwen3.8-flash` 模型版本 2 及既有预算。

1. 通过正常界面临时开启自动识别；定向读取弹窗正确提示原文会在覆盖通过后发往模型且可能计费。
2. 执行一次定向读取，恢复原检查点。读取完成状态 `COMPLETE / DECLARED_TREE_EXHAUSTED`。
3. 独立覆盖证据：document complete、container present、rootScopeExact、rootEndVisible 均成立；`hasMore` 明确 false；3 个根评论及 3 个直接回复共 6 个唯一 ID；无缺失/重复/非法节点；每个根的声明、加载与实际回复数相符。叶子缺失字段仍是 MISSING；`rootScopedLeafGroups=3`，不是将缺失当成零，也不是仅凭总数一致。
4. 恢复确认 `confirmedTotal=6`、`remainingAnchors=0`，本次没有重复输出保存正文。数据库仍为 3 帖、68 评论，本帖已保存 6 条。
5. 自动任务真实到达 `COMPLETED / 本次整帖处理完成`，处理 6 条。新增且仅新增一个 `AUTOMATIC` provider 调用，rows=6、COMPLETED。不是手动调用，不是去重 SKIPPED。
6. 完整输入单次含 6 items；6 条评论原文逐字保留，6 条均有逐字评论证据。新结果模型版本 `qwen3.8-flash:comment-first-whole-post-v3`。累计调用 2 → 3，已评分 6 → 12。
7. 本次 usage：输入 768 tokens、输出 623 tokens。按配置的 0.8/2.7 元每百万 tokens 估算 ¥0.0022965，非提供方账单。
8. 评分分布为 95 分 2 条、0 分 4 条。但模型本次全部返回 `INSUFFICIENT / UNCERTAIN`；人工状态全部保持 PENDING，不表示确认相关、已联系或可自动发送。
9. 结束后正常关闭自动识别，策略版本 6、autoEnabled=false。活动采集/手动审核/自动审核/RESERVED 调用均为 0；队列 active/wait/delayed/prioritized/waiting-children 均为 0，scheduler/repeatable 均为 0，worker 1 个。
10. 原有用户、账号、68 条评论、旧评分、旧模型调用（包括失败）、旧手动任务及旧自动跳过记录的数据库摘要完全保留。未新增 lead/contact，未更改 Key 或预算，无重试。

## 尚存限制与后续范围

- 恢复读取的任务卡按本次 emitted rows 显示 0 条，进而出现“覆盖待确认/差 6 条”措辞，虽然底层覆盖及帖子 coverage 已 COMPLETE。`run-post-feed.ts` 按评论 lastRunId 筛选，本次 checkpoint 恢复不重写旧评论，所以本轮计数不能表达已确认的累计 6 条。需要单独修正展示契约，不能直接把 0 改成 6 或改写历史来掩盖。
- 新审核使用旧保存评论快照，6 个输入 items 的 `partial` 仍为 true；这与本次新的帖子覆盖证据应区分。模型本次返回上下文不足是已观察事实，不能仅凭该字段断言其唯一原因。后续若修正当前审核上下文，应保留历史快照与历史输入，以当前确认范围建立新快照；本轮未修改历史、未追加收费试验。
- 本次只验证一个小帖子；不能外推所有平台结构、隐藏内容、长帖、其他账号或模型均已真实验证。超容量、失败、取消与重复防护来自前轮隔离测试。

## 本地证据

以下私有目录不入 Git：`/Users/kleene/Documents/Codex/2026-10-26/task-5/root-scope-deploy/`。

- `baseline.json` / `verification.json`：备份与部署无损验证。
- `binary-backup.json`：旧程序哈希及回滚位置。
- `final-verification.json`：覆盖、单次自动调用、评分、历史保留及清理断言。
- `queue-final.json`：无预约/残余队列任务。
- `result-context.json`：真实评分与上下文状态分布。
- `auto-on-read-confirm.jpg` / `auto-off-final.jpg`：已保存并查看像素的正式页面截图。
- `resumed-run-count-limitation.jpg`：恢复读取计数展示限制截图。

数据库备份使用私有目录和 0600 权限，pg_restore TOC 验证通过；旧程序保持独立备份。回滚需正常停启、恢复旧程序和相应哈希/代码，不删除当前业务记录。无待处理权限拒绝或部署阻塞。
