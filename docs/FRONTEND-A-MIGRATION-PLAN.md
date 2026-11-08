# A 方案施工计划：整体采用 shadcn-admin 作底座

> **执行状态（2026-11-08）**：P0–P5 已完成，分支 `feat/frontend-upstream-base`。
> `desktop:build` 绿，`scripts/desktop/test-ui.cjs` 端到端全绿（含 390/320 与重启持久化）。
> 构建 CSS **305KB → 91KB**（源样式 17 个文件 242KB → 11 个文件 29KB）。
> 落地差异：P4a 未按原文拆分目录，改由 `lib/router-compat.tsx` 兼容层迁移路由，页面逻辑零改动；
> `?tab=` 未拆成路径；页面仍用 `local-*` 语义类，但样式已收敛到 6 个 feature 级文件并全部走主题变量。

> 决策：2026-11-08，采用 A 方案（整体引入上游代码），保留 Clerk 脚手架，删除 demo feature。
> 参照：`satnaing/shadcn-admin` `v2.2.1-77-ge16c87f`
> 前序：`docs/FRONTEND-BASE-EVALUATION.md`（B 方案评估，已被本决策覆盖）
> 对象：`main@016a25f`

## 一、路由问题：精确诊断（已复现，非推测）

### 1.1 先说结论

**不是"资源找不到"这么笼统。是两个独立的 bug，而且都能修，修完 path 路由完全可行。**

之前 `docs/DESKTOP-UI-REFACTOR-ASSESSMENT.md:66` 的结论是"不能改成 path 路由，不值得"。实测下来这个结论**过重了**：它只对了一半——相对 `base` 在嵌套路径下确实会坏，但改成绝对 `base` 后只剩一个 3 字符的边界判断问题。

### 1.2 实测数据

把 `main.cjs:54-61` 的 `protocol.handle` 逐字复刻成脚本，对两套产物分别喂不同文档路径，看资源请求实际命中什么文件：

```
### dist-desktop  —— 相对 (base:./)  js="./assets/desktop-Drcl0Ic5.js"
  文档 /desktop.html      → HTML:desktop.html  请求 /assets/desktop-Drcl0Ic5.js    → assets/…js [text/javascript] ✅
  文档 /                  → HTTP 403  ❌ 直接白屏
  文档 /work              → HTML:desktop.html  请求 /assets/desktop-Drcl0Ic5.js    → assets/…js [text/javascript] ✅
  文档 /work/archive      → HTML:desktop.html  请求 /work/assets/…js               → desktop.html [text/html] ❌
  文档 /settings/account  → HTML:desktop.html  请求 /settings/assets/…js           → desktop.html [text/html] ❌

### dist-base-root —— 绝对 (base:/)  js="/assets/desktop-Drcl0Ic5.js"
  文档 /desktop.html      → HTML:desktop.html  请求 /assets/desktop-Drcl0Ic5.js    → assets/…js [text/javascript] ✅
  文档 /                  → HTTP 403  ❌ 直接白屏
  文档 /work              → HTML:desktop.html  请求 /assets/desktop-Drcl0Ic5.js    → assets/…js [text/javascript] ✅
  文档 /work/archive      → HTML:desktop.html  请求 /assets/desktop-Drcl0Ic5.js    → assets/…js [text/javascript] ✅
  文档 /settings/account  → HTML:desktop.html  请求 /assets/desktop-Drcl0Ic5.js    → assets/…js [text/javascript] ✅
```

### 1.3 根因一：相对 base 按"文档 URL 的目录"解析

`base:'./'` 产出 `<script src="./assets/desktop-Drcl0Ic5.js">`。这个 `./` 是相对于**当前文档 URL 的目录**，不是相对于站点根：

| 文档 URL | `./assets/x.js` 解析成 |
|---|---|
| `workbench://app/desktop.html` | `workbench://app/assets/x.js` ✅ |
| `workbench://app/work` | `workbench://app/assets/x.js` ✅（`/work` 视为文件，目录是 `/`） |
| `workbench://app/work/archive` | `workbench://app/work/assets/x.js` ❌ |
| `workbench://app/settings/account` | `workbench://app/settings/assets/x.js` ❌ |

所以**只有一级路径侥幸能用，二级及以上必坏**。这就是"看起来偶尔没事"的原因。

坏的方式不是 404，而是：协议处理器有 SPA 回退（`main.cjs:58`，找不到文件就返回 `desktop.html`），于是 `.js` 请求拿到了 `text/html` 响应。模块脚本遇到 MIME 不符会**静默拒绝执行**——表现是纯白屏，控制台只有一行 `Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of "text/html"`。这比 404 更难排查。

**修法**：`vite.desktop.config.ts` 的 `base:'./'` 改成 `base:'/'`。产出的引用变成 `/assets/…`，从站点根解析，任意深度都对。

### 1.4 根因二：协议处理器把根路径判成越界

```js
// main.cjs:57
const target = path.resolve(web, '.' + rel);
if (!target.startsWith(web + path.sep)) return new Response('', { status: 403 });
```

当 `rel === '/'` 时，`path.resolve(web, './')` 恰好等于 `web`（结尾没有分隔符），于是 `target.startsWith(web + path.sep)` 为 `false` → **403**。

这就是为什么现在必须写 `loadURL('workbench://app/desktop.html')` 而不能写 `workbench://app/`。path 路由要求首屏落在 `/`，所以这一行必须修。

**修法**（3 个字符级别）：

```js
if (target !== web && !target.startsWith(web + path.sep)) return new Response('', { status: 403 });
```

### 1.5 修复后的完整改动

| 文件 | 现在 | 改成 |
|---|---|---|
| `apps/web/vite.desktop.config.ts` | `base:'./'` | `base:'/'` |
| `apps/desktop/src/main.cjs:57` | `if(!target.startsWith(web+path.sep))` | `if(target!==web&&!target.startsWith(web+path.sep))` |
| `apps/desktop/src/main.cjs:95` | `loadURL('workbench://app/desktop.html')` | `loadURL('workbench://app/')` |

SPA 回退（`main.cjs:58`）已经天然满足 history 路由的需求：任何未知路径都返回 `desktop.html`，这正是 `createBrowserHistory` 要的行为。

### 1.6 那为什么当初用了 hash？

因为 hash 让上面两个问题都不存在，**不是唯一解，是省事的解**。上游 TanStack Router 默认 `createBrowserHistory`，走 path 更贴合上游代码；如果想少改动，也可以继续 `createHashHistory`（TanStack 支持），但那样上游的 `Link`、`useSearch` 写法都要跟着改，得不偿失。

**建议：改 path，改 3 行。**

## 二、Clerk 的真实情况（和你预期不同）

### 2.1 上游的 Clerk 只是可选 demo，不是核心认证

- 核心认证是 `src/stores/auth-store.ts`：zustand + cookie，token 是**硬编码的** `'thisisjustarandomstring'`。
- Clerk 只挂在 `src/routes/clerk/route.tsx` 这一棵**独立路由树**（`/clerk/*`，6 个文件），且只有在 `VITE_CLERK_PUBLISHABLE_KEY` 存在时才渲染，否则显示"缺少公钥"提示页。

所以"保留"和"删除"的成本都很低：留着只是 6 个文件 + 1 个依赖；删掉也不影响任何业务代码（清单见 §2.7）。本计划选择**删除**，等真要接认证时再用 `@clerk/electron` 重新引入。

### 2.2 桌面端不能直接搬上游的 `@clerk/react`，要用官方 Electron SDK

Clerk 有官方 Electron SDK（**Beta**，`@clerk/electron@0.1.10`），架构与本项目高度契合：

| 维度 | `@clerk/react`（上游用的） | `@clerk/electron`（该用的） |
|---|---|---|
| 会话载体 | 浏览器 Cookie（FAPI 域） | **token + `electron-store@8` + `safeStorage` 加密** |
| 主进程参与 | 无 | `createClerkBridge()` 注册 IPC + 令牌存储 |
| 自定义协议 | 不可用 | OAuth 深链用（`my-app://`） |
| 适配 `workbench://` | 需自行验证 Cookie/CORS | 不依赖 Cookie，天然规避 |

也就是说，**它不靠 Cookie，靠 token**——这正好绕开了我上一版评估里"自定义协议 Cookie 未验证"的顾虑。

官方前置条件与本项目现状：

| 要求 | 本项目 | 结论 |
|---|---|---|
| Electron ≥ 28 | 45.2.3 | ✅ |
| `contextIsolation: true` | `main.cjs:62` 已是 | ✅ |
| React `~19.2.3` | 19.2.0 | ⚠️ 需升到 19.2.5 |
| Node ≥ 20.9 | 22.22.2 | ✅ |
| 打包 macOS 需代码签名 | 未配置 | ⚠️ 否则 token 持久化失效 |

### 2.3 需要改的 6 处

| # | 位置 | 改动 |
|---|---|---|
| 1 | `apps/web/package.json` | 加 `@clerk/electron@0.1.10`、`electron-store@8.2.x`（SDK 锁定 v8，不能升） |
| 2 | `main.cjs` | `createClerkBridge({ storage: storage() })`，**必须在 `app.whenReady()` 之前**；退出时 `clerk.cleanup()` |
| 3 | `preload.cjs` | 加一行 `exposeClerkBridge()`，与现有 `localWorkbench` 白名单并存 |
| 4 | `main.cjs:60` | CSP 放宽（见 §2.4），这是最大代价 |
| 5 | `main.cjs:63` | 补 `will-redirect` 守卫（现在只有 `will-navigate`）；Clerk 文档明确要求三处守卫齐全 |
| 6 | Clerk Dashboard | `allowed_origins` 加入 `workbench://app`（PATCH `/v1/instance`，**会覆盖整个列表**） |

### 2.4 CSP 放宽的具体幅度

当前策略（`main.cjs:60`）：

```
default-src 'none'; script-src 'self'; style-src 'self';
img-src 'self' data:; font-src 'self'; connect-src 'none';
base-uri 'none'; frame-src 'none'; form-action 'none'
```

接 Clerk 后需要（生产形态，去掉 dev-only 项）：

```
default-src 'none';
script-src  'self' https://<fapi-host> https://challenges.cloudflare.com https://*.protect.clerk.com;
style-src   'self' 'unsafe-inline';          ← Clerk 运行时注入样式
img-src     'self' data: https://img.clerk.com;
font-src    'self' data:;
connect-src https://<fapi-host> https://*.protect.clerk.com
            https://clerk-telemetry.com https://*.clerk-telemetry.com;
worker-src  'self' blob:;                    ← 新增，默认被 default-src 'none' 挡死
frame-src   https://challenges.cloudflare.com https://*.protect.clerk.com;
base-uri 'none'; form-action 'none'
```

三处实质性削弱，需要你确认接受：

1. **`connect-src` 从 `'none'` 变成白名单** —— 原本"渲染层被攻破也发不出数据"的保证，变成"只能发到 Clerk 及其防护域"。
2. **`style-src` 加 `'unsafe-inline'`** —— Clerk 组件靠注入样式，无法避免。
3. **`frame-src` 从 `'none'` 打开** —— CAPTCHA 走 Cloudflare iframe。

### 2.5 两个尚未验证的阻塞点

| 阻塞点 | 风险 | 验证方式 |
|---|---|---|
| `workbench://app` 能否进 Clerk 的 `allowed_origins` | **高**。`workbench:` 是非特殊 scheme，`new URL('workbench://app').origin` 返回 `'null'`，Clerk 侧是否接受该字符串未知 | 0.5 人日 spike：建测试实例 → PATCH allowlist → 加载 `<SignInButton mode="modal">` → 看 FAPI 是否 403 |
| macOS 打包后 `safeStorage` 持久化 | 中。无代码签名时 token 每次重启丢失 | 打包后重启两次，看是否保持登录 |

如果第 1 条失败，退路是**把渲染层从 `workbench://` 换成 `http://127.0.0.1:<随机端口>`**：协议处理器的 SPA 回退逻辑可以原样改成本地 HTTP server，origin 变成标准 `http://`，Clerk 全部能力可用。代价是引入一个本地监听端口（需绑定 127.0.0.1 + 启动令牌校验），并且要重做 §1 的路由修复（其实更简单，`base:'/'` 天然成立）。

### 2.6 与产品定位的冲突（需要你拍板）

现在 `LocalShell` 的首次使用文案是：

> 初始化本机工作台，无需创建工作台账号。小红书账号另行扫码登录。

并且 `LocalStatus.loginRequired` 在类型上是**字面量 `false`**（`local-api.ts:5`），`service.cjs:43` 硬编码返回 `false`。加登录意味着：

- 契约变更：`loginRequired: false` → `boolean`
- 门禁顺序变更：`status` → **`login`** → `initialized` → 工作台
- 文案改写

这属于产品决策，不是技术决策。

### 2.7 P1 引入上游时的处置：删 Clerk，留登录页

当前 `main` 上**不存在任何 Clerk 代码或依赖**（`package.json` 无 `@clerk/*`，`node_modules` 无 `@clerk/`）。所以"删除 Clerk"这个动作发生在 **P1 引入上游的那一刻**——决定带不带。

**建议不带。** 删除清单（共 8 个文件 + 3 条导航 + 1 个依赖）：

| 目标 | 内容 |
|---|---|
| `routes/clerk/**` | 6 个文件（`route.tsx`、`(auth)/{route,sign-in,sign-up}.tsx`、`_authenticated/{route,user-management}.tsx`） |
| `assets/clerk-logo.tsx`、`assets/clerk-full-logo.tsx` | 2 个文件 |
| `components/layout/data/sidebar-data.ts` | 3 条导航（`/clerk/sign-in`、`/clerk/sign-up`、`/clerk/user-management`） |
| `package.json` | `@clerk/react` |
| `routeTree.gen.ts` | 重新生成即可，不用手改 |

**已实测（2026-11-08）**：在 `/tmp` 副本上执行上述删除后——

- 删除规模：**8 个文件 / 464 行**（`routes/clerk/*` 400 行 + 两个 logo 组件 64 行）
- 路由文件：31 → **25**
- `npx vite build` ✅ 通过（`routeTree.gen.ts` 由插件自动重生成，clerk 引用 0 残留）
- `npx tsc -b` ✅ 退出码 0
- 产物无 clerk 分包
- `/sign-in`、`/sign-in-2`、`/sign-up`、`/forgot-password`、`/otp` 五条登录页路由**全部保留**

结论：Clerk 是一块可以整块摘掉的独立子树，摘掉不影响任何其他代码。

**但不要删登录页。** `routes/(auth)/*`（5 个文件：`sign-in`、`sign-up`、`forgot-password`、`otp`、`sign-in-2`）和 `features/auth/*`（1,108 行）**完全不依赖 Clerk**，用的是 zustand + zod + react-hook-form 的本地假认证。这是现成的登录页骨架，后续换真认证只需替换提交逻辑，比重写快得多。

同时把门禁钩子留住（这部分不会被后续推翻）：

1. `LocalStatus.loginRequired` 从字面量 `false` 改成 `boolean`（`local-api.ts:5`）
2. `service.cjs:43` 返回真实值（现在恒 `false`）
3. `LocalShell` 状态机加一档：`status` → **`login`** → `initialized` → 工作台

### 2.8 为什么"以后再引入"成本很低

`@clerk/electron` 是三段式独立接入（main / preload / renderer），**不侵入业务代码**：

- main 加 `createClerkBridge()`
- preload 加 `exposeClerkBridge()`
- renderer 把 `<ClerkProvider>` 包在根部，登录页换成 `<SignInButton mode="modal">`

业务页面一行都不用改——它们只读 `loginRequired` 和一个 `userId`。

**但有两样东西"删了容易、加回来贵"，要提前想清楚：**

| 项 | 现状 | 说明 |
|---|---|---|
| **CSP** | `connect-src 'none'` | 这是当前最强的安全边界。**不要为了"以后可能接"提前放宽**——接入时一次性放宽，随时可回滚 |
| **macOS 代码签名** | 未配置 | `safeStorage` 的 token 持久化依赖签名。这是发布配置不是代码，接入那天会卡在这里 |

### 2.9 建议的落地顺序

Clerk 与 A 方案正交，但**现在接会在 P1–P2 重写一遍**。三个选项：

| 选项 | 做法 | 工期 | 适合 |
|---|---|---|---|
| **甲** | 等 P2 路由迁完再接真 Clerk | 1–2 人日（含 spike） | 想一次做对 |
| **乙** | 现在先做"登录门禁壳"：`loginRequired` 改成 `boolean`，加一个占位登录页，不接 Clerk | 0.5 人日 | 想立刻看到首次启动登录流程 |
| **丙** | 现在接真 Clerk | 2–3 人日 | 有 Clerk 账号且不介意重写一次 |

推荐 **乙 → 甲**：先用 0.5 人日把门禁位置、状态机、文案定下来（这部分不会被 A 方案推翻），等 P2 完成后再把占位换成 `@clerk/electron`。

## 三、依赖对齐：只加运行时，不升级工具链

**关键建议：不要跟着上游升级 Vite 8 / TypeScript 6。**

本仓库是 npm workspaces，`typescript@5.9.3` 被 `apps/api`、`packages/contracts`、`runtime/*` 共用。升到 TS 6 会让整个 monorepo 的类型检查重新洗牌，跟前端重构无关，属于白白扩大爆炸半径。上游代码在 TS 5.9 下能跑——它没有用到 6.0 的新特性。

| 类别 | 处理 |
|---|---|
| **新增运行时** | `@tanstack/react-router`、`react-hook-form`、`@hookform/resolvers`、`zod`、`@tanstack/react-table`、`cmdk`、`sonner`、`zustand`、`date-fns`、`react-day-picker`、`input-otp`、`react-top-loading-bar`、`recharts`、`@clerk/react` |
| **不新增** | `axios`（CSP 下不可用，`handle-server-error.ts` 改写掉）、`@radix-ui/react-icons`（已有 lucide） |
| **升级** | `react` 19.2.0→19.2.5、`tailwindcss`/`@tailwindcss/vite` 4.1.17→4.2.2（都是补丁级） |
| **保持** | `vite` 7.3.7、`typescript` 5.9.3、`electron` 45.2.3 |
| **不引入** | 上游的 eslint 10 / prettier / knip / vitest browser 套件（与本仓库 `node --test` 体系冲突） |

### 一个必须先定的分叉点：Radix 包形态

- 本仓库用**单体包** `radix-ui@1.8.1`，写法 `import { Slot } from 'radix-ui'`
- 上游用 **17 个独立包**，写法 `import { Slot } from '@radix-ui/react-slot'`

两种混用能跑但会重复打包。既然要整体采用上游代码，**建议跟上游走独立包**，把现有 14 个 primitive 的 import 改掉（14 个文件，机械替换），然后移除 `radix-ui` 单体依赖。

## 四、分阶段施工

| 阶段 | 内容 | 改动面 | 工期 | 验收 |
|---|---|---|---|---|
| **P0 路由解耦** | `base:'/'` + 协议根路径判断 + `loadURL('/')`。此时仍是 hash 路由，行为不变 | 3 行 | 0.5 人日 | `desktop:build` + `desktop:test:ui` 全绿；手动刷新 `/work` 不白屏 |
| **P1 引入上游骨架** | 复制 `src/{components,context,hooks,lib,stores,styles,routes}`，删 `features/*`、**删 `routes/clerk` 与 `@clerk/react`**、保留 `routes/(auth)` 作登录页骨架、删 `routes/_authenticated/{users,tasks,chats,apps,settings,help-center}`；`main.tsx` 接管入口 | 约 52 文件 | 2 人日 | `typecheck` 过；空路由能启动；`desktop:test:ui` 暂挂（预期） |
| **P2 路由迁移** | 12 条业务路由按 §五 落到 `routes/_authenticated/*`；`createBrowserHistory`；旧 URL 重定向 | 12 文件 | 1.5 人日 | 12 条路由逐条可达，深链刷新不白屏 |
| **P3 桥接层** | `local-api.ts`（82 个 IPC 方法）移到 `src/lib/local-bridge.ts`，只改 import 路径；`use-local-*.ts` 8 个 hook 保留 | 9 文件 | 0.5 人日 | 概览页能取到真实数据 |
| **P4 页面迁移** | 30 个页面按 §五 映射表搬迁，`className` 从 `local-*` 换成 Tailwind + shadcn 原语 | 30 文件 / 592 行 | 4–6 人日 | 每页跑 `desktop:test:ui` |
| **P5 样式清理** | 删 `styles.css`(55KB) / `simple.css`(39KB) / `mist.css`(35KB) / `ui-consistency.css` / `foundation.css`(77KB)；只留 `styles/{index,theme}.css` | 5 文件 | 1 人日 | 构建 CSS ≤160KB |
| **P6 Clerk 接线** | 按 §二 放宽 CSP，验证自定义协议下的 session；不确定则走主进程认证 | 2 文件 + spike | 1–2 人日 | 登录态可持久化 |
| **P7 依赖收敛** | 移除 `radix-ui` 单体、`react-router-dom`、`tw-animate-css` 之外的旧依赖；`npm ls` 无重复 | — | 0.5 人日 | `npm ci` 干净 |

合计 **11–13.5 人日**。P0 可独立上线，P1 之后不可半途停（路由和入口是原子的）。

## 五、路由与文件映射

### 5.1 路由

| 现有 | 新路径 | 组件 |
|---|---|---|
| `/work` | `/work` | `features/workbench/overview.tsx` |
| `/work?module=archive` | `/work/archive` | `features/records/history.tsx` |
| `/work?module=notices` | `/work/notices` | `features/records/notices.tsx` |
| `/work?module=accounts` | `/work/accounts` | `features/workbench/accounts.tsx` |
| `/home` | 重定向 → `/work` | — |
| `/automation` | `/automation` | `features/automation/index.tsx` |
| `/configuration` | `/configuration/$tab` | `features/configuration/index.tsx` |
| `/comment-review` | `/comment-review` | `features/review/history.tsx` |
| `/reply-history` | `/reply-history` | `features/records/reply-history.tsx` |
| `/inbox` | `/inbox` | `features/inbox/index.tsx` |
| `/auto-contact` | `/auto-contact` | `features/contact/index.tsx` |
| `/auto-contact?view=pending` | `/auto-contact/pending` | `features/contact/pending.tsx` |
| `/platforms` | `/platforms` | `features/platform/index.tsx` |
| `/data` | `/data` | `features/data/index.tsx` |
| `*` | 重定向 → `/work` | — |

> `?module=` 拆成真路径同时解决一个现存缺陷：`local-app-sidebar.tsx:76` 的 `isActive()` 必须手写 query 比较，否则同路径不同参数会同时高亮。

### 5.2 文件

| 现有 | 去向 |
|---|---|
| `desktop.tsx` | 删除，逻辑并入 `main.tsx` |
| `features/local-workbench/local-api.ts` (14.6KB) | `lib/local-bridge.ts`，**代码不动**，只改 import |
| `features/local-workbench/use-local-*.ts`（8 个） | 随所属 feature 走，或统一 `features/*/hooks.ts` |
| `components/layout/local-app-sidebar.tsx` | 改为 `components/layout/app-sidebar.tsx`，复用上游 `NavGroup` |
| `features/local-workbench/local-shell.tsx` | 改为 `components/layout/authenticated-layout.tsx` 的本地变体，保留三态 |
| 其余 29 个 `local-*.tsx` | 按 §5.1 落到对应 `features/<domain>/` |
| `styles.css` / `simple.css` / `mist.css` / `ui-consistency.css` / `foundation.css` | 删除（P5） |
| `tsr.config.json` | 恢复启用，`routesDirectory: './src/routes'` |

## 六、风险与回滚

| 风险 | 概率 | 应对 |
|---|---|---|
| `base:'/'` 后旧 hash URL 失效（用户书签） | 低 | 桌面端无外部书签；加 `#/xxx` → `/xxx` 的一次性迁移 |
| TanStack Router 插件与 Vite 7 兼容性 | 中 | P1 先跑 `vite build` 验证；不兼容则降到 `@tanstack/router-plugin@1.9x` |
| 上游代码依赖 TS 6 语法 | 低 | `tsc --noEmit` 立刻暴露，逐处降级 |
| P4 页面迁移引入视觉回归 | 高 | 每页截图对比；`desktop:test:ui` 的 3 个 aria 断言同步改 |
| Clerk 在自定义协议下不可用 | 中 | 走主进程认证方案（§2.2） |
| 大爆炸式替换导致中途不可用 | 高 | P0 单独提交；P1–P2 在同一分支内完成后再合并 |

**回滚点**：P0 可单独 revert（3 行）；P1 之后建议在 `feat/frontend-upstream-base` 分支上做，`main` 保持可用直到 P5 完成。

## 七、先做的一件事

P0 只有 3 行，但它决定后面所有 path 路由能不能成立。建议先做 P0 并跑一遍 `desktop:test:ui`，确认：

1. 应用仍能启动（hash 路由在 `base:'/'` 下不受影响）
2. 手动改 `loadURL` 到 `workbench://app/` 后不再 403
3. 在 DevTools 里 `history.pushState({}, '', '/settings/account')` 后刷新，资源仍能加载

这三条过了，A 方案的路由风险就归零了。
