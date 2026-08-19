import { existsSync, readFileSync, mkdirSync, writeFileSync, createWriteStream, rmSync, statSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { app } from 'electron'
import type { AssembleProgress } from '../../shared/contracts'

export const DSH_VERSION = '0.1.0-rc.7'

export interface KernelManifest {
  version: string
  entry: string
  source: string
}

export type ProgressSink = (progress: AssembleProgress) => void

function runCommand(command: string, args: string[], options: { cwd: string }): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: 'ignore', ...options })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command.toUpperCase()}_FAILED: exit ${code}`))
    })
  })
}

export function kernelDownloadTarget(version: string): string {
  const slug = 'io.github.snkzhong.deepseek-harness-desktop'
  const base =
    process.env.DSH_HARNESS_DESKTOP_USER_DATA ??
    join(
      process.env.HOME ?? '.',
      process.platform === 'win32'
        ? `AppData/Roaming/${slug}`
        : process.platform === 'darwin'
          ? `Library/Application Support/${slug}`
          : `.config/${slug}`
    )
  return join(base, 'runtime', 'dsh', version)
}

function manifestPathOf(kernelDirPath: string): string {
  return join(kernelDirPath, 'manifest.json')
}

export function kernelDir(userDataPath: string): string {
  return join(userDataPath, 'runtime', 'dsh', readVersionSafe(userDataPath))
}

/**
 * 解析实际运行的内核入口,优先级:
 *   1. 用户目录已有内核(自愈更新落盘的版本)
 *   2. 安装包内捆绑内核(resources/dsh-pkg,只读直跑,零复制)
 *   3. 都没有 → null(由调用方走远程下载)
 */
export function resolveKernelEntry(userDataPath: string): { entryPath: string; version: string; source: string } | null {
  const local = readKernelManifest(userDataPath)
  if (local !== null) {
    return { entryPath: join(kernelDir(userDataPath), local.entry), version: local.version, source: 'local' }
  }
  const bundled = bundledKernelInfo()
  if (bundled !== null) {
    return { entryPath: join(bundled.rootDir, 'lib', 'bin.js'), version: bundled.info.dshVersion, source: 'bundled' }
  }
  return null
}
function readVersionSafe(userDataPath: string): string {
  const manifest = join(userDataPath, 'runtime', 'dsh', 'manifest.json')
  if (existsSync(manifest)) {
    try {
      const raw = JSON.parse(readFileSync(manifest, 'utf8')) as { version?: string }
      if (typeof raw.version === 'string') return raw.version
    } catch {
      // fall through
    }
  }
  return DSH_VERSION
}

export function manifestPath(userDataPath: string): string {
  return join(kernelDir(userDataPath), 'manifest.json')
}

export function readKernelManifest(userDataPath: string): KernelManifest | null {
  const path = manifestPath(userDataPath)
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as KernelManifest
    if (typeof raw.version !== 'string' || typeof raw.entry !== 'string') return null
    return raw
  } catch {
    return null
  }
}

/** 壳平台 → dsh-pkg 归档平台名(macos 双架构单包)。 */
export function archivePlatform(): string {
  if (process.platform === 'darwin') return 'macos-universal'
  if (process.platform === 'win32') return 'windows'
  return 'linux'
}

interface BundledKernelInfo {
  dshVersion: string
  archive: string
  archiveSha256: string
}

/**
 * 安装包内捆绑的内核(resources/dsh-pkg/kernel/ 展开目录 + kernel.json)。
 * 打包脚本 fetch-kernel.mjs 在构建机解压好;首启零复制零解压,只读直跑。
 *
 * 路径解析:
 *   - packaged: process.resourcesPath/dsh-pkg/kernel
 *   - dev:      <appRoot>/build/dsh-pkg-extracted/kernel
 * 两者都不存在时才走远程下载兜底(dev 未 fetch 时)。
 */
export function bundledKernelInfo(): { info: BundledKernelInfo; rootDir: string } | null {
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, 'dsh-pkg')]
    : [join(app.getAppPath(), 'build', 'dsh-pkg-extracted'), join(app.getAppPath(), '..', 'build', 'dsh-pkg-extracted')]

  for (const baseDir of candidates) {
    const rootDir = join(baseDir, 'kernel')
    const kernelJson = join(baseDir, 'kernel.json')
    if (!existsSync(kernelJson)) continue
    try {
      const info = JSON.parse(readFileSync(kernelJson, 'utf8')) as BundledKernelInfo
      if (typeof info.dshVersion !== 'string' || typeof info.archive !== 'string') continue
      if (!existsSync(join(rootDir, 'lib', 'bin.js'))) continue
      return { info, rootDir }
    } catch {
      continue
    }
  }
  return null
}

/** 首启只用一次:捆绑内核拷贝/就位到用户目录(改由直接只读使用,此函数保留为兜底/更新切换用)。 */
export async function installFromBundled(userDataPath: string, onProgress: ProgressSink): Promise<KernelManifest> {
  const bundled = bundledKernelInfo()
  if (bundled === null) throw new Error('KERNEL_BUNDLED_MISSING: no bundled kernel in resources')
  const { info, rootDir } = bundled
  const targetDir = kernelDownloadTarget(info.dshVersion)
  const staging = join(tmpdir(), `io.github.snkzhong.deepseek-harness-desktop-kernel-bundled-${Date.now()}`)
  mkdirSync(staging, { recursive: true })

  onProgress({ stage: 'kernel-extract', indeterminate: true })
  try {
    const extractDir = join(staging, 'extracted')
    mkdirSync(extractDir, { recursive: true })
    if (process.platform === 'win32') {
      await runRobocopyMove(rootDir, extractDir)
    } else {
      await runCommand('cp', ['-R', rootDir, extractDir], { cwd: staging })
    }

    rmSync(targetDir, { recursive: true, force: true })
    mkdirSync(join(targetDir, '..'), { recursive: true })
    if (process.platform === 'win32') {
      await runRobocopyMove(extractDir, targetDir)
    } else {
      await runCommand('mv', [extractDir, targetDir], { cwd: staging })
    }

    writeFileSync(
      manifestPathOf(targetDir),
      JSON.stringify({ version: info.dshVersion, entry: 'lib/bin.js', source: 'bundled' }, null, 2),
      'utf8'
    )
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }

  const manifest = readKernelManifest(userDataPath)
  if (manifest === null) throw new Error('KERNEL_BUNDLED_INSTALL_FAILED')
  return manifest
}

export interface KernelSource {
  latest(): Promise<string>
  download(version: string, onProgress: ProgressSink): Promise<void>
}

interface RemoteManifest {
  dshVersion?: string
  archive?: string
  archiveSha256?: string
}

const DEFAULT_MIRRORS = ['https://github.com', 'https://ghproxy.net/https://github.com']

/**
 * ArchiveKernelSource:从 GitHub Release(或镜像)下载 dsh-pkg 预打包归档。
 * 用户机唯一的内核获取路径:下载 → sha256 校验 → 解压 → 就位。零 npm install。
 */
export function createArchiveKernelSource(options: {
  owner: string
  repo: string
  mirrorPrefixes?: string[]
}): KernelSource {
  const prefixes = options.mirrorPrefixes ?? DEFAULT_MIRRORS
  const assetUrl = (prefix: string, asset: string): string =>
    `${prefix}/${options.owner}/${options.repo}/releases/latest/download/${asset}`
  const manifestAsset = (): string => `manifest-${DSH_VERSION}-${archivePlatform()}.json`

  async function fetchRemoteManifest(): Promise<{ manifest: RemoteManifest; prefix: string }> {
    let lastError = 'NO_MIRROR_REACHED'
    for (const prefix of prefixes) {
      try {
        const response = await fetch(assetUrl(prefix, manifestAsset()), { signal: AbortSignal.timeout(15_000) })
        if (!response.ok) {
          lastError = `HTTP ${response.status} (${prefix})`
          continue
        }
        const manifest = (await response.json()) as RemoteManifest
        if (typeof manifest.dshVersion === 'string' && typeof manifest.archiveSha256 === 'string') {
          return { manifest, prefix }
        }
        lastError = 'MANIFEST_INCOMPLETE'
      } catch (error) {
        lastError = String(error)
      }
    }
    throw new Error(`KERNEL_MANIFEST_FAILED: ${lastError}`)
  }

  return {
    async latest(): Promise<string> {
      const { manifest } = await fetchRemoteManifest()
      return manifest.dshVersion as string
    },

    async download(version, onProgress): Promise<void> {
      const { manifest, prefix } = await fetchRemoteManifest()
      if (manifest.dshVersion !== version) {
        throw new Error(`KERNEL_VERSION_MISMATCH: remote ${manifest.dshVersion} != requested ${version}`)
      }
      const archiveName = manifest.archive as string
      const expectedSha = manifest.archiveSha256 as string

      const targetDir = kernelDownloadTarget(version)
      const staging = join(tmpdir(), `io.github.snkzhong.deepseek-harness-desktop-kernel-${version}-${Date.now()}`)
      mkdirSync(staging, { recursive: true })

      try {
        // 1. 流式下载(断点续传 + 节流进度)
        const archivePath = join(staging, archiveName)
        await downloadWithResume(assetUrl(prefix, archiveName), archivePath, onProgress)

        // 2. sha256 校验(整文件)
        const actualSha = createHash('sha256').update(readFileSync(archivePath)).digest('hex')
        if (actualSha !== expectedSha) {
          throw new Error(`KERNEL_SHA_MISMATCH: ${actualSha} != ${expectedSha}`)
        }

        // 3. 解压
        onProgress({ stage: 'kernel-extract', indeterminate: true })
        const extractDir = join(staging, 'extracted')
        mkdirSync(extractDir, { recursive: true })
        if (process.platform === 'win32') {
          await runPowerShellExpand(archivePath, extractDir)
        } else {
          await runCommand('unzip', ['-q', archivePath, '-d', extractDir], { cwd: staging })
        }

        // 4. 就位(归档内容即内核根:lib/ node_modules/ dsh-pkg-plugins/ ...)
        rmSync(targetDir, { recursive: true, force: true })
        mkdirSync(join(targetDir, '..'), { recursive: true })
        const entries = readdirSync(extractDir)
        const root = entries.includes('lib') ? extractDir : join(extractDir, entries[0] as string)
        if (process.platform === 'win32') {
          await runRobocopyMove(root, targetDir)
        } else {
          await runCommand('mv', [root, targetDir], { cwd: staging })
        }

        // 5. 写本地 manifest
        writeFileSync(
          manifestPathOf(targetDir),
          JSON.stringify({ version, entry: 'lib/bin.js', source: assetUrl(prefix, archiveName) }, null, 2),
          'utf8'
        )
      } finally {
        rmSync(staging, { recursive: true, force: true })
      }
    }
  }
}

async function runPowerShellExpand(archivePath: string, dest: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const ps = spawn(
      'powershell.exe',
      ['-NoProfile', '-Command', `Expand-Archive -LiteralPath "${archivePath}" -DestinationPath "${dest}" -Force`],
      { windowsHide: true, stdio: 'ignore' }
    )
    ps.once('error', reject)
    ps.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`EXPAND_ARCHIVE_FAILED: exit ${code}`))))
  })
}

async function runRobocopyMove(src: string, dst: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const rc = spawn('robocopy', [src, dst, '/E', '/MOVE'], { windowsHide: true, stdio: 'ignore' })
    rc.once('error', reject)
    rc.once('exit', (code) => (code !== null && code < 8 ? resolve() : reject(new Error(`ROBOCOPY_FAILED: exit ${code}`))))
  })
}

/**
 * 断点续传下载:已有部分走 Range;不支持 Range 时重头;进度 100ms 节流。
 * sha256 校验在调用方对完整落盘文件执行(避免续传场景增量哈希复杂度)。
 */
async function downloadWithResume(url: string, destPath: string, onProgress: ProgressSink): Promise<void> {
  let existingBytes = existsSync(destPath) ? statSync(destPath).size : 0
  const headers: Record<string, string> = {}
  if (existingBytes > 0) headers.Range = `bytes=${existingBytes}-`

  const response = await fetch(url, { headers, signal: AbortSignal.timeout(600_000), redirect: 'follow' })
  if (!response.ok || response.body === null) throw new Error(`KERNEL_DOWNLOAD_FAILED: HTTP ${response.status}`)
  if (existingBytes > 0 && response.status !== 206) {
    existingBytes = 0 // 服务器不支持续传,重头下
  }

  const totalHeader = response.headers.get('content-length')
  const total = existingBytes + (totalHeader !== null ? Number(totalHeader) : 0)
  let received = existingBytes
  let lastEmit = 0

  const body = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream)
  body.on('data', (chunk: Buffer) => {
    received += chunk.length
    if (Date.now() - lastEmit > 100) {
      lastEmit = Date.now()
      onProgress({
        stage: 'kernel-download',
        receivedBytes: received,
        totalBytes: total > 0 ? total : undefined
      })
    }
  })

  await pipeline(body, createWriteStream(destPath, { flags: existingBytes > 0 ? 'a' : 'w' }))
  onProgress({ stage: 'kernel-download', receivedBytes: received, totalBytes: total > 0 ? total : received })
}
