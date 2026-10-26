# 输出校验修复正式部署验收（2026-10-26）

已部署 release `6b7e89bca43fd5d30c096c822423110ef4de72b6`，实现为 `0032ff2ffe57719597f5b0d59795f4906a0f243c`。本文件补充先前修复报告的待部署状态；没有进一步代码修改。

## 正常部署

用户批准本轮正常更新后，先审查启动器所需 Docker 操作。本次相同 Docker 路径的正常工具权限审查允许只读容器检查、业务聚合核验与私有备份；未更改系统权限、绕过旧拒绝或改用其他数据库入口。普通沙箱中的 status 返回 LOCAL_STATE_UNAVAILABLE 后，通过正常权限审查执行同一 status 成功，没有再次启动服务。

停机前确认采集、审核和已预留模型调用均无活跃任务。私有 0600 备份已生成并用 pg_restore 目录校验。执行受管 `npm stop` 正常关闭前端与后端，保留 PostgreSQL、Redis、会话及密钥库；正式干净检出从 `90ecaf9` fast-forward 至 release 后执行 `npm start`，构建启动完成。没有强杀、清锁、清库或恢复旧备份覆盖数据。

无需新 schema 迁移，最新既有迁移仍为 `202610260005_original_comment_input`。数据库与 Redis 容器启动时间、卷身份均未改变。编译后 provider、校验器、共享服务、自动/手动审核及 worker 等 10 个关键文件 SHA-256 与隔离验收产物一致。

## 正式验收

- 受管 backend 与 web 均 healthy。API `/api/health/ready` 返回 database ready，前端 HTTP 200；collection worker 进程存在且在正确持久实例的 BullMQ 队列注册。
- 停机前与只读 UI 验收后均为 1 run / 3 posts / 68 comments，用户 1、平台账号 2、模型配置 1；模型调用 1、审核记录 6（5 FAILED、1 UNANALYSED）、已评分 0、联系记录 0、自动 OFF。
- 评论、帖子、审核记录、模型调用、审核策略及版本、手动/自动任务和联系记录的数据库侧摘要完全一致；模型配置版本一致。数据库配置文件和 vault Key 仅比较 stat 元信息，未读取内容、未改 Key。
- 登录实页显示“批次未采纳 5 / 未送审 1”。旧失败详情和任务记录均显示“旧记录未保存具体原因，无法确定失败条目或校验分支”，并说明本批整体未采纳不等于每条独立失败。旧确认仍失效，没有改写历史。
- 详情与任务抽屉关闭后焦点返回触发按钮；浏览器错误日志 0。截图已保存并实际查看，仅留本机，未将真实评论正文或生产截图提交 Git。
- 没有执行模型请求/重试、创建付费任务、开启自动、采集、发送、修改人工状态或创建新预览。模型调用数 1 → 1。

汇总证据：[deployment-summary.json](evidence/comment-output-validation-2026-10-26/deployment-summary.json)。完整私有证据位于 `/Users/kleene/Documents/Codex/2026-10-26/task-5/output-deploy/`，包括 baseline、verification、前后 status、UI 检查与截图；备份保存在项目 `.local/backups/`。

## 验证边界

实现的 types、build、API 590 / Agent 4 / 前端 152 测试、71 项针对性测试及 20 组隔离 UI 检查已通过，详见[修复报告](COMMENT-OUTPUT-VALIDATION-2026-10-26.md)。部署期间未更改代码，不重复执行无关测试。新输出诊断通过 mock 和合成数据验证；此次正式验收只检查既有历史记录、真实进程健康和数据保留，未验证真实模型成功结果。实现提交没有 GitHub check-runs 或 Actions runs，不能宣称 CI 通过。

当前无部署阻塞。若后续需要回退，先确认任务空闲，再按受管 stop/start 回到先前代码版本；本次无 schema 变化，不需要恢复业务备份，不应覆盖用户后续数据。
