#!/usr/bin/env node
/**
 * 打包前准备捆绑内核到 build/dsh-pkg-extracted/(electron-builder 会打包为 resources/dsh-pkg)。
 * 构建机解压好展开目录;用户机首启零复制零解压,直接从 resources 只读运行内核。
 *
 * 用法:
 *   node scripts/fetch-kernel.mjs                       # 拉当前平台 latest
 *   node scripts/fetch-kernel.mjs --dsh-version 0.1.0-rc.7 --platform macos-universal
 */
import { parseArgs } from 'node:util'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

const args = parseArgs({
  options: {
    'dsh-version': { type: 'string' },
    platform: { type: 'string' },
    owner: { type: 'string', default: 'snkzhong' },
    repo: { type: 'string', default: 'dsh-pkg' }
  }
})

const OWNER = args.values.owner
const REPO = args.values.repo

function platformFor(hostPlatform) {
  if (args.values.platform !== undefined) return args.values.platform
  if (hostPlatform === 'darwin') return 'macos-universal'
  if (hostPlatform === 'win32') return 'windows'
  return 'linux'
}

function readFileSafe(path) {
  try {
    return readFileSync(path)
  } catch {
    return null
  }
}

function duSize(dir) {
  try {
    const out = execFileSync('du', ['-sk', dir], { encoding: 'utf8' })
    return Number(out.trim().split(/\s+/)[0]) * 1024
  } catch {
    return 0
  }
}

function extractZip(zipPath, destDir) {
  if (process.platform === 'win32') {
    execFileSync(
      'powershell',
      ['-NoProfile', '-Command', `Expand-Archive -LiteralPath "${zipPath}" -DestinationPath "${destDir}" -Force`],
      { stdio: 'inherit' }
    )
  } else {
    execFileSync('unzip', ['-q', zipPath, '-d', destDir], { stdio: 'inherit' })
  }
}

async function downloadArchive(baseUrl, name, sha, dest) {
  console.log(`[fetch-kernel] downloading ${name}`)
  const response = await fetch(`${baseUrl}/${name}`, { signal: AbortSignal.timeout(600_000), redirect: 'follow' })
  if (!response.ok || response.body === null) throw new Error(`DOWNLOAD_FAILED: HTTP ${response.status}`)
  await pipeline(Readable.fromWeb(response.body), createWriteStream(dest))
  const actual = createHash('sha256').update(readFileSync(dest)).digest('hex')
  if (actual !== sha) {
    rmSync(dest, { force: true })
    throw new Error(`SHA_MISMATCH: ${actual} != ${sha}`)
  }
}

async function main() {
  const platform = platformFor(process.platform)
  const base = `https://github.com/${OWNER}/${REPO}/releases/latest/download`

  const extractedDir = join(process.cwd(), 'build', 'dsh-pkg-extracted')
  const markerPath = join(extractedDir, 'kernel.json')
  const localMarker = readFileSafe(markerPath)
  const local = localMarker === null ? null : JSON.parse(String(localMarker))

  // 版本:显式指定,或从 latest release 的 manifest 探测;探测失败时回退本地缓存(CI 离线/镜像不可达)
  let version = args.values['dsh-version']
  if (version === undefined) {
    try {
      const apiRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(15_000)
      })
      if (!apiRes.ok) throw new Error(`HTTP ${apiRes.status}`)
      const tag = (await apiRes.json()).tag_name
      const match = /dsh-(.+)-[\d]+$/.exec(tag)
      if (!match) throw new Error(`cannot parse version from tag ${tag}`)
      version = match[1]
    } catch (error) {
      if (local === null) throw new Error(`LATEST_FAILED: ${error.message}`)
      console.log(`[fetch-kernel] latest probe failed (${error.message}), using cached kernel ${local.dshVersion}`)
      console.log(`[fetch-kernel] extracted kernel up-to-date (cached): ${local.dshVersion}`)
      return
    }
  }

  let remote
  try {
    const manifestJson = await fetch(`${base}/manifest-${version}-${platform}.json`, { signal: AbortSignal.timeout(15_000) })
    if (!manifestJson.ok) throw new Error(`HTTP ${manifestJson.status}`)
    remote = await manifestJson.json()
  } catch (error) {
    // manifest 拉不到:若本地缓存恰为请求版本且 zip 校验通过,直接复用
    if (local === null || local.dshVersion !== version) throw new Error(`MANIFEST_FAILED: ${error.message}`)
    const cachedZip = join(process.cwd(), 'build', 'dsh-pkg', local.archive)
    const cached = readFileSafe(cachedZip)
    if (cached === null || createHash('sha256').update(cached).digest('hex') !== local.archiveSha256) {
      throw new Error(`MANIFEST_FAILED: ${error.message} (cached zip unusable)`)
    }
    console.log(`[fetch-kernel] manifest unreachable, reusing verified cache: ${version}`)
    console.log(`[fetch-kernel] extracted kernel up-to-date (cached): ${version}`)
    return
  }
  const archiveName = remote.archive
  const expectedSha = remote.archiveSha256

  // 已是最新 → 跳过
  if (local !== null && local.dshVersion === version && local.archiveSha256 === expectedSha) {
    console.log(`[fetch-kernel] extracted kernel up-to-date: ${version}`)
    return
  }

  const zipDir = join(process.cwd(), 'build', 'dsh-pkg')
  mkdirSync(zipDir, { recursive: true })
  const zipPath = join(zipDir, archiveName)

  // zip 缓存命中则复用,否则下载
  const cached = readFileSafe(zipPath)
  if (cached === null || createHash('sha256').update(cached).digest('hex') !== expectedSha) {
    await downloadArchive(base, archiveName, expectedSha, zipPath)
  }

  // 解压展开目录(构建机行为;用户机零解压)。
  // 关键:内核必须位于 kernel/ 子目录——electron-builder 的 filter 无条件排除
  // 复制源根下的 node_modules(filter.js),而 kernel/node_modules 是子目录路径会被保留。
  console.log(`[fetch-kernel] extracting ${archiveName} → build/dsh-pkg-extracted/kernel/`)
  rmSync(extractedDir, { recursive: true, force: true })
  mkdirSync(extractedDir, { recursive: true })
  const unpackDir = join(extractedDir, '_unpack')
  mkdirSync(unpackDir, { recursive: true })
  extractZip(zipPath, unpackDir)
  // zip 内可能有一层根目录(如 package/),取实际内容
  const zipRoot = readdirSync(unpackDir)
  const contentRoot = zipRoot.includes('lib') && zipRoot.includes('node_modules')
    ? unpackDir
    : join(unpackDir, zipRoot.find((entry) => !entry.endsWith('.zip')) ?? '')
  renameSync(contentRoot, join(extractedDir, 'kernel'))
  rmSync(unpackDir, { recursive: true, force: true })
  writeFileSync(
    markerPath,
    JSON.stringify({ dshVersion: version, archive: archiveName, archiveSha256: expectedSha }, null, 2)
  )
  console.log(`[fetch-kernel] bundled kernel ready: ${version} (${(duSize(extractedDir) / 1048576).toFixed(1)} MB extracted)`)
}

await main()
