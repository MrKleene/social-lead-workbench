# 工作台视觉改版验收 · 2026-10-19

项目：`/Users/kleene/Documents/Codex/2026-10-18/task-2`。
本地预览：<http://127.0.0.1:5173/leads>。已有开发服务运行中；重新启动使用项目根目录的 `npm run dev`，数据库服务启动方式见 README。

## 设计依据与实现范围

实际浏览“小齐UI设计师”抖音作品后，依据用户代选授权采用：

- [2026-10-16 企业后台](https://www.douyin.com/note/7697222770103188598)：浅灰蓝底、白色卡片、细边框、柔和阴影与低饱和重点色。
- [2026-10-06 工作台](https://www.douyin.com/note/7693512191818871652)：任务、列表、摘要清晰分区。

作品是图文参考，不能证明作者设计的真实交互动效。本次动画由项目自身实现。没有下载抖音原图或复制原图装饰。

已完成：

1. 浅色轻量侧栏、统一蓝紫重点色、柔和渐变摘要、登录页与平台卡片样式。
2. 线索首页的紧凑概览、实际授权数据驱动的待跟进任务摘要、同一行状态分段筛选/搜索/平台筛选和一键重置。
3. 详情抽屉的身份标题、负责人/下次跟进摘要，以及“需求与分配 / 跟进记录 / 人工任务”分区。切换分区保留草稿；没有销售用户时明确提示，避免伪造可分配用户。
4. 任务中心按待处理、已完成、已暂停、全部筛选，显示各分类数量和保存反馈。
5. 抽屉进入 360ms、退出 240ms、分段选中指示 280ms、内容分区渐入、按钮点击/悬停、保存反馈。行本身无入场动画，打开详情不重挂整个线索页，搜索与筛选保留。
6. `prefers-reduced-motion` 下关闭动画、过渡及按钮/指标位移；关闭抽屉走零延迟兜底。

保持原有服务端权限、会话安全、接口和数据库结构，没有改动真实平台操作、18060 服务、用户凭据或浏览器登录状态。没有增加项目依赖、系统软件或公网部署。

原目录不是 Git 仓库；修改前已将前端源码备份至 `/tmp/crm-ui-before-20261019/src`，未覆盖其他用户文件。

## 命令结果

| 命令 | 实际结果 |
|---|---|
| `npm run typecheck` | contracts / API / web / worker / agent 全部通过 |
| `npm run build` | 全工作区构建通过 |
| `npm test` | API 21 项、agent 4 项通过 |
| `npm run test:integration` | 真实 PostgreSQL 隔离库 crm_test，22 项通过；包括权限、转交、并发版本与去重 |
| `npm run typecheck -w @crm/web` | 最后文字和样式微调后再次通过 |
| `npm run build -w @crm/web` | 最后微调后再次通过；JS 412.57 kB / gzip 130.06 kB，CSS 56.35 kB / gzip 12.69 kB |

共 47 项回归通过。最初默认沙箱拒绝 HTTP 测试的 `127.0.0.1` 临时监听（EPERM），经工具批准后在允许本机监听的执行环境重跑全部通过；不是应用断言失败。隔离测试未清空开发库。

## 浏览器验收

使用 Chrome 实际运行的本地页面与 6 条明确虚构的种子。沿用现有管理员会话，没有退出或创建新登录凭据。

| 检查 | 结果与证据 |
|---|---|
| 桌面布局 | 默认 1920px 与 1440×1000 实测，无横向溢出；6 条线索正常呈现 |
| 1000×800 窄窗 | document.scrollWidth=985，viewport=1000，无页面横向溢出 |
| 390×844 线索与任务 | document.scrollWidth=375，viewport=390；表格自身 scrollWidth=833，可横向滚动 |
| 390×844 详情 | 抽屉宽 390，文档宽 390；双字段改为单列，表单列宽 305 |
| 搜索、平台、状态组合筛选 | 搜索演示用户01得到1条；抖音+跟进中得到空结果；重置后恢复6条 |
| 搜索后打开/关闭详情 | 搜索内容保持，关闭后焦点返回“演示用户01”按钮 |
| 详情分区 | 三个分区可切换；输入虚构草稿后切换再返回，草稿保留；草稿未保存 |
| 退出动画 | 关闭瞬间实际读取 data-state=closed、animationName=drawer-out；结束后对话框移除 |
| 进入/列表动画 | 抽屉实际 animationName=drawer-in；列表行 animationName=none |
| 任务保存与恢复 | 演示用户06的既有虚构任务从待处理→完成，显示“任务状态已更新”，分类数量6/0→5/1；随后重新打开恢复6条待处理、0条已完成，保留正常审计记录 |
| 侧栏 | 收起/展开通过 |
| 登录页面 | 在 localhost 主机单独查看未登录界面，避免影响127.0.0.1的原会话；空提交聚焦email，email/password均invalid。没有提交真实凭据。正式使用仍必须用127.0.0.1入口以匹配CSRF Origin |
| 平台能力 | 六个自动评论/私信/内嵌聊天“未验证”按钮仍禁用；没有进行平台操作 |
| 工作台控制台 | 验收标签页 error/warn 日志为空 |

临时 viewport 覆盖已 reset。最终本地预览标签页保留。

## 边界与待办

- 开发库当前没有销售账号，所以浏览器验证了“无销售可分配”提示和禁用状态；实际分配/转交及越权拒绝由本轮22项PostgreSQL集成测试覆盖。未擅自创建销售账号。
- 本轮没有重新登录/退出用户现有账号；真实登录、CSRF、限速和会话相关逻辑由既有回归测试覆盖。
- reduced-motion 经过源码核对，未修改用户系统设置，也未声称在浏览器中模拟该媒体偏好完成实测。
- 浏览器临时连接中断已通过新验收标签页恢复，不影响最终检查。
- 本次为视觉和交互改版，真实采集、评论、私信及完整获客流程仍未实现。

## 实际截图

- [桌面工作台](screenshots/ui-refresh/desktop.jpg)
- [需求与分配抽屉](screenshots/ui-refresh/detail-overview.jpg)
- [跟进抽屉与草稿](screenshots/ui-refresh/detail-followup.jpg)
- [任务保存成功](screenshots/ui-refresh/task-saved.jpg)
- [任务列表](screenshots/ui-refresh/tasks.jpg)
- [平台能力](screenshots/ui-refresh/platforms.jpg)
- [1000px窄窗](screenshots/ui-refresh/narrow.jpg)
- [手机线索](screenshots/ui-refresh/mobile-leads.jpg)
- [手机任务](screenshots/ui-refresh/mobile-tasks.jpg)
- [手机抽屉](screenshots/ui-refresh/mobile-detail.jpg)
- [登录页](screenshots/ui-refresh/login.jpg)
- [手机登录页](screenshots/ui-refresh/mobile-login.jpg)

桌面截图已存入 Library：`library_file_id=libfile_21beb2e716848191a01961f81860fcc4`，`file_id=file_000000000f1c8243b454f88fce4392c0`；本地文件身份元数据已写入。截图仅含虚构种子与通用管理员显示名，不含密码、token或真实客户数据。
