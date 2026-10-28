# 更新后真实只读验收

2026-10-29，用户 Mac 已登录 Chrome，http://127.0.0.1:63968。正式源码更新后重载页面，前端由现有 Vite 服务读取当前 main；无需重启 API/worker，无新增 migration/依赖。完整正式项目构建成功，网页与后端均 running/healthy。

- 桌面 1920px、原生 15px 滚动条：Dock x=711（宽483），设置打开后 x=711；主体 x=304.5 不变。body margin 0→15→0，关闭后 scroll lock 清除。
- 390px：Dock x=2.5，配置和业务弹窗开启/关闭均保持 x=2.5；无横向溢出。测试完恢复默认视口。
- 真实采集设置的 Select content z=54，父弹窗 z=53；Escape 只关闭 Select，父弹窗保留；再 Escape 正常关闭父弹窗。
- 回复历史实际读取 8 条：2 CONFIRMED、1 UNKNOWN、5 FAILED（有未提交证据，UI显示未发送）；原评论、正文、收发身份、时间与展开执行证据仍可读。键盘选择全部结果已验；鼠标选择完整验收使用隔离 Playwright 原生鼠标事件（本机扩展 locator.click 对 Radix option 未提交选择，键盘路径正常）。
- 真实工作台关联已有任务，显示1篇/11条本轮数据、3阶段未启用/4阶段收信待接通；仅进入视图与配置，无开始操作。
- 最终视觉检查修正 shadcn Button 默认 inline-flex 导致首页步骤内容横排，以及 ghost 主按钮文字对比度；步骤专用结构显式 block，主按钮使用 default variant。新增桌面/390布局断言通过。

数据库前后全行摘要一致：ContactAttempt 5c3f52eb887de298c05972a24eae352d；PlatformAccount 22a9b21d05d81f508abd3684300d372c。Lead/Task/FollowUp/CollectionNotice/CapturedPost/CapturedComment 数量保持 0/0/0/0/6/124。3个账号 PAUSED；启用 AutoContactRule 数0。更新前3类任务 lease 均0。未调用模型/平台采集/发送，未修改历史、锁或额度。

源码与数据库备份位于本机 task/shadcn-backup（权限600），不纳入Git。未 push。
