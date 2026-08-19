import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { IPC_CHANNELS, SPLASH_CHANNELS, APP_CHANNELS, ASSEMBLE_STAGES, type RuntimeSnapshot, type AssembleProgress } from '../shared/contracts'
import { normalizeLocale, createTranslator, isLocale, type Locale, type MessageKey, type Translator } from '../shared/locales'
import { RuntimeOrchestrator } from './orchestrator/runtime'
import { spawnHarness, pickFreePort, waitUntilReady, type HarnessChild } from './orchestrator/spawn'
import { ensureNodeRuntime } from './env/node-resolver'
import { createArchiveKernelSource, resolveKernelEntry } from './env/kernel-source'
import { createSplashWindow } from './window/splash'
import { openMainWindow, getMainWindow } from './window/main-window'
import { createSessionToken } from './security/token'
import { RingLogger } from './diagnostics/logger'
import { exportDiagnostics } from './diagnostics/export'
import { showNotification } from './desktop/notification'
import { ensureTray, setTrayBadge } from './desktop/tray'
import { registerShortcut, unregisterShortcut, unregisterAllShortcuts } from './desktop/shortcut'
import { showContextMenu, pickDirectory } from './desktop/menu'
import { loadSettings } from './state/settings'

// userData 用带命名空间限定的 RDN slug(io.github.<owner>.<repo>):"deepseek-harness-desktop"
// 是上游生态通用名,任意产品都可能占用同名目录(数据混写 + 单例锁互相误杀);
// GitHub 强制 <owner>/<repo> 全局唯一,除非仿冒我们的账号否则不会冲突。
// 必须在 requestSingleInstanceLock 之前设置(锁文件落在 userData)。
app.setPath('userData', join(app.getPath('appData'), 'io.github.snkzhong.deepseek-harness-desktop'))

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

app.on('second-instance', () => {
  getMainWindow()?.show()
})

function userDataDir(): string {
  return app.getPath('userData')
}

function dshHome(): string {
  // 永远隔离:~/.dsh 是全 dsh 生态(官方 CLI、各桌面客户端)的公共读写目录,
  // rc 期 schema 频繁变更 + 存储并发写,共享即数据损坏。将来凭证共享走一次性导入。
  return join(userDataDir(), 'dsh')
}

/** 活动子进程登记表(模块级):退出清理用,防孤儿进程占端口。 */
const activeChildrenGlobal = new Set<HarnessChild>()
let quitCleanupDone = false

app.whenReady().then(async () => {
  const harnessLog = new RingLogger(join(userDataDir(), 'logs', 'dsh-web.log'))
  harnessLog.open()
  console.log('[deepseek-harness-desktop] app ready, wiring orchestrator')

  const settings = loadSettings(userDataDir())
  // 用户设置的语言覆盖 > 系统 locale;'system' 或非法值走系统检测
  const locale: Locale = isLocale(settings.locale) ? settings.locale : normalizeLocale(app.getLocale())
  const t = createTranslator(locale)
  console.log(`[deepseek-harness-desktop] locale=${locale}`)

  const sessionToken = createSessionToken()

  // splash 先创建再接进度事件;加载完成即启动编排器(生命周期不依赖 UI 成败)
  const splash = createSplashWindow(() => {
    console.log('[deepseek-harness-desktop] splash ready, starting orchestrator')
    void orchestrator.start().catch((error) => console.error('[deepseek-harness-desktop] start failed:', error))
  })
  splash.webContents.once('did-fail-load', (_event, code, desc, url) => {
    console.error(`[deepseek-harness-desktop] splash failed to load: ${code} ${desc} ${url}`)
    splash.show()
    void orchestrator.start().catch((error) => console.error('[deepseek-harness-desktop] start failed:', error))
  })

  // 结构化进度 → 本地化文案 → 推送 splash + 写日志。i18n 收敛在此。
  const emitProgress = (progress: AssembleProgress): AssembleProgress => {
    const mb = (n: number): string => `${(n / 1_048_576).toFixed(1)} MB`
    let message = progress.message ?? ''
    if (progress.message === undefined) {
      const v = progress.version ?? ''
      switch (progress.stage) {
        case 'kernel-download':
          message =
            progress.receivedBytes === undefined
              ? t('progress.download', { version: v })
              : t('progress.downloadProgress', {
                  version: v,
                  received: mb(progress.receivedBytes),
                  total: progress.totalBytes !== undefined ? mb(progress.totalBytes) : ''
                })
          break
        case 'kernel-extract':
          message = t('progress.extract')
          break
        case 'kernel-deps':
          message =
            progress.detailLine !== undefined
              ? t('progress.depsLine', { line: progress.detailLine })
              : t('progress.deps')
          break
        case 'kernel-latest':
          message = t('progress.checkingLocal')
          break
        case 'node-check':
          message = t('progress.locatingNode')
          break
        case 'spawn':
          message = t('progress.spawn')
          break
        case 'health':
          message = t('progress.health')
          break
      }
    }
    const localized: AssembleProgress = { ...progress, message }
    harnessLog.append(`[progress] ${localized.stage}: ${localized.message}`)
    if (!splash.isDestroyed()) {
      splash.webContents.send(SPLASH_CHANNELS.progress, localized)
    }
    return localized
  }

  const orchestrator = new RuntimeOrchestrator({
    async assemble() {
      const kernelSource = createArchiveKernelSource({ owner: 'snkzhong', repo: 'dsh-pkg' })

      emitProgress({ stage: 'kernel-latest', indeterminate: true })
      // 1. 用户目录已有(自愈更新版)→ 2. 安装包捆绑(只读直跑,零 IO)→ 3. 远程下载兜底
      let resolved = resolveKernelEntry(userDataDir())
      if (resolved === null) {
        const latest = await kernelSource.latest()
        harnessLog.append(`Downloading dsh-pkg ${latest}...`)
        await kernelSource.download(latest, emitProgress)
        resolved = resolveKernelEntry(userDataDir())
      }
      if (resolved === null) {
        throw new Error('KERNEL_INSTALL_FAILED: no runnable kernel after install')
      }

      emitProgress({ stage: 'node-check', indeterminate: true })
      const node = await ensureNodeRuntime(userDataDir(), { onProgress: emitProgress })
      const dshHomePath = dshHome()
      await mkdir(dshHomePath, { recursive: true })
      console.log(`[deepseek-harness-desktop] assembled: node=${node.exePath} (${node.version}) kernel=${resolved.source}@${resolved.version}`)
      return { nodeExe: node.exePath, dshEntry: resolved.entryPath, dshHome: dshHomePath }
    },
    spawnChild(port, env) {
      emitProgress({ stage: 'spawn', indeterminate: true })
      const child = spawnHarness({
        nodeExe: env.nodeExe,
        dshEntry: env.dshEntry,
        dshHome: env.dshHome,
        port,
        launchDirectory: env.dshHome,
        onStdout: (data) => harnessLog.append(data.trimEnd()),
        onStderr: (data) => harnessLog.append(data.trimEnd())
      })
      activeChildrenGlobal.add(child)
      child.onExit(() => activeChildrenGlobal.delete(child))
      return child
    },
    pickPort: pickFreePort,
    waitUntilReady: async (port, timeoutMs) => {
      emitProgress({ stage: 'health', indeterminate: true })
      return waitUntilReady(port, timeoutMs)
    },
    onSnapshot(snapshot: RuntimeSnapshot) {
      console.log(`[deepseek-harness-desktop] phase=${snapshot.phase} ${snapshot.message}`)
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send(IPC_CHANNELS.runtimeSnapshot, snapshot)
      }
      if (snapshot.phase === 'ready' && snapshot.url !== undefined) {
        emitProgress({ stage: 'health', message: t('progress.ready'), receivedBytes: 1, totalBytes: 1 })
        if (!splash.isDestroyed()) splash.close()
        openMainWindow(sessionToken.attachTo(snapshot.url))
        ensureTray(() => void app.quit(), () => getMainWindow()?.show(), t)
      }
    }
  })

  registerIpc({
    orchestrator,
    harnessLog,
    shellLogPath: join(userDataDir(), 'logs', 'main.log'),
    locale,
    t
  })
})

interface IpcDeps {
  orchestrator: RuntimeOrchestrator
  harnessLog: RingLogger
  shellLogPath: string
  locale: Locale
  t: Translator
}

function registerIpc(deps: IpcDeps): void {
  ipcMain.handle(APP_CHANNELS.getLocale, () => deps.locale)
  ipcMain.handle(APP_CHANNELS.getStageLabels, () => {
    const labels: Record<string, string> = {}
    for (const stage of ASSEMBLE_STAGES) {
      labels[stage] = deps.t(`stage.${stage}` as MessageKey)
    }
    return labels
  })
  ipcMain.handle(IPC_CHANNELS.runtimeGet, () => deps.orchestrator.snapshot)
  ipcMain.handle(IPC_CHANNELS.runtimeRetry, () => deps.orchestrator.start())
  ipcMain.handle(IPC_CHANNELS.logTailGet, () => ({ lines: deps.harnessLog.tail(200) }))
  ipcMain.handle(IPC_CHANNELS.diagnosticsExport, () =>
    exportDiagnostics(deps.harnessLog, deps.shellLogPath, deps.t)
  )
  ipcMain.handle(IPC_CHANNELS.notificationShow, (_e, title: string, body: string) => showNotification(title, body))
  ipcMain.handle(IPC_CHANNELS.traySetBadge, (_e, count: number) => setTrayBadge(count))
  ipcMain.handle(IPC_CHANNELS.shortcutRegister, (_e, accelerator: string, id: string) =>
    registerShortcut(accelerator, id)
  )
  ipcMain.handle(IPC_CHANNELS.shortcutUnregister, (_e, id: string) => unregisterShortcut(id))
  ipcMain.handle(IPC_CHANNELS.contextMenuShow, (e, items) => {
    const window = BrowserWindow.fromWebContents(e.sender)
    if (window == null) return null
    return showContextMenu(window, items)
  })
  ipcMain.handle(IPC_CHANNELS.directoryPickerPick, (e) => {
    const window = BrowserWindow.fromWebContents(e.sender)
    if (window == null) return null
    return pickDirectory(window)
  })
  ipcMain.handle(IPC_CHANNELS.openExternal, (_e, url: string) => shell.openExternal(url))
  ipcMain.handle(IPC_CHANNELS.openPath, (_e, path: string) => shell.openPath(path))
}

/** 退出前杀掉所有 dsh 子进程(整棵树),绝不留孤儿占端口。 */
async function killChildrenOnQuit(): Promise<void> {
  const kills = Array.from(activeChildrenGlobal).map((child) => child.killTree())
  await Promise.allSettled(kills)
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', (event) => {
  unregisterAllShortcuts()
  if (quitCleanupDone || activeChildrenGlobal.size === 0) return
  quitCleanupDone = true
  event.preventDefault()
  void killChildrenOnQuit().finally(() => app.quit())
})
