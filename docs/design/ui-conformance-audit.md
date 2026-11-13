# UI 一致性审计（2026-11-11）

> **本文件是审计记录，不是规范。**
> 规范只有一份：`apps/web/DESIGN.md`；执行约束：`AGENTS.md`。
> 本文件记录「代码实际长什么样 vs 规范要求什么」以及修复过程，不得被当作样式依据。

审计范围：`apps/web/src` 全部源码。
审计起点时 `npm run ui:check` = 0 error / 0 warning、`npm run design:lint` = 0 error，
**下面列的问题全是机器检查抓不到的**——见最后一节。

---

## 变更记录

### 第 ① 步：补表单基元 + 替换 80 个原生控件

新增 `components/ui/native-select.tsx`、`checkbox.tsx`、`textarea.tsx`（复用已装的 `radix-ui`
统一包，**没有新增依赖**），把 21 个文件里的 **39 个 `<select>` / 21 个 `<input type="checkbox">`
/ 17 个原生 `<input>` / 3 个 `<textarea>`** 全部换掉。

- 下拉用 `NativeSelect`（样式化原生 `<select>`），不是 Radix `Select`。取舍写进 `DESIGN.md` §4「表单控件」：
  这些下拉是 2–10 项的表单筛选器，需要 `required` 校验、`<label>` 包裹关联、`value=""` 表示「全部」，
  Radix `Select` 渲染成 `button` 后这三条都要补偿。
- 删除 6 条原生控件兜底 CSS。这些 CSS 没有 `@layer`，优先级高于 Tailwind，留着会盖掉新组件。

### 第 ⑥ 步开工：页面骨架 + 2 个样板页 + 棘轮

结论先说：**不 fork shadcn-admin**。外壳（sidebar / nav / 错误页 / provider）已经是它原样 vendored 的，
再 fork 一次换不来上游同步（它是模板不是库），却要背它的 demo 代码和一套 mock CRUD 页面。
真正缺的不是底座，是**统一的页面骨架**——证据：3 套分页实现、2 套卡片容器、2 套空态。

新增 `src/components/patterns/`（9 个骨架组件）：

| 组件 | 替代 |
|---|---|
| `PageHeader` | 手写 `<h1>` / `.page-heading` |
| `SectionCard` | `.local-panel` / `.configuration-detail` / `.model-configuration-content` |
| `FilterBar` + `FilterField` | `.local-filterbar` |
| `RecordList` + `RecordItem` | `.local-config-list` / `.local-messages` |
| `Pagination` | `Pages` / `LocalPagination` / inbox 内联 `<nav>`（3 套合一） |
| `EmptyState` | `.local-empty`（CSS 里不存在）+ 裸 `<p>` |
| `FormField` | `.local-editor label` |
| `CheckboxField` | `.local-check`（20 处授权块 + 筛选勾选） |
| `DetailSheet` + `DetailList` | 5 处手写 `<Sheet>` + 抽屉宽度覆盖 |

**棘轮机制**：`ui:check` 新增 `legacy-class` 规则，白名单在 `scripts/check-ui-conventions.mjs`
的 `LEGACY_CLASS_ALLOWED`。白名单外出现 `local-*` / `configuration-*` / `journey-*` / `graphite-*` /
`reply-history-*` 即判 error。已用探针文件验证会拦截。

### 第 ⑥ 步完成：21 个文件全部迁移，遗留方言清零

| 指标 | 迁移前 | 迁移后 |
|---|---|---|
| 遗留类名（`local-*` 等） | 23 个文件 / 169 处 | **0 处** |
| 全局样式表 | 6 个 | **2 个**（`index.css` + `theme.css`） |
| `ui:check` 批准例外 | 5 条 | **1 条** |
| 手写 CSS 总行数 | 464 行 | **0 行** |

删除的样式表：`styles/workbench.css`、`styles/desktop-bridge.css`、
`features/local-workbench/local-workbench.css`、`features/local-workbench/local-shell.css`、
`features/auto-contact/graphite-reply-history.css`、`features/work/journey-stepper.css`、
`components/configuration-browser.css`、`features/configuration/configuration.css`。
`SidebarInset` 上的 `graphite-workspace` / `local-desktop` 作用域类一并移除。

**顺带修掉的真实缺陷**（都不是迁移引入的）：

| 缺陷 | 处理 |
|---|---|
| 配置分类导航在 `<767px` 被 `display:none` 且没有替代入口 → 移动端进不去别的配置类型 | 改成窄屏横向滚动条，宽屏竖排 |
| `data-tone` 空转 → 成功/未知/失败三种结果渲染成同一个灰药丸 | 给 `Badge` 加 `success` / `warning` 变体，改用 `variant` |
| `Alert` 没有 warning 变体，未知结果只能靠 CSS 类改色 | 加 `variant="warning"` |
| 表格单元格缺 `overflow-wrap`，24 位平台 ID 溢出到相邻列 | `TableCell` 基元加 `break-words` |
| `TableHead` / `TableCell` 的 40px 表头与 12/16px 内边距散落在 feature CSS | 收进 `table.tsx` 基元（`DESIGN.md` §4 的统一要求） |
| `Card` 带 `shadow-sm` 且 `gap-6`，与 §6「阴影仅浮层」/ §5「标题到内容 16px」冲突 | 改成无阴影 + `gap-4` |

**测试改动 2 处**（UI 语义变化导致，非放宽断言）：
`共 0 条 · 第 1 / 1 页` → 空状态文案（分页单页时不再渲染）；
`page.locator('.local-archive')` → `getByRole('region',{name:'旧业务档案'})`（类名没了，改用区域语义）。

### 内容区顶栏照搬 shadcn-admin

第一版凭一张裁剪图猜，做错了四处。后来用 Electron 直接打开 `localhost:5173` 抓真实 DOM
（`header` 的 class、内层结构、每个按钮的计算样式）才看清：

| 我第一版做的 | 真实 shadcn-admin |
|---|---|
| `h-14` + `border-b` 的独立横条 | `h-16 shadow-none`，**没有下边框**，与侧栏顶部同高，连成一条横带 |
| 顶栏里放当前页面标题 | 顶栏**没有标题**，页面标题在内容区的 `PageHeader` |
| tab 做成 `rounded-md px-3 py-1.5 hover:bg-accent` 的按钮 | `<a class="text-sm font-medium transition-colors hover:text-primary">`，**纯文字**，间距靠 `space-x-4 xl:space-x-6`，激活态只是默认前景色 |
| 折叠按钮用 ghost 图标 | `size-7 border bg-background shadow-xs` 的**带边框方钮** |

补齐的右侧工具区（对齐真实 DOM 的类名与尺寸）：

- 搜索胶囊 `h-8 rounded-md bg-muted/25 text-sm font-normal text-muted-foreground`，
  左侧放大镜、右侧 `⌘K` 键帽（`h-5 rounded border bg-muted px-1.5 font-mono`）。
- 主题钮 `size-9 rounded-full`，太阳/月亮两个图标叠放互相缩放（不是只显示一个）。
- 设置钮 `size-9 rounded-full`。
- 头像 `h-8 w-8 rounded-full` + `bg-muted` 首字母兜底。

**搜索做成了真的**：⌘K 打开命令面板，按标题或分组名匹配，方向键 + 回车跳转。
本项目没有全局搜索后端，所以只做页面导航——不做一个按下去没结果的假输入框。
面板用 `radix-ui` 的 Dialog 现搭，没有引入 `cmdk`。

**`ThemeProvider` 之前是死代码**：支持 light/dark/system 并存 localStorage，但全站没有入口。
这次补上，深色模式首次可用。

**左侧侧栏仍然是主导航**（13 项 4 组全在侧栏），顶栏 tab 只是分组级快捷入口——
与 shadcn-admin 一致：它的 tab 是页面级、侧栏是分组级，两者并存。

### 下拉换成 Radix `Select`：`NativeSelect` 是一条死路（2026-11-12）

上一节我判定「下拉已经走 shadcn」，理由是触发器的高度/圆角/边框/自绘 chevron 都和 `Input` 对齐。
**这个判断是错的**——我只看了关闭状态。

用户贴了两张对比图：shadcn 的下拉打开后是白底圆角浮层 + 阴影 + 选中项浅灰底 + 右侧对勾；
我们的是 **macOS 系统菜单**：灰底、蓝色高亮、系统字体、无圆角。

根因：**原生 `<select>` 的弹出层由操作系统绘制，CSS 完全控制不了**。
`appearance-none` 只能去掉触发器的系统箭头，改不了弹出层。所以 `NativeSelect` 这条路，
无论怎么调样式，打开后都不可能是 shadcn 的外观。

处理：从 shadcn-admin 拷入 `components/ui/select.tsx`（Radix `Select`），把 **39 处**全部换掉，
删除 `components/ui/native-select.tsx`。

触发器按本项目约束改了四处（其余保持上游原样）：

| 上游 | 本项目 | 原因 |
|---|---|---|
| `w-fit` | `w-full` | 表单控件要和 `Input` 同宽 |
| `bg-transparent` | `bg-card` | `--input` 与 `--border` 同值，透明底在 `--muted` 面板里没有边界 |
| `shadow-xs` | 去掉 | `DESIGN.md` §6：阴影只给浮层 |
| `px-3` | `ps-3 pe-9` | 右侧留出自绘 chevron 的位置 |

**四个必须知道的坑**：

1. **`SelectItem` 的 value 不能是空字符串**，Radix 直接抛错。而本项目 11 处筛选器用
   `value=""` 表示「全部/未选」。解法：在 `Select` 封装里做双向映射——
   调用点继续写 `value={state}`、`onValueChange={(v) => setState(v)}`，
   内部自动把 `""` ↔ `SELECT_EMPTY`（`"__empty__"`）互换。
   业务代码只需要把「全部」选项写成 `<SelectItem value={SELECT_EMPTY}>全部</SelectItem>`。
2. **`aria-label` 必须放 `SelectTrigger`，不能放 `Select`**。`Select` 是 Radix 的 Root，
   不渲染 DOM 元素，放它上面的属性会被丢弃。
3. **Radix 的 value 不落 DOM**。它的 `SelectItem` 只把 value 存在 React context 里，
   渲染出的 `[role=option]` 上**没有 `data-value`**。这导致 e2e 的
   `[role=option][data-value="X"]` 永远匹配不到，每次白等 30 秒——我为此浪费了两轮
   10 分钟的 e2e 超时。解法：在 `SelectItem` 上显式加 `data-value={value}`。
4. **`required` 不参与原生表单校验**。Radix 渲染的是 `button`。本项目唯一带 `required`
   的下拉（规则匹配目标）本来就在提交处理里有 `if (!policy || !pool.length) return`，
   所以功能不受影响；但以后新增表单要记得自己校验。

**e2e 全部重写**：`selectOption()` 对 Radix 无效，改成统一 helper：

```js
const pick = async (label, value) => {
  await page.getByLabel(label, { exact: true }).click();
  await page.locator(`[role=option][data-value="${value}"]`).click();
};
```

11 处调用全部替换。`对比快照` 那处需要先读第二个选项的 `data-value` 再点，单独处理。

**另外**：`getByLabel(label, { exact: true })` 对「`<label>` 包裹 button」不成立——
button 的 accessible name 会变成「标签文本 + 当前选中值」，`exact` 匹配失败。
所以每个 `SelectTrigger` 都必须有 `aria-label`，38 处已补齐。

### 设置类页面照 shadcn-admin 的 Settings 重做（2026-11-12）

用户指出配置管理页面和 shadcn-admin 的 Settings 差距很大，要求把能替换的都换掉。

**差距在哪**：当前三个区域（分类导航 / 配置列表 / 详情）**各自套了一张卡片**，
`SectionCard` + `border` 叠三层，页面像三个盒子并排。shadcn-admin 的 Settings
**完全没有卡片**——靠 `Separator` 和 `bg-muted` 分层。

**从 shadcn-admin 移植两个骨架**（`components/patterns/`）：

| 组件 | 来源 | 与上游的差异 |
|---|---|---|
| `SidebarNav` | `features/settings/components/sidebar-nav.tsx` | 选中项由 `activeHref` 传入，不读 `useLocation`（本项目分类切换靠 query，`pathname` 全一样）；移动端保留横向滚动，不换成 `Select`（`router-compat` 没有 `useNavigate`） |
| `ContentSection` | `features/settings/components/content-section.tsx` | 标题可选（无标题时不渲染 header 和分隔线）；`actions` 支持右上角按钮 |

**改造的三个页面**：

1. **配置管理**：`PageHeader title="配置管理"`（原来是"分类名"当标题，和左侧导航重复）
   \+ `Separator` + `SidebarNav`（5 个分类各配图标：Tag/Filter/MessageSquare/Send/Cpu）
   \+ 配置列表（去掉 `border`，选中态 `bg-muted`）+ `ContentSection`。
   "新增配置"按钮提到页面级，`tab === "model"` 时隐藏。
2. **账号中心**：详情从 `SectionCard` 换成 `ContentSection`，「编辑账号设置 / 断开本机会话」
   从内容底部移到 header 的 `actions`；「添加账号」从卡片换成 `ContentSection`。
3. **模型配置**：`SectionCard` 换成 `ContentSection title="模型审核授权"`，
   表单加 `max-w-xl`（原来输入框拉满 660px）。

**边界**：列表类页面（采集归档、回复记录、消息通知、概览）**保留 `SectionCard`**——
那里的卡片是用来分隔独立记录的，去掉反而更乱。这条写进了 `DESIGN.md`。

**注意**：`ContentSection` 的 `Separator` 颜色是 `--border`（#ebebeb），在白色背景上
对比度只有 1.19:1，截图缩放下几乎看不见，放大后是清晰的 hairline。这是 token 层
既有的取舍（见「仍未解决」一节），不是这次引入的问题。

> **2026-11-14 追记**：上面「改造的三个页面」第 2、3 条，以及「边界」里那条
> 「列表页用 SectionCard / 设置页用 ContentSection」的规则，**已全部废止**。
> 用户确认这条规则不是他的决定，是这次重构的事后归纳（当时的要求只是「照 shadcn-admin
> 的 Settings 重做」，并没有规定"设置页不能套卡片"）。
> 现在所有页面改用 `SectionCard`，`components/patterns/content-section.tsx` 已删除。
> 本段保留作为过程记录，不要照着做。

### e2e 跟随信息架构重做（2026-11-12）

`44181a9` 重做了自动化任务三步流程、改名「采集归档 → 采集历史」、把模型配置拆成多个设置页，
**e2e 没有同步**，导致测试大面积失败。这一轮按新 UI 重写，逐条都是先探查 DOM 再改，不猜文案。

**探查出来的实际交互**（用于写断言）：

| 位置 | 实际结构 |
|---|---|
| 自动化任务页 | 页头三动作「查看采集历史 / 采集设置 / 开始自动化采集」+ `JourneyStepper`（`aria-label="任务步骤"`） |
| 采集设置 | 弹窗 + Tabs（采集 / 评论匹配 / 自动回复）；采集页签初始只有「关键词配置」，**选了配置才出现**「采集账号」「本次最多笔记数」 |
| 开始采集 | 弹窗「确认本轮采集范围」，动作「取消 / 预览采集范围」 |
| 采集历史 | 页头只有筛选（采集状态 / 来源配置 / 采集账号筛选 / 更多筛选）+ 列表，**没有「查看笔记与恢复」** |
| 笔记详情与跨版本对比 | 移到**任务页**的「本轮笔记与历史恢复」，入口是「查看原文与评论」 |

**改了什么**：

1. 页面标题：`关键词配置` → `配置管理`（2 处）
2. 导航名：`采集归档` → `采集历史`
3. 采集设置：从「点折叠面板」改成「点采集设置按钮 → 弹窗内操作 → Escape 关闭」，
   并在选配置后加 `waitForTimeout` 等 `CollectionSetup` 渲染
4. 采集历史详情：改为「采集历史只验筛选 + 空态」→「回任务页点查看原文与评论」走对比流程
5. 模型配置：`模型运行记录` / `整轮自动审核` / `模型请求状态` 三个断言删除
   （这些功能已移走或删除），改成验「模型审核授权」+「审核模型」下拉存在
6. **删除「新链接单帖只读诊断」整段**——该功能已从产品中移除（`单帖` 相关文案全仓 0 处）
7. 同时删掉 result 里的 `newLinkDiagnosticControl: true`——功能都没了，flag 还声明覆盖，
   属于**谎报**。这类硬编码 flag 要跟着功能一起删。

**结果**：31 项检查全绿，`errors: []`，320/390 无横向溢出。

### 取消字重例外：框架文件也遵守 vercel 规范（2026-11-12）

之前为了「和 shadcn-admin 普通页逐像素一致」，页面标题用了 700 字重，并在 `ui:check` 里
登记为 `font-weight-over-600` 的唯一例外。用户决定**规范优先**，取消这个例外。

做法：把 `VENDORED` 机制整个删掉——框架文件不再跳过任何检查，和业务代码受同一套约束。

扫描结果只有 3 处违规（比预想的少）：

| 文件 | 问题 | 处理 |
|---|---|---|
| `components/layout/app-title.tsx` | `font-bold`（1 处） | **文件删除**——零引用死代码，且硬编码了上游品牌名 `Shadcn-Admin` 和英文 `sr-only` 文案 |
| `components/patterns/page-header.tsx` | `font-bold`（3 处，含注释） | 改成 `font-semibold`；字号从 `text-2xl` 换成 token `text-display`（同为 24px），行高 `leading-snug`（1.375，贴近规范的 1.35） |
| `components/search.tsx` | `text-[10px]`（1 处，⌘K 键帽） | 改成 `text-caption`（12px），键帽 `h-5`(20px) 不变，12px 字能放下 |

实测标题计算样式：`fontSize: 24px / fontWeight: 600 / lineHeight: 33px / letterSpacing: -0.6px`，
与 `DESIGN.md` §3 的 page-title 完全一致。

**`VENDORED` 删除的代价**：同步 shadcn-admin 上游时，`search.tsx` 的键帽字号改动要重放。
其余框架文件仍是逐字节的上游代码。这条已写进 `AGENTS.md` §6.1 和 `DESIGN.md`。

**保留的唯一例外**：`styles/index.css` 的 2 处 `!important`（Radix 滚动锁 + iOS 聚焦缩放）。
这两条无法用 Tailwind 表达，且有明确的技术原因，不是风格妥协。

### 日期选择器与原生 tooltip（2026-11-12）

用户追问「还有没有其他表面像、实际不是 shadcn 的组件」。按「**谁绘制弹出层**」这个标准重扫，
又找到两类：

1. **`<Input type="date">` 4 处**（`local-diagnostics` 的请求起止日期、`local-history-filters`
   的采集/发布起止日期）。触发器是 `Input` 的样式，但**日历面板由 Chromium 绘制**——
   蓝色表头、直角、系统字体，和全站圆角浮层不搭。和下拉是同一类问题。
2. **原生 `title` tooltip 1 处**（`reply-history-content` 的发送人 ID）。悬停弹出的是
   系统灰色小方块，延迟 1 秒、不可样式化。

**按官方方式引入**（用户要求走 shadcn/ui 官方）：

```sh
npx shadcn@latest add popover calendar
```

CLI 装了 `react-day-picker@10.0.2` + `date-fns@4.4.0`，但**有两个坑**：

- `components.json` 的 `tailwind.css` 指向不存在的 `src/styles.css`，先改成 `src/styles/index.css`。
- CLI 生成的文件里 import 用了 registry 的内部别名：`import { cn } from "cn"`、
  `from "@/registry/new-york-v4/ui/button"`。**必须手动改成** `@/lib/utils` 和
  `@/components/ui/button`，否则编译失败。
- `calendar` 单独 `add` 时 CLI 报「Updating files」但**没落盘**。最后从官方 registry
  JSON（`https://ui.shadcn.com/r/styles/new-york-v4/calendar.json`）直接取源码写入。

**引入后按本项目规范改了三处**（用户授权「不遵循 vercel 规范可以改掉」）：

| 官方写法 | 本项目 | 原因 |
|---|---|---|
| `bg-background` | `bg-card` | 项目表面用 `--card` |
| `text-[0.8rem]` | `text-caption` | 禁用任意值字号 |
| `shadow-xs`（月份下拉框） | 去掉 | `DESIGN.md` §6：阴影只给浮层 |

新增 `components/ui/date-picker.tsx` 做组合封装（`Popover` + `Calendar` + 中文 locale）。
触发器**不用 `Button variant="outline"`**——那个变体带 `shadow-xs` 和 `bg-background`，
与 `Input` 的 `bg-card`、无阴影不一致；直接复用 `Input` 的度量。

值用 `YYYY-MM-DD` 字符串而非 `Date`：`new Date("2026-11-01")` 按 UTC 解析，
在东八区会退到 10 月 31 日。组件内部手工按本地时区构造/格式化。

原生 `title` 换成 `Tooltip`（`components/ui/tooltip.tsx` 之前一直零使用）。

**排查时的一个误判**：`getComputedStyle(popover).boxShadow` 我只取了前 60 字符，
看到的是 4 个空阴影（`rgba(0,0,0,0) 0 0 0 0`），以为阴影没生效。完整值是
`rgba(0,0,0,0.1) 0 4px 6px -1px, ...`——阴影是正常的。**读计算样式不要截断**。

### 全页面组件核查：业务页是否都走 shadcn（2026-11-12）

逐文件扫了 `features/` + `routes/` 共 50 个 tsx，统计 `@/components/ui/*` 与
`@/components/patterns/*` 的引用，以及原生 HTML 元素的残留。

**已经全部走 shadcn 的**（原生元素 0 处）：

| 形态 | 用的组件 | 覆盖 |
|---|---|---|
| 按钮 | `Button` | 26 个文件 |
| 下拉 | `NativeSelect` | 16 个文件 |
| 文本输入 | `Input` | 15 个文件 |
| 多行输入 | `Textarea` | 2 个文件 |
| 复选框 | `CheckboxField` → `Checkbox` | 13 个文件 |
| 表格 | `Table` 全套 | 回复记录（唯一的真表格） |
| 分页 | `Pagination` | 8 个文件 |
| 筛选栏 | `FilterBar` + `FilterField` | 8 个文件 |
| 空态 | `EmptyState` | 8 个文件 |
| 卡片 | `SectionCard` → `Card` | 17 个文件 |
| 列表行 | `RecordList` + `RecordItem` | 11 个文件 |
| 描述列表 | `DetailList` + `DetailItem` | 6 个文件 |
| 页头 | `PageHeader` | 7 个文件 |

**这次查出来并修掉的 5 类问题**：

1. **36 处裸 `<p role="alert">`**——错误提示手写成一行红字，没有图标、没有边框，
   22 个文件各写一遍。改成 `ErrorNotice`（31 处）与 `Alert` + `AlertDescription`（5 处，
   带前后缀文案和 `warning` 语义的那些）。`ErrorNotice` 之前也有，但只有 1 个调用点。
2. **6 处原生 `<details>/<summary>`**——`Collapsible` 早就装了，`Disclosure` 也封装好了，
   却只有回复详情在用。5 个文件全部改成 `Disclosure`。
3. **`InfoSection` 是 `Card` 的重复实现**——`components/information-section.tsx` 用
   `Card` 拼了个卡片，带 `.information-section` / `.information-heading` 两个**CSS 里不存在的类名**，
   且 3 个 collection 诊断文件**嵌套使用**它（卡片套卡片）。改成 `SectionCard` + `Disclosure`，
   文件删除。
4. **`feedback.tsx` 的 `Loading` 带死类名**——`.loading-stack` / `.loading-caption` 同样无定义。
   改成纯 Tailwind，并把写死的 3 行骨架改成 `rows` 参数。
5. **`StatusNotice` 是最后一份手写 CSS**——`status-notice.css` 9 条规则，含一条
   `[data-slot=sheet-content]` 覆写（`ALLOWED` 里的批准例外）。全部翻成 Tailwind 后删除 CSS，
   `data-slot-override` 例外随之消失。**2026-11-13 补完**：CSS 与 `data-slot-override`
   例外已一并删除，`ALLOWED` 只剩 `styles/index.css` 的 `!important` 一条。

另外把 4 处手写容器换成组件：`local-account-page` 与 `local-configurations` 的
`<section className="rounded-lg border bg-card p-6">` → `SectionCard`（后者需要透传
`aria-label`，所以给 `SectionCard` 加了 props 透传）；`local-overview` 的指标卡
`<Link className="...">` → `<Card asChild><Link>`；`local-configurations` 的
`<dl>/<dt>/<dd>` → `DetailList`/`DetailItem`。

**`Disclosure` 的箭头踩了三个坑**（都记在组件注释里）：

- `group-data-[state=open]:rotate-180`：`asChild` 让 Trigger 与 Button 是同一元素，
  没有祖先可供 group 变体匹配。
- `[&[data-state=open]>svg]:rotate-180`：Tailwind v4 生成独立 `rotate` 属性，
  **SVG 元素不支持**，计算值恒为 `0deg`。
- `[&[data-state=open]>span]:rotate-180`：CSS 规则确实生成了
  （`.\[\&\[data-state\=open\]\>span\]\:rotate-180[data-state=open]>span{rotate:180deg}`），
  类名和 `data-state` 都在，但计算值仍是 `0deg`。

最终用组件状态直接写内联 `transform: rotate(180deg)`。这是全项目唯一的内联样式，
理由写在组件注释里。

**仍未处理的 1 项**：查询级加载态。32 处 `isPending` 全是 mutation（按钮 `pending`），
查询级只有 `local-inbox-page` 与 `local-record-pages` 两处；`<Loading>` 零调用。
本地 IPC 查询通常几毫秒，感知不到；但 `采集归档`、`回复记录` 有数据量，首屏可能空一下。
属功能改进，不是组件选择问题。

---

## 审计起点发现的问题（已全部修复）

按严重度排序，保留在这里是为了记住「机器检查全绿不等于没问题」。

| # | 级别 | 问题 | 状态 |
|---|---|---|---|
| 1 | P0 | **两套 UI 方言并存**：33 个 feature 文件里 22 个零 Tailwind，169 处 `local-*` 类名全靠手写 CSS；5 个 feature CSS 没有 `@layer`，优先级高于 Tailwind utilities | 已迁移，0 处 |
| 2 | P0 | **shadcn 基元缺件**：`ui/` 缺 select / checkbox / textarea，退回 39 个原生 `<select>`、38 个原生 `<input>` | 已补 3 个基元 |
| 3 | P0 | **用 CSS 覆写 shadcn 组件**（`ui:check` 只认 `[data-slot]`，自定义 class 覆写查不到）：`.journey-step-button` 把 ghost Button 的 background / border / box-shadow 全盖掉 | 已随迁移消除 |
| 4 | P1 | **状态色没接上**：`data-tone` 全仓 CSS 0 处消费，三种结果同一个灰药丸 | 已改 Badge 变体 |
| 5 | P1 | **排版与 token 脱节**：`--text-*` 只有字号没配行高，`text-body` 不带 1.6；`.local-desktop h1` 两处 24/20 冲突；h2 与 h3 都是 16px | 已随迁移消除 |
| 6 | P2 | **间距/圆角/嵌套**：卡片内边距 4 处 20px（规范 24）；`.local-panel` 里嵌 `.local-editor` = 卡片套卡片 | 已随迁移消除 |
| 7 | P2 | **无 1040px 内容容器**：`main` 全宽铺满，`.local-workbench` 类已不存在 | **未解决** |
| 8 | P2 | **死类名 9 个 / 死 CSS 约 18 条**，2 条 `[data-slot=select-trigger]` 指向未安装的 Select | 已随迁移消除 |
| 9 | P3 | **shadcn-admin 遗留死代码**：direction/font provider 零调用、tooltip 零消费、sonner 挂载但零 `toast()`、`data-table/` 与 `brand-icons/` 空目录 | **部分未解决** |

---

## 仍未解决

1. **内容容器缺 1040px 上限**（`DESIGN.md` §5 要求）。`workbench-shell` 的 `main` 是
   `p-4 md:p-6` 全宽，宽屏下正文会一路拉到窗口边缘。改动很小但一次影响所有页面，建议单独做。
2. **`--input` 与 `--border` 同值**（hairline），36px 输入框边框对比度约 1.16:1，
   低于 WCAG 1.4.11 的 3:1。属 token 决策，会同时影响输入框、卡片、outline 按钮。
3. **P3 死代码**：`context/direction-provider.tsx`、`context/font-provider.tsx` 仍挂载但无人调用；
   `components/ui/tooltip.tsx` 零消费；`components/data-table/`、`assets/brand-icons/` 仍为空目录。

---

## 为什么 `ui:check` 全绿时问题仍在

`scripts/check-ui-conventions.mjs` 的规则集只覆盖：硬编码颜色、任意值、直接调色板、
字号/字重/圆角/间距越界、`!important`、`[data-slot]` 覆写、遗留类名（新增）。

**抓不到**：是不是 shadcn 基元、有没有用自定义 class 覆写组件、`data-*` 有没有被 CSS 消费、
类名有没有 CSS 定义、CSS 有没有 `@layer`、两份文档是否互相矛盾、语义 HTML 用得对不对。

它守住「颜色和刻度不跑偏」这条底线，但守不住「有没有走 shadcn 这条路」。

## 复现

```sh
npm run ui:check            # 代码是否遵守规范
npm run ui:check:strict     # warning 也算失败
npm run design:lint         # DESIGN.md 内部一致性
npm run typecheck -w @crm/web
node tests/e2e/desktop.test.cjs   # 本机需 env -u ELECTRON_RUN_AS_NODE 且加 --no-sandbox
```
