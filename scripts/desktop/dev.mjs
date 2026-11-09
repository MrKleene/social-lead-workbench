// Runs the real Electron main process against the Vite dev server so renderer
// changes hot-reload without a build or a package step.
//
// The window, preload, IPC allowlist and local database are the same ones the
// packaged app uses; only the renderer URL differs (http://127.0.0.1:5173
// instead of workbench://app). `--dev` is rejected when app.isPackaged, so this
// path cannot be reached from a shipped build.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const electron = require('electron')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const devUrl = process.env.WORKBENCH_DEV_URL || 'http://127.0.0.1:5173/'

const children = []
let stopping = false

function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) {
    try {
      child.kill('SIGTERM')
    } catch {}
  }
  process.exit(code)
}

process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))

const vite = spawn('npm', ['run', 'dev', '-w', '@crm/web'], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
})
children.push(vite)
vite.on('exit', (code) => {
  if (code) {
    console.error(`[dev] Vite 退出（${code}）`)
    stop(code)
  }
})

async function waitForServer() {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (vite.exitCode !== null) throw new Error('Vite 启动失败')
    try {
      const response = await fetch(devUrl)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error(`等待 ${devUrl} 超时`)
}

try {
  await waitForServer()
  console.log(`\n[dev] ${devUrl} 已就绪，启动 Electron（前端改动会热更新）\n`)
} catch (error) {
  console.error(`[dev] ${error.message}`)
  stop(1)
}

const extraArgs = (process.env.WORKBENCH_DEV_ELECTRON_ARGS || '')
  .split(' ')
  .filter(Boolean)

const app = spawn(
  electron,
  [path.join(root, 'apps/desktop/src/main.cjs'), '--dev', ...extraArgs],
  {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, WORKBENCH_DEV_URL: devUrl },
  }
)
children.push(app)
app.on('exit', (code) => stop(code ?? 0))
