#!/usr/bin/env node
/**
 * UI 规范检查 —— 把 AGENTS.md 里"机械可判定"的条款变成可执行检查。
 *
 * 用法：
 *   node scripts/check-ui-conventions.mjs           # 只把 error 视为失败
 *   node scripts/check-ui-conventions.mjs --strict  # warning 也算失败
 *   node scripts/check-ui-conventions.mjs --json    # 机器可读输出
 *
 * 不判断审美，也不替代截图核对。规则与 apps/web/DESIGN.md、AGENTS.md 对应。
 */

import { readFile, readdir } from 'node:fs/promises'
import { join, relative, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SCAN_DIR = join(ROOT, 'apps/web/src')
const STRICT = process.argv.includes('--strict')
const JSON_OUT = process.argv.includes('--json')

/** 允许的字号档位（px）。vercel 阶梯：12/14/16/20/24，hero 48 对应 display-xl。 */
const FONT_SIZE_SCALE = [12, 14, 16, 20, 24, 48]
/** 允许的圆角（px）。控件 sm 4 / md 6，卡片 lg 8 / xl 12；≥24 视为药丸。 */
const RADIUS_SCALE = [4, 6, 8, 12]
/** 允许的字重。vercel 规定 600 是天花板。 */
const FONT_WEIGHT_SCALE = [400, 500, 600]
/**
 * 允许的间距（px）。用 Tailwind 的 spacing 刻度，而不是「4 的倍数」——
 * 6/10/14/28 都是 Tailwind 的合法步进（1.5 / 2.5 / 3.5 / 7）。
 * 越界典型：3 / 5 / 7 / 9 / 18 / 34。
 */
const SPACING_SCALE = [
  0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 80,
  96, 9999,
]

/** token 定义文件本身必须写具体色值，豁免颜色规则。 */
const TOKEN_SOURCE = new Set(['styles/theme.css'])

/**
 * 显式例外：必须逐条给出理由，否则仍算违规。
 * 用于「技术上无法避免」的场景（覆盖第三方组件内置工具类、Radix 运行时行为）。
 *
 * 只登记**当前仍存在**的文件。文件删掉后必须同步删掉这里，
 * 否则会留下一条永远命中不到的空豁免，让「还有几条例外」这个事实失真。
 */
const ALLOWED = [
  [
    'styles/index.css',
    'important',
    'Radix 滚动锁会移除滚动条宽度，sticky 表头需要 overflow:unset；输入框 16px 是 iOS 聚焦缩放防护',
  ],
]
const allowedKey = new Set(ALLOWED.map(([f, r]) => `${f}::${r}`))
const allowedReason = new Map(ALLOWED.map(([f, r, why]) => [`${f}::${r}`, why]))

/** 已知债务文件：仍会产生 error，但单独标注，避免误以为是新引入的。 */
const KNOWN_DEBT = new Set([])

/**
 * 遗留方言棘轮：`local-*` / `configuration-*` / `journey-*` / `graphite-*` /
 * `reply-history-*` 是手写 CSS 时代的类名，样式不走 Tailwind + shadcn。
 *
 * **2026-11-11 已清空**：全部页面迁移完毕，白名单为空。新代码出现这些类名
 * 一律判 error。确实需要临时例外时加进来并写明理由，迁完立刻删掉。
 */
const LEGACY_CLASS_ALLOWED = new Set([])

/** 遗留类名前缀。命中且文件不在白名单 → error。 */
const LEGACY_PREFIX = /^(?:local|configuration|journey|graphite|reply-history)-/

const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-desktop', '.git', 'assets'])

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) await walk(full, out)
    else if (['.css', '.tsx', '.ts'].includes(extname(entry.name))) out.push(full)
  }
  return out
}

const findings = []
const allowedHits = []
function add({ rule, level, file, detail, snippet }) {
  const rel = relative(SCAN_DIR, file)
  const key = `${rel}::${rule}`
  if (allowedKey.has(key)) {
    allowedHits.push({ rule, file: rel, detail, reason: allowedReason.get(key) })
    return
  }
  findings.push({ rule, level, file: rel, detail, snippet })
}

/** 返回匹配所在行号；压缩文件返回 1。 */
function lineAt(content, index) {
  let line = 1
  for (let i = 0; i < index && i < content.length; i++) if (content[i] === '\n') line++
  return line
}

function collect(content, re) {
  const hits = []
  re.lastIndex = 0
  let m
  while ((m = re.exec(content))) hits.push({ text: m[0], index: m.index, groups: m })
  return hits
}

// ---------- CSS 规则 ----------

function checkCss(file, content) {
  // 注释里的示例代码不算违规；保留换行以维持行号
  content = content.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  const isTokenSource = TOKEN_SOURCE.has(relative(SCAN_DIR, file))

  // 1. 硬编码颜色（theme.css 是 token 定义处，豁免）
  if (!isTokenSource) {
    const hex = collect(content, /#[0-9a-fA-F]{3,8}\b/g)
    if (hex.length) {
      add({
        rule: 'hardcoded-color',
        level: 'error',
        file,
        detail: `${hex.length} 处硬编码色值`,
        snippet: [...new Set(hex.map((h) => h.text))].slice(0, 6).join(' '),
      })
    }
  }

  // 2. 字重越界
  const weights = collect(content, /font-weight:\s*(\d{3})/g)
  const badWeights = weights.filter((w) => !FONT_WEIGHT_SCALE.includes(Number(w.groups[1])))
  if (badWeights.length) {
    add({
      rule: 'font-weight-out-of-scale',
      level: 'error',
      file,
      detail: `${badWeights.length} 处非标准字重`,
      snippet: [...new Set(badWeights.map((w) => w.groups[1]))].join(', '),
    })
  }

  // 3. 字号越界
  const sizes = collect(content, /font-size:\s*([\d.]+)(px|rem|em)/g)
  const badSizes = sizes.filter((s) => {
    const n = Number(s.groups[1])
    const px = s.groups[2] === 'px' ? n : s.groups[2] === 'rem' ? n * 16 : n * 14
    return !FONT_SIZE_SCALE.some((allowed) => Math.abs(allowed - px) < 0.6)
  })
  if (badSizes.length) {
    add({
      rule: 'font-size-out-of-scale',
      level: 'warn',
      file,
      detail: `${badSizes.length} 处字号不在档位内`,
      snippet: [...new Set(badSizes.map((s) => s.groups[1] + s.groups[2]))].join(', '),
    })
  }

  // 4. 圆角越界
  const radii = collect(content, /border-radius:\s*([\d.]+)px/g)
  const badRadii = radii.filter((r) => {
    const n = Number(r.groups[1])
    return n < 24 && !RADIUS_SCALE.includes(n)
  })
  if (badRadii.length) {
    add({
      rule: 'radius-out-of-scale',
      level: 'warn',
      file,
      detail: `${badRadii.length} 处圆角不在档位内`,
      snippet: [...new Set(badRadii.map((r) => r.groups[1] + 'px'))].join(', '),
    })
  }

  // 5. !important
  const imp = collect(content, /!\s*important/g)
  if (imp.length) {
    add({
      rule: 'important',
      level: 'error',
      file,
      detail: `${imp.length} 处 !important`,
      snippet: `首次出现第 ${lineAt(content, imp[0].index)} 行`,
    })
  }

  // 6. data-slot 覆写 shadcn（上一轮设计系统崩掉的模式）
  //    :not([data-slot=...]) 是排除守卫，不是覆写，先剔除
  const withoutGuards = content.replace(/:not\(\[data-slot[^\]]*\]\)/g, '')
  const slot = collect(withoutGuards, /\[data-slot[^\]]*\]/g)
  if (slot.length) {
    add({
      rule: 'data-slot-override',
      level: 'error',
      file,
      detail: `${slot.length} 处通过 data-slot 覆写组件`,
      snippet: [...new Set(slot.map((s) => s.text))].slice(0, 4).join(' '),
    })
  }

  // 7. 间距越界（padding / margin / gap）
  const spacingHits = []
  const spacingRe = /\b(?:padding|margin|gap|row-gap|column-gap)(?:-[a-z]+)?\s*:\s*([^;}]+)/g
  let sm
  while ((sm = spacingRe.exec(content))) {
    for (const v of sm[1].matchAll(/(\d+(?:\.\d+)?)px/g)) {
      if (!SPACING_SCALE.includes(Number(v[1]))) spacingHits.push(v[1])
    }
  }
  if (spacingHits.length) {
    add({
      rule: 'spacing-out-of-scale',
      level: 'error',
      file,
      detail: `${spacingHits.length} 处间距不在 Tailwind 刻度上`,
      snippet: [...new Set(spacingHits.map((v) => v + 'px'))].slice(0, 6).join(' '),
    })
  }
}

// ---------- TSX 规则 ----------

const PALETTE =
  /\b(?:bg|text|border|ring|from|to|via|fill|stroke|outline|divide|shadow|accent|caret|decoration)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|[1-9]00|950)\b/g

function checkTsx(file, content) {
  // 1. 任意值颜色
  const arbColor = collect(content, /\b(?:bg|text|border|ring|fill|stroke|from|to|via)-\[(?:#|rgb|hsl)[^\]]*\]/g)
  if (arbColor.length) {
    add({
      rule: 'arbitrary-color',
      level: 'error',
      file,
      detail: `${arbColor.length} 处任意值颜色`,
      snippet: [...new Set(arbColor.map((h) => h.text))].slice(0, 4).join(' '),
    })
  }

  // 2. 直接调色板
  const palette = collect(content, PALETTE)
  if (palette.length) {
    add({
      rule: 'palette-class',
      level: 'error',
      file,
      detail: `${palette.length} 处直接使用调色板`,
      snippet: [...new Set(palette.map((p) => p.text))].slice(0, 4).join(' '),
    })
  }

  // 3. 裸 hex（排除注释与已知非颜色用途）
  const hex = collect(content, /#[0-9a-fA-F]{6}\b/g)
  const hexColor = hex.filter((h) => !/^#(?:[0-9]{6})$/.test(h.text))
  if (hexColor.length) {
    add({
      rule: 'hardcoded-color',
      level: 'error',
      file,
      detail: `${hexColor.length} 处十六进制色值`,
      snippet: [...new Set(hexColor.map((h) => h.text))].slice(0, 4).join(' '),
    })
  }

  // 4. 任意字号：px 定值视为错误（应走档位）；rem 视为展示级排版，仅提示
  const arbPx = collect(content, /\btext-\[[\d.]+px\]/g)
  if (arbPx.length) {
    add({
      rule: 'arbitrary-font-size',
      level: 'error',
      file,
      detail: `${arbPx.length} 处 px 任意值字号`,
      snippet: [...new Set(arbPx.map((h) => h.text))].slice(0, 4).join(' '),
    })
  }
  const arbRem = collect(content, /\btext-\[[\d.]+rem\]/g)
  if (arbRem.length) {
    add({
      rule: 'arbitrary-font-size-rem',
      level: 'warn',
      file,
      detail: `${arbRem.length} 处 rem 任意值字号`,
      snippet: [...new Set(arbRem.map((h) => h.text))].slice(0, 4).join(' '),
    })
  }

  // 5. 任意字重
  const arbWeight = collect(content, /\bfont-\[[\d.]+\]/g)
  if (arbWeight.length) {
    add({
      rule: 'arbitrary-font-weight',
      level: 'error',
      file,
      detail: `${arbWeight.length} 处任意值字重`,
      snippet: [...new Set(arbWeight.map((h) => h.text))].slice(0, 4).join(' '),
    })
  }

  // 6. 字重超过 600（vercel 规定 600 是天花板）
  const heavy = collect(content, /\bfont-(bold|extrabold|black)\b/g)
  if (heavy.length) {
    add({
      rule: 'font-weight-over-600',
      level: 'error',
      file,
      detail: `${heavy.length} 处字重超过 600`,
      snippet: [...new Set(heavy.map((h) => h.text))].slice(0, 4).join(' '),
    })
  }

  // 7. 越界字号（Tailwind 默认档位里不在 12/14/16/20/24 的）。shadcn 组件本身豁免。
  if (!file.includes('/components/ui/')) {
    const offScale = collect(content, /\btext-(lg|3xl|4xl|5xl|6xl|7xl|8xl|9xl)\b/g)
    if (offScale.length) {
      add({
        rule: 'font-size-off-scale',
        level: 'error',
        file,
        detail: `${offScale.length} 处字号不在 12/14/16/20/24/48 档位内`,
        snippet: [...new Set(offScale.map((h) => h.text))].slice(0, 4).join(' '),
      })
    }
  }

  // 8. 任意值间距：px 必须落在 Tailwind 刻度上
  const arbSpacing = collect(
    content,
    /\b(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y)-\[(\d+(?:\.\d+)?)px\]/g,
  )
  const badSpacing = arbSpacing.filter((h) => !SPACING_SCALE.includes(Number(h.groups[1])))
  if (badSpacing.length) {
    add({
      rule: 'spacing-out-of-scale',
      level: 'error',
      file,
      detail: `${badSpacing.length} 处任意值间距不在刻度上`,
      snippet: [...new Set(badSpacing.map((h) => h.text))].slice(0, 4).join(' '),
    })
  }

  // 9. !important
  const imp = collect(content, /!\s*important/g)
  if (imp.length) {
    add({
      rule: 'important',
      level: 'error',
      file,
      detail: `${imp.length} 处 !important`,
      snippet: `第 ${lineAt(content, imp[0].index)} 行`,
    })
  }

  // 10. 遗留方言棘轮：className 里出现手写 CSS 时代的类名
  const rel = relative(SCAN_DIR, file)
  if (!LEGACY_CLASS_ALLOWED.has(rel)) {
    const legacyHits = []
    for (const m of content.matchAll(/className=(?:"([^"]*)"|'([^']*)')/g)) {
      for (const token of (m[1] ?? m[2] ?? '').split(/\s+/)) {
        if (LEGACY_PREFIX.test(token)) legacyHits.push(token)
      }
    }
    if (legacyHits.length) {
      add({
        rule: 'legacy-class',
        level: 'error',
        file,
        detail: `${legacyHits.length} 处遗留类名（应改用 Tailwind + components/patterns）`,
        snippet: [...new Set(legacyHits)].slice(0, 4).join(' '),
      })
    }
  }
}

// ---------- 执行 ----------

const files = await walk(SCAN_DIR)
for (const file of files) {
  const content = await readFile(file, 'utf8')
  if (file.endsWith('.css')) checkCss(file, content)
  else checkTsx(file, content)
}

// 入口层叠顺序守卫：index.css 必须第一个导入。
// Tailwind 的层顺序由 @import 'tailwindcss' 首次声明决定；若先导入任何
// @layer components 的样式，components 层会被注册在最前、优先级降到
// preflight 之下，页面标题字号和页头外边距会整体失效。
const entry = join(SCAN_DIR, 'main.tsx')
try {
  const src = await readFile(entry, 'utf8')
  const cssImports = [...src.matchAll(/^import\s+['"](\.[^'"]+\.css)['"]/gm)].map((m) => m[1])
  const idxIndex = cssImports.indexOf('./styles/index.css')
  if (idxIndex > 0) {
    add({
      rule: 'css-layer-order',
      level: 'error',
      file: entry,
      detail: `index.css 不是第一个 CSS 导入（当前第 ${idxIndex + 1} 个）`,
      snippet: cssImports.join(' → '),
    })
  }
} catch {
  // 没有 main.tsx 时跳过
}

const errors = findings.filter((f) => f.level === 'error')
const warns = findings.filter((f) => f.level === 'warn')

if (JSON_OUT) {
  console.log(JSON.stringify({ scanned: files.length, errors, warns, allowed: allowedHits }, null, 2))
} else {
  console.log(`\nUI 规范检查 · apps/web/src · ${files.length} 个文件\n`)

  const print = (list, icon, title) => {
    if (!list.length) return
    console.log(`${icon} ${title}（${list.length}）`)
    for (const f of list) {
      const debt = KNOWN_DEBT.has(f.file) ? ' [已知债务]' : ''
      console.log(`  · ${f.rule}  ${f.file}${debt}`)
      console.log(`      ${f.detail}${f.snippet ? ` → ${f.snippet}` : ''}`)
    }
    console.log()
  }

  print(errors, '✖', '错误')
  print(warns, '⚠', '警告')

  if (allowedHits.length) {
    console.log(`◐ 已批准例外（${allowedHits.length}）`)
    for (const f of allowedHits) {
      console.log(`  · ${f.rule}  ${f.file}`)
      console.log(`      ${f.detail}｜理由：${f.reason}`)
    }
    console.log()
  }

  if (!errors.length && !warns.length) console.log('✔ 未发现违规\n')
  else {
    const newErrors = errors.filter((f) => !KNOWN_DEBT.has(f.file)).length
    console.log(`小计：错误 ${errors.length}（其中新引入 ${newErrors}）· 警告 ${warns.length} · 已批准 ${allowedHits.length}`)
    console.log('规则说明见 AGENTS.md；设计依据见 apps/web/DESIGN.md\n')
  }
}

const failed = errors.length > 0 || (STRICT && warns.length > 0)
process.exit(failed ? 1 : 0)
