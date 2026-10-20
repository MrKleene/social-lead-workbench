# Windows 执行适配：代码交付与待验收项

基线 `c26f97e`，需求 REQ-029/035，2026-10-20。本轮在 Mac 独立源码副本实现和验证，**没有 Windows 实机，也未编译运行 Windows 原生助手**。Windows 真实扫码/采集仍被浏览器依赖审阅门槛阻断；不能把本页或 DPAPI 分支单独当作跨平台整链已经可用。

## 目标运行方式

| 项目 | 本轮限定范围 |
| --- | --- |
| 系统 | Windows 11 客户端、原生 x64（build ≥22000）。不支持 Windows 10、Server、ARM64或其x64模拟、WSL内执行。 |
| 进程 | 当前普通交互式Windows用户运行官方原生Node.js 22+与npm；不以管理员提权、服务账号或计划任务运行。 |
| 业务依赖 | 已准备的Docker Desktop Linux容器环境，已存在官方 `postgres:17` / `redis:7-alpine` 镜像；本轮不安装Docker或改变其设置。 |
| 编译 | Windows自带.NET Framework 4.8的 `Framework64/v4.0.30319/csc.exe` 编译仓库C#助手；缺失时报错，不下载安装器或修改PowerShell策略。 |
| 文件系统 | 系统盘本地NTFS；项目位于当前用户私有目录，如 `%USERPROFILE%\source\social-lead-workbench`。凭据禁止UNC、共享/已知同步目录、重解析点、ADS及超过240字符路径。 |
| 浏览器 | 必须是经审阅的上游固定版本配套浏览器；当前审阅记录为pending，因此真实入口不放行。不能任意换成Chrome/Edge或自动下载绕过。 |

本轮未改动用户Mac上的63968实例、数据库、管理员、已有密钥或会话，没有真实设备批准与平台请求。

## 已实现的代码

`runtime/platform.cjs` 是启动器和API共用的平台边界，保留Mac ARM64/APFS行为：

- OS能力由执行程序判断；Windows原生助手进一步检查客户端系统和原生AMD64架构，不信任浏览器UA/IP。
- Windows默认目录由.NET `Environment.GetFolderPath(LocalApplicationData)` 获取，真实设备使用 `...\SocialLeadWorkbench\devices\<设备ID>\credential-roots\default`。新建目录设置当前用户和SYSTEM的私有DACL；已有目录只校验，不擅自修改ACL。文件验证所有者、硬链接及权限；路径拒绝重解析点、UNC/设备命名空间、ADS、穿越与非系统盘NTFS。
- 新真实设备私钥通过 `ProtectedData.Protect/Unprotect(..., CurrentUser)`，使用设备ID+keyID绑定附加熵。磁盘身份文件保存公钥、保护类型和DPAPI密文，明文只在受控进程内存/管道中短暂使用；不在argv或日志中传输。解密失败、原用户不可用或密文损坏时拒绝认证，不生成替代身份，不降级为明文。Windows拒绝v1真实明文私钥文件；旧Mac密钥和平台会话不迁移。
- 设备钥匙与平台Cookie分开；平台会话继续采用MCP兼容私有文件及账号隔离，没有新增应用层加密。DPAPI CurrentUser不是硬件不可迁移证明；域漫游、系统备份/账号恢复和完整系统管理员权限不在此应用的隔离保证内。
- Windows用Job Object管理持久栈及MCP/浏览器子孙进程，kill-on-close；MCP子进程先挂起创建、加入Job再恢复，避免先启动后附加的空窗。栈守护助手只允许绑定自己的父进程；是进程生命周期内的句柄，没有服务、计划任务或持续权限。普通停止保留卷；异常退出由Job回收进程，但遗留实例锁仍需人工核查，不能自动删除。
- npm通过 `node npm-cli.js` 启动，避免 `.cmd` shell插值；使用平台路径分隔符、`os.devNull`与必要Windows环境白名单。Go浏览器缓存变量被固定为OS已确认的LocalApplicationData。保留本机端口、单设备签名、每账号租约及最多3篇逐次确认。
- 页面显示DPAPI和“实机待验证/真实依赖未完成”，销售仍不能绑定、管理扫码、启动或停止采集；原CRM权限不变。

## 真实执行的具体阻塞

固定上游 `xpzouying/xiaohongshu-mcp` v2.5.5 / `a5c8f7799980ba1fdd501999843eb2d17e4c9a9f` 提供Windows x64 MCP。已从发布页核对其SHA256：

```text
cb55674f90c1649c875be9c4cde3af193b02fc34ffc860c40c8d711e6ca53e27
```

本轮只读取公开元信息/源码，没有下载安装或运行该exe。Windows预期位置是OS LocalApplicationData下 `SocialLeadWorkbench\tools\xiaohongshu-mcp-windows-amd64.exe`。

该版本源码的浏览器版本为 `148.0.7778.215`，使用 `%LOCALAPPDATA%\xiaohongshu-mcp\browser\148.0.7778.215` 缓存，缺失时会访问第三方CDN `cdn.one-world.ai` 的 `windows-x64.zip`。当前没有已审阅Windows浏览器包或完整文件哈希证据，**没有执行该包的下载、安装或授权**。

仓库 `runtime/windows-tools.json` 将这项审阅明确保持pending。真实Windows启动预检先验证固定MCP哈希，再要求已批准的浏览器归档摘要及全部文件哈希；缺失、篡改、额外文件或多个 `chrome.exe` 都拒绝。预检不联网、不自动回退、不提供用户请求参数绕过审阅。后续必须在来源获准后审查包内容、填入经核验的版本化文件清单并提交评审，才能开启真实运行；仅把state改为approved并不能通过完整性检查。MCP实际返回稳定平台ID、鉴权/QR/只读兼容仍待Windows实测。

## 本轮测试结果（均在Mac）

| 检查 | 结果与范围 |
| --- | --- |
| 全工作区类型检查/构建 | 通过；既有Vite大chunk和Mac文件钥匙串API弃用提示保留。Windows原生编译在Mac明确skip。 |
| `npm test` | 134项通过：API105、agent4、web25。Windows分支使用模拟系统保护器验证密文封装、重启签名、错误拒绝、零明文落盘；不等于调用过DPAPI。 |
| `npm run test:platform` | 8项通过：Windows版本/架构、路径边界、环境大小写、npm无shell参数、MCP路径与摘要、原生传输拒绝、源码静态约束、浏览器pending/篡改/多余文件拒绝。 |
| `npm run test:real:preflight` | 9项通过，虚构资源与临时端口，不启动平台。 |
| `npm run test:mcp` | 数据库/HTTP132、队列14、worker2通过，1项按模式跳过；销售/匿名/CSRF拒绝、账号隔离、并发/撤销/限流及CRM回归保留；2/2临时容器清理。 |
| `npm run test:device:vault` | Mac临时钥匙串回归通过，未读取默认钥匙串已有条目。 |
| `npm run test:persistent` | 12组检查、两次启动通过，保留同一虚构管理员/业务数据/设备身份；虚构3篇只读、重复新增0、撤销与自有资源清理。 |
| `test:xhs:entry:offline` | 13组桌面/390px/键盘状态通过；含Windows候选/DPAPI说明、销售隐藏、未支持系统禁用、绑定失败重试。零意外外部请求/写请求/页面错误。 |
| `npm run test:windows:native` | 在Mac明确SKIP，**不能记为Windows通过**。脚本已准备虚构DPAPI跨进程存取、篡改/熵不匹配、ACL与junction拒绝、Job子孙进程回收。 |

独立目录：`/Users/kleene/Documents/Codex/2026-10-20/task-4/windows/validation`。UI证据在 `/var/folders/q6/b2g8k11x23g_cf3ql0ky_v140000gn/T/crm-qr-entry-evidence-lZkGuz`；持久化最终证据在 `/var/folders/q6/b2g8k11x23g_cf3ql0ky_v140000gn/T/crm-persistent-evidence-eYOb1M`。截图仅为虚构夹具；不是Windows截图。

过程问题已修正：最初常规测试缺少端口权限，停止本任务的测试进程后在获准隔离环境重跑；调整共享模块的测试导入及持久化脚本的旧状态断言。没有操作用户运行栈，也没有绕过源码/权限拒绝。

## Windows可重复验收流程

在一台获准的独立Windows11 x64测试机、普通用户、系统盘私有目录中执行；不要复制Mac的 `.local`、Cookie、密钥、数据库卷或 `node_modules`。

1. 从已推送源码检出，准备官方Node/npm、Docker及镜像。用锁文件安装项目依赖（`npm ci`）、`npm run db:generate`，然后 `npm run typecheck`、`npm run build`。确认C#原生编译成功；若编译器/系统保护阻止，记录原始非秘密错误并停下，不关闭系统保护。
2. 运行 `npm run test:platform` 和 `npm run test:windows:native`。后者只建立随机 `crm-windows-test-*` 目录、虚构秘密及测试进程，并清理自己的资源；会暂时改变其自有unsafe夹具目录ACL来验证拒绝，不修改已有系统/用户目录。必须是PASS而非SKIP。单独验收不同OS用户不能解密同一个虚构密文，以及守护父进程被强制结束后无子孙残留；这些跨用户/异常终止项目本轮未执行。
3. 准备已安装的Playwright测试运行库及浏览器，通过 `PLAYWRIGHT_MODULE` / `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指定Windows路径。运行 `npm run test:persistent` 验证虚构界面、权限、两次启动、备份恢复与资源清理。脚本Windows测试退出通过仅测试实例可用的IPC请求正常关闭，避免用Windows强制kill伪装正常重启。另在终端用Ctrl+C验证人工正常停止。
4. Windows GUI实测：管理员一键绑定（离线环境明确是虚构身份）、重复点击、刷新/重启、窄屏键盘；销售直接HTTP调用绑定、扫码及启动/停止采集应403；确认已有客户操作正常。分别记录路径中空格/中文、junction、非NTFS/共享路径拒绝。
5. 浏览器依赖来源审阅完成前，`npm run dev:persistent` 的Windows真实预检应失败；这是预期阻断，不能删校验或修改state假装成功。
6. 审阅和Windows原生回归完成后，再由用户启动同一真实实例、手动点击绑定，记录DPAPI保护与重启签名结果；本人扫码并核验稳定ID，再逐次确认最多3篇只读。测试限制停止、取消、同账号互斥、零命中、重复去重、会话重启恢复。评论/私信与持续采集始终禁用。

Windows原生编译、DPAPI/ACL实际行为、Job/浏览器取消、数据库持久启动、跨用户拒绝、真实平台兼容全部需要上述实机证据。本轮不做“Windows已可投入使用”的结论。Mac用户无需为此次源码交付中断63968；如安排升级，仍在原项目/原实例正常重启，不重建管理员或卷。

## 核验来源

- [Microsoft ProtectedData / CurrentUser](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.protecteddata?view=netframework-4.8)：OS提供DPAPI，依赖当前用户配置文件；不是自制加密算法。
- [Microsoft SpecialFolder](https://learn.microsoft.com/en-us/dotnet/api/system.environment.specialfolder?view=netframework-4.8)：LocalApplicationData为当前非漫游用户的应用数据目录。
- [Microsoft Directory.CreateDirectory](https://learn.microsoft.com/en-us/dotnet/api/system.io.directory.createdirectory?view=netframework-4.8)：带DirectorySecurity的目录创建。
- [Microsoft Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)、[CreateProcessW](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessw)：Job子进程管理和挂起创建。
- [Node child_process](https://nodejs.org/api/child_process.html)：Windows `.cmd` 与进程信号区别，不能照搬Unix进程组。
- [MCP v2.5.5资产及SHA256](https://github.com/xpzouying/xiaohongshu-mcp/releases/expanded_assets/v2.5.5)、[固定版本浏览器源码](https://raw.githubusercontent.com/xpzouying/xiaohongshu-mcp/a5c8f7799980ba1fdd501999843eb2d17e4c9a9f/browser/browser_download.go)：核对架构、路径、来源及自动下载行为；不构成对第三方浏览器包的审阅批准。
