#!/usr/bin/env node
/**
 * 统一 CI 编排:precheck / typecheck / test / smoke / 打包 / 产物校验 / git 提交推送 / GitHub Release。
 *
 * 用法:
 *   node scripts/ci.mjs check                          # typecheck + test + smoke
 *   node scripts/ci.mjs package [--dir|--mac|--win]    # fetch 内核 → build → electron-builder
 *   node scripts/ci.mjs verify                         # 校验 dist 产物 + 捆绑内核完整性
 *   node scripts/ci.mjs all                            # check + package + verify(发布门禁)
 *   node scripts/ci.mjs commit "msg"                   # git add + commit(无仓库时自动 init -b main)
 *   node scripts/ci.mjs push                           # push origin <branch> + tags
 *   node scripts/ci.mjs release [--bump patch|minor|major|prerelease]
 *                                                      # all → bump → commit → tag → push → gh release
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const PREFIX = '[ci]'
const DEFAULT_REMOTE = process.env.DSH_HARNESS_DESKTOP_REMOTE ?? 'https://github.com/snkzhong/deepseek-harness-desktop.git'
const IS_WIN = process.platform === 'win32'
const ARTIFACT_RE = /\.(dmg|zip|exe|AppImage|deb|rpm|blockmap)$/

const [command = 'all', ...rest] = process.argv.slice(2)

function fail(message) {
  console.error(`${PREFIX} FAILED: ${message}`)
  process.exit(1)
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: IS_WIN,
    cwd: ROOT,
    ...options
  })
  if (result.status !== 0) throw new Error(`\`${[cmd, ...args].join(' ')}\` exited with ${result.status}`)
  return result
}

function tryRun(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', shell: IS_WIN, cwd: ROOT })
  return result.status === 0 ? result.stdout.trim() : null
}

function npmRun(script, ...args) {
  run(IS_WIN ? 'npm.cmd' : 'npm', ['run', script, ...args])
}

function precheck() {
  const [major, minor] = process.versions.node.split('.').map(Number)
  const ok = major === 22 ? minor >= 19 : major >= 24
  if (!ok) fail(`node ${process.versions.node} 不满足 ^22.19.0 || >=24.0.0`)
  if (!existsSync(join(ROOT, 'node_modules'))) fail('node_modules 缺失,先运行 npm install')
  if (!existsSync(join(ROOT, '.git'))) {
    run('git', ['init', '-b', 'main'])
    console.log(`${PREFIX} git repo initialized (branch main)`)
  }
}

function stageCheck() {
  npmRun('typecheck')
  npmRun('test')
  npmRun('smoke')
}

function stagePackage(args) {
  npmRun('fetch:kernel')
  npmRun('build')
  const platformArg = ['--mac', '--win', '--linux'].find((flag) => args.includes(flag))
  const builderArgs = platformArg === undefined ? [] : [platformArg]
  if (args.includes('--dir')) builderArgs.push('--dir')
  builderArgs.push('--publish', 'never')
  run(IS_WIN ? 'electron-builder.cmd' : 'npx', ['electron-builder', ...builderArgs])
}

function findAppResources(dir) {
  const found = []
  for (const entry of readdirSync(dir)) {
    const entryPath = join(dir, entry)
    let stat = null
    try { stat = statSync(entryPath) } catch { continue }
    if (!stat.isDirectory()) continue
    if (entry.endsWith('-unpacked')) {
      found.push(join(entryPath, 'resources'))
    } else if (entry.endsWith('.app')) {
      found.push(join(entryPath, 'Contents', 'Resources'))
    } else {
      found.push(...findAppResources(entryPath))
    }
  }
  return found
}

function unpackedResourcesDir() {
  const distDir = join(ROOT, 'dist')
  if (!existsSync(distDir)) return null
  const candidates = findAppResources(distDir)
  return candidates.find((resourcesDir) => existsSync(join(resourcesDir, 'dsh-pkg', 'kernel.json'))) ?? null
}

function stageVerify() {
  const resources = unpackedResourcesDir()
  if (resources === null) fail('找不到解包产物中的 dsh-pkg(先运行 package)')

  const kernelModules = join(resources, 'dsh-pkg', 'kernel', 'node_modules')
  const moduleCount = existsSync(kernelModules) ? readdirSync(kernelModules).length : 0
  if (moduleCount < 100) fail(`捆绑内核 node_modules 仅 ${moduleCount} 个包,electron-builder 排除陷阱可能复现`)

  const artifacts = readdirSync(join(ROOT, 'dist')).filter(
    (name) => ARTIFACT_RE.test(name) || /^latest/.test(name)
  )
  if (artifacts.length === 0) {
    console.log(`${PREFIX} verify: kernel ${JSON.parse(readFileSync(join(resources, 'dsh-pkg', 'kernel.json'), 'utf8')).dshVersion}, ${moduleCount} packages, unpacked app ok (no distributable artifacts — --dir build)`)
    return
  }

  const kernelMarker = JSON.parse(readFileSync(join(resources, 'dsh-pkg', 'kernel.json'), 'utf8'))
  console.log(`${PREFIX} verify: kernel ${kernelMarker.dshVersion}, ${moduleCount} packages, artifacts:`)
  for (const name of artifacts) {
    const size = (statSync(join(ROOT, 'dist', name)).size / 1048576).toFixed(1)
    console.log(`${PREFIX}   ${name} (${size} MB)`)
  }
}

function ensureRemote() {
  const remotes = tryRun('git', ['remote']) ?? ''
  if (remotes.split('\n').includes('origin')) return
  run('git', ['remote', 'add', 'origin', DEFAULT_REMOTE])
  console.log(`${PREFIX} remote origin -> ${DEFAULT_REMOTE}`)
}

function currentBranch() {
  return tryRun('git', ['rev-parse', '--abbrev-ref', 'HEAD']) ?? 'main'
}

function gitCommit(message) {
  run('git', ['add', '-A'])
  const dirty = tryRun('git', ['status', '--porcelain'])
  if (dirty === '') {
    console.log(`${PREFIX} nothing to commit`)
    return false
  }
  run('git', ['commit', '-m', message])
  return true
}

function stageCommit(message) {
  if (message === undefined) fail('用法: node scripts/ci.mjs commit "msg"')
  gitCommit(message)
}

function stagePush() {
  ensureRemote()
  const branch = currentBranch()
  run('git', ['push', '-u', 'origin', branch])
  run('git', ['push', '--tags', 'origin', branch])
}

function currentVersion() {
  return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version
}

function bumpVersion(kind) {
  if (kind === undefined) return currentVersion()
  run(IS_WIN ? 'npm.cmd' : 'npm', ['version', kind, '--no-git-tag-version'])
  return currentVersion()
}

function releaseFiles() {
  return readdirSync(join(ROOT, 'dist'))
    .filter((name) => ARTIFACT_RE.test(name) || /^latest.*\.yml$/.test(name))
    .map((name) => join('dist', name))
}

function stageRelease(args) {
  const bumpIndex = args.indexOf('--bump')
  const kind = bumpIndex !== -1 ? args[bumpIndex + 1] : undefined
  const dirty = tryRun('git', ['status', '--porcelain'])
  if (dirty !== '') fail('工作区不干净,先提交或 stash')

  stageCheck()
  stagePackage([])
  stageVerify()

  const version = bumpVersion(kind)
  const tag = `v${version}`
  const kernelMarker = JSON.parse(readFileSync(join(ROOT, 'build', 'dsh-pkg-extracted', 'kernel.json'), 'utf8'))
  const files = releaseFiles()
  if (files.length === 0) fail('没有可上传的 release 产物')

  gitCommit(`release: v${version} (kernel dsh ${kernelMarker.dshVersion})`)
  run('git', ['tag', '-f', tag])
  stagePush()

  const notes = [
    `DeepSeek Harness Desktop v${version}`,
    '',
    `- Kernel: @deepseek-ai/dsh ${kernelMarker.dshVersion} (sha256 ${kernelMarker.archiveSha256.slice(0, 12)}…)`,
    `- Platform: ${process.platform}`,
    '',
    '质量门禁:typecheck / vitest / smoke / 产物校验 全部通过。'
  ].join('\n')

  if (tryRun('gh', ['--version']) === null) {
    console.log(`${PREFIX} gh CLI 不可用,请手动发布:`)
    console.log(`${PREFIX}   gh release create ${tag} ${files.join(' ')} --notes "..."`)
    return
  }
  run('gh', ['release', 'create', tag, ...files, '--title', `DeepSeek Harness Desktop ${tag}`, '--notes', notes])
  console.log(`${PREFIX} release ${tag} published`)
}

const stages = { precheck }

async function main() {
  const started = Date.now()
  try {
    stages.precheck()
    if (command === 'check') stageCheck()
    else if (command === 'package') stagePackage(rest)
    else if (command === 'verify') stageVerify()
    else if (command === 'all') {
      stageCheck()
      stagePackage(rest)
      stageVerify()
    }
    else if (command === 'commit') stageCommit(rest[0])
    else if (command === 'push') stagePush()
    else if (command === 'release') stageRelease(rest)
    else fail(`未知命令: ${command}(可用: check | package | verify | all | commit | push | release)`)
    console.log(`${PREFIX} ${command} PASSED (${((Date.now() - started) / 1000).toFixed(1)}s)`)
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }
}

await main()
