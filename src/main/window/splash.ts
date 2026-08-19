import { BrowserWindow, app } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { preloadPath } from './preload-path'

export function createSplashWindow(onReadyToShow: () => void): BrowserWindow {
  const window = new BrowserWindow({
    width: 480,
    height: 440,
    frame: false,
    resizable: false,
    center: true,
    show: false,
    alwaysOnTop: true,
    backgroundColor: '#17161a',
    webPreferences: {
      preload: preloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })
  window.once('ready-to-show', () => {
    console.log('[deepseek-harness-desktop] splash ready-to-show fired')
    window.show()
    onReadyToShow()
  })
  window.webContents.once('did-finish-load', () => {
    // Fallback: if ready-to-show was missed (e.g. window shown early), still start.
    setTimeout(() => onReadyToShow(), 50)
  })
  void window.loadFile(splashResourcePath())
  return window
}

export function splashResourcePath(): string {
  const packaged = join(process.resourcesPath, 'splash.html')
  if (app.isPackaged && existsSync(packaged)) return packaged
  // electron-vite dev runs main from out/, project resources/ sits two levels up.
  const appPath = app.getAppPath()
  const candidates = [join(appPath, 'resources', 'splash.html'), join(appPath, '..', 'resources', 'splash.html')]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return candidates[0]!
}
