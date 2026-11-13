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
  destructive: "#e60000"
  destructive-soft: "#f7d4d6"
  warning: "#ab570a"
  warning-bg: "#ffefcf"
  attention: "#c50000"
  success: "#0d7a3f"
  success-bg: "#e8f5ee"
  border: "#ebebeb"
  input: "#909090"
  ring: "#171717"
typography:
  page-title:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.35
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

**与 shadcn-admin 的分工**：只取它的**外壳结构与组件代码**，不取它的**配色与度量**。
上游默认值是 slate 蓝灰色板、10px 圆角基准、700 字重、卡片带 `shadow-sm`——这四项都与本文冲突，
冲突时**以本文为准**。已经按本文改掉的有：圆角 10px→8px、字重 700→600、卡片阴影移除、
`hsl(var(--x))` 套壳修正。**没有**跟进的只有配色（见 §1「冷灰」和 §2 暗色说明），那是刻意保留的。

### 每条规则的出处（别把自定的当上游）

| 规则 | 谁定的 | 依据 |
|---|---|---|
| 颜色值、灰阶、hairline、表面三层 | **vercel** | `design.md` 的 colors token，逐值可查 |
| 圆角刻度、字重 600 天花板、字号阶梯 | **vercel** | 同上 |
| 外壳结构、`SidebarNav` 等组件形态、`Main` 的 1280px 容器 | **shadcn-admin** | 源码，不是规范文档 |
| ~~列表页用 `SectionCard` / 设置页用 `ContentSection`~~ | **已废止**（无上游出处，也无产品决策记录） | 2026-11-12 `4567fed` 归纳，2026-11-14 删除 |
| ~~阴影只用于浮层、卡片不用阴影~~ | **已废止**（无上游出处，且与 vercel 相反） | 见下 |
| 强制间距表、文案规则（§9）、CJK 排版规则、整套暗色 | **本项目** | §3/§5、`AGENTS.md` §9 |

**2026-11-14 清理了两条无主条款**（都写进了本文，但没有人认领过）：

1. **「阴影只用于浮层 / 卡片不用阴影」已废止**。它来自 `fb570d5`（建规范那次），
   `卡片不用阴影` 这句是 2026-11-14 补写时把代码现状总结成规则的产物。而 vercel 的 elevation
   有 5 级，Level 2「Subtle Drop」明确给卡片叠极轻阴影（`0 1px 1px #00000005` +
   `0 2px 2px #0000000a` + inset hairline）。所以这条**不仅无主，还与上游相反**。
   现在 §6 按 vercel 分级描述，卡片阴影属于允许项（当前未启用）。
2. **「设置页不套卡片」已删除**（同表上一行）。它是 `4567fed` 里跟着 `content-section.tsx`
   一起写进来的 6 行归纳——先抄了上游组件的形态，再把「什么时候用它」总结成规则。
   vercel 通篇没有组件架构话题，shadcn-admin 也只有那个组件本身。
   2026-11-14 按用户决定废止，页面骨架统一改用 `SectionCard`，组件文件已删除。

**教训**：这两条都是「把当时的实现总结成规范」的产物。写规范时如果要写
「必须用 A 不能用 B」，先确认这是谁的决定——否则下一个维护者会把它当成约束去遵守。

**2026-11-09 收敛结果**：

| 项 | 收敛前 | 现在 |
|---|---|---|
| feature CSS 里的硬编码 hex | 50 处 | **0 处**，全部走 `var(--*)` |
| 字重 650 | 3 处 | 0 处，统一 600 |
| 字号档位 | 12 种（10–30px） | 6 档（12/14/16/20/24/48） |
| 圆角档位 | 6 种（5/6/8/10/12/30） | 4 档（4/6/8/12）+ pill |
| 死规则（`.local-workbench` 前缀） | 15 条 | **已删除** |
| 任意值字号（`text-[7rem]` 等） | 7 处 | 0 处，改用 `text-hero` / `text-caption` |
| `npm run ui:check` | 错误 8 / 警告 18 | **错误 0 / 警告 0**，另有 2 条带理由的批准例外 |

**2026-11-11 完成方言收敛**：

| 项 | 收敛前 | 现在 |
|---|---|---|
| 手写 CSS 方言（`local-*` 等遗留类名） | 23 个文件 / 169 处 | **0 处** |
| 全局样式表 | 6 个（含 155KB 历史残留） | 只剩 `index.css` + `theme.css` |
| 页面骨架 | 3 套分页 / 2 套卡片容器 / 2 套空态 | `components/patterns` 各一套 |
| `ui:check` 批准例外 | 5 条 | 2 条 |

新页面一律用 `components/patterns/*`，`ui:check` 的 `legacy-class` 规则会拦住回退。


---

## 1. 视觉主题与氛围

**定位**：内部运营工具，不是营销站。密度中等偏高，信息优先，装饰让位于可读性。

- **单色阶**：墨黑 `#171717` 是唯一强调色，且视为稀缺——只用于主按钮、选中态、焦点。
- **表面三层**：页底 `#fafafa`（canvas-soft）→ 卡片 `#ffffff`（canvas）→ 边框 `#ebebeb`（hairline）。
  卡片"坐在"页面上，而不是白卡片贴白底。
- **冷灰**：全阶无彩色倾向（灰阶 chroma ≈ 0），避免与内容区的截图/头像冲突。
  **这一条是刻意不跟 shadcn-admin 的**，不要"修"回 slate：
  - 上游用 slate 色板（`oklch(... 0.04 260)`），是带蓝的灰；vercel 的灰阶是 R=G=B 的中性灰
    （`#4d4d4d` `#888888` `#a1a1a1`）。本项目以 vercel 为准。
  - 理由一：内容区满是小红色/抖音的彩色截图与头像，蓝调灰阶会和它们抢色。
  - 理由二：浅色已是中性灰，暗色若单独带蓝，切换主题时会出现明显的色相跳变；
    要换就得两套一起换，那等于放弃 vercel 的灰阶体系。
  - 理由三：`--input` 的 3:1 是在中性底上验的，换底色要全部重算。
- **扁平**：页面骨架只用 1px 边框分层；阴影按 vercel 的 elevation 分级使用（见 §6），
  当前卡片不带阴影，浮层带。
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
| `--destructive` / `--destructive-soft` | 错误、删除 / 错误底 | `#e60000` / `#f7d4d6` |
| `--warning` / `--warning-bg` | 未知结果、提示条 | `#ab570a` / `#ffefcf` |
| `--attention` | 需注意但非错误的文字 | `#c50000` |
| `--success` / `--success-bg` | 成功、已就绪 | `#0d7a3f` / `#e8f5ee` |
| `--border` | 分割线、卡片边框（hairline） | `#ebebeb` |
| `--input` | 输入框描边（控件边界，需 ≥3:1） | `#909090` |
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
| `--border` | `#262626` |
| `--input` | `#666666` |
| `--ring` | `#ededed` |

**暗色是推导值，不是规范原文**：vercel 那份 DESIGN.md 只覆盖浅色（它连暗色章节都没有，
只有"极性反转的深色带"）。推导规则——表面阶梯反向（页底最暗、卡片略亮）、
边框改实色深灰、语义色提亮、`primary` 反转为浅色。

**暗色不跟 shadcn-admin**，两处结构性差异都是刻意的：

| 项 | shadcn-admin `.dark` | 本项目 | 为什么 |
|---|---|---|---|
| 灰阶色相 | slate 蓝灰（`#020618` `#1d293d`） | 中性灰（`#0a0a0a` `#1a1a1a`） | 见 §1「冷灰」 |
| 边框 | 白 10% / 15% 半透明 | 实色 `#262626` / `#666666` | 见下 |

**边框必须是实色，不能用半透明**：半透明描边叠在不同表面上对比度不可预测，
没法保证 WCAG 1.4.11 的 3:1；vercel 的 `hairline` 也是实色 `#ebebeb`，alpha 只出现在阴影里。
上游的 `oklch(1 0 0 / 15%)` 叠在 `#020919` 上只有约 1.3:1，控件等于没有边界。
另有一处同样别抄：上游暗色的 `card`（`#020919`）几乎等于 `background`（`#020618`），
卡片靠半透明边框才看得出轮廓；本项目保持"卡片比页底亮一档"，靠表面差分层（§6）。

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
| 页面标题 `h2` | 24px / 1.35 | 600 | `-0.6px`（仅 Latin） | `text-display font-semibold`（纯 Latin 标题另加 `tracking-tight`） |
| 展示数字（404 等） | 48px / 1.05 | 600 | `-1.4px` | `text-hero` |
| 区块标题 `h2` | 16px / 1.5 | 600 | 0 | `text-section` |
| 正文 | 14px / 1.6 | 400 | 0 | `text-body` / `text-sm` |
| 表格单元 | 14px / 1.5 | 400（关键列 500） | 0 | `text-sm` |
| 说明 / 元信息 | 12px / 1.5 | 400 | 0 | `text-caption` / `text-xs` |
| 按钮标签 | 14px / 1.2 | 500 | 0 | `text-sm font-medium` |

**字号档位只有 6 档**：`text-caption`(12) `text-body`(14) `text-section`(16) `text-title`(20)
`text-display`(24) `text-hero`(48)。定义在 `theme.css` 的 `@theme inline`，Tailwind v4 会自动生成对应 class。
**行高写在 token 里**（`--text-body--line-height: 1.6` 等），所以 `text-body` 自带 1.6，
不需要每个调用点再补 `leading-relaxed`；上表的行高就是 token 值，改行高改 `theme.css`，不要在页面里逐处写。
`hero` 对应 vercel 的 `display-xl`，只用于 404 这类整页大数字，业务页面不得使用。
不额外引入 13 / 15 / 17 / 18 / 22 / 25 / 30 这些档位——`ui:check` 会把它们判为越界。

**字重天花板 600**：只用 400 / 500 / 600。vercel 明文规定不用 700+，需要更强的层级就加大字号。
**这条没有例外**——包括 shadcn-admin 的外壳文件：`AppTitle` 的 700 已随死代码删除，
`PageHeader` 从 700 降到 600。`ui:check` 不再有 `font-weight-over-600` 的白名单。

**禁止 `text-[13px]` 这类 px 任意值**；需要新档位就往 `@theme inline` 加 `--text-*`。

**CJK 规则（必须遵守）**：
- 负字距只用于**纯 Latin 标题**。中文标题字距保持 `0`，`-0.02em` 会让汉字挤在一起。
- 中文正文行高不低于 `1.6`；英文可到 `1.5`。
- 正文段落最大宽度 `75ch`（`PageHeader` 的 description 已按此实现）。
- 数字列用 `font-variant-numeric: tabular-nums`（见 `graphite-reply-history.css`）。
- 长文本一律 `overflow-wrap: anywhere`，中文无空格断行不生效会导致溢出。

---

## 4. 组件样式

**基线**：shadcn/ui `new-york` 风格，baseColor `slate`，`cssVariables: true`，实际使用的组件位于
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

### 表单控件（`input.tsx` / `textarea.tsx` / `select.tsx` / `date-picker.tsx` / `checkbox.tsx`）

四件共用一套度量，**不要在页面里另写高度或边框**：

| 控件 | 高度 | 圆角 | 底色 | 字号 |
|---|---|---|---|---|
| `Input` | `h-9`(36) | `rounded-md` | `bg-card` | `text-base md:text-sm` |
| `Select`（`SelectTrigger`） | `h-9`(36) | `rounded-md` | `bg-card` | `text-base md:text-sm` |
| `DatePicker`（触发器） | `h-9`(36) | `rounded-md` | `bg-card` | `text-base md:text-sm` |
| `Textarea` | `min-h-16` | `rounded-md` | `bg-card` | `text-base md:text-sm` |
| `Checkbox` | `size-4` | `rounded-sm` | `bg-card`，勾选态 `bg-primary` | — |

**暗色填充**：四件在暗色下用 `dark:bg-muted`（`#1a1a1a`）而不是 `bg-card`，因为暗色下
`--card`（`#111`）与页底几乎同色，需要一档表面差把控件"托"起来。不要写成 `dark:bg-input/30`——
那是拿边框色当填充，`--input` 改成 3:1 后会连带把控件底色调亮。

- **底色用 `bg-card` 而不是 `bg-transparent`**。透明底落在 `--muted`（`#f5f5f5`）的编辑器面板里，
  控件与面板同属浅灰、只剩一条描边可读，边界会明显变弱。白底控件在灰面板上是"浮起来"的，
  这是本项目的固定组合，不要改成透明。
- **`--input` 与 `--border` 是两档，不要合并**：`--border` 是装饰性 hairline（`#ebebeb`），
  `--input` 是控件边界，必须满足 WCAG 1.4.11 的 3:1（`#909090` 对白底 3.19:1，暗色 `#666` 对 `#111` 3.29:1）。
  两者同值曾让 36px 输入框的边框对比度只有 1.16:1，等于控件没有边界。
- **`text-base` 在移动端是防 iOS 聚焦缩放**，`md:text-sm` 才是桌面档位；不要删。
- **下拉一律用 Radix `Select`（`components/ui/select.tsx`），不要用原生 `<select>`。**
  原生 `<select>` 的**弹出层由操作系统绘制**，CSS 完全控制不了——macOS 上必然是灰底 + 蓝高亮的
  系统菜单，和全站的圆角浮层完全不搭（2026-11-12 实测截图对比）。样式化原生控件只能改触发器，
  改不了弹出层，所以这条路走不通。
- **「全部 / 未选」用 `SELECT_EMPTY` 哨兵**：Radix 的 `SelectItem` 不接受空字符串 value。
  `Select` 封装已经把 `value=""` ↔ `SELECT_EMPTY` 做了双向映射，业务代码继续写
  `value={state}`（空串表示全部）、`onValueChange={(v) => setState(v)}`，**不需要知道哨兵存在**；
  只需要把「全部」那个选项写成 `<SelectItem value={SELECT_EMPTY}>全部</SelectItem>`。
- **`required` 要自己补偿**：Radix `Select` 不参与原生表单校验。提交处理里必须有
  `if (!value) return`，并用 `aria-required` 标注。
- **`aria-label` 放 `SelectTrigger`，不要放 `Select`**：`Select`（Root）不渲染 DOM 元素，
  放在它上面的 `aria-label` 会被丢弃。
- **日期一律用 `DatePicker`（`Popover` + `Calendar`），不要用 `<Input type="date">`。**
  原生日历的弹出层同样由浏览器绘制，配色/圆角/字体都不受控，和全站浮层不一致。
  `DatePicker` 的值是 `YYYY-MM-DD` 字符串（不是 `Date`），因为 `new Date("2026-11-01")`
  按 UTC 解析会在东八区退一天；组件内部手工按本地时区构造。
  清空用「清除日期」，对应空字符串 `""`。
- **`Checkbox` 与输入框共用 `border-input`**：`--input` 已是 3:1 档，16px 方框在白底上也能读出来，
  不需要再单独退到 `border-muted-foreground/60`。勾选态 `bg-primary` + 白色对勾。
- 控件一律带 `data-slot`，状态走 `aria-invalid` / `data-state`，不要用颜色单独表达。

### 其他基元

- **卡片**：`bg-card` + `border` + `rounded-lg`，内边距固定 24px（移动端 16px）。卡片内不再套卡片，用 `border-top` 分段。
- **输入框**：`border-input` + `rounded-md` + 高 36px；聚焦走 `ring`，错误走 `aria-invalid:border-destructive`。
- **表格**：`[data-slot=table-head]` 高 40px、`bg-muted`；`[data-slot=table-cell]` 内边距 `12px 16px`。
- **徽标/状态**：`rounded-full` 药丸或 `rounded-sm` 方标，语义色只用于状态，不用于装饰。

**圆角刻度**：`--radius: 0.5rem`(8px) → `sm` 4px / `md` 6px / `lg` 8px / `xl` 12px / `full` pill。
**双尺度纪律**：控件（按钮、输入、下拉）用 `md` 6px；卡片用 `lg` 8px。**同一屏不混用两套尺度**。
`rounded-2xl` 及以上禁止使用。

### 页面骨架（`src/components/patterns/`）

**新页面必须用这套骨架，不要自己写容器。** 它们替代了手写 CSS 时代的
`.local-panel` / `.local-filterbar` / `.local-config-list` / `.local-actions` / `.local-check`。

| 组件 | 替代 | 关键约束 |
|---|---|---|
| `PageHeader` | `<header className="page-heading">` | 结构照框架普通页（`h2` + 标题块与动作区同行），但字号字重按本项目规范：`text-display font-semibold`（24px/600）；**不带外边距**（节奏由 `<Main>` 的 gap 给） |
| `SectionCard` | `.local-panel` / `.configuration-detail` | **所有页面骨架都用它**；24px 内边距、1px 边框分层（阴影可选，见 §6）、**卡片内不再套卡片** |
| `FilterBar` / `FilterField` | `.local-filterbar` | 控件间距 12px；**自身不带上下 margin**，靠外壳 `gap-4` |
| `RecordList` / `RecordItem` | `.local-config-list` | 行间 `divide-y`，动作区 `shrink-0` |
| `Pagination` | `Pages` / `LocalPagination` / 内联 `<nav>` | 只有一页时整体不渲染；按钮 36px |
| `EmptyState` | `.local-empty` | **不带边框**，因为它总在 `SectionCard` 里；需要带框时外套卡片 |
| `FormField` | `.local-editor label` | 标签到控件 8px；提示/错误放在 `<label>` 外 |
| `CheckboxField` | `.local-check` | 复选框 + 文案 + 可选说明；说明左对齐到文案 |
| `DetailSheet` / `DetailList` | `.local-detail-sheet` + 手写 `<dl>` | 宽度 `sm:max-w-xl`，不用任意值 |
| `SidebarNav` | 手写分类导航 | 图标 + `ghost` 按钮，选中 `bg-muted`；窄屏横向滚动，宽屏竖排 |
| `Disclosure`（`components/disclosure.tsx`） | 原生 `<details>/<summary>` | 基于 `Collapsible`；标题 `font-medium`、左对齐到正文；**不要用原生 `details`**——三角标记无法统一、无展开动画、事件模型不同 |
| `ErrorNotice` / `Loading`（`components/feedback.tsx`） | 裸 `<p role="alert">` / 手写骨架 | 错误一律 `Alert variant="destructive"` + 图标；**不要手写红字**。`Loading` 只在整块无数据时用 |

**页面骨架统一用 `SectionCard`**：一块独立内容 = 一张卡，列表页、设置页、详情页都一样。
卡片内部要分节时用 `border-t`（不要套第二张卡）；一屏只有一段内容时也照样用卡片，
**不要退回裸 `<div>` + 分隔线**——那样在宽屏上会变成贴着左边的一条窄带。

> 2026-11-14 废止了旧的「列表页用 SectionCard / 设置页用 ContentSection」二选一规则。
> 那条规则来自 2026-11-12 一次重构的事后归纳，没有产品决策记录（见 §0.1 归属表），
> 现已删除 `components/patterns/content-section.tsx`，全部页面改用 `SectionCard`。

**外壳（侧栏 / 顶栏 / 主题布局）不在这张表里**：2026-11-11 起它们**整体使用 shadcn-admin 的源码**
（`components/layout/*`、`components/{search,command-menu,theme-switch,config-drawer,profile-dropdown,skip-to-main}.tsx`、
`context/{layout,search}-provider.tsx`），不再由本项目手写。改动规则：

- 这些文件**和业务代码受同一套规范约束**，`ui:check` 不做豁免。上游写法不合规时就地改掉。
  当前有 6 个文件偏离上游（中文化、`shadow-2xl` → `ring-2`、`hsl(var(--x))` 套壳等），
  **逐条清单在 `AGENTS.md` §6.1 的偏离表里**，同步上游时照表重放。
- 需要改外观时改 `features/**` 与 `components/patterns/**`（内容区），**不要改外壳**。
- 唯一允许的接缝是「内容」而非「样式」：中文文案、侧栏数据（`layout/data/sidebar-data.ts`）、
  菜单项（去掉登录/登出/账单这类本机应用没有的项）、`SidebarContent` 的 `aria-label`。

**纵向节奏**：外壳用框架的 `<Main className='flex flex-1 flex-col gap-4 sm:gap-6'>`（16 / 24px）。
骨架组件**一律不带上下 margin**，间距全交给 `<Main>` 的 gap；自己加 margin 会叠成 32px 以上。

**棘轮机制**：`ui:check` 的 `legacy-class` 规则维护一份白名单（`scripts/check-ui-conventions.mjs`
的 `LEGACY_CLASS_ALLOWED`）。白名单里的文件可以暂时用 `local-*` 等遗留类名，
**迁完一个删一行，新文件一律不许加**。

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
| 卡片之间纵向 | **16px（≥sm 24px）** | 由外壳 `<Main>` 的 `gap-4 sm:gap-6` 给；骨架组件自身不带 margin |
| 表单标签到控件 | 8px | `label` 内部 `gap` |
| 表单控件之间 | 12px | `.local-key-form` / `.local-filterbar` 的 `gap` |
| 卡片标题到内容 | 16px | `h2` 之后的第一个块用 `margin-top: 16px` |
| 分页行到上方内容 | 16px | `.local-actions` 的 `margin-top` |

### 其他

- 内容容器：**由外壳 `<Main>` 统一给上限**——`px-4 py-6`，宽度到 `@7xl/content`（1280px）以上时
  `mx-auto max-w-7xl` 居中。页面自身不再写 `max-w-*`，否则会和外层叠成两道约束。
- 页面纵向节奏：上 44px / 左右 24px / 下 80px。
- 常用 flex 间隙：`gap-2`(8) 图标与文字、`gap-3`(12) 按钮组、`gap-4`(16) 区块、`gap-5`(20) 页头。
- **不用固定侧边栏**撑满布局；宽表允许横向滚动，用 `min-width` 保证列不塌（如 1080px 表格）。
- 表单标签在输入框上方（`flex-direction: column; gap: 8px`），不用左侧对齐标签。

---

## 6. 深度与层次

三层，按此顺序表达层级，**不要同时用三种**：

1. **边框**（首选）：`1px solid var(--border)`，最轻，用于卡片、表格、分段、sticky 顶栏。
2. **表面差**（次选）：`background` → `muted` → `card`，暗色下靠亮度阶梯。
3. **阴影**：浮层用 `shadow-md`（Popover / Select / Dropdown）、`shadow-lg`（Dialog / Sheet / AlertDialog）；
   卡片可用 `shadow-xs` / `shadow-sm` 这一档。

**卡片阴影是可选项，不是禁止项**。vercel 的 elevation 分 5 级，Level 2「Subtle Drop」就是给卡片的
（`0 1px 1px #00000005` + `0 2px 2px #0000000a` + inset hairline）。本项目**当前没有启用**：
内部工具卡片密集，阴影叠起来会变成噪点，靠 1px 边框 + 表面差已经够分层。要启用就用 `shadow-xs` / `shadow-sm`。

顶栏不加阴影（滚动时加 1px `border-b`）——这是当前实现，不是禁令。

仍然禁止：彩色阴影、大范围高斯模糊光晕、`shadow-2xl` 及以上（`ui:check` 的 `shadow-out-of-scale` 会拦）。
这一条是机械守卫，防止阴影从"轻微抬升"退化成装饰。

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
  （上一轮设计系统用 `[data-slot]` 全量覆写，堆出 155KB 死规则后被整体删除；
  记录见 `docs/design/ui-conformance-audit.md`。）
- 不要用 `[data-slot]` 批量覆写组件外观。布局类覆盖（宽度、内边距）作用域必须限定在功能类内，
  并同样登记到 `ALLOWED`。
- 不要引入第二套设计系统 / 图标库；图标统一 `lucide-react`。
- 不要用 100px 胶囊做工具按钮、不要网格渐变——那是 vercel 营销面的语言，不适用于本工具。
- **一个控件只允许一套焦点指示**：不要同时保留全局 `outline` 和组件自带的 `focus-visible:ring`，
  否则会叠成双圈、且两圈颜色不一致（2026-10-26 那次审计的根因）。
- **不要在界面上写解释性文案**。只写操作标签、数据与状态、授权句。判据：删掉这句用户还能完成操作，
  就删。`DialogDescription`、卡片 `description`、表单 `hint` 是高发位置。规则与违规样例见
  `AGENTS.md` §9；付费披露与危险操作确认是仅有的两类例外。

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
> 页面容器交给外壳 `<Main>`（`px-4 py-6` + 1280px 上限），页面自己只写
> `<PageHeader title=… />` + 内容块，不要再包一层 `max-w-*`；
> 标题用 `PageHeader`（24px/600，中文不加负字距），
> （纯 Latin 标题可加 `tracking-[-0.6px]`，中文标题不加），正文 `text-body leading-relaxed`，
> 元信息 `text-caption text-muted-foreground`。
> 卡片用 `bg-card rounded-lg border`，放在 `bg-background`（#fafafa）上，不要加阴影。
> 中文段落加 `break-words`，行高 1.6。
> 表格用 `@/components/ui/table`，表头 `bg-muted`、行高 40px、单元格 `px-4 py-3`。
> 主操作一个 `default` 按钮，其余用 `outline`；危险操作用 `destructive` 并配 `AlertDialog`。
> 字重不超过 600，字号只用 12/14/16/20/24 五档。
> 必须同时适配 `dark` 模式，不新增硬编码颜色。

### 已知结构问题（不影响观感）

- 遗留类名与全局样式表**已清零**（2026-11-11）。`ui:check` 的 `legacy-class` 规则守着，白名单为空。
- `ui:check` 有 1 条批准例外（`styles/index.css` 的 `!important`），在
  `scripts/check-ui-conventions.mjs` 的 `ALLOWED` 里写了理由。新增例外必须同样写理由；
  文件删除后必须同步删掉例外。
- **内容容器上限已落地**：`components/layout/main.tsx` 在 `@7xl/content` 以上加
  `mx-auto w-full max-w-7xl`（1280px），页面自己不再写 `max-w-*`。
  窄于该断点时正文占满可用宽度，这是刻意的——运营表格需要横向空间。
- **`--input` 已独立成档**：`#909090`（暗色 `#666666`），对相邻卡片底 ≥3:1，满足 WCAG 1.4.11。
  `--border` 保持 hairline，两者不再同值。
- **顶栏不再用投影**：滚动超过 10px 时出现 1px `border-b`（§6 首选边框分层），
  未滚动时是透明边框占位，不会跳高度。
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

**当前 lint 状态**：0 error / 11 条 `orphaned-tokens` warning。
warning 来自「token 已定义但没被 `components:` 表引用」——那些 token 由 CSS 选择器使用，
不在 component 表里体现。补全 `components` 可以消掉，但会显著拉长文件，暂不处理。

### 导出的已知损失（重要）

`design:tokens` 导出的 `@theme` 块**不能直接替换 `theme.css`**，有两处损失：

1. **丢行高**：导出不含 `--leading-*`，而中文排版最依赖行高（本文件第 3 章的核心规则）。
2. **无暗色层**：只产出单层 `@theme`，而本项目需要 `:root` / `.dark` 双层覆盖。

（颜色不再是损失——`theme.css` 现在原生就用 hex，导出值与源值一致。）

所以 `theme.css` 继续手写，导出仅用于**对照和排查**，不作为生成源。
若将来把 DESIGN.md 定为唯一真相源，需要先解决上面两点。


## 11. 首次使用引导

引导页由 `src/features/onboarding/welcome.tsx` 实现，沿用本文 token，不另建视觉体系。
桌面为居中品牌与标题、本地数据说明、三列步骤卡片和双操作按钮；窄屏收为单列。
正文 14px、主标题 24px/600，卡片圆角 8px、控件 6px，卡片内边距移动端 16px、其余 24px。

- 未初始化时由工作台外壳显示引导，不显示侧栏；数据读取失败显示重试，不伪装成首次使用。
- 「连接账号」完成初始化后进入账号中心；「先进入工作台」完成初始化后进入概览。
- 操作期间显示进度并阻止重复点击；初始化失败保留引导和错误，允许重试。
- 初始化状态来自本地 SQLite，不使用演示登录、过期 token 或浏览器会话作为入口门槛。
- 已初始化用户可通过侧栏底部菜单进入 `/welcome` 再看引导，不重复初始化。
- 文案区分本地数据与联网操作，不宣称所有内容永不离开设备；引导本身不连接平台、不请求模型、不发送消息。
