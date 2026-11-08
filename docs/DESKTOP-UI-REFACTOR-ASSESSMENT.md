# 桌面端 UI 重构方案评估

> 评估对象：`origin/desktop-local-sqlite`（`2ed1c47`）
> 参考实现：`migrate/shadcn-admin` 上已完成但**未提交**的网页版重构
> 结论时间：2026-11-08

## 一、先厘清一件事

桌面端**不使用** `main.tsx`。它的渲染入口是：

```
apps/desktop/src/main.cjs
  └─ loadURL('workbench://app/desktop.html')
       └─ desktop.html → src/desktop.tsx
            └─ createHashRouter → LocalShell → 35 个 Local* 页面
```

所以此前落在 `apps/web/src/main.tsx` + `features/*` 上的 shadcn-admin 重构，对桌面产品**零影响**。它没有被浪费——其中「外壳 + 主题 + 原语」那部分可以整体搬过来，但业务页路由搬不过来。

## 二、可复用性盘点

| 资产 | 结论 |
|---|---|
| `components/ui/` 下 29 个原语 | **已同版本存在**，无需复制 |
| `components/ui/{sidebar,command,dialog,dropdown-menu,popover,scroll-area,sonner}` | 直接复制（7 个新文件） |
| `context/{theme,layout,search,direction,font}-provider.tsx`、`hooks/{use-mobile,use-dialog-state}`、`lib/{cookies,utils}` | 直接复制（桌面版目前没有这两个目录） |
| `styles/{index,theme}.css` | 直接复制 |
| `components/layout/{app-title,nav-group,header,main,types}` | 复制后改 import |
| `components/layout/{app-sidebar,nav-user}`、`command-menu.tsx` | **不可直接用**，依赖 `useAuth` / HTTP 未读数 |
| `features/work/draft-guard.tsx`（TanStack `useBlocker` 版） | 整份替换桌面版同名文件（API 完全不同） |
| `lib/session.ts`、`features/auth/*`、`routes/_authenticated/*` | **不可复用**，桌面版无账号体系 |

## 三、桌面版必须保留的三样

1. `LocalShell` 的首次使用流程：`isPending` / `!data` / `!initialized` 三态 + 「初始化并打开」按钮。
2. 「本地存储」标识（现在是 `.local-storage-mark`）。
3. `/data` 数据与恢复页——`scripts/desktop/test-ui.cjs` 直接断言 `.local-archive`。

## 四、路由组织

现在用 `?module=` / `?tab=` / `?view=` 分栏。模板的 `checkIsActive` 只比较 `pathname`，同路径不同查询参数会**同时高亮**，所以必须拆路径：

```
/work                 LocalOverview
/work/archive         LocalHistory tab="runs"      (原 ?module=archive)
/work/notices         LocalNotices                 (原 ?module=notices)
/work/accounts        LocalAccountPage             (原 ?module=accounts)
/home                 redirect → /work
/automation           LocalTaskPage
/configuration        redirect → /configuration/keywords
/configuration/$tab   LocalConfigurations          keywords|matching|templates|dm-templates|model
/comment-review       LocalHistory tab="reviews"
/reply-history        LocalReplyHistory
/inbox                LocalInboxPage
/auto-contact         LocalAutomation
/auto-contact/pending LocalPending
/platforms            LocalCapabilities
/data                 LocalDataPage
*                     redirect → /work
```

`/automation` 的 `stage` 暂不拆路径（页内步骤，组合太多）。

## 五、Router 选型：TanStack + `createHashHistory`

**不能改成 path 路由**：`vite.desktop.config.ts` 里 `base:'./'`，刷新 `/data` 时 HTML 里的 `./assets/index-*.js` 会解析成 `workbench://app/data/assets/...`，`protocol.handle` 找不到文件。

若坚持 path 路由，必须同时把 `base` 改成 `'/'` 并重写 `protocol.handle` 的回退逻辑——不值得。

Hash 下 URL 是 `workbench://app/desktop.html#/data`，不触发 `will-navigate`，也不需要改安全策略。

## 六、施工顺序

| # | 内容 | 风险 | 验收 |
|---|---|---|---|
| 0 | 复制 7 个原语 + `context/*` + `hooks/*` + `styles/*`；补依赖 `@tanstack/react-router`、`@tanstack/router-plugin`、`@tanstack/router-cli`、`cmdk`、`sonner`、`tw-animate-css`（先与 `react-router-dom` 并存） | 低 | `typecheck` + `desktop:build` |
| 1 | **换壳**：`local-shell.tsx` → `SidebarProvider + Sidebar + SidebarInset`，保留三态与 `<div className="local-desktop">` 包裹层 | 中 | `desktop:test:ui` + 1180/390/320 三档截图 |
| 2 | 主题 / 明暗 / ⌘K / 侧栏折叠持久化 | 中 | 重启 Electron 后状态保留 |
| 3 | 路由换 TanStack + 路径拆分（11 个文件改 import + 替换 `draft-guard.tsx`） | 中高 | `test:workbench` + 旧 URL 重定向断言 |
| 4 | 12 个页面逐页视觉重写 | 中 | 每页跑 `desktop:test:ui` |
| 5 | 清理 `foundation.css` / `local-shell.css` / `local-workbench.css` / `react-router-dom` | 低 | 全绿 |

## 七、两个必须提前处理的坑

1. **`design-system/foundation.css` 会覆盖新主题**。`desktop.tsx` 最后 import 它，其开头有 `:root{--background:#fff;--primary:#18181b}` 和 `body{font-size:14px}`，会压掉 `styles/theme.css` 的 slate 主题。做法：复制成 `styles/legacy-graphite.css`，删掉开头的 `:root{}` 和 `body{}` 两段，改为在 `styles/index.css` **之前** import。
2. **`scripts/desktop/test-ui.cjs` 依赖 3 个导航 aria**：`getByRole('navigation',{name:'主导航'})`、`{name:'移动导航'}`、`button[name='打开导航']`。shadcn 的 `SidebarTrigger` 默认 sr-only 文案是「切换侧边栏」，需要在新壳上显式加 `aria-label` 或同步改测试。

> **更正**：初版评估称 `main.cjs` 有 CSP `style-src 'self'` 会拦掉 Sidebar 的内联 `--sidebar-width`。已核实 `apps/desktop` 与 `desktop.html` 中**不存在任何 CSP 声明**，此风险不成立。

## 八、测试影响面

- `apps/desktop/test/*.test.cjs`（9 个）：不碰渲染层，**零影响**。
- `tests/local/*.test.cjs`（26 个）：纯 SQLite/runtime，**零影响**。
- 唯一会挂的是 `scripts/desktop/test-ui.cjs`（`desktop:test:ui`），原因见上。

## 九、如果只做一件事

**只换壳，不换路由、不改页面。**

新建 `components/layout/local-app-sidebar.tsx`，把 `local-shell.tsx` 的 `DesktopNavigation()` 和 `graphite-*` 外壳换掉，`SidebarInset` 内保留 `<div className="local-desktop"><main id="workspace-main"><Outlet/></main></div>`，同时把 `desktop.tsx` 的 `./styles.css` 换成 `styles/index.css`、删掉 `foundation.css` 的 `:root/body` 两段。

约 1–2 人日，拿到 80% 视觉收益（slate 主题、可折叠侧栏、移动端 Sheet、分组导航），`createHashRouter`、10 条路由、12 个页面、26 个 runtime 测试全不动。路由换 TanStack 是纯技术债，排在视觉收益之后。
