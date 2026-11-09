# UI 风格审计截图（2026-11-09）

用于回答「当前是什么风格」，不是验收证据。

## 采集方式

- Vite 开发服务 `npm run dev -w @crm/web`，入口 `http://127.0.0.1:5173/desktop.html`（`vite.desktop.config.ts` 的 input 是 `desktop.html`，不是 `index.html`）。
- Playwright + 本机 Chromium，视口 1440×900 / 390×844，DPR 2。
- 未登录、未连 API、未执行任何采集或发送。

## 文件

| 文件 | 内容 |
|---|---|
| `login-desktop-1440.png` | 登录页 `/sign-in` 桌面（改造前） |
| `login-mobile-390.png` | 登录页 `/sign-in` 移动（改造前） |
| `not-found-1440.png` | 根路径 404（改造前，英文） |
| `after-vercel-light-1440.png` | 登录页，vercel 口径落地后（浅色） |
| `after-vercel-dark-1440.png` | 登录页，vercel 口径落地后（暗色） |
| `after-404-zh-1440.png` | 404 页汉化后 |
| `spacing-replica-light-1440.png` | 工作台间距验证（浅色） |
| `spacing-replica-dark-1440.png` | 工作台间距验证（暗色） |

## spacing-replica 是什么

**不是真实应用截图。** 登录后的页面依赖 `window.localWorkbench` 桌面桥接，纯浏览器渲染不出来。
这两张是用**真实构建产物 CSS**（`dist-desktop/assets/desktop-*.css`）+ 与
`local-overview.tsx` / `local-record-pages.tsx` 相同的 DOM 结构和类名搭的静态页，
用来验证间距计算值，不能当作业务功能证据。

用它定位到的问题：`main.tsx` 的 CSS 导入顺序让 `@layer components` 被注册在 `theme`/`base` 之前，
导致 `workbench.css` 里 `.page-heading{margin-bottom:24px}` 与 `.page-heading h1{font-size:20px}`
全部被 Tailwind preflight 覆盖——实测页头外边距 0px、标题 16px/400。
修正导入顺序后为 24px、20px/600。


## 证据边界

- **登录后的业务页面没有渲染**：`WorkbenchShell` 依赖 `window.localWorkbench` 桌面桥接，纯浏览器下依次抛出
  `请从桌面应用打开本地工作台` → `Cannot read properties of null (reading 'ok')` → `["local","status"] data is undefined`。
  用 Proxy 桩接可继续往下推进，但要补的返回结构越来越多，不具代表性，已停止。
  业务页的视觉判断依据是：`theme.css` 的计算值、`components/ui/*` 的 CVA 定义、以及
  `docs/evidence/current-observation-2026-10-27/review-results-desktop.png`（上一版设计，仅作对照）。
- 截图里的 TanStack Router 角标是开发模式产物，打包后不出现。
