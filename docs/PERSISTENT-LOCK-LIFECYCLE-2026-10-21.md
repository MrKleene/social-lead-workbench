# 持久实例锁生命周期修复（REQ-024，2026-10-21）

基线 `2e57e1d`。保留独立评论规则、原数据库、main实例、63967/63968、账号及设备保护。本轮仅修改启动器/锁生命周期、诊断、隔离测试和文档，不修改数据库schema、浏览器安全参数或真实MCP启动方式。

## 已确认事实与推断边界

只读检查 `.local/persistent/main` 白名单元数据：

- `operation.lock` 已是 `crm-persistent-lock-v2`，创建于2026-10-21 05:48:24 UTC；`running.json`对应同次启动。不是恢复后仍写回旧格式。
- 当前内核启动UUID与v2锁相同；`.operation.guard`可非阻塞取得后立即释放，表明没有锁助手持有它。原API/Web健康连接均ECONNREFUSED。没有用这些结果删除锁。
- `stopped.json`还是此前一天的记录，没有这次运行的清理完成凭证。现有恢复见证与原锁、实例配置摘要仍匹配，无需重复准备。
- 本次拒绝代码实际为 `LOCK_REBOOT_PROOF_REQUIRED`。旧诊断未收录锁错误码，错误显示成泛化的 `STARTUP_FAILED`。未检查Docker或将Docker未就绪列为原因。

上述证据说明同次系统启动内的运行留下残留锁，没有证明所有独立执行进程结束。用户当时具体使用了几次Ctrl+C、是否关闭终端或遭遇强制退出，现有记录无法还原。没有枚举进程，没有读取凭据，没有操作Terminal/Codex原生UI，也没有停止或重启真实服务。

## 代码根因与最小修复

旧代码 `process.once(SIGINT/SIGTERM)` 在收到第一信号后移除监听器。异步清理期间再次收到同类信号会按Node默认行为立即终止，`finally`来不及释放锁。隔离真实进程复现结果为：清理已开始、未完成、退出信号SIGINT、锁仍存在。旧代码也没有SIGHUP处理，终端关闭可以绕过清理。

锁助手原与前台终端同组，终端Ctrl+C会同时打到助手；助手可能先释放内核锁，触发额外的失锁退出。这个风险由信号拓扑与测试证实，不等于已经证明用户这次由该路径退出。

修复：

1. 停止处理器在整个进程生命周期保留，对SIGINT、SIGTERM、SIGHUP只启动一次清理，重复信号不会恢复默认立即退出。
2. Mac锁助手使用独立进程组，生命周期仍由本启动器stdin管道维持；没有后台服务、登录项或新增持久权限。启动器退出后EOF释放flock，助手仍不是“全部业务进程退出”的证明。
3. 原有自有进程停止/强制终止步骤后，等待已跟踪子进程的退出事件，最多5秒；未确认时保留operation.lock，不写成功停止记录，显示 `LOCK_CLEANUP_INCOMPLETE`。
4. 精确白名单锁错误码可见，未知原始错误仍不输出；同一错误不重复打印。锁所有权token校验、并发互斥、原子恢复和旧残留保守拒绝保持。

没有更改锁格式或加入“只要PID不存在/端口空闲就删锁”的宽松恢复。SIGKILL/系统崩溃无法执行JS清理，仍可能留下残留；本次没有实现能证明所有脱离子进程退出的完整原生监督器。因此不能声称任意异常退出都能无重启恢复。Windows原生信号行为本轮未实测。

## 当前真实残留与最少用户操作

**修复代码不会清除已经留下的真实v2锁。** 它缺少可验证的执行进程退出证明，不能安全地静默接管；本次没有尝试删锁、终止未知进程或重启系统。

本次已只读确认原恢复见证仍匹配，不需要再次运行 `--prepare-lock-recovery`。若用户选择使用现有安全恢复方式：保存其他工作后正常重启Mac一次，在Docker就绪时回到同一目录执行：

```sh
cd /Users/kleene/projects/social-lead-workbench
npm run dev:persistent
```

不要在这次重启后重新准备见证，不要删锁、重建卷、重新初始化管理员或换实例。启动器用变化后的系统启动UUID证明旧执行进程已结束，沿用原数据和63968。本轮没有替用户执行此恢复动作。

之后正常停止：在启动终端按Ctrl+C，等待“Stopped owned processes…”退出完成，再运行原命令。连续信号和终端SIGHUP已在离线实例通过，不需要为正常重启再次重启整台Mac。新源码不会改变已经运行的旧Node启动器，需下一次启动才使用修复。

## 验证

隔离目录 `/Users/kleene/Documents/Codex/2026-10-20/task-4/lock-lifecycle/validation`。只使用新建虚构锁、进程和随机离线数据库实例，不读真实会话或启动真实MCP。

- 修复前真实进程复现：`cleanupStarted=true, cleanupFinished=false, residualLock=true, signal=SIGINT`。
- `npm run test:persistent:lock`：16项通过。单次/重复SIGINT、混合SIGTERM、重复SIGHUP；清理期间竞争者仍被内核锁拒绝；清理后同次OS启动立即再次加锁成功。另验证SIGKILL残留仍拒绝、活跃锁/并发/符号链接/token变更/重启证据保护及未确认退出保留锁。
- `npm run test:persistent:diagnostics`：10项通过。精确锁错误码、未知秘密不输出、Docker失败后原实例和解锁行为仍保留。
- `npm run test:persistent`：12组通过。真实离线启动器第一次连续两次终端SIGINT后锁消失，第二次立即启动并保留原管理员、账号、关键词、客户、跟进、审计、设备身份；第二次连续SIGHUP同样完成解锁。角色/CSRF、虚构3帖去重和备份恢复仍通过，仅清理自有夹具。
- 完整验收证据：`/var/folders/q6/b2g8k11x23g_cf3ql0ky_v140000gn/T/crm-persistent-evidence-UpRfdF/`。启动器相关JS语法检查通过。

无需为本轮再跑真实采集。现有真实残留的一次性恢复仍待用户执行，不能将离线验收算作已恢复用户环境。
