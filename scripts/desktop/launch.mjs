// Launches the real Electron binary for the desktop app.
//
// Electron-based IDEs (WorkBuddy, VS Code) export ELECTRON_RUN_AS_NODE=1 into
// their integrated terminals. The Electron binary then behaves as plain Node,
// `require('electron')` returns the package's path string instead of the runtime
// API, and main.cjs dies on `protocol.registerSchemesAsPrivileged` of undefined.
// The variable is removed for the child only, so nothing else changes.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const electron = require('electron')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(electron, [path.join(root, 'apps/desktop/src/main.cjs'), ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
  env,
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    try {
      child.kill(signal)
    } catch {}
  })
}

child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
