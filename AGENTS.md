# AGENTS.md — 前端 UI 约定

本文件是**约束**，不是介绍。`apps/web` 下任何 UI 改动必须遵守；违反会被 `npm run ui:check` 拦下。

写任何 JSX / CSS 之前，先读 `apps/web/DESIGN.md`（它描述外观与规则）。
本文件描述的是**怎么落地**，两者不重复。

---

## 0. 必读顺序

1. `apps/web/DESIGN.md` — **唯一样式规范**：token 表、排版、组件、CJK 规则
2. 本文件 — 强制规则与禁止项（指向 DESIGN.md，不另立标准）
3. `apps/web/src/styles/theme.css` — 唯一的 token 定义处

**不要**从以下文档推导样式，它们是历史记录、归档或提案：

- `docs/archive/ui-2026-10/`（雾白 + 海松绿审计、Spatial Lead Space，配色已 0 残留）
- `docs/FRONTEND-A-MIGRATION-PLAN.md`（施工记录，不描述外观）
- `docs/FRONTEND-BASE-EVALUATION.md`（已否决的 B 方案）
- `VoltAgent/awesome-design-md` 的任何一份（外部参考，不是本项目规范）

---

## 1. 颜色的唯一来源

**允许**
- 表面三层：`bg-background`（页底 #fafafa）/ `bg-card`（卡片 #fff）/ `border-border`（#ebebeb）
- 文本三层：`text-foreground`（主）/ `text-muted-foreground`（次级 #4d4d4d）/ `text-faint`（占位 #888）
- 交互：`bg-primary` `text-primary-foreground` `bg-muted` `bg-accent` `ring-ring`
- 状态：`bg-destructive` `text-destructive` `bg-destructive-soft` `text-warning` `bg-warning-bg`
  `text-success` `bg-success-bg` `text-attention`
- CSS 里引用变量：`var(--border)` `var(--muted-foreground)` `var(--radius)`

**禁止**
- 任何十六进制 / `rgb()` / `hsl()` 字面值，无论是 `.css` 还是 `className`（`styles/theme.css` 除外）
- 任意值颜色：`bg-[#fff]` `text-[rgb(...)]`
- 直接调色板：`bg-slate-900` `text-gray-500` `border-zinc-200`
- 新增颜色却不加 `:root` + `.dark` 两套
- 用彩色表达层级或装饰——彩色只给状态

需要新语义色时：在 `theme.css` 的 `:root` 和 `.dark` 各加一条，再到 `@theme inline` 映射 `--color-<name>`。

---

## 2. 改组件，不要覆写组件

`src/components/ui/*` 的变体由 `class-variance-authority` 定义。

- 要改按钮长相 → 改 `button.tsx` 的 `buttonVariants`
- 要在某页特殊化 → 用 `className` 传布局类（`w-full` `justify-start`），不要改颜色和形状
- **禁止**用 `[data-slot=...]` 选择器在 CSS 里批量覆写 shadcn 组件外观
- **禁止** `!important`

两条都是 `ui:check` 的 error 级规则。确需覆盖第三方组件内置工具类时，只能在
`scripts/check-ui-conventions.mjs` 的 `ALLOWED` 里登记「文件 + 规则 + 理由」，
并保证作用域限定在功能类内。没有登记的例外一律判失败。

> 历史教训：上一轮设计系统用 `[data-slot]` 全量覆写，堆出 155KB 死规则后被整体删除
> （见 `src/styles/workbench.css` 文件头注释）。不要重演。

---

## 3. 排版

- 字体只允许 `font-sans` / `font-inter` / `font-manrope`。不引入第四种。
- 字号只有 6 档：`text-caption`(12) `text-body`(14) `text-section`(16) `text-title`(20)
  `text-display`(24) `text-hero`(48)。`text-hero` 只给 404 这类整页大数字，业务页禁用。
  **禁止** `text-[13px]` 这类 px 任意值，也禁止 13/15/17/18/22/25/30 这些档位。
  需要新档位就往 `theme.css` 的 `@theme inline` 加 `--text-*`。
- 字重只用 `font-normal`(400) `font-medium`(500) `font-semibold`(600)。**600 是天花板**，不用 700+。
  **禁止** `font-[650]`、`font-weight:650`。
- **中文标题不加负字距**。`tracking-[-0.6px]` 只用于纯 Latin 标题。
- 中文正文行高 ≥ `leading-relaxed`(1.6)。
- 长文本必须 `break-words` 或 `overflow-wrap:anywhere`，否则中文会撑破容器。

---

## 4. 间距与圆角

- 间距只用 Tailwind spacing 刻度：`2/4/6/8/10/12/14/16/20/24/28/32/40/44/48`。
  **禁止** `3/5/7/9/18/34` 这类中间值，也禁止 `p-[18px]` 这种任意值——`ui:check` 判 error。
- **卡片内边距固定 24px**（移动端 16px），内容不得贴边；卡片内首行到边框 ≥16px。
- 页头到首个内容块 24px；卡片网格间隙 16px；卡片之间纵向 20px；分页行到上方 16px。
- 圆角只有 4 档：`rounded-sm`(4) `rounded-md`(6) `rounded-lg`(8) `rounded-xl`(12) `rounded-full`。
  **双尺度纪律**：控件用 `md`(6)，卡片用 `lg`(8)，同一屏不混用其他尺度。
  **禁止** `rounded-[12px]`、`rounded-[5px]`、`rounded-2xl`。
- 分层顺序：`border`（首选）→ 表面色差（`bg-background` 上的 `bg-card`）→ `shadow`（仅浮层）。
  禁止彩色阴影。

---

## 5. 响应式与可访问性

- 触摸目标 ≥ 36×36px；纯图标按钮最小 `size="icon-sm"`。
- 破坏性操作必须用 `variant="destructive"` + `AlertDialog` 确认。
- 状态语义走 `data-slot` / `aria-*`，不要靠颜色单独表达。
- 新页面必须在 320px 宽度下不产生页面级横向滚动（表格允许局部滚动）。

---

## 6. 历史遗留（样式已收敛，结构未清理）

2026-11-09 已把 47 处硬编码 hex 全部换成 `var(--*)`，字号/字重/圆角压到规范档位，
并删除 15 条 `.local-workbench` 死规则。以下属于**结构**遗留：

| 项 | 说明 |
|---|---|
| 127 处 `className="local-*"` | 样式已走 token，类名仍是历史命名，可逐步改 |
| `graphite-workspace` / `local-desktop` | **有效作用域**（63 处 CSS 引用），不是死 class；清理需连选择器一起改 |

`ui:check` 现有 5 条批准例外（`!important` 与 `[data-slot]` 布局覆盖），
每条都在 `scripts/check-ui-conventions.mjs` 的 `ALLOWED` 里写明理由。
**新增例外必须同样登记理由**，否则检查失败。

---

## 7. 提交前必须跑

```sh
npm run ui:check        # 代码是否遵守规范（error 会失败）
npm run ui:check:strict # 同上，warning 也算失败
npm run design:lint     # DESIGN.md 内部一致性
npm run typecheck -w @crm/web
```

`ui:check` 的 error 级规则：硬编码颜色、任意值颜色/字号/字重、直接调色板、字号/字重/圆角越界、
`!important`、`[data-slot]` 覆写。它不判断审美，也不能替代截图核对。
