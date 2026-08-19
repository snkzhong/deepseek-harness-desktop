import { Menu, BrowserWindow, dialog } from 'electron'

export interface ContextMenuItem {
  label?: string
  type?: 'separator'
  id: string
}

export async function showContextMenu(window: BrowserWindow, items: ContextMenuItem[]): Promise<string | null> {
  return new Promise((resolve) => {
    let clicked = false
    const menu = Menu.buildFromTemplate(
      items.map((item) =>
        item.type === 'separator'
          ? { type: 'separator' as const }
          : {
              label: item.label ?? item.id,
              click: () => {
                clicked = true
                resolve(item.id)
              }
            }
      )
    )
    menu.once('menu-will-close', () => {
      if (!clicked) resolve(null)
    })
    menu.popup({ window })
  })
}

export async function pickDirectory(window?: BrowserWindow): Promise<string | null> {
  const result = await dialog.showOpenDialog(window!, {
    properties: ['openDirectory', 'createDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]!
}
