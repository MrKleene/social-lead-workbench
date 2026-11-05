# 隔离 Redis/BullMQ 采集队列验收（2026-10-19）

主目录 `/Users/kleene/projects/social-lead-workbench`，业务基线 `22c3ff116c25497f41f0d2a11b3784ce63c13843`。本轮没有业务代码修复，也没有重跑前两步的45项单元测试和42项PostgreSQL集成测试。

## 命令和结果

- `npm run typecheck -w @crm/api`：通过（含新增测试类型）。
- `npm run test:queue`：通过。根入口是 `scripts/test-queue-isolated.mjs`，必须从此入口运行以建立临时服务。
- 入口在全新临时 PostgreSQL 应用2个现有迁移，构建 contracts/API/worker，然后运行：
  - `npm run test:queue -w @crm/api -- --reporter=verbose`：11项通过、0失败。
  - `node scripts/test-worker.mjs`：2项健康队列检查通过。
- 日志和清理结果在 `.qa/step3-validation/`，被Git忽略。测试输出不持久化连接密码。

## 实际覆盖

1. 生产采集worker独立Node进程消费真实BullMQ任务，完成模拟基线；来源、楼中楼、规则依据入库，首次不提醒。
2. 相同请求键并发提交只生成一条业务运行、一条完成审计。
3. 完成后的运行以另一个BullMQ任务ID重复投递，业务记录、来源和审计不重复。
4. 新评论产生一条新线索和提醒，重复新增场景均为零。
5. 排队中手动暂停、停用配置后，worker仍可消费旧任务，但不能写入来源。
6. 业务模拟超时是数据库中的FAILED/TIMEOUT。该错误已被业务处理，所以BullMQ投递状态是completed，不能据此声称采集成功。
7. 队列attempts=1；无计划任务和延迟自动重试；立即手动重跑被退避拒绝。
8. 连续手动失败的退避依次为30/60/120/240/300/300秒，成功后重置。测试只推进临时数据库中的退避时间，不实际等待数分钟，也没有平台轮询。
9. 非法COMMENT任务进入BullMQ failed，只尝试一次，不创建业务运行。
10. 大批次仍在32次读取预算停止，业务状态为PARTIAL/BUDGET。
11. 运行中暂停使用另一个真实Redis队列和相同生产execute()，仅注入延迟的模拟读取以稳定控制时序；暂停后迟到的读取结果不入库。这一项使用进程内测试Worker，其余采集任务使用生产独立Worker进程。
12. 原健康worker完成HEALTHCHECK，拒绝平台任务（2项独立检查）。

## 隔离与清理

- 仅复用已安装的官方 `postgres:17` 与 `redis:7-alpine` 镜像，`--pull=never`。
- 每轮唯一容器名和队列名；随机宿主端口只绑定127.0.0.1，并拒绝5432、55432、6379、56379、18060。
- PostgreSQL与Redis均使用tmpfs，不挂载现有目录或持久卷；Redis关闭持久化。
- 不加载`.env`，不读取平台账号、cookies或tokens。临时数据库密码只存在于进程/临时容器环境，销毁容器后不保留。
- 虚构管理员fixture为禁用账号，密码摘要字段不可用于登录；未创建持久账号或凭据。
- 测试结束先退出worker并清空专用队列；启动脚本最后删除两个临时容器并检查它们已不存在。本轮结果为2/2删除成功，专用采集队列残留key为0。
- 不执行全局Redis FLUSH、不连接既有数据库、不操作18060。

## 本步未覆盖

浏览器闭环、真实平台、真实平台一分钟规模、Redis断网/重启恢复、数据库断网、worker非正常崩溃与stalled任务恢复，以及多worker压力测试。本步不把配置中的`maxStalledCount: 1`视为已经验证过的崩溃恢复能力。

新增测试相关文件及package脚本随最终模拟验收统一提交；最终浏览器结果见 ACCEPTANCE.md。
