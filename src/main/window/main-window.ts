import { BrowserWindow, shell } from 'electron'
import { preloadPath } from './preload-path'

const LOOPBACK_ORIGIN_RE = /^https?:\/\/127(?:\.0){3}\d(?::\d+)?$/i

let mainWindow: BrowserWindow | undefined

export function getMainWindow(): BrowserWindow | undefined {
  return mainWindow
}

export function openMainWindow(url: string): BrowserWindow {
  console.log(`[deepseek-harness-desktop] opening main window: ${url}`)
  if (mainWindow !== undefined && !mainWindow.isDestroyed()) {
    void mainWindow.loadURL(url)
    mainWindow.show()
    return mainWindow
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#ffffff',
    title: 'DeepSeek Harness Desktop',
    webPreferences: {
      preload: preloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })

  mainWindow.once('ready-to-show', () => {
    console.log('[deepseek-harness-desktop] main window ready-to-show')
    mainWindow?.show()
  })
  guardNavigation(mainWindow)
  void mainWindow.loadURL(url).then(
    () => console.log('[deepseek-harness-desktop] main window loadURL done'),
    (error) => console.error('[deepseek-harness-desktop] main window loadURL failed:', String(error))
  )
  mainWindow.on('closed', () => {
    mainWindow = undefined
  })
  return mainWindow
}

function guardNavigation(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (LOOPBACK_ORIGIN_RE.test(new URL(url).origin)) return { action: 'allow' }
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    const origin = new URL(url).origin
    if (!LOOPBACK_ORIGIN_RE.test(origin)) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })
}
