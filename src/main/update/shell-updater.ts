import { autoUpdater } from 'electron-updater'

export interface ShellUpdatePolicy {
  autoDownload: boolean
  intervalHours: number
}

const DEFAULT_POLICY: ShellUpdatePolicy = { autoDownload: true, intervalHours: 6 }

export function startShellUpdater(
  policy: Partial<ShellUpdatePolicy> = {},
  onStatus: (status: string) => void
): void {
  const merged = { ...DEFAULT_POLICY, ...policy }
  autoUpdater.autoDownload = merged.autoDownload

  autoUpdater.on('checking-for-update', () => onStatus('checking'))
  autoUpdater.on('update-available', (info) => onStatus(`available ${info.version}`))
  autoUpdater.on('update-not-available', () => onStatus('up-to-date'))
  autoUpdater.on('download-progress', (progress) => onStatus(`downloading ${Math.round(progress.percent)}%`))
  autoUpdater.on('update-downloaded', () => onStatus('ready-to-install'))

  void autoUpdater.checkForUpdates()
  const timer = setInterval(() => void autoUpdater.checkForUpdates(), merged.intervalHours * 3_600_000)
  timer.unref()
}
