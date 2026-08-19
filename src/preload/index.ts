import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_CHANNELS,
  SPLASH_CHANNELS,
  APP_CHANNELS,
  type RuntimeSnapshot,
  type LogTail,
  type AssembleProgress
} from '../shared/contracts'
import type { Locale } from '../shared/locales'

const api = {
  app: {
    getLocale(): Promise<Locale> {
      return ipcRenderer.invoke(APP_CHANNELS.getLocale) as Promise<Locale>
    },
    getStageLabels(): Promise<Record<string, string>> {
      return ipcRenderer.invoke(APP_CHANNELS.getStageLabels)
    }
  },
  runtime: {
    get(): Promise<RuntimeSnapshot> {
      return ipcRenderer.invoke(IPC_CHANNELS.runtimeGet)
    },
    retry(): Promise<void> {
      return ipcRenderer.invoke(IPC_CHANNELS.runtimeRetry)
    },
    onSnapshotChanged(listener: (snapshot: RuntimeSnapshot) => void): () => void {
      const handler = (_e: unknown, snapshot: RuntimeSnapshot): void => listener(snapshot)
      ipcRenderer.on(IPC_CHANNELS.runtimeSnapshot, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.runtimeSnapshot, handler)
    }
  },
  splash: {
    onProgress(listener: (progress: AssembleProgress) => void): () => void {
      const handler = (_e: unknown, progress: AssembleProgress): void => listener(progress)
      ipcRenderer.on(SPLASH_CHANNELS.progress, handler)
      return () => ipcRenderer.removeListener(SPLASH_CHANNELS.progress, handler)
    }
  },
  logs: {
    tail(): Promise<LogTail> {
      return ipcRenderer.invoke(IPC_CHANNELS.logTailGet)
    }
  },
  diagnostics: {
    export(): Promise<string | null> {
      return ipcRenderer.invoke(IPC_CHANNELS.diagnosticsExport)
    }
  },
  desktop: {
    showNotification(title: string, body: string): Promise<void> {
      return ipcRenderer.invoke(IPC_CHANNELS.notificationShow, title, body)
    },
    setTrayBadge(count: number): Promise<void> {
      return ipcRenderer.invoke(IPC_CHANNELS.traySetBadge, count)
    },
    registerShortcut(accelerator: string, id: string): Promise<boolean> {
      return ipcRenderer.invoke(IPC_CHANNELS.shortcutRegister, accelerator, id)
    },
    unregisterShortcut(id: string): Promise<boolean> {
      return ipcRenderer.invoke(IPC_CHANNELS.shortcutUnregister, id)
    },
    showContextMenu(items: Array<{ label?: string; type?: 'separator'; id: string }>): Promise<string | null> {
      return ipcRenderer.invoke(IPC_CHANNELS.contextMenuShow, items)
    },
    pickDirectory(): Promise<string | null> {
      return ipcRenderer.invoke(IPC_CHANNELS.directoryPickerPick)
    },
    openExternal(url: string): Promise<void> {
      return ipcRenderer.invoke(IPC_CHANNELS.openExternal, url)
    },
    openPath(path: string): Promise<void> {
      return ipcRenderer.invoke(IPC_CHANNELS.openPath, path)
    }
  }
}

contextBridge.exposeInMainWorld('dshDesktop', api)
