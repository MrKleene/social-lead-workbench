# 第一里程碑验收记录

日期：2026-10-18。本机 macOS / Node.js 24.20.0 / PostgreSQL 17 / Redis 7。项目绝对路径 `/Users/kleene/Documents/Codex/2026-10-18/task-2`。

## 最终命令结果

|命令|真实结果|
|---|---|
|`npm run db:generate`|Prisma Client 6.19.0 生成成功|
|`npm run db:migrate`|202610180001_initial 成功应用到开发数据库 crm|
|`npm run db:seed`|6 条明确虚构线索、来源帖子评论及人工任务写入成功，无登录用户|
|`npm run build`|contracts、API、web、worker、agent 全部退出码 0；web JS 406.59 kB / gzip 128.39 kB|
|`npm run typecheck`|全部 workspace 类型检查退出码 0，包括 API 测试源码|
|`npm test`|21 项 API 单元/HTTP 测试 + 4 项 agent 协议测试全部通过，Vitest 5.0.5|
|`npm run test:integration`|22 项真实 PostgreSQL + Nest HTTP 集成测试全部通过；独立 crm_test，测试后清空测试记录|
|`npm run test:worker`|2 项真实 Redis/BullMQ 检查通过：健康任务完成，COMMENT 类型拒绝|
|`npm run agent:check`|SKIPPED / PLATFORM_CALLS_DISABLED，未进行任何网络请求|
|`npm audit`（依赖修复后安装审计）|0 vulnerabilities|
|`docker compose --profile full config --quiet`|退出码 0|
|`docker compose ps`|postgres 与 redis 均 healthy，仅回环端口 55432 / 56379|

最新合计 47 项测试 + 2 项 worker 集成检查通过。不是 mock 数据库替代：权限、事务、唯一约束和并发用例使用真实 PostgreSQL。另已完成 full profile 四个镜像实际构建与完整容器栈验收，见 [Compose 验收记录](COMPOSE-VALIDATION.md)。

### 核心覆盖

匿名访问和伪造 cookie；管理员全量与销售 owner 范围；IDOR 详情/跟进/分配/任务；用户目录和审计角色限制；Origin/CSRF；严格字段/日期校验；跟进/下次时间/审计事务；陈旧版本拒绝；人工确认不标为联系同意；有效销售目标校验；转交后旧销售不能访问及写入；新销售任务操作；并发分配仅一个版本获胜；重复/并发来源幂等；跨平台同名同字符串 ID 不合并；冲突原文保持；数据库直接写入唯一约束；受限账号只暂停；注销/过期/禁用用户；账号登录限速。

### 曾发现并修复

- 沙箱 localhost listen EPERM：在获准的本机执行环境重跑 HTTP 测试，通过；不是应用故障。
- 种子脚本装饰器编译配置缺失：显式使用 API tsconfig，种子成功。
- 测试参数 `unknown` 与 supertest 类型冲突：改为 object。
- 升级安全版本 Vitest 后 `describe.sequential` API 与 dist 测试发现问题：采用默认顺序测试、只扫描源测试文件，重新通过。
- 浏览器 datetime-local 填写后重渲染丢失值：使用原生日期控件 ref 读取提交值，验证 UI/数据库一致；保存后显示 `10/20 10:30`。
- 详情查询失去权限后不再渲染陈旧缓存；401 会清理当前会话界面，所有写入仍由后端检查。
- 批量格式化时出现临时 HMR 上下文失配；完整重载后最终验收时段控制台无新增 error/warn，生产构建通过。

## 浏览器交互与视觉验证

使用 Codex 新建的 IAB 标签页，通过 cua_repl 官方接口操作，没有打开或更改旧平台浏览器会话。URL `http://127.0.0.1:5173`，标题“线索工作台”。

|检查|结果|
|---|---|
|页面身份 / 非空 / 无框架错误覆盖|通过|
|登录→6 条管理员线索|通过|
|搜索“对接”→仅演示用户02|通过|
|详情→负责人选择演示销售甲→分配|通过|
|原文→人工核验说明→保存|通过|
|跟进内容→下次时间→保存→时间线|通过，修复后日期正确保存|
|创建人工任务→任务中心→完成|通过，任务显示已完成|
|销售甲登录|只显示分配的 1 条线索|
|平台能力|6 个未验证能力按钮禁用，真实连接未启用|
|侧栏收起/展开、退出登录|通过|
|1536×1024 / 1440×960 桌面|检查完成，保留整页截图|
|1000×800 窄窗|页面无水平溢出；表格区域可横向滚动|
|390×844 小屏|document.scrollWidth = viewport = 390；侧栏图标化，表格区域可横向滚动|
|减少动态效果|CSS prefers-reduced-motion 关闭 animation/transition；未改变用户系统偏好|
|最终控制台|从最终重载开始的检查时段无新增 error/warn|

所有交互使用临时虚构 QA 账号。验收后已退出，删除 3 个 QA 用户、会话、QA 跟进/任务与本地凭据文件，恢复 6 条干净虚构种子。清理核验：`remainingQaUsers=0, adminCount=0, demoLeads=6`。用户必须通过 `npm run admin:init` 建立自己的管理员。

## 视觉对照

最终参考为内置 Image Gen 生成的 `generated_images/exec-bb99e255-6a78-4a7d-8ea3-79c5c5bac8f5.png`；初版参考也保留在 generated_images。生成简报：中文 CRM、深墨侧栏、青绿重点色、浅色内容区、六行虚构线索表、三项指标、显式未接入提示、代码原生控件、无装饰图片。

用 view_image 检查了最终参考与实际 desktop/detail/narrow/mobile 截图。核对点：

1. 深墨侧栏、三项导航、选中态和品牌位置一致；增加可折叠操作。
2. 标题/副标题/演示提示层级一致；保留真实数据标签和明确未连接文案。
3. 三项指标卡、线性图标、浅边框与留白一致；数值使用真实授权返回集合，而非参考图固定数值。
4. 表格保留六列业务信息与详情操作，昵称/需求摘要双层展示；用文字平台标签，不伪造平台连接图标。
5. 青绿/浅琥珀状态、圆角、细边框、浅阴影统一；详情抽屉与登录沿用相同字体/配色。
6. 窄窗采用表格区域横向滚动，避免把列压缩到无法阅读；键盘可聚焦滚动区域。
7. 页面、行、侧栏、详情与按钮反馈有短动画，reduced-motion 时停用。

有意差异：参考图的演示状态/日期/负责人替换为真实虚构数据库状态；补充当前用户角色、退出、表格数量/上限、详情操作、CRM 页码。以上由功能/安全要求驱动。主标题、副标题和“专业相关不等于联系同意”提示与批准需求一致，无新增获客完成宣称。视觉已按最终参考风格核对，不宣称像素级复制。

## 交付证据

- [桌面工作台](screenshots/desktop.png)
- [跟进详情与日期](screenshots/detail.png)
- [平台能力禁用](screenshots/platforms.png)
- [较窄窗口](screenshots/narrow.png)
- [小屏](screenshots/mobile.png)
- [最终登录页](screenshots/login.png)

## 未完成或未验证

- 尚未进行多浏览器、负载、长期运行、HTTPS、公网部署、备份恢复验证。
- Agent 领取/配对、真实采集、增量轮询、评论、私信和内嵌聊天未实现，明确禁用。整体获客需求尚未完成。
- 旧 MCP 只保留背景描述；未调用 18060、未动凭据/会话/旧项目。没有安装系统软件或授予新的系统权限。

## 交付复核补充

2026-10-18 首次交付复核时，`npm test` 为 19 + 4 = 23 项通过；`npm run test:integration` 为 22 项通过；当时合计 45 项。后续 Compose 验收增加 2 项数据库就绪 HTTP 测试，最终重新运行得到 21 + 4 + 22 = 47 项全部通过，类型检查全部通过。`npm run test:worker` 的两项独立队列检查再次通过。已强化第二项断言：必须包含 HEALTHCHECK 校验错误且任务实际状态为 failed，不能将超时误当作拒绝。依赖审计为 0 vulnerabilities。

只读运行时核验：

|宿主入口|实际监听|
|---|---|
|Vite 网页|127.0.0.1:5173|
|Nest API|127.0.0.1:3100|
|PostgreSQL 容器映射|127.0.0.1:55432|
|Redis 容器映射|127.0.0.1:56379|

Docker 客户端与引擎均为 29.7.2；Docker.app 本来已安装，本轮仅启动。PostgreSQL 使用本机原有官方 postgres:17 镜像，新建独立项目容器，实际数据库版本 17.11。Redis 下载官方 redis:7-alpine 镜像并新建独立容器，实际版本 7.4.11。两者均 healthy。未安装宿主系统软件，没有 Homebrew/apt 宿主安装、没有安装 Docker Desktop、没有授予新的系统权限。后续 full 构建已成功执行；openssl/libssl3 仅安装在容器构建层，未安装到宿主。

上述 loopback 结论仅覆盖本项目四个宿主监听入口；容器内部服务在独立 Docker 网络内监听，与公网宿主暴露不同。worker 和 agent 不提供监听端口。本次没有扫描或改动其他项目服务。

安全初始化：非 TTY 执行 `npm run admin:init </dev/null` 按预期退出码 1，提示必须在本机交互终端运行，未创建用户。用户需自行在终端输入邮箱、名称、掩码密码（12–256 字符）、重复密码及确认；不接受通过命令行或环境变量传入管理员密码，不把密码发到聊天。复核开发库 `users=0, admins=0, sessions=0, demoLeads=6`。

桌面虚构数据截图已上传 Library，原文件身份扩展属性写入成功：`library_file_id=libfile_bf5040b769348191a8352de6e5359559`，Library 路径 `/desktop.png`。未上传真实个人数据或凭据。
