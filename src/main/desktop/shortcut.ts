import { globalShortcut } from 'electron'

const registered = new Map<string, string>()

export function registerShortcut(accelerator: string, id: string): boolean {
  if (registered.has(id)) unregisterShortcut(id)
  const ok = globalShortcut.register(accelerator, () => {
    // v1: shortcuts focus the main window; plugin-specific actions arrive via client plugins later.
    const { getMainWindow } = require('../window/main-window') as typeof import('../window/main-window')
    getMainWindow()?.show()
  })
  if (ok) registered.set(id, accelerator)
  return ok
}

export function unregisterShortcut(id: string): boolean {
  const accelerator = registered.get(id)
  if (accelerator === undefined) return false
  globalShortcut.unregister(accelerator)
  registered.delete(id)
  return true
}

export function unregisterAllShortcuts(): void {
  globalShortcut.unregisterAll()
  registered.clear()
}
