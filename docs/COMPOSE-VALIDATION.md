# Full Compose 隔离验收

日期：2026-10-18。独立项目名 `crm-compose-qa-20261018`，使用本项目 compose.yaml 的 full profile 加临时端口覆盖。四个镜像构建、整栈启动、故障恢复和资源清理均已完成。

## 隔离范围

- 临时 web 仅绑定 `127.0.0.1:5184`。
- 临时 PostgreSQL/Redis 取消全部宿主端口映射；API/worker 无宿主端口。
- 使用新建项目网络与 `crm-compose-qa-20261018_crm_pg`、`crm-compose-qa-20261018_crm_redis` 数据卷。
- 临时数据库密码随机生成，以 0600 文件保存在 /tmp；没有平台凭据或真实用户账号。
- 不复用开发库、开发数据卷或原服务的会话；5173、3100、55432、56379 保留给原开发预览。未访问 18060。
- Docker Desktop 已安装，本次未安装宿主系统软件。Dockerfile 中 openssl/libssl3 的安装只发生在容器镜像构建层。

## 本轮部署修复

- 增加 `/api/health/ready`，真正查询 PostgreSQL；数据库不可用时返回不泄露连接细节的 503。
- API 健康检查使用 ready 端点；web 等待 API 健康后启动，并检查自身 HTTP。
- worker 健康检查读取 BullMQ worker 注册情况，确认 worker 已连上 Redis；不是只检查 Redis 进程。
- npm ci 增加安装脚本/请求日志及请求超时，便于定位构建下载问题。
- 补充 2 项就绪探针 HTTP 测试（成功/数据库失败）。原 45 项测试仍保留，目前测试总数为 47 项，另有 2 项 worker 实际队列检查。

## 构建过程

首轮 BuildKit 获取基础镜像元数据超时。通过独立临时 Docker 配置匿名预拉取官方 Node/nginx 镜像后，元数据步骤成功；未修改用户原有 Docker 配置或凭据。构建依赖仅从官方 Debian 源与 npm 注册表获取。

基础镜像：
- node:24-bookworm-slim，digest `sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5`
- nginx:1.28-alpine，digest `sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236`
- postgres:17 和 redis:7-alpine 复用本机已缓存官方镜像，但使用全新容器/数据卷。

镜像/容器运行验收只证明本项目部署配置和 CRM 基础就绪；真实平台采集、agent 配对领取、评论、私信与内嵌聊天依然未实现并禁用。

## 实际命令与结果

所有 Compose 命令均使用独立项目参数 `-p crm-compose-qa-20261018`、本项目 `-f compose.yaml`、临时 override 和 `--profile full`，不复用开发库密码或数据卷。临时 override 如下：

```yaml
services:
  postgres:
    ports: !reset []
  redis:
    ports: !reset []
  api:
    environment:
      APP_ORIGIN: http://127.0.0.1:5184
  web:
    ports: !override ["127.0.0.1:5184:80"]
```

|命令/检查|真实结果|
|---|---|
|`compose … config --quiet`|退出码 0|
|`compose … build`|退出码 0；api、worker、migrate、web 四个镜像 Built|
|`compose … up -d --wait --wait-timeout 120`|退出码 0|
|`compose … ps -a`|postgres、redis、api、worker、web 均 healthy；migrate Exited (0)|
|`compose … logs migrate`|成功应用 202610180001_initial|
|`compose … exec -T api npm run db:seed`|写入 6 条虚构线索/来源评论及人工任务，未创建登录用户|
|容器内 Prisma 核验|已完成迁移 1、users=0、demoLeads=6、demoComments=6|
|容器内 BullMQ 核验|worker 注册存在；HEALTHCHECK 完成且 platformCallsEnabled=false；COMMENT 被协议拒绝，状态 failed|
|nginx 入口 HTTP|网页 200；JS/CSS 两项资源 200；代理数据库就绪接口 200|
|容器化权限边界|匿名 leads/tasks/events 均 401；缺少 Origin 的登录提交 403|
|agent 协议接口|enabled=false，platformCallsEnabled=false|
|镜像检查|API 运行 UID=1000；/app/.env 不存在|
|故障注入|仅停止临时 postgres 后，数据库就绪接口返回 503，message 为“数据库尚未就绪”，无连接细节|
|恢复检查|重新 up --wait 成功，五个服务 healthy；网页及就绪接口再次通过|
|`npm test`|21 API + 4 agent 全部通过|
|`npm run test:integration`|22 PostgreSQL/Nest HTTP 集成测试通过|
|`npm run test:worker`|2 项 Redis/BullMQ 检查通过|
|`npm run typecheck`|所有 workspace 退出码 0|

构建时 msgpackr-extract 可选原生加速包因精简镜像无编译工具而未安装；npm ci 成功回退，实际 BullMQ 完成/拒绝检查通过。web 构建阶段全 workspace 安装出现 Prisma OpenSSL 检测警告，但 web 最终镜像仅包含 nginx 和静态资源；实际 API/migration 镜像有 OpenSSL，迁移和数据库访问均通过。没有为消除这些非阻塞提示安装宿主编译工具。

## 清理与原环境复核

- `compose … down --volumes --rmi local` 退出码 0：本轮 6 个容器、2 个数据卷、1 个网络及 4 个项目镜像全部删除。
- 删除本轮新增 node:24-bookworm-slim、nginx:1.28-alpine 基础镜像标签，未使用强制删除。
- 按项目 label 查询容器、卷、网络和项目镜像均为空；5184 不再监听。
- 临时密码、Docker 匿名配置、override 和 smoke 脚本所在 /tmp 目录已删除。没有修改用户原有 Docker 配置或凭据。
- 保留 Docker 共享构建缓存，未执行全局 prune，避免影响其他项目缓存；不残留运行中的验收资源。
- 原 lead-workbench PostgreSQL/Redis 容器仍 healthy；5173 网页和 3100 API readiness 均返回 200。
- 原开发库只读核验：users=0、admins=0、sessions=0、demoLeads=6。原开发入口 5173/3100/55432/56379 均仍只监听 127.0.0.1。

本轮无剩余运行阻塞。长期运行、负载、HTTPS、备份恢复和真实平台能力仍不属于已验证范围。
