/// <reference types="vite/client" />

import type { RuntimeSnapshot, LogTail } from '../shared/contracts'
import type { Locale } from '../shared/locales'

declare global {
  interface Window {
    dshDesktop: {
      app: {
        getLocale(): Promise<Locale>
        getStageLabels(): Promise<Record<string, string>>
      }
      runtime: {
        get(): Promise<RuntimeSnapshot>
        retry(): Promise<void>
        onSnapshotChanged(listener: (snapshot: RuntimeSnapshot) => void): () => void
      }
      logs: {
        tail(): Promise<LogTail>
      }
      diagnostics: {
        export(): Promise<string | null>
      }
      desktop: {
        showNotification(title: string, body: string): Promise<void>
        setTrayBadge(count: number): Promise<void>
        registerShortcut(accelerator: string, id: string): Promise<boolean>
        unregisterShortcut(id: string): Promise<boolean>
        showContextMenu(
          items: Array<{ label?: string; type?: 'separator'; id: string }>
        ): Promise<string | null>
        pickDirectory(): Promise<string | null>
        openExternal(url: string): Promise<void>
        openPath(path: string): Promise<void>
      }
    }
  }
}

export {}
