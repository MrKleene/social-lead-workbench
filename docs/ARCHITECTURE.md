# 当前架构

React/Vite 前端通过同源受鉴权 API 读取数据库状态；SSE 推送状态变化，首次进入及重连读取数据库补齐。API与业务 worker 可分进程，数据库是权威来源，前端展示不会启动业务。

## 业务链

`CollectionConfig → CollectionRun → CapturedPost / CapturedComment → ReviewJob / ReviewResult → AutoContactJob → SendAttempt / ContactLedger`

整轮阶段屏障控制采集、审核和回复。当前执行任务与页面查看任务分离。评论与私信分别冻结模板和目标、独立去重，保留账号锁、共享额度、UNKNOWN及平台风险防护。单帖重读标记的执行来源阻止派生发送。

## 接入与接收

账号/设备服务管理受管 MCP 独立进程、内置浏览器与会话。应用通过限定工具协议调用，不能将网页登录等同全部平台能力。接收服务与消息表提供账号隔离、增量去重、系统未读及SSE更新；平台WebSocket事件、补偿读取和未验证能力须分别标识。参见 inbox-reception.md、direct-messages.md。

## 退出模块与历史兼容

旧线索、跟进、人工任务、线索提醒及模拟联系控制器、服务、页面已删除，相关API无处理器。采集入库不再创建Lead或CollectionNotice。模板预览直接处理模板变量，不查询旧线索列表。

Lead、FollowUp、Task、CollectionNotice等旧数据库结构及迁移仅为历史外键、归档与审计兼容保留，未提供管理功能，也未运行删除迁移。实际发送保护仍只读检查旧勿联系/已联系及ContactLedger，不能移除这些检查来追求文件名零命中。

## 主要目录

- `apps/api/src/collection`：采集、原文、覆盖、模型审核与进度。
- `apps/api/src/auto-contact`、`direct-messages`：任务、预检、发送适配器与回执。
- `apps/api/src/inbox`：接收、去重、消息查询与系统内未读。
- `accounts`、`devices`、`auth`、`replies`：账号设备、身份权限及模板。
- `apps/web/src/features`：对应页面和功能局部hooks。
- `packages/contracts`：共享协议；`scripts`：受管启动、测试与运维。

只读API不得泄露令牌、Cookie或模型配置秘密；部署不自动切换业务开关。没有数据库迁移或历史回填依赖。
