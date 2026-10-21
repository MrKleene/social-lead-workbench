# Mac 持久实例锁诊断与恢复（REQ-024）

2026-10-21 更新：本页保留第一次恢复历史；重复停止信号/终端关闭的生命周期修复及当前残留锁边界见[后续修复](PERSISTENT-LOCK-LIFECYCLE-2026-10-21.md)。不要把每次启动失败都归为旧格式锁或Docker未就绪。

## 已确认的当前故障

用户运行 `npm run dev:persistent` 时被 `operation.lock` 拦住。只读核验原 `.local/persistent/main`：锁和 `running.json` 的PID均为378，启动记录为2026-10-20；原API端口63967、网页端口63968连接被拒绝；归属标签匹配该实例的PostgreSQL、Redis容器仍在运行；没有 `stopped.json`。

这只能证明网页/API目前不可用，**不能证明所有旧执行进程已经退出**。旧锁只有PID/时间，启动器只用`wx`创建和正常退出时删除，没有可靠的失效证明。异常结束或清理中断都可能留下锁，但本轮不能确证具体终止原因。没有查询进程列表、操作Terminal/Codex原生UI、读取密码/钥匙串/Cookie或停止现有容器，也没有删除真实锁。

原来的失败提示统一打印“Stopped owned processes”，即使重复启动根本没获得锁，容易被误认为旧栈已停止。本轮改为没有启动资源时明确显示“本次没有启动或停止业务进程/容器”。

## 原实例的最少安全恢复步骤

在原项目目录，使用本轮代码。默认真实`main`实例运行：

```sh
npm run dev:persistent -- --prepare-lock-recovery
```

必须看到“已记录本次 Mac 启动标识与原锁/实例配置摘要”。该步骤只生成私有的锁恢复凭证及本地编译的锁助手，不读取 `secret.json`，不执行数据库/平台预检，不删除锁、不启动或停止业务服务。记录系统启动UUID和锁/实例文件SHA256；不是设备绑定或平台授权。

然后保存其他工作，由用户正常重启Mac。Docker Desktop准备好后，在**同一个项目目录**运行：

```sh
npm run dev:persistent
```

恢复检查必须全部通过：系统启动UUID已改变、原锁和实例文件摘要仍匹配、原API/Web端口可绑定、没有新启动器持有系统锁。通过后在系统锁保护下原子替换旧`operation.lock`，继续读取原实例配置和原数据卷。此实例仍使用63967/63968，不重新创建管理员，不切换实例或离线库。

如果第一步提示“已有启动器持有系统锁”，请回原启动终端正常Ctrl+C退出，再按正常启动流程继续。若找不到终端或提示不符，保留错误并停下，不运行`rm operation.lock`、`kill`、`docker rm`或换实例规避。采用过`--instance`/`--offline`的其他实例必须保持相同参数；不可把本例真实main命令用于其他实例。重复准备会重新记录当前启动UUID，因此应在重启**前**执行；重启后直接用原启动命令。

本轮未替用户执行准备、重启或恢复真实锁；真实恢复仍待用户执行确认。要求系统重启是因为当前不允许通过进程检查确证旧进程退出，而旧格式锁没有其他可验证身份。

## 实现边界

- `native/macos/instance-lock.swift` 使用系统 `flock(LOCK_EX|LOCK_NB)` 持有 `.operation.guard` 的固定inode；该文件不删除。检查普通文件、当前用户、私有权限、单硬链接。锁由进程句柄持有，结束释放，不用PID探测、时间超时或HTTP失败判定失效。系统启动UUID直接读取 `kern.bootsessionuuid`，不读取进程列表。
- Node保留助手stdin，助手提前结束会要求启动器停止本次自有资源。编译只用已安装的 `/usr/bin/swiftc`，不安装软件或持续权限；编译产物原子替换。官方语义参考：[Apple flock(2)](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/flock.2.html)。
- 新操作锁带随机所有权token和启动UUID。正常退出只删除token匹配的锁；释放失败保留并报错。被替换的锁不会被旧持有者删除。
- 新锁跨OS重启可直接验证原持有进程已结束；同一次OS启动内的异常退出仍可能留下脱离的worker/MCP，所以即便内核锁已释放、端口关闭，也仍要求准备恢复凭证并重启。
- 旧格式锁通过用户显式准备的文件摘要和下一次OS启动证明恢复。准备不变更原锁；运行配置或锁被改动时拒绝。恢复原子替换，没有先删除再创建的无锁窗口；端口占用时不替换锁、不停止任何占用者。
- Windows继续既有独占文件锁行为，本轮没有新增或宣称验证Windows恢复；`--prepare-lock-recovery`只支持Mac。配置丢失、损坏、权限异常仍拒绝，不创建替代业务库。

## 验证证据

隔离工作目录：`/Users/kleene/Documents/Codex/2026-10-20/task-4/lock-recovery/validation`。

- `npm run test:persistent:lock`：12项通过。Mac原生助手实际编译/运行；活跃锁、准备被拒绝、旧PID/锁龄不足以恢复、同启动拒绝、摘要改变拒绝、端口占用拒绝、并发仅一个胜者、符号链接拒绝、token更换保护、仅测试自有进程强杀后的残留锁保护，以及无凭据的准备CLI验证。
- 跨启动恢复使用临时夹具中的不同启动UUID模拟；没有重启用户Mac，不能称真实系统重启恢复已验收。
- `npm run test:persistent`：12组完整离线检查、两次启动通过。活跃工作台重复启动拒绝、原管理员/业务/设备引用跨重启保留、销售/CSRF限制、虚构3篇只读、备份恢复及自有测试资源清理通过。证据目录：`/var/folders/q6/b2g8k11x23g_cf3ql0ky_v140000gn/T/crm-persistent-evidence-QtKL7L`。
- 变更JS入口语法检查通过；本轮没有修改React/API业务代码或数据库schema。原生测试首次受沙箱sysctl/端口限制失败，随后在获准的隔离测试环境重跑全部通过；没有重试被拒绝的进程列表或原生UI动作。

## 后续：锁恢复成功但启动失败

用户已执行系统重启并成功恢复旧锁；随后失败时本次锁也正常释放。新故障的只读证据指向Docker守护进程不可连接，见[后续诊断](PERSISTENT-STARTUP-DIAGNOSTICS-2026-10-20.md)。此状态不要重复本页的重启/准备流程，应先让Docker引擎就绪，再使用原启动命令。
