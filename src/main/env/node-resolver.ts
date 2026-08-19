import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { satisfies } from './semver'
import type { ProgressSink } from './kernel-source'

export interface NodeRuntime {
  exePath: string
  version: string
  source: 'system' | 'bundled' | 'discovered'
}

const REQUIRED_RANGE = '^22.19.0 || >=24.0.0'
export const NODE_DIST_VERSION = '22.22.0'

const OFFICIAL_DIST_BASE = 'https://nodejs.org/dist'
const NPMMIRROR_DIST_BASE = 'https://registry.npmmirror.com/-/binary/node'
/** 中国大陆时区(含历史别名);不含港台——npmmirror 对它们同样可达,回退链会兜住。 */
const CHINA_TIMEZONES = new Set(['Asia/Shanghai', 'Asia/Urumqi', 'Asia/Chongqing', 'Asia/Harbin', 'PRC', 'CTT'])

export function isChinaTimezone(timeZone: string | undefined): boolean {
  return timeZone !== undefined && CHINA_TIMEZONES.has(timeZone)
}

export function currentTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return undefined
  }
}

/**
 * Node dist 下载源顺序:用户自定义镜像优先;
 * 中国时区 npmmirror 在前(国内满速),否则官方在前;另一个始终作回退。
 * 启发式猜错(如海外时区+回国网络)由回退链自愈,只是首试多花一次超时。
 */
export function nodeDistMirrorBases(customMirror?: string, china = isChinaTimezone(currentTimezone())): string[] {
  const ordered = china ? [NPMMIRROR_DIST_BASE, OFFICIAL_DIST_BASE] : [OFFICIAL_DIST_BASE, NPMMIRROR_DIST_BASE]
  if (customMirror === undefined || customMirror.trim() === '') return ordered
  return [customMirror.replace(/\/+$/, ''), ...ordered.filter((base) => base !== customMirror)]
}

export function nodeDistArchiveName(platform: NodeJS.Platform = process.platform, arch: string = process.arch): string {
  const os = platform === 'win32' ? 'win' : platform === 'darwin' ? 'darwin' : 'linux'
  const ext = platform === 'win32' ? 'zip' : 'tar.gz'
  return `node-v${NODE_DIST_VERSION}-${os}-${arch}.${ext}`
}

export function systemNodePath(): string {
  return process.execPath
}

export function bundledNodeDir(userDataPath: string): string {
  return join(userDataPath, 'runtime', 'node')
}

/**
 * GUI 应用不继承 shell 的 PATH(nvm/volta 等都不在),扫描常见版本管理器安装位置。
 */
export function discoverNodeCandidates(): string[] {
  const home = process.env.HOME ?? '~'
  const candidates: string[] = []
  const exeName = process.platform === 'win32' ? 'node.exe' : 'bin/node'

  // nvm / volta / fnm / asdf
  const managers: Array<[string, (v: string) => string]> = [
    [join(home, '.nvm/versions/node'), (v) => join(home, '.nvm/versions/node', v, exeName)],
    [join(home, '.volta/tools/image/node'), (v) => join(home, '.volta/tools/image/node', v, exeName)],
    [join(home, '.local/share/fnm/node-versions'), (v) => join(home, '.local/share/fnm/node-versions', v, 'installation', exeName)]
  ]

  for (const [root, build] of managers) {
    if (!existsSync(root)) continue
    let versions: string[]
    try {
      versions = readdirSync(root).filter((name) => name.startsWith('v'))
    } catch {
      continue
    }
    // Prefer the newest first.
    versions.sort((a, b) => compareVersionStrings(b, a))
    for (const version of versions) {
      candidates.push(build(version))
    }
  }

  // Homebrew (Apple Silicon then Intel)
  candidates.push('/opt/homebrew/bin/node', '/usr/local/bin/node')
  return candidates
}

function compareVersionStrings(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number)
  const pb = b.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da !== db) return da - db
  }
  return 0
}

function probeNode(exePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(exePath, ['--version'], { timeout: 5_000, windowsHide: true }, (error, stdout) => {
      if (error) {
        resolve(null)
        return
      }
      resolve(stdout.trim())
    })
  })
}

export async function resolveNode(userDataPath: string, systemNodeExe = 'node'): Promise<NodeRuntime> {
  // 1. Whatever the inherited PATH offers.
  const systemVersion = await probeNode(systemNodeExe)
  if (systemVersion !== null && satisfies(systemVersion, REQUIRED_RANGE)) {
    return { exePath: systemNodeExe, version: systemVersion, source: 'system' }
  }

  // 2. Well-known version-manager locations (GUI apps lack the user's shell PATH).
  for (const candidate of discoverNodeCandidates()) {
    if (!existsSync(candidate)) continue
    const version = await probeNode(candidate)
    if (version !== null && satisfies(version, REQUIRED_RANGE)) {
      return { exePath: candidate, version, source: 'discovered' }
    }
  }

  // 3. A previously downloaded official dist in the user data directory.
  const platform = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'macos' : 'linux'
  const arch = process.arch
  const exeName = process.platform === 'win32' ? 'node.exe' : 'bin/node'
  const bundledExe = join(bundledNodeDir(userDataPath), `node-v${NODE_DIST_VERSION}-${platform}-${arch}`, exeName)
  const bundledVersion = existsSync(bundledExe) ? await probeNode(bundledExe) : null
  if (bundledVersion !== null) {
    return { exePath: bundledExe, version: bundledVersion, source: 'bundled' }
  }

  throw new Error(
    `NODE_NOT_FOUND: no system Node satisfying ${REQUIRED_RANGE}; bundled dist missing at ${bundledExe}`
  )
}

async function fetchShasums(base: string): Promise<Map<string, string>> {
  const response = await fetch(`${base}/v${NODE_DIST_VERSION}/SHASUMS256.txt`, {
    signal: AbortSignal.timeout(10_000)
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const text = await response.text()
  const sums = new Map<string, string>()
  for (const line of text.split('\n')) {
    const match = /^([0-9a-f]{64})\s+\*?(.+)$/.exec(line.trim())
    if (match !== null) sums.set(match[2]!, match[1]!)
  }
  return sums
}

async function downloadArchiveWithProgress(
  url: string,
  destPath: string,
  onProgress: ProgressSink
): Promise<void> {
  const response = await fetch(url, { signal: AbortSignal.timeout(600_000), redirect: 'follow' })
  if (!response.ok || response.body === null) throw new Error(`HTTP ${response.status}`)
  const total = Number(response.headers.get('content-length') ?? 0)
  let received = 0
  const body = Readable.fromWeb(response.body)
  body.on('data', (chunk: Buffer) => {
    received += chunk.length
    onProgress({ stage: 'node-download', receivedBytes: received, totalBytes: total > 0 ? total : received, version: NODE_DIST_VERSION })
  })
  await pipeline(body, createWriteStream(destPath))
}

function extractNodeArchive(archivePath: string, destDir: string): void {
  if (process.platform === 'win32') {
    execFile(
      'powershell',
      ['-NoProfile', '-Command', `Expand-Archive -LiteralPath "${archivePath}" -DestinationPath "${destDir}" -Force`],
      { windowsHide: true }
    )
  } else {
    execFile('tar', ['-xzf', archivePath, '-C', destDir])
  }
}

async function installNodeDist(userDataPath: string, onProgress: ProgressSink): Promise<NodeRuntime> {
  const archiveName = nodeDistArchiveName()
  const targetDir = join(bundledNodeDir(userDataPath), `node-v${NODE_DIST_VERSION}-${process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'darwin' : 'linux'}-${process.arch}`)
  const exeName = process.platform === 'win32' ? 'node.exe' : 'bin/node'

  const failures: string[] = []
  for (const base of nodeDistMirrorBases()) {
    const staging = join(tmpdir(), `io.github.snkzhong.deepseek-harness-desktop-node-${Date.now()}`)
    try {
      // 先拉校验和(小文件):不可达/超时快速失败,立即换下一个源
      const shasums = await fetchShasums(base)
      const expectedSha = shasums.get(archiveName)
      if (expectedSha === undefined) throw new Error('SHASUM_MISSING')

      mkdirSync(staging, { recursive: true })
      const archivePath = join(staging, archiveName)
      await downloadArchiveWithProgress(`${base}/v${NODE_DIST_VERSION}/${archiveName}`, archivePath, onProgress)

      const actualSha = createHash('sha256').update(readFileSync(archivePath)).digest('hex')
      if (actualSha !== expectedSha) throw new Error('SHA_MISMATCH')

      onProgress({ stage: 'node-extract', indeterminate: true, version: NODE_DIST_VERSION })
      const extractDir = join(staging, 'extracted')
      mkdirSync(extractDir, { recursive: true })
      extractNodeArchive(archivePath, extractDir)
      const extractedRoot = join(extractDir, archiveName.replace(/\.(zip|tar\.gz)$/, ''))
      if (!existsSync(join(extractedRoot, exeName))) throw new Error('ARCHIVE_LAYOUT_UNEXPECTED')

      mkdirSync(join(targetDir, '..'), { recursive: true })
      rmSync(targetDir, { recursive: true, force: true })
      renameSync(extractedRoot, targetDir)

      const version = await probeNode(join(targetDir, exeName))
      if (version !== `v${NODE_DIST_VERSION}`) throw new Error(`VERSION_PROBE_FAILED: ${version ?? 'null'}`)
      return { exePath: join(targetDir, exeName), version, source: 'bundled' }
    } catch (error) {
      failures.push(`${base}: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      rmSync(staging, { recursive: true, force: true })
    }
  }
  throw new Error(`NODE_DOWNLOAD_FAILED:\n  ${failures.join('\n  ')}`)
}

/**
 * 探测链(PATH → 版本管理器 → 已下载 dist)任一命中即复用;
 * 全 miss 时按镜像顺序下载官方 dist(中国时区 npmmirror 优先),sha256 校验 + 版本探测双验证。
 */
export async function ensureNodeRuntime(
  userDataPath: string,
  options: { customMirror?: string; onProgress?: ProgressSink } = {}
): Promise<NodeRuntime> {
  try {
    return await resolveNode(userDataPath)
  } catch (error) {
    if (!(error instanceof Error && error.message.startsWith('NODE_NOT_FOUND'))) throw error
  }
  return installNodeDist(userDataPath, options.onProgress ?? (() => {}))
}
