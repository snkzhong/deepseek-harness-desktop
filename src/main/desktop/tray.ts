import { Tray, nativeImage, Menu, app } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import type { Translator } from '../../shared/locales'

const TRAY_LABEL_MAX = 4
let tray: Tray | undefined

function trayIconPath(): string {
  const packaged = join(process.resourcesPath, 'tray-icon.png')
  if (app.isPackaged && existsSync(packaged)) return packaged
  const appPath = app.getAppPath()
  const candidates = [join(appPath, 'build', 'tray-icon.png'), join(appPath, '..', 'build', 'tray-icon.png')]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return candidates[0]!
}

export function ensureTray(onQuit: () => void, onShow: () => void, t: Translator): void {
  if (tray !== undefined) return
  const iconPath = trayIconPath()
  if (!existsSync(iconPath)) return
  tray = new Tray(nativeImage.createFromPath(iconPath))
  tray.setToolTip(t('tray.tooltip'))
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: t('tray.show'), click: onShow },
      { type: 'separator' },
      { label: t('tray.quit'), click: onQuit }
    ])
  )
  tray.on('click', onShow)
}

export function setTrayBadge(count: number): void {
  if (process.platform === 'darwin') {
    app.dock?.setBadge(count > 0 ? String(Math.min(count, 99)) : '')
    return
  }
  if (tray === undefined) return
  if (count <= 0) {
    tray.setTitle('')
    return
  }
  const text = count > TRAY_LABEL_MAX ? '9+' : String(count)
  tray.setTitle(` ${text}`)
}
