# 前端底座选型：是否直接采用 shadcn-admin

> **决策更新（2026-11-08）**：本文结论（B 方案）已被否决，实际采用 **A 方案（整体引入上游）**。
> 执行计划见 `docs/FRONTEND-A-MIGRATION-PLAN.md`。本文保留作为数据底稿——§三~§五 的规模统计仍然有效，§三 关于路由的结论已在 A 方案文档中修正为"可解，只需 3 行改动"。

> 评估对象：`main@016a25f`，前端 `apps/web`
> 参照上游：`satnaing/shadcn-admin` `v2.2.1-77-ge16c87f`（本地 `/Users/kleene/projects/shadcn-admin`）
> 前序文档：`docs/DESKTOP-UI-REFACTOR-ASSESSMENT.md`（换壳已落地于 `95043c9`）
> 结论时间：2026-11-08

## 一、结论

**不建议把上游整体当作底座。建议继续"选择性 vendor + 先清死债"。**

理由一句话：上游 `src` 共 16,619 行，其中 **8,626 行（52%）是 demo 业务页和 Clerk 认证**，在桌面端必须整段删除。删完之后剩下的东西，和现在按需 vendor 进来的约 1.2k 行**是同一批资产**——只是多背了 15k 行的上游维护面，以及一套与桌面硬约束冲突的 web SPA 假设。

真正该做的是 P0/P1 两件事：删掉 207KB 死 CSS，再按需 vendor 上游确实缺的 4 个能力件。

## 二、"当底座"的三种含义

| 方案 | 做法 | 本质 |
|---|---|---|
| **A 整体 fork** | 克隆上游为仓库根，业务迁进去 | 接手一个 16.6k 行的 web SPA，改造成桌面应用 |
| **B 选择性 vendor** | 需要哪个组件复制哪个（现状） | 把上游当组件仓库 |
| **C 只迁约定** | 采用 `features/*`、文件路由、data-table 模式，不引代码 | 把上游当规范参考 |

用户问题对应的是 A。下面按 A 评估。

## 三、桌面端的五条硬约束

这五条决定了上游"能不能直接当底座"，不是风格问题，是可行性问题。

| # | 约束 | 证据 | 与上游的冲突 |
|---|---|---|---|
| 1 | 构建 `base:'./'` + 自定义协议 | `vite.desktop.config.ts`；`main.cjs:54` `protocol.handle('workbench')` | 上游 `vite.config.ts` **无 `base`**（默认 `'/'`）。`workbench://app/data` 会把 `./assets/x.js` 解析成 `workbench://app/data/assets/x.js` → 404。**path 路由不可用，必须 hash** |
| 2 | CSP `connect-src 'none'` | `main.cjs:60` | 上游 `lib/handle-server-error.ts` + 各 feature 走 axios 直连。整个网络层在桌面端是死代码 |
| 3 | 数据面只有 IPC | `preload.cjs` 冻结 82 个方法；`ipc-policy.cjs` 白名单校验 | 上游用 `useQuery` + HTTP + URL 状态。数据接入方式完全不同 |
| 4 | 无账号体系 | 本地单用户，`LocalShell` 只有"初始化并打开" | 上游 31 个路由文件里 20 个在 `_authenticated/` 和 `clerk/` 下，依赖 `@clerk/react` + `auth-store` |
| 5 | 单入口 `desktop.html` | `vite.desktop.config.ts` `rollupOptions.input` | 上游是 `index.html` + `main.tsx` |

> 补充：`@tanstack/react-router` 曾在 `949b378` 被引入，又在 4 小时后的 `e6b0dd4` 被移除，`src/desktop-routes/` 也已删除，只剩 `tsr.config.json` 死配置。说明这条路已经走过一次并回退了。

## 四、上游资产盘点：16,619 行里有多少能用

| 目录 | 行数 | 处置 | 说明 |
|---|---|---|---|
| `components/ui` | 3,129 | **可用** | 28 个 primitive，当前只有 14 个 |
| `components/data-table` | 708 | **可用** | 泛型表格 + URL 状态，当前完全没有 |
| `components/layout` | 934 | 部分 | `app-sidebar`/`nav-user` 依赖 `useAuth`，`nav-group`/`header`/`main` 可用 |
| `components` 顶层 | 1,759 | 部分 | `config-drawer` 362 / `command-menu` 91 / `theme-switch` 58 可用；`sign-out-dialog`、`profile-dropdown` 要重写 |
| `context` | 521 | 部分 | `theme`/`direction`/`font` 可用，`search` 依赖 command 数据 |
| `hooks` | 629 | 部分 | `use-mobile`/`use-dialog-state`/`use-table-url-state` 可用 |
| `lib` | 313 | 部分 | `utils`/`cookies` 可用，`handle-server-error` 依赖 axios |
| `stores` | 129 | **删** | `auth-store` |
| `routes` | 671 | **全删** | 31 个文件，20 个是 Clerk / demo 页 |
| `features` | 7,826 | **全删** | users 2,294 / tasks 1,778 / auth 1,108 / settings 1,098 / dashboard 649 / chats 482 / apps 287 / errors 130 |
| **合计** | **16,619** | | 必删 ≈ 8,626 行（52%） |

## 五、当前业务规模：迁移的分母

| 项 | 数量 |
|---|---|
| 路由 | 12 条，全写在 `desktop.tsx`（32 行） |
| 页面组件 | 30 个 `.tsx` / 592 行 |
| `features` 全部 TS/TSX | 1,132 行 |
| UI primitive | 14 个 / 1,926 行 |
| 业务 CSS | 12 个文件 / 35KB |
| 遗留 CSS | 5 个文件 / **207KB** / 2,798 行 |
| IPC 方法 | 82 个（UI 重写不受影响） |
| 构建产物 | CSS 305KB / JS 738KB |

**关键判断：业务 TSX 只有 592 行，重写它很便宜；贵的是 CSS。**

遗留 CSS 的实际状态：

| 文件 | 体积 | 当前 TSX 是否使用其类名 |
|---|---|---|
| `styles.css` | 55,771 B | 否（`ui-workspace`/`app-shell`/`app-topbar` 等 0 命中） |
| `design-system/foundation.css` | 76,769 B | **是**，但通过 `[data-slot=button/switch/badge]` 全局覆盖，非类名 |
| `features/work/simple.css` | 39,394 B | 否 |
| `features/work/mist.css` | 35,279 B | 否 |
| `features/work/ui-consistency.css` | 4,416 B | 否 |

四个大文件合计 207KB，其中 `:root` 前缀出现 493 + 85 + 31 + 34 次——这是为了压过 Tailwind utility 而打的**特异性战争**。`foundation.css` 仍在用 `[data-slot]` 把 shadcn 原语重新刷成 graphite 皮肤（44px 控件、8px 圆角、zinc 配色），这也是为什么换了 slate 主题但页面观感没变。

## 六、方案对比

| | **A 整体 fork** | **B 选择性 vendor + 清债**（推荐） | **C 只迁约定** |
|---|---|---|---|
| 引入代码 | 16.6k 行，删 8.6k | ~1.2k 行 | 0 |
| 业务迁移 | 30 文件 / 592 行 + 35KB CSS 重写 | 不动 | 不动 |
| 路由 | 12 条迁 TanStack + 自定义 `createHashHistory` | 不动（可另行拆路径） | 换文件路由 |
| 构建 | Vite 7→8、TS 5→6、ESLint 10、pnpm | 不动 | 不动 |
| 依赖 | +9 个（table/form/zod/recharts/cmdk/sonner/zustand/date-fns/day-picker），−axios | +3 个 | 0 |
| 工期 | 8–12 人日 | **3–5 人日** | 2–3 人日 |
| 视觉收益 | 高 | **相同** | 0 |
| 长期成本 | 每次上游发版重新解冲突 | diff 面 1.2k 行 | 低 |
| 可回退 | 难（大爆炸） | 每步独立 | 易 |

A 和 B 的**产出是一样的**：都能拿到 data-table、command palette、主题切换。差别只在你要不要连带接手那 15k 行用不到的上游代码。

## 七、如果坚持 A，成本明细

| 阶段 | 内容 | 人日 | 风险 |
|---|---|---|---|
| 1 | 剥 Clerk：删 `routes/clerk/*`、`routes/(auth)/*`、`_authenticated` 路由树、`auth-store`、`sign-out-dialog` | 1–2 | 中：删完等于重写路由树 |
| 2 | 删 8 个 demo feature（7,826 行） | 0.5 | 低 |
| 3 | 构建改造：`base:'./'`、`index.html`→`desktop.html`、`createHashHistory`、`routeTree` 生成 | 2–3 | **高**：TanStack Router 的资源路径与 `base` 交互是已知坑，曾试过并回退 |
| 4 | 依赖对齐：Vite 8 / TS 6 / ESLint 10 / pnpm 与 npm workspaces 并存 | 1–2 | **高**：会污染 lockfile，`desktop:build` 全链路要重验 |
| 5 | 12 条路由 + 30 个页面迁移 | 3–4 | 中 |
| 6 | 35KB 业务 CSS 改 tailwind | 2–3 | 中：`local-editor`/`local-panel` 等 27 个语义类要逐个换 |
| **合计** | | **9.5–14.5 人日** | |

注意第 3、4 两项：这不是"迁移成本"，是"一次性改造上游"的成本，且和上游后续版本永久分叉。

## 八、风险清单

1. **`base:'./'` 与文件路由互斥**。前序文档已判定 path 路由不可行，A 方案仍要面对同一约束，且 TanStack Router 的 `routeTree.gen.ts` 是构建期产物，改 `base` 需要额外验证。
2. **CSP 会让上游一半代码变成死代码**。`connect-src 'none'` 下 axios、`handle-server-error`、所有 `useQuery(fetch)` 都不可用，删起来比留着更麻烦（要判断哪些是数据、哪些是 UI 状态）。
3. **特异性战争会恶化**。现在 4 层 CSS 已在用 `:root` 前缀互相压制；引入 28 个 primitive 后，`foundation.css` 那 96 处 `[data-slot]` 覆盖会覆盖更多组件，观感反而更难收敛。
4. **版本前沿**。上游要求 Vite 8 / TS 6 / ESLint 10，本仓库是 Vite 7 / TS 5 / ESLint 未启用。要么升级全仓，要么把上游代码降级适配——两条都是净成本。
5. **`desktop:test:ui` 依赖 3 个导航 aria**（`主导航`、`移动导航`、`打开导航`），换壳时已知会挂，A 方案会再挂一次。
6. **pnpm vs npm workspaces**。上游 `pnpm-lock.yaml` + `pnpm-workspace.yaml`，本仓库 `package-lock.json` + npm workspaces。

## 九、建议路线

### P0 — 清死债（1–2 人日，收益最大）

1. 删除 `features/work/{simple,mist,ui-consistency}.css` 与 `styles.css`（207KB）。删前用 `desktop:test:ui` + 三档截图（1180 / 390 / 320）确认无回归。
2. 把 `design-system/foundation.css` 里仍在生效的 `[data-slot=button/switch/badge/input]` 覆盖，收敛成 `styles/theme.css` 里的 20–30 行 token，然后整份删除。
3. `desktop.tsx` 的 import 顺序随之简化：`styles/index.css` → `styles/desktop-bridge.css`，去掉 `graphite-workspace` 这个 539 条规则的 scoping 类。

验收：构建后 CSS 从 305KB 降到 **≤160KB**，页面观感向 slate 主题收敛。

### P1 — 按需 vendor 上游真正缺的 4 个能力（2–3 人日）

| 资产 | 行数 | 用途 |
|---|---|---|
| `components/data-table` | 708 | 采集归档 / 评论审核 / 回复记录三张表目前是手写 table |
| `components/command-menu` + `ui/command` | 91 + cmdk | ⌘K 跳转，13 个导航项已经够用 |
| `components/theme-switch` | 58 | 明暗切换 |
| `components/config-drawer` | 362 | 侧栏折叠 / 布局偏好持久化 |

做法与 `949b378` 一致：复制 + 改 import + 不引入上游 `routes`/`features`。合计约 1.2k 行。

### P2 — 拆 `?module=` 路径（可选）

`/work?module=archive`、`/auto-contact?view=pending` 这类同路径不同参数的写法，导致 `local-app-sidebar.tsx` 必须手写 `isActive()` 比较 query。拆成真路径更干净——**但这与换不换 TanStack 无关，`react-router-dom` 一样能做**。

### 不做

整体 fork 上游。

## 十、验收标准

| 项 | 当前 | 目标 |
|---|---|---|
| 构建后 CSS | 305KB | ≤160KB |
| 源 CSS 文件数 | 17 | ≤10 |
| 与上游逐字节一致的文件 | 4 | 4（保持） |
| `desktop:build` + `desktop:test:ui` | 绿 | 绿 |
| 新增上游代码 | — | ≤1.5k 行（P1） |

---

## 附：前序文档勘误

`docs/DESKTOP-UI-REFACTOR-ASSESSMENT.md:88` 称"`apps/desktop` 与 `desktop.html` 中不存在任何 CSP 声明，此风险不成立"。该结论已过期：`f6ad9ef`（2026-11-06）在 `main.cjs:60` 的 `protocol.handle` 响应头里加了 CSP。

不过结论方向仍然成立——React 的 `style={{}}` 走 DOM API（`element.style.setProperty`），不受 `style-src 'self'` 限制，只有文档源码里的内联 `style="..."` 属性会被拦。`sidebar.tsx` 的 3 处内联样式是 React 属性，不触发拦截。
