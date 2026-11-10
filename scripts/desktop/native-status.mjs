// Read-only report: which native resources the desktop runtime can use on this
// host, and the exact command that produces each missing one. Builds nothing,
// launches nothing, and never copies a browser.
//
// Run it before packaging: `beforePack` fails with NATIVE_MANIFEST_UNVERIFIED
// when these are incomplete, and `npm start` silently disables collect, inbox
// and send while the window still opens.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const root = path.resolve(import.meta.dirname, '../..')
const { NativeResources } = require(path.join(root, 'apps/desktop/src/native-resources.cjs'))

const key = `${process.platform}-${process.arch}`
const directory = path.join(root, 'apps/desktop/dist/native', key)
const present = name => fs.existsSync(path.join(directory, name))

const groups =
  process.platform === 'darwin' && process.arch === 'arm64'
    ? [
        {
          label: '监督器',
          files: ['desktop-supervisor', 'supervisor-build.json'],
          command: 'npm run desktop:build:native',
        },
        {
          label: 'Go MCP',
          files: ['desktop-mcp', 'mcp-build.json'],
          command:
            'npm run desktop:prepare:mcp（需 DESKTOP_GO 与 DESKTOP_GO_MODCACHE 指向已存在的绝对路径）',
        },
        {
          label: '固定浏览器',
          files: ['Chromium.app', 'browser-build.json'],
          command: 'npm run desktop:prepare:browser -- /绝对路径/Chromium.app',
        },
      ]
    : process.platform === 'win32' && process.arch === 'x64'
      ? [
          {
            label: 'Windows 原生入口',
            files: [
              'desktop-mcp.exe',
              'mcp-build.json',
              'browser',
              'browser-build.json',
              'windows-validation.json',
            ],
            command: 'npm run desktop:validate:win',
          },
        ]
      : null

if (!groups) {
  console.error(`不支持的原生资源宿主：${key}（仅 darwin-arm64 与 win32-x64）`)
  process.exit(1)
}

console.log(`原生资源目录：apps/desktop/dist/native/${key}`)
const missing = []
for (const group of groups) {
  const absent = group.files.filter(name => !present(name))
  if (absent.length === 0) {
    console.log(`  ✔ ${group.label}`)
    continue
  }
  missing.push(group)
  console.log(`  ✖ ${group.label} —— 缺 ${absent.join('、')}`)
  console.log(`     → ${group.command}`)
}

const status = new NativeResources(directory, {}).status()
console.log(`\n结论：${status.ready ? '可用' : '不可用'}（${status.reason}）`)
if (!status.ready) {
  console.log('影响：npm start 与 desktop:dev 仍能打开界面，但采集、收件、发送三个能力被禁用；')
  console.log('      desktop:package:mac:preview 会在 beforePack 直接失败。')
}
process.exit(status.ready ? 0 : 1)
