---
version: alpha
name: Lead Workbench Web
description: 内部运营工具的浅色石墨界面；单色阶，靠 1px 边框分层，仅状态色允许有色。
colors:
  background: "#fafafa"
  foreground: "#171717"
  card: "#ffffff"
  popover: "#ffffff"
  primary: "#171717"
  on-primary: "#ffffff"
  secondary: "#f5f5f5"
  muted: "#f5f5f5"
  muted-foreground: "#4d4d4d"
  faint: "#888888"
  accent: "#f5f5f5"
  destructive: "#ee0000"
  destructive-soft: "#f7d4d6"
  warning: "#ab570a"
  warning-bg: "#ffefcf"
  attention: "#c50000"
  success: "#0d7a3f"
  success-bg: "#e8f5ee"
  border: "#ebebeb"
  input: "#ebebeb"
  ring: "#171717"
typography:
  page-title:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: -0.6px
  section:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.6
  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.5
  display:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: -0.5px
  hero:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: -1.4px
rounded:
  sm: 4px
  md: 6px
  lg: 8px
  xl: 12px
  pill: 9999px
spacing:
  micro: 2px
  xxs: 4px
  xs: 6px
  sm: 8px
  snug: 10px
  md: 12px
  comfy: 14px
  lg: 16px
  xl: 20px
  2xl: 24px
  3xl: 32px
  section: 44px
components:
  button-default:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    height: 36px
    padding: 0 16px
  button-default-hover:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    height: 36px
  button-outline:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    height: 36px
    padding: 0 16px
  button-ghost:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    height: 36px
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    height: 36px
    padding: 0 16px
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    height: 36px
    padding: 0 12px
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: 24px
  table-head:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.foreground}"
    typography: "{typography.caption}"
    height: 40px
    padding: 10px 16px
  table-cell:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    padding: 12px 16px
  status-warning:
    backgroundColor: "{colors.warning-bg}"
    textColor: "{colors.warning}"
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
    padding: 4px 8px
  status-destructive:
    backgroundColor: "{colors.background}"
    textColor: "{colors.destructive}"
    typography: "{typography.caption}"
---

# DESIGN.md — Lead Workbench Web

> **本文件是 `apps/web` 的唯一样式规范。**
> 规范值写在顶部 YAML front matter（格式为 `@google/design.md`，alpha），正文解释"为什么"和"怎么用"。
> 与代码冲突时先判断：是"规范没落地"（改代码），还是"规范过时"（改本文）。
> 事实来源：`src/styles/theme.css`、`src/styles/index.css`、`src/components/ui/*`、`src/config/fonts.ts`。

---

## 0. 规范优先级：哪份文档说了算

| 文档 | 定位 | 能否作为依据 |
|---|---|---|
| **`apps/web/DESIGN.md`（本文件）** | 唯一规范 | ✅ 是 |
| `AGENTS.md`（仓库根） | 执行约束，规则层，指向本文件 | ✅ 是 |
| `README.md` 的「紧凑石墨黑白风格」 | 一句话方向声明，无 token | ⚠️ 只作方向参考 |
| `VoltAgent/awesome-design-md` 的 84 份 | 外部参考案例 | ❌ 永不作为本项目规范 |

判断口径只有一条：**能不能被 `npm run design:lint` 或 `npm run ui:check` 校验**。
不能校验的，是参考材料，不是规范。

2026-11-09 已删除 `design-qa.md` 与 `docs/UI-STYLE-DIRECTION.md`（前者方向已废弃、后者内容已并入本文件），
并删除 2026-10-26 的旧配色审计及其证据（雾白 + 海松绿、Spatial Lead Space，配色在代码中已 0 处残留，
仅存于 git 历史）。`docs/` 下不再有任何会被误当成 UI 规范的文件。

## 0.1 口径来源与收敛现状

**口径来源**：`VoltAgent/awesome-design-md` 的 `design-md/vercel`。
只取它的色彩纪律、表面三层、圆角双尺度、字重天花板；营销语言（100px 胶囊 CTA、网格渐变、
64–96px 区块留白）全部剔除。暗色阶与 success 色是我们自己补的，规范原文没有。

**2026-11-09 收敛结果**：

| 项 | 收敛前 | 现在 |
|---|---|---|
| feature CSS 里的硬编码 hex | 50 处 | **0 处**，全部走 `var(--*)` |
| 字重 650 | 3 处 | 0 处，统一 600 |
| 字号档位 | 12 种（10–30px） | 6 档（12/14/16/20/24/48） |
| 圆角档位 | 6 种（5/6/8/10/12/30） | 4 档（4/6/8/12）+ pill |
| 死规则（`.local-workbench` 前缀） | 15 条 | **已删除** |
| 任意值字号（`text-[7rem]` 等） | 7 处 | 0 处，改用 `text-hero` / `text-caption` |
| `npm run ui:check` | 错误 8 / 警告 18 | **错误 0 / 警告 0**，另有 5 条带理由的批准例外 |

**仍存在的结构问题**（不影响观感，但会增加维护成本）：

- 127 处 `className="local-*"` 分布在 23 个组件文件，样式走 token 了，但类名仍是历史命名。
- `WorkbenchShell` 上的 `graphite-workspace` / `local-desktop` 是**有效作用域**（CSS 里 63 处引用），
  不是死 class；要清理需连同 63 条选择器一起改，属独立任务。


---

## 1. 视觉主题与氛围

**定位**：内部运营工具，不是营销站。密度中等偏高，信息优先，装饰让位于可读性。

- **单色阶**：墨黑 `#171717` 是唯一强调色，且视为稀缺——只用于主按钮、选中态、焦点。
- **表面三层**：页底 `#fafafa`（canvas-soft）→ 卡片 `#ffffff`（canvas）→ 边框 `#ebebeb`（hairline）。
  卡片"坐在"页面上，而不是白卡片贴白底。
- **冷灰**：全阶无彩色倾向（灰阶 chroma ≈ 0），避免与内容区的截图/头像冲突。
- **扁平**：页面骨架只用 1px 边框分层；阴影只用于浮层（dropdown / dialog / sheet）。
- **圆角偏小**：基准 8px，控件 6px、卡片 8px，同一屏不混用两套尺度。
- 双语界面（中文为主 + 英文标识），排版必须同时满足 CJK 与 Latin 的可读性。

**密度**：表格行高 40px；卡片内边距 24px；页面左右留白 24px；正文 14px（不用 13px，vercel 阶梯没有这一档）。

---

## 2. 色彩板与角色

所有颜色定义在 `src/styles/theme.css` 的 `:root` 与 `.dark`，再通过 `@theme inline`
映射为 Tailwind 的 `--color-*`。**写代码时用变量，不要写 hex**（`ui:check` 会拦）。

### Light

| Token | 角色 | 值 |
|---|---|---|
| `--background` | 页底（canvas-soft） | `#fafafa` |
| `--card` / `--popover` | 卡片、浮层（canvas） | `#ffffff` |
| `--foreground` | 主文本（ink） | `#171717` |
| `--primary` | 主按钮、选中态（唯一强调色） | `#171717` |
| `--primary-foreground` | 主按钮文字 | `#ffffff` |
| `--secondary` / `--muted` / `--accent` | 次级面、禁用、hover 底 | `#f5f5f5` |
| `--muted-foreground` | 次级正文、导航未激活（body） | `#4d4d4d` |
| `--faint` | 占位符、最低强调（mute） | `#888888` |
| `--destructive` / `--destructive-soft` | 错误、删除 / 错误底 | `#ee0000` / `#f7d4d6` |
| `--warning` / `--warning-bg` | 未知结果、提示条 | `#ab570a` / `#ffefcf` |
| `--attention` | 需注意但非错误的文字 | `#c50000` |
| `--success` / `--success-bg` | 成功、已就绪 | `#0d7a3f` / `#e8f5ee` |
| `--border` / `--input` | 分割线、输入框描边（hairline） | `#ebebeb` |
| `--ring` | 焦点环 | `#171717` |
| `--qr-surface` | 二维码底（两种模式都纯白） | `#ffffff` |

`--chart-1…5`：`#f54900` / `#009689` / `#104e64` / `#ffb900` / `#fe9a00`。
目前无组件使用，属预留。

### Dark

| Token | 值 |
|---|---|
| `--background` | `#0a0a0a` |
| `--card` | `#111111` |
| `--popover` | `#161616` |
| `--foreground` | `#ededed` |
| `--primary` | `#ededed` |
| `--primary-foreground` | `#0a0a0a` |
| `--secondary` / `--muted` / `--accent` | `#1a1a1a` / `#1a1a1a` / `#1f1f1f` |
| `--muted-foreground` / `--faint` | `#a1a1a1` / `#6b6b6b` |
| `--destructive` / `--destructive-soft` | `#ff5c5c` / `#2a1416` |
| `--warning` / `--warning-bg` | `#f5a623` / `#2a1f0f` |
| `--attention` | `#ff8a8a` |
| `--success` / `--success-bg` | `#3ddc84` / `#0f2419` |
| `--border` / `--input` | `#262626` / `#2e2e2e` |
| `--ring` | `#ededed` |

**暗色是推导值，不是规范原文**：vercel 那份 DESIGN.md 只覆盖浅色。推导规则——
表面阶梯反向（页底最暗、卡片略亮）、边框改实色深灰、语义色提亮、`primary` 反转为浅色。

**关键差异**：暗色下 `primary` 反转（浅底深字）；浮层比背景更亮一档
（`popover` `#161616` > `card` `#111111` > `background` `#0a0a0a`）。

**主题切换**：`src/context/theme-provider.tsx`，`light | dark | system`，偏好存 localStorage，
`.dark` 类挂在 `<html>`。新增颜色必须同时补 `:root` 与 `.dark` 两套，否则切主题会露馅。

---

## 3. 排版规则

**字体栈**（Latin 在前，CJK 系统字在后，避免中文回退到衬线）：

```
'Inter', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif
```

可用族：`font-sans`（默认）、`font-inter`、`font-manrope`（`src/config/fonts.ts` 控制可选项）。
**不引入第四种字体**；品牌感靠字重与字号层级，不靠字体数量。

| 用途 | 字号 / 行高 | 字重 | 字距 | class |
|---|---|---|---|---|
| 页面标题 `h1` | 20px / 1.4 | 600 | `-0.6px`（仅 Latin） | `text-title` |
| 展示数字（404 等） | 48px / 1.05 | 600 | `-1.4px` | `text-hero` |
| 区块标题 `h2` | 16px / 1.5 | 600 | 0 | `text-section` |
| 正文 | 14px / 1.6 | 400 | 0 | `text-body` / `text-sm` |
| 表格单元 | 14px / 1.5 | 400（关键列 500） | 0 | `text-sm` |
| 说明 / 元信息 | 12px / 1.5 | 400 | 0 | `text-caption` / `text-xs` |
| 按钮标签 | 14px / 1.2 | 500 | 0 | `text-sm font-medium` |

**字号档位只有 6 档**：`text-caption`(12) `text-body`(14) `text-section`(16) `text-title`(20)
`text-display`(24) `text-hero`(48)。定义在 `theme.css` 的 `@theme inline`，Tailwind v4 会自动生成对应 class。
`hero` 对应 vercel 的 `display-xl`，只用于 404 这类整页大数字，业务页面不得使用。
不额外引入 13 / 15 / 17 / 18 / 22 / 25 / 30 这些档位——`ui:check` 会把它们判为越界。

**字重天花板 600**：只用 400 / 500 / 600。vercel 明文规定不用 700+，需要更强的层级就加大字号。

**禁止 `text-[13px]` 这类 px 任意值**；需要新档位就往 `@theme inline` 加 `--text-*`。

**CJK 规则（必须遵守）**：
- 负字距只用于**纯 Latin 标题**。中文标题字距保持 `0`，`-0.02em` 会让汉字挤在一起。
- 中文正文行高不低于 `1.6`；英文可到 `1.5`。
- 正文段落最大宽度 `75ch`（`workbench.css` 已有 `.page-heading p` 先例）。
- 数字列用 `font-variant-numeric: tabular-nums`（见 `graphite-reply-history.css`）。
- 长文本一律 `overflow-wrap: anywhere`，中文无空格断行不生效会导致溢出。

---

## 4. 组件样式

**基线**：shadcn/ui `new-york` 风格，baseColor `slate`，`cssVariables: true`，31 个组件在
`src/components/ui/`。所有变体通过 `class-variance-authority` 定义，**改样式改 CVA，不要在页面里覆写**。

### Button（`src/components/ui/button.tsx`）

| Variant | 表现 |
|---|---|
| `default` | `bg-primary` 实心，hover `primary/90` |
| `secondary` | `bg-secondary` 浅底 |
| `outline` | `border` + `bg-background`，hover 转 `accent` |
| `ghost` | 无底无框，hover `accent` |
| `destructive` | `bg-destructive`，暗色降透明度到 60% |
| `link` | 文字 + 下划线 offset 4 |

| Size | 高度 | 说明 |
|---|---|---|
| `xs` | 24px | 表格内联操作 |
| `sm` | 32px | 工具栏 |
| `default` | 36px | 表单主操作 |
| `lg` | 40px | 页面级主 CTA |
| `icon` / `icon-sm` / `icon-lg` | 36 / 32 / 40 方 | 纯图标 |
| `content` | auto | 多行内容按钮 |

按钮统一 `rounded-md`、`text-sm`、`font-medium`、`gap-2`，图标默认 `size-4`（`xs` 为 `size-3`）。
禁用态 `pointer-events-none` + 降透明，**不用**灰色替代色。

### 其他基元

- **卡片**：`bg-card` + `border` + `rounded-lg`，内边距 18–24px。卡片内不再套卡片，用 `border-top` 分段。
- **输入框**：`border-input` + `rounded-md` + 高 36px；聚焦走 `ring`，错误走 `aria-invalid:border-destructive`。
- **表格**：`[data-slot=table-head]` 高 40px、`bg-muted`；`[data-slot=table-cell]` 内边距 `12px 16px`。
- **徽标/状态**：`rounded-full` 药丸或 `rounded-sm` 方标，语义色只用于状态，不用于装饰。

**圆角刻度**：`--radius: 0.5rem`(8px) → `sm` 4px / `md` 6px / `lg` 8px / `xl` 12px / `full` pill。
**双尺度纪律**：控件（按钮、输入、下拉）用 `md` 6px；卡片用 `lg` 8px。**同一屏不混用两套尺度**。
`rounded-2xl` 及以上禁止使用。

---

## 5. 布局原则

**间距刻度 = Tailwind 的 spacing 刻度**（不是"4 的倍数"）：
`2 / 4 / 6 / 8 / 10 / 12 / 14 / 16 / 20 / 24 / 28 / 32 / 40 / 44 / 48`。

禁止 `3 / 5 / 7 / 9 / 18 / 34` 这类中间值——它们不对应任何 Tailwind 步进，
`ui:check` 的 `spacing-out-of-scale` 会拦下。历史上 4 个文件共 11 处犯过这个错。

### 强制间距（这几条是硬性的，不是建议）

| 位置 | 值 | 说明 |
|---|---|---|
| 卡片内边距 | **24px**（移动端 16px） | 内容不得贴边。统计卡、面板、编辑器一律适用 |
| 卡片内首行到边框 | ≥ 16px | 视觉呼吸的最小值 |
| 页头到首个内容块 | **24px** | `.page-heading` 的 `margin-bottom` |
| 卡片网格间隙 | 16px | `.local-metric-grid` / `grid gap-4` |
| 卡片之间纵向 | 20px | `.local-panel` 的 `margin-bottom` |
| 表单标签到控件 | 8px | `label` 内部 `gap` |
| 表单控件之间 | 12px | `.local-key-form` / `.local-filterbar` 的 `gap` |
| 卡片标题到内容 | 16px | `h2` 之后的第一个块用 `margin-top: 16px` |
| 分页行到上方内容 | 16px | `.local-actions` 的 `margin-top` |

### 其他

- 内容容器：`max-width: 1040px`，居中（`.local-workbench` 先例）。
- 页面纵向节奏：上 44px / 左右 24px / 下 80px。
- 常用 flex 间隙：`gap-2`(8) 图标与文字、`gap-3`(12) 按钮组、`gap-4`(16) 区块、`gap-5`(20) 页头。
- **不用固定侧边栏**撑满布局；宽表允许横向滚动，用 `min-width` 保证列不塌（如 1080px 表格）。
- 表单标签在输入框上方（`flex-direction: column; gap: 8px`），不用左侧对齐标签。

---

## 6. 深度与层次

三层，按此顺序表达层级，**不要同时用三种**：

1. **边框**（首选）：`1px solid var(--border)`，最轻，用于卡片、表格、分段。
2. **表面差**（次选）：`background` → `muted` → `card`，暗色下靠亮度阶梯。
3. **阴影**（仅浮层）：`shadow-xs`（输入框/小卡）、`shadow-sm`（卡片）、`shadow-lg`（弹层/Dropdown）。

禁止：彩色阴影、大范围高斯模糊光晕、超过 `shadow-xl` 的投影。

---

## 7. 该做与不该做

**Do**
- 颜色、圆角、间距、字号一律走 token / Tailwind 类，不写裸值。
- 卡片放在 `--background`（`#fafafa`）上，卡片本身用 `bg-card`（白）——靠表面差分层，不要靠阴影。
- 新增语义色时同时补 `:root` 与 `.dark`，并在 `@theme inline` 里映射 `--color-*`。
- 中文文案配 `1.6` 行高、`0` 字距、`overflow-wrap: anywhere`。
- 状态用 `data-slot` / `aria-*` 选择器定位，保持与 shadcn 一致。
- 破坏性操作用 `destructive` 变体，并配确认对话框（`alert-dialog`）。

**Don't**
- 不要在 feature CSS 里写十六进制色值。2026-11-09 已把 47 处硬编码 hex 全部收敛为 `var(--*)`，
  新增代码再写 hex 会被 `npm run ui:check` 判为 error。
- 不要用彩色区分信息层级。彩色只允许出现在状态语义（destructive / warning / success / attention）。
- 不要给中文标题加负字距（`-0.6px` 只用于纯 Latin 标题）。
- 字重不要超过 600。需要更强层级就加大字号，不要上 700。
- 不要在同一屏混用控件圆角（6px）和卡片圆角（8px）以外的尺度。
- 不要在页面里用 `!important` 覆盖 shadcn 组件。确需覆盖第三方内置工具类时，
  必须到 `scripts/check-ui-conventions.mjs` 的 `ALLOWED` 登记文件与理由，否则 `ui:check` 判 error。
  （`workbench.css` 注释记录了上一轮设计系统用 `[data-slot]` 全量覆写导致 155KB 死规则被删除的教训。）
- 不要用 `[data-slot]` 批量覆写组件外观。布局类覆盖（宽度、内边距）作用域必须限定在功能类内，
  并同样登记到 `ALLOWED`。
- 不要引入第二套设计系统 / 图标库；图标统一 `lucide-react`。
- 不要用 100px 胶囊做工具按钮、不要网格渐变——那是 vercel 营销面的语言，不适用于本工具。
- **一个控件只允许一套焦点指示**：不要同时保留全局 `outline` 和组件自带的 `focus-visible:ring`，
  否则会叠成双圈、且两圈颜色不一致（2026-10-26 那次审计的根因）。

---

## 8. 响应式行为

| 断点 | 行为 |
|---|---|
| `≥1080px` | 宽表完整展示，双栏可用 |
| `860px` | 双栏收为单栏 |
| `767px` | 输入类控件强制 `font-size: 16px`（防 iOS 聚焦缩放，`index.css` 已全局处理） |
| `700px` / `600px` | 页头改纵向、按钮组换行、表单 label/input 改纵向堆叠 |
| `520px` / `480px` | 卡片内边距降到 14–18px，标题降到 25px |

- 触摸目标不小于 36×36px；纯图标按钮用 `icon-sm`(32) 起步，移动端升到 `icon`(36)。
- 表格在窄屏保持横向滚动，不折叠成卡片（运营场景需要列对齐）。

---

## 9. Agent 提示指南

### 快捷参考

```
页底: bg-background(#fafafa)   卡片: bg-card(#fff)   次级面: bg-muted
主操作: bg-primary text-primary-foreground
次要操作: variant="outline" | "ghost"
主文本: text-foreground   次级: text-muted-foreground   占位: text-faint
分割: border-border(#ebebeb)
焦点: ring-ring
危险: text-destructive / variant="destructive"
提示: text-warning / bg-warning-bg
成功: text-success / bg-success-bg
圆角: rounded-md(6, 控件) / rounded-lg(8, 卡片)
字号: text-title(20) / text-section(16) / text-body(14) / text-caption(12)
```

### 可直接使用的提示词

> 在本项目 `apps/web` 下新建一个页面：使用现有的 shadcn 组件（`@/components/ui/*`），
> 只用 `theme.css` 的语义 token（`bg-background`、`bg-card`、`border-border`、
> `text-muted-foreground`、`bg-primary`），不要写任何十六进制色值，不要新增 CSS 文件。
> 页面容器 `max-w-[1040px] mx-auto px-6 py-11`，标题 `text-title font-semibold`
> （纯 Latin 标题可加 `tracking-[-0.6px]`，中文标题不加），正文 `text-body leading-relaxed`，
> 元信息 `text-caption text-muted-foreground`。
> 卡片用 `bg-card rounded-lg border`，放在 `bg-background`（#fafafa）上，不要加阴影。
> 中文段落加 `break-words`，行高 1.6。
> 表格用 `@/components/ui/table`，表头 `bg-muted`、行高 40px、单元格 `px-4 py-3`。
> 主操作一个 `default` 按钮，其余用 `outline`；危险操作用 `destructive` 并配 `AlertDialog`。
> 字重不超过 600，字号只用 12/14/16/20/24 五档。
> 必须同时适配 `dark` 模式，不新增硬编码颜色。

### 已知结构问题（不影响观感）

- 127 处 `className="local-*"` 仍是历史命名，样式已走 token，可逐步改名。
- `graphite-workspace` / `local-desktop` 是有效作用域（63 处 CSS 引用），不是死 class。
- `ui:check` 有 5 条批准例外（`!important` 与 `[data-slot]` 覆写），每条都在
  `scripts/check-ui-conventions.mjs` 的 `ALLOWED` 里写了理由。新增例外必须同样写理由。
- 仓库根目录 `design-qa.md` 记录的 `Spatial Lead Space`（深色星空 + 香槟金 CTA）**已不在代码中**：
  全仓已无 `spatial` / `champagne` 相关类名。该文档是 2026-10-20 的历史交付记录，**不能当作当前基线**。

---

## 10. 机器可读 token 与校验

本文件顶部的 YAML front matter 是 token 的**规范值**，下面的正文解释"为什么"和"怎么用"。
格式来自 `@google/design.md`（alpha），不是本项目自创。

```sh
npm run design:lint      # 校验 front matter：失效引用 / 对比度 / 孤儿 token
npm run design:tokens    # 导出 Tailwind v4 @theme 块，供对照
npm run ui:check         # 校验代码是否遵守本文（另一套规则，见 AGENTS.md）
```

**分工**：`design:lint` 管文档内部一致性，`ui:check` 管代码是否越界。两者都不判断审美。

**当前 lint 状态**：0 error / 若干 `orphaned-tokens` warning。
warning 来自「token 已定义但没被 `components:` 表引用」——那些 token 由 CSS 选择器使用，
不在 component 表里体现。补全 `components` 可以消掉，但会显著拉长文件，暂不处理。

### 导出的已知损失（重要）

`design:tokens` 导出的 `@theme` 块**不能直接替换 `theme.css`**，有两处损失：

1. **丢行高**：导出不含 `--leading-*`，而中文排版最依赖行高（本文件第 3 章的核心规则）。
2. **无暗色层**：只产出单层 `@theme`，而本项目需要 `:root` / `.dark` 双层覆盖。

（颜色不再是损失——`theme.css` 现在原生就用 hex，导出值与源值一致。）

所以 `theme.css` 继续手写，导出仅用于**对照和排查**，不作为生成源。
若将来把 DESIGN.md 定为唯一真相源，需要先解决上面两点。
