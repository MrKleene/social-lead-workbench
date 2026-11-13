// 准备 Windows 版固定浏览器：校验压缩包、解压、生成逐文件清单。
//
// 只做静态校验（PE 头 + 每个文件的 size/sha256），不运行浏览器、不验证发布者签名。
// 输出：
//   apps/desktop/dist/native/win32-x64/browser/**          解压后的浏览器目录
//   apps/desktop/dist/native/win32-x64/browser-build.json  运行时逐文件复核用的清单
//   scripts/desktop/platform-support/windows-tools.json    browserReview 从 pending 改为 reviewed
//
// 用法：
//   npm run desktop:prepare:browser:win -- /绝对路径/windows-x64.zip
//   npm run desktop:prepare:browser:win -- /绝对路径/已解压目录
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import cp from 'node:child_process'
import { createHash } from 'node:crypto'

const root = path.resolve(import.meta.dirname, '../..')
const source = process.argv[2]
const manifestPath = path.join(root, 'apps/desktop/src/windows-browser-source.json')
const toolsPath = path.join(root, 'scripts/desktop/platform-support/windows-tools.json')
const targetRoot = path.join(root, 'apps/desktop/dist/native/win32-x64')
const browserTarget = path.join(targetRoot, 'browser')
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

if (!source || !path.isAbsolute(source)) {
  throw Error('需要绝对路径：npm run desktop:prepare:browser:win -- /绝对路径/windows-x64.zip')
}
if (!fs.existsSync(source)) throw Error('BROWSER_SOURCE_MISSING: ' + source)

const hashFile = (file) =>
  new Promise((resolve, reject) => {
    const h = createHash('sha256')
    const stream = fs.createReadStream(file)
    stream.on('data', (chunk) => h.update(chunk))
    stream.on('end', () => resolve(h.digest('hex')))
    stream.on('error', reject)
  })

/** 解压后浏览器可能被包在一层目录里，找到 chrome.exe 所在目录作为根。 */
const findBrowserRoot = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const found = findBrowserRoot(path.join(dir, entry.name))
      if (found) return found
    } else if (entry.name.toLowerCase() === 'chrome.exe') {
      return dir
    }
  }
  return null
}

const extract = (zip, dest) => {
  const windows = process.platform === 'win32'
  const command = windows ? 'powershell' : 'unzip'
  const args = windows
    ? ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${dest}' -Force`]
    : ['-q', zip, '-d', dest]
  if (cp.spawnSync(command, args, { stdio: 'inherit' }).status !== 0) {
    throw Error('BROWSER_EXTRACT_FAILED')
  }
}

const copyInto = (from) => {
  fs.mkdirSync(targetRoot, { recursive: true })
  fs.cpSync(from, browserTarget, { recursive: true, force: true })
  console.log(`已复制到 ${path.relative(root, browserTarget)}`)
}

const stat = fs.statSync(source)
let archiveSha256 = manifest.archiveSha256
let staging = null
let browserRoot

try {
  if (stat.isDirectory()) {
    console.log('使用已解压目录，跳过压缩包校验')
    browserRoot = findBrowserRoot(source)
  } else {
    archiveSha256 = await hashFile(source)
    if (archiveSha256 !== manifest.archiveSha256) {
      throw Error(`BROWSER_ARCHIVE_HASH_MISMATCH: 期望 ${manifest.archiveSha256}，实际 ${archiveSha256}`)
    }
    console.log(`压缩包 sha256 匹配：${archiveSha256.slice(0, 16)}…`)
    staging = fs.mkdtempSync(path.join(os.tmpdir(), 'social-lead-win-browser-'))
    extract(source, staging)
    browserRoot = findBrowserRoot(staging)
  }
  if (!browserRoot) throw Error('BROWSER_CHROME_EXE_MISSING')
  copyInto(browserRoot)
} finally {
  if (staging) fs.rmSync(staging, { recursive: true, force: true })
}

// PE 头检查：MZ 是 DOS 头魔数，缺了说明不是可执行文件。
const exeHead = fs.readFileSync(path.join(browserTarget, 'chrome.exe')).subarray(0, 2).toString('hex')
if (exeHead !== '4d5a') throw Error('BROWSER_CHROME_EXE_NOT_PE: ' + exeHead)

const files = {}
const walk = async (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await walk(file)
      continue
    }
    if (!entry.isFile()) throw Error('BROWSER_REPARSE_POINT: ' + path.relative(browserTarget, file))
    const rel = path.relative(browserTarget, file).split(path.sep).join('/')
    files[rel] = { size: fs.statSync(file).size, sha256: await hashFile(file) }
  }
}
await walk(browserTarget)

const build = {
  platform: 'win32',
  arch: 'x64',
  version: manifest.version,
  binary: 'browser/chrome.exe',
  archiveSha256,
  archiveBytes: stat.isDirectory() ? manifest.archiveBytes : stat.size,
  files,
}
fs.writeFileSync(path.join(targetRoot, 'browser-build.json'), JSON.stringify(build, null, 2) + '\n')

// windows-tools.json 的 browserReview 是打包时 platform.cjs 读的，必须同步。
const tools = JSON.parse(fs.readFileSync(toolsPath, 'utf8'))
tools.browserVersion = manifest.version
tools.browserReview = {
  state: 'reviewed',
  source: manifest.source,
  archiveSha256,
  archiveBytes: build.archiveBytes,
  validation: manifest.validation,
  windowsExecuted: false,
  publisherSignatureValidated: false,
  files,
}
fs.writeFileSync(toolsPath, JSON.stringify(tools, null, 2) + '\n')

console.log(
  JSON.stringify(
    {
      version: build.version,
      binary: build.binary,
      archiveSha256,
      files: Object.keys(files).length,
      bytes: Object.values(files).reduce((sum, item) => sum + item.size, 0),
    },
    null,
    2,
  ),
)
