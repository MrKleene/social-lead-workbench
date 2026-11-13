// Copies only the already-selected browser application's immutable resources;
// never profile, cache or cookies. Windows keeps its separate review gate.
//
// Nothing is downloaded here. Pass the absolute path of an already obtained
// Chromium.app (arm64, 148.0.7778.215); this verifies architecture, version and
// every file's mode before copying it into the native resource directory and
// writing `browser-build.json`, which the runtime re-checks at startup.
import fs from 'node:fs'
import path from 'node:path'
import cp from 'node:child_process'
import { createHash } from 'node:crypto'

const root = path.resolve(import.meta.dirname, '../..')
const source = process.argv[2]
const expectedVersion = '148.0.7778.215'
const expectedBinary = 'Chromium.app/Contents/MacOS/Chromium'

if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw Error('BROWSER_PREPARE_REQUIRES_MAC_ARM64')
}
if (!source || !path.isAbsolute(source) || !source.endsWith('/Chromium.app')) {
  throw Error(
    'Explicit Mac arm64 Chromium.app source required: ' +
      'npm run desktop:prepare:browser -- /绝对路径/Chromium.app'
  )
}

const binary = path.join(source, 'Contents/MacOS/Chromium')
const stat = fs.lstatSync(binary)
if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o022) {
  throw Error('UNSAFE_BROWSER: the binary must be a regular, non-writable file')
}

const arch = cp.spawnSync('/usr/bin/lipo', ['-archs', binary], { encoding: 'utf8' })
if (arch.status !== 0 || arch.stdout.trim() !== 'arm64') {
  throw Error(`BROWSER_ARCH_MISMATCH: expected arm64, got ${arch.stdout.trim() || 'unknown'}`)
}

const version = cp.spawnSync(
  '/usr/libexec/PlistBuddy',
  ['-c', 'Print :CFBundleShortVersionString', path.join(source, 'Contents/Info.plist')],
  { encoding: 'utf8' }
)
if (version.status !== 0 || version.stdout.trim() !== expectedVersion) {
  throw Error(
    `BROWSER_VERSION_CHANGED: expected ${expectedVersion}, got ${version.stdout.trim() || 'unknown'}`
  )
}

const destination = path.join(root, 'apps/desktop/dist/native/darwin-arm64/Chromium.app')
if (fs.existsSync(destination)) fs.rmSync(destination, { recursive: true })
fs.cpSync(source, destination, {
  recursive: true,
  dereference: false,
  verbatimSymlinks: true,
  mode: fs.constants.COPYFILE_FICLONE,
})

// 复制后校验签名完整性。Chromium 的沙箱依赖签名里的 entitlements，缺 _CodeSignature
// 的 linker-signed 副本能通过版本/架构/权限检查，却会在启动时报
// "sandbox initialization failed"，最终表现为扫码进程启动失败。
// 在目标路径校验，避免挂载卷上的 Finder 元数据造成误报。
const signature = cp.spawnSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', destination], {
  encoding: 'utf8',
})
if (signature.status !== 0) {
  throw Error('BROWSER_SIGNATURE_INVALID: ' + (signature.stderr || '').trim())
}

const files = {}
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    const rel = path.relative(destination, file).split(path.sep).join('/')
    if (entry.isDirectory()) {
      walk(file)
    } else if (entry.isSymbolicLink()) {
      const target = fs.readlinkSync(file)
      const resolved = fs.realpathSync(file)
      if (path.isAbsolute(target) || !resolved.startsWith(destination + path.sep)) {
        throw Error(`BROWSER_LINK_OUTSIDE_BUNDLE: ${rel}`)
      }
      files[rel] = { link: target }
    } else if (entry.isFile()) {
      const s = fs.statSync(file)
      if (s.mode & 0o022) throw Error(`WRITABLE_BROWSER_RESOURCE: ${rel}`)
      files[rel] = { sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex'), size: s.size }
    } else {
      throw Error(`SPECIAL_BROWSER_FILE: ${rel}`)
    }
  }
}
walk(destination)

fs.writeFileSync(
  path.join(path.dirname(destination), 'browser-build.json'),
  JSON.stringify(
    { platform: 'darwin', arch: 'arm64', version: version.stdout.trim(), binary: expectedBinary, files },
    null,
    2
  ) + '\n'
)
console.log(JSON.stringify({ browserPrepared: true, files: Object.keys(files).length, executed: false }))
