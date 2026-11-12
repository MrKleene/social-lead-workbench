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
> （记录见 `docs/design/ui-conformance-audit.md`）。不要重演。

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

## 6. 遗留方言已清除（棘轮守卫）

2026-11-09 把 47 处硬编码 hex 换成 `var(--*)`，字号/字重/圆角压到规范档位。
**2026-11-11 完成最后一步**：21 个页面文件从手写 CSS 迁到 Tailwind + `components/patterns`，
删掉 5 个全局样式表（`workbench.css` / `local-workbench.css` / `local-shell.css` /
`desktop-bridge.css` / `graphite-reply-history.css` 等），遗留类名 169 处 → **0 处**。

| 项 | 现状 |
|---|---|
| `className="local-*"` 等遗留类名 | **0 处**。`ui:check` 的 `legacy-class` 规则守着，白名单已清空 |
| `graphite-workspace` / `local-desktop` | 已从 `SidebarInset` 移除，对应 CSS 一并删除 |
| 全局样式表 | 只剩 `styles/index.css`（Tailwind 入口）与 `styles/theme.css`（token） |

### 6.1 外壳使用 shadcn-admin 源码（2026-11-11）

侧栏、顶栏、主题/布局配置**不再是本项目手写**，而是 shadcn-admin 的原样文件：

```
components/layout/{app-sidebar,header,top-nav,nav-group,nav-user,team-switcher,app-title,types}
components/{search,command-menu,theme-switch,config-drawer,profile-dropdown,skip-to-main}
context/{layout-provider,search-provider}  hooks/use-dialog-state  lib/cookies
components/ui/{command,scroll-area,avatar,radio-group,label,dialog}  assets/custom/icon-*
```

- 这些文件**和业务代码受同一套规范约束**，`ui:check` 不做任何豁免。上游写法不合规时
  **就地改掉**，并记录改动（见下）——例如 `search.tsx` 的 `text-[10px]` 已改成 `text-caption`。
- **同步上游时要重放这些改动**。目前已知的偏离上游之处只有一处：
  `components/search.tsx` 的 `⌘K` 键帽字号。其余文件仍是逐字节的上游代码。
- `components/layout/app-title.tsx` 已删除（零引用死代码，且硬编码了上游品牌名与英文
  `sr-only` 文案）。
- **不要改它们的样式**。要改外观改 `features/**` 和 `components/patterns/**`。
- 允许的接缝只有「内容」：中文文案、`layout/data/sidebar-data.ts` 的导航数据、
  去掉本机应用没有的菜单项（登录/登出/账单/通知）、`SidebarContent` 的 `aria-label='主导航'`。
- 同步上游：把上面这些文件从 shadcn-admin 重新 copy 覆盖，然后只重做「内容接缝」。

`ui:check` 现有 2 条批准例外（1 条 `!important`、1 条 `[data-slot]` 布局覆盖），
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

---

## 8. 工程目录与依赖约束

工程结构以 `docs/design/project-structure.md` 为准。

- `apps/*`、`packages/*` 必须是有 `package.json` 的工作区；跨包依赖必须显式声明并通过公开 `exports` 引用。
- `packages/domain` 只放业务规则，不依赖 Electron、数据库客户端、文件/网络 I/O 或平台 SDK。
- SQLite、队列和外部能力适配属于 `packages/local-runtime`；Electron 与系统装配属于 `apps/desktop`。
- 旧 PostgreSQL 模型与兼容工具只放 `packages/legacy-migration`，不得进入桌面运行时依赖图。
- 模块测试放在模块内；跨模块和端到端测试放在根 `tests/`。不跨包相对引用生产源码。
- 手写源码放 `src/`；编译产物、bundle、原生二进制放模块 `dist/`，不提交 Git。
- 目录调整必须同步构建脚本、测试、桌面装配白名单和文档，不能只移动文件。
- 工程结构修改运行 `npm run check`；桌面装配修改额外运行 `npm run desktop:stage` 和相关集成测试。
- 不把可跳过的原生测试或静态验证描述为目标平台完整验收。

---

## 9. 文案：只写状态与动作，不写解释

界面上只允许三类文字：

1. **操作标签**：按钮、菜单、页签、字段名。
2. **数据与状态**：值、计数、时间、状态词（已授权 / 待开始 / 失败 / 未选择关键词组）。
3. **授权句**：必须由用户确认才能继续的勾选项，且能对应到服务端 consent 常量。

**禁止解释性文案**：说明功能怎么运作、系统保证什么、费用怎么算、切换会不会丢、步骤会不会自动走、进度从哪来、为什么这么设计。

判据只有一条：**删掉这句话，用户还能不能完成操作？能，就删。**

已出现过的违规（不要重写）：

| 位置 | 违规文案 | 应该写成 |
|---|---|---|
| 采集设置弹窗 | 「采集、评论匹配与自动回复三组设置分别保存，切换页签不会丢改动」 | 删掉 |
| 模型配置 | 「项目价目版本：… 费用以供应商账单为准」 | 只留在付费授权页，不复制到别处 |
| 自动化任务 | 「步骤会随进度自动推进；点步骤可切换查看」 | 删掉 |
| 采集进度 | 「进度读取自本机运行记录，刷新页面不会中断本轮」 | 删掉 |
| 空状态 | 「先在采集设置里选好关键词组和采集账号，再开始第一轮」 | 「未选择关键词组」 |
| 授权之后 | 「本次有界采集已加入队列。步骤会随进度自动推进；离开页面不会中断本轮」 | 「已加入队列」 |

**唯一例外（仅此两类）**

- **付费 / 数据去向披露**：确有必要时只写在付费授权页，且不超过一行；不复制到弹窗或其他页面。
- **危险操作后果**：写在确认弹窗里，一条，不重复第二遍。

弹窗里的 `DialogDescription`、卡片里的 `description`、表单控件的 `hint` 都是解释文案的高发位置——除非它承载状态或授权，否则不要写。

---

## 10. 认知索引（AOCI）

改动 `apps/` `packages/` `integrations/` `scripts/` 下的文件后，交付前跑一次 `npm run aoci:sync`，
按返回的批次补条目；返回孤儿条目（文件已删）时一并裁决。纯文案、纯样式微调不需要。

`npm run aoci:check` 只读校验，不改索引。索引状态 `invalid` 时 `aoci_overview` 会如实标记不可靠，
不会拿旧认知冒充当前结构。

<!-- aoci:begin -->
## AOCI 仓库认知

AOCI 为本仓库维护一个稳定、可版本化、可增量更新的仓库级认知层，供模型跨任务复用对系统的理解。

`aoci.txt` 是面向模型的结构化认知索引。它以每个受管理文件、数据库表或其他受管理对象一条独立 Entry 的方式，用符号标签与 F/R/A/S 语义表达对象的核心职责、重要关系、对外契约，以及理解或修改系统时必须知道的非显然约束和设计决策。

Header、目录段和全部 Entry 共同组成完整仓库索引，可以覆盖前端、后端、配置、数据库结构及其他受管理内容。受管理内容发生变化时，通常只需维护受影响的认知条目，不需要重新生成整个索引。

AOCI 提供系统架构、对象职责、重要关系、对外契约和关键约束的高密度视图。

### 工作原理

AOCI 采用“模型生成、模型读取”的认知闭环。

Header、Entry 和 Curation 语义的创作只按当前机器签发的 Plan 与实时 Guide 执行；由 Host 模型基于当前绑定证据独立完成。

Entry 的语义必须来自模型对真实证据的理解。不得仅依据路径、文件名、扩展名、AST、符号列表、依赖扫描、正则、固定模板或规则引擎推导、预填、拼接或改写索引语义。

对 Fresh Bootstrap，只按当前机器签发的 Plan 和实时 Guide 执行。当它们要求创作时，Host 模型创作 Root、Meta、Tag 和 F/R/A/S，提供 authoring-run 声明，并把它绑定到 Plan、Evidence 与完整 Candidate。不得要求 AOCI 填写 `origin=host_model`、制造 Receipt 或把程序生成的 Framework 当作语义。本文件不自行重建 Onboarding 流程。内部批次不是用户决策；只有遇到既有批准边界或真实的安全、漂移、CAS、Recovery 条件才停止。

### 最小使用入口

- `aoci_rules`：取得当前AOCI版本的会话运行合同。
- `aoci_overview`：建立或恢复本仓库的完整认知。
- `aoci_maintain`：受管理对象达到最终稳定状态后检查认知是否需要维护。
- `aoci_update_entry`：提交与当前证据和源码摘要绑定的完整语义更新批次。
- `aoci_report`：仅当当前布局和工具状态支持时，在证据不足、无法可靠生成语义时登记待办，不猜写。

其他MCP工具、CLI命令、参数和专项流程，以当前工具说明、Guide和 `--help` 返回内容为准，不在本文件中重复完整手册。

本区块只规定仓库接入、认知使用和收尾原则。`aoci_rules` 承载当前会话合同，Guide实时输出承载当前Plan的执行顺序与停点，工具Schema、Spec和Validator承载机器结构与判据；Prompt、Description、README和静态文档不能覆盖这些机器事实。

### 建立、生成和恢复认知

1. 每个新的 Agent Run 开始时，应先判断：

   - 本仓库是否已经存在可用的完整AOCI索引；
   - 当前上下文中是否已有与本仓库根、当前索引版本和当前AOCI服务相匹配，并且模型仍可可靠使用的完整仓库认知。

2. 仓库已经存在可用的完整索引，但当前Run没有可靠完整认知时，先调用 `aoci_rules`，再调用 `aoci_overview`。

   完整认知仍可靠时直接复用。局部不确定本身不要求机械重读系统全貌。

   本Run从已知Host上下文压缩恢复时（包括宿主注入的压缩摘要），必须把此前模型认知视为不可靠。压缩handoff不得保留或摘要正式Whole-Index，也不得保留或摘要任何Overview Header、Entry、Chunk、Challenge或Attestation正文；只能保留安全续接所需的receipt身份、未完成write或Recovery状态，以及立即重载指令。复制进handoff的Whole-Index语义或receipt不能证明恢复后模型的当前认知可靠。若当前上下文已无法可靠保留运行合同，先调用 `aoci_rules`。继续业务任务前，使用 `refresh_reasons=["context_compaction"]` 和新的 `refresh_event_id` 调用普通完整Whole-Index `aoci_overview`（不设置 `check_only` 或设为false）；不得使用 `check_only` 或认知probe。原样跟随每个 `next_cursor` 直到 `completed=true`，确认交付，并且只基于新交付正文提交一次Attestation。完成这次新的完整传输后，即使Attestation为partial或fail也消费该generation，并按既有合同继续source-bound任务，不再自动调用第二次Overview。

   AOCI可以针对 `context_compaction`、项目 `cognition_refresh_threshold` 下的机器 `semantic_threshold` 或主要 `phase_transition` 提供checkpoint与认知状态事实。只需要这些紧凑事实时使用 `check_only=true`；这些事实只向Agent提供建议，不替模型决定是否需要系统全貌。

   Agent显式调用普通 `aoci_overview`（未设置 `check_only` 或为false）时，只要能形成一致的CognitionSet，AOCI必须完整交付请求scope。不得因为已有receipt、阈值未达到或没有待处理刷新原因而抑制正文。正式认知Dirty或Stale时仍交付正文，但必须标记不可靠。存在未决恢复或无法形成一致snapshot时失败关闭，不返回混合正文。

   普通Overview返回 `continuation_required=true` 时，必须原样提交 `next_cursor` 并自动继续到 `completed=true`。不得询问用户、开始业务任务或给出阶段性系统结论。Host截断、缺块、重复、乱序、cursor失败、Index变化或`chunk_tokens`变化时停止本次认知链。Attestation完成前不得用Memory、源码、Spec、`aoci.txt`、历史会话、scope、search或Entry读取修补或补充Whole-Index认知。Challenge ordinal是正式Entry序列中的1-based位置；Header内容、注释、空行、Section/Overview/Chunk Marker、Receipt与Metadata均不计数，Chunk Receipt ordinal使用同一序列。Attestation必须原样回绑本次Challenge发布的当前`index_sha256`、`entry_sequence_sha256`与`entry_count`；旧Index、旧Entry序列、旧数量或旧Attestation均无效。完整链结束后只正式提交一次既有模型认知Attestation；同一响应只允许一次不改变语义答案的JSON Schema或字段格式修正。对象、Tag或F不匹配即失败且认知吸收不确定，不得语义重试或旁路补答。首次认知失败时还不得执行Root/Meta、Migration、全局布局或其他未重新绑定的系统级决策。上下文压缩刷新若传输完整、认知身份不变、治理对齐且没有Recovery或第三方冲突，即使Attestation为partial或fail也消耗该refresh generation，并继续原任务，不再自动重读Overview。`system_mastery_percent`只自评系统框架——架构、职责、强关系、稳定外部契约以及高熵安全和维护约束——不表示完整实现或运行实况知识；机器索引覆盖率必须分开。默认只向用户输出由本次真实覆盖率、Challenge、块数、Token和掌握度生成的规定成功或失败一句话。Host截断时提示用户把 `overview_delivery.chunk_tokens` 设置为更小的合法值后重新开始，不得自动修改。

   加法认知等级必须与严格证明字段分开解释。`delivery_verified`表示已加载Index且Host交付已确认，但完整认知验证仍未完成；应表达为“已加载且交付已验证”，不得描述为“没有认知”或“没有理解系统”。`cognition_verified`要求Attestation通过（Challenge至少80%的ordinal完全正确且对象身份至多失手一处），`cognition_governed`还要求治理对齐。通用完整读取失败句只用于真实交付故障。

   当Overview响应包含可选`cognition-state/v2`投影时，必须分别解释各维度。其Level止于`model_cognition_usable`；`strict_attestation_verified`、`governance_aligned`与`current_system_cognition_reliable`都是独立状态，绝不参与该Level。ordinal、对象身份、Tag或核心F不匹配可以导致严格Attestation失败，而模型认知仍然可用；不得仅凭这种不匹配就宣称模型没有理解系统。只有`current_system_cognition_reliable=true`允许无保留地声称当前完整系统认知可靠。投影缺失时继续使用上述Legacy解释。

   普通的只读审计、分析、检查、不修改代码或不提交、不push，不自动等于严格零写入，也不改变上述认知有效性判断。Codex Memory和历史Skill只能辅助恢复经验、用户偏好与调查方向，不能替代与当前仓库根、索引摘要、AOCI服务身份和认知范围匹配的当前认知收据；项目AGENTS和当前AOCI身份在AOCI状态上优先于历史Memory。

   只有用户明确禁止Ledger、元数据、`.aoci`运行资产及任何文件写入时，才按严格零写入处理。若必要的认知建立与该边界冲突，必须报告冲突并请求用户裁决或建议使用隔离副本，不得静默以Memory替代当前仓库认知。

3. 仓库没有可用的完整索引，或当前只有最小骨架、Header不完整、Entries未完成、必要Curation尚未裁决时，如果需要建立正式完整AOCI索引，先取得 `aoci_rules`，然后进入当前AOCI Guide。由Guide依据仓库真实状态决定下一阶段并完成必要安全步骤。

   `aoci_maintain` 不替代索引建立流程。

   不在本文件中自行重建或硬编码完整索引生成状态机。

4. 在长程任务中，模型负责保留当前认知收据并正确使用刷新门禁：

   - Host报告上下文压缩或模型已知系统全貌丢失时，执行上述强制 `context_compaction` 重载规则；AOCI不能自行推断Host事件；
   - 进入真正的主要阶段时声明 `phase_transition`，不得把函数、测试运行或小步骤当作阶段；
   - 在有用的稳定检查点通过 `check_only=true` 取得机器语义计数；
   - 除已知压缩的强制重载外，由Agent判断当前任务是否需要再次显式获取指定scope或完整Overview；
   - 在维护和对齐完成前，保留AOCI报告的Dirty或Stale可靠性状态。

### 任务收尾与认知维护

5. 纯只读问答、分析、版本核验，或没有产生受AOCI管理对象变化的任务，不需要调用维护工具。当前AOCI版本是任意`aoci_overview` check_only或`aoci_maintain`响应里的`cognition_receipt.mcp_service_version`；二进制路径是项目`.mcp.json`里的`command`，CLI不必在PATH上。

6. 发生受AOCI管理对象变化时，待其达到本次任务的最终稳定状态后，只调用一次 `aoci_maintain`。不要在每次中间修改后逐文件维护。

7. 若维护结果返回真实语义候选，Host 模型必须基于每个候选绑定的对象和必要证据，独立创作完整标签与F/R/A/S更新。通过 `aoci_update_entry` 一次提交当前机器签发批次的完整候选集合，同时原样保留每项 `source_sha256`、`candidate_id` 与对应domain批次身份。`max_entries`只限制单次请求和原子事务，不限制logical plan、Whole-Index或Managed Scope。`remaining`非零时，在当前批次成功Apply后重新调用Maintain并从新preimage继续；绝不能为满足transport上限缩减Index覆盖或自行截取返回批次。

   没有足够证据且当前布局支持 `aoci_report` 时，使用它而不猜测、套用模板或为消除待办而生成缺乏证据的认知。

8. 必须遵守工具返回的结构化状态和安全边界：

   - `repair_required`：只修复明确命中的候选，再重新提交当前机器签发的完整批次；
   - `stopped`：结束当前写入尝试并检查 `failed_step`、错误、正式写入证据与Recovery。auto模式下，已证明零写入则记录closure并重新Plan；完整Intent和可证明postimage则Resume；策略要求Rollback且preimage可证明则精确恢复后重新Plan。只有证据不足、第三方正式字节冲突、需要审批或外部动作，或命中其他真实安全边界时，才停止整个用户任务；
   - 冲突、审批、人工裁决、权限和安全信号不得忽略；
   - 已经对齐后不得重复维护或重复写入；`refresh_ready_for_overview` 是checkpoint事实，由Agent决定是否为下一阶段请求普通完整Overview。

   维护完成后如果又修改了任何受管理对象，之前的维护结果失效，应在新的最终稳定状态重新完成收尾。

9. 用户只限制业务文件范围，但没有明确禁止仓库托管资产时，AOCI托管资产可以在收尾阶段为保持认知一致而更新，并应在审计和提交中与业务文件区分。

   用户明确禁止修改 `aoci.txt`、`.aoci`、元数据或任何额外文件时，以用户限制为准，不得写入，并如实报告剩余不一致。

### 专项流程

初始化、完整索引生成、Header生成、Entries生成、数据库结构索引、Curation、人工评审和故障恢复，只按当前AOCI Guide或工具在对应阶段返回的指令、命令和安全停点执行。

不预加载、不猜测，也不自行重建这些专项流程。平台调用方式、请求格式、批次上限、审批规则、索引格式细节和恢复步骤由对应Guide、工具说明、模型Prompt和CLI帮助按需提供。
<!-- aoci:end -->
