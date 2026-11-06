# Windows 桌面构建与验收

当前 Mac 可完成的检查：Windows x64 MCP 交叉编译、平台无关 Go 协议测试、PE32+ x64 文件头、固定浏览器压缩包/76 个文件、428 个 MCP 构建源文件哈希、资源清单及 JavaScript 生命周期失败路径。它们不证明 Windows ACL、DPAPI、Job Object 或安装器工作正常。

## 最小环境

- 原生 Windows 11 x64（build 22000+、Client），Intel/AMD 机器或 x64 虚拟机。Windows ARM64 的 x64 模拟、WSL、Windows Server 不在当前实现的支持范围。
- 独立标准测试用户，系统盘为 NTFS；本地用户目录和 LocalAppData 可写。当前路径校验不接受网络盘、重解析点、云同步目录或超过 240 字符的路径。
- 构建机：Node 24、项目锁定的 npm 依赖与对应 Windows Electron、Go 1.24.13 Windows amd64、现有 Go 模块缓存、系统 .NET Framework 4.x 的 `Framework64/v4.0.30319/csc.exe`。
- 固定 Windows 浏览器 ZIP：`apps/desktop/src/windows-browser-source.json` 记录版本、来源及 SHA256。构建脚本仅接受匹配文件，不会自动改为系统浏览器。
- 干净安装测试环境：没有 Node、Go、Docker、PostgreSQL、Redis；这些构建工具不应成为最终用户的安装条件。无需小红书账号或模型 Key 即可执行离线验收。

## 构建入口

在已准备好依赖的隔离工作副本，用 Windows PowerShell 执行以下脚本，并将三个参数改成现存绝对路径：

```powershell
.\scripts\desktop\windows-preview.ps1 `
  -Go 'C:\Users\tester\build-tools\go\bin\go.exe' `
  -ModuleCache 'C:\Users\tester\go\pkg\mod' `
  -BrowserArchive 'C:\Users\tester\build-inputs\windows-x64.zip'
```

脚本先做原生验证，再打包 NSIS，最后核验资源、安全开关、包内离线自检与安装包哈希。任一步失败不产生成功的产物清单。不要手工创建或复制其他主机的 `windows-validation.json` 来绕过门槛。

## 必须在 Windows 验证的项目

| 项目 | 具体测试 | 通过标准 |
| --- | --- | --- |
| 私有目录和文件 | 标准用户新建数据目录；给独立测试子目录增加 Everyone 读取权限；测试 junction、符号链接及硬链接 | 正常私有数据可读写；额外用户访问或链接被拒绝，不修改已有目录 ACL |
| 系统凭据 | 合成值 DPAPI/safeStorage 保存、进程重启读取、篡改及第二测试用户读取 | 同一用户正确解密，磁盘无明文；篡改或其他用户不能解密；不测试真实 Key/Cookie |
| 进程生命周期 | 自然退出、主动停止、主进程强制退出、子/孙进程；停止后的回执交接 | 整棵受管进程树结束后才确认停止、保存回执并清理临时会话；停止不明确保留暂停 |
| 内置浏览器与 MCP | 离线合成 HTML、截图、许可证导出；禁止外部域名访问 | 包内浏览器启动并渲染，受管进程能退出；无需下载运行时 |
| 应用安全边界 | 包内自检、IPC 来源/固定方法、ASAR 完整性和 Electron fuses | 未知方法或不可信页面无权调用；无业务数据/凭据夹入安装包 |
| 干净安装 | 标准用户安装，初始化、多条关键词、备份、退出重启 | 不要求另装 Node、Docker 或数据库；数据位于当前用户 LocalAppData |
| 升级与崩溃 | 合成 v9 数据升级 v10；中断/UNKNOWN 记录；升级前备份 | 原数据有可恢复副本；不复发 UNKNOWN；既有授权失效规则继续生效 |
| 卸载与重装 | 先创建合成库与凭据，再卸载/重装 | 用户数据不被静默删除；重新打开仍能区分历史与新授权，不自动重试已提交请求 |
| 签名与分发 | Authenticode、SmartScreen、安装路径及杀毒软件记录 | 实际记录状态；未签名不能标记为正式分发验收通过 |

自动脚本覆盖其中一部分，跨用户、干净机器安装、升级/卸载、签名和安全软件行为仍需逐项留下证据。真实登录、采集、收件、发送与付费模型属于另一轮明确授权的平台验收，不纳入离线成功结论。
