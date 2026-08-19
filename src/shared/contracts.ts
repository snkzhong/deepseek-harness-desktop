export type RuntimePhase =
  | 'idle'
  | 'assembling'
  | 'starting'
  | 'ready'
  | 'degraded'
  | 'stopped'

export interface RuntimeSnapshot {
  phase: RuntimePhase
  message: string
  url?: string
  restartCount: number
}

export type AssembleStage =
  | 'node-check'
  | 'node-download'
  | 'node-extract'
  | 'kernel-latest'
  | 'kernel-download'
  | 'kernel-extract'
  | 'kernel-deps'
  | 'spawn'
  | 'health'

/** 阶段展示顺序(splash 清单与 stage.* 文案 key 同构)。 */
export const ASSEMBLE_STAGES: readonly AssembleStage[] = [
  'node-check',
  'node-download',
  'node-extract',
  'kernel-latest',
  'kernel-download',
  'kernel-extract',
  'kernel-deps',
  'spawn',
  'health'
]

export interface AssembleProgress {
  stage: AssembleStage
  /** 本地化文案由 main 进程按 locale 填充;原始事件可无 message。 */
  message?: string
  receivedBytes?: number
  totalBytes?: number
  indeterminate?: boolean
  /** 依赖安装阶段转发的工具输出行(如 npm),供 main 拼接展示。 */
  detailLine?: string
  /** 下载阶段用于文案的版本号。 */
  version?: string
}

export interface LogTail {
  lines: string[]
}

export interface DesktopCapabilities {
  notification: boolean
  tray: boolean
  shortcut: boolean
  contextMenu: boolean
  directoryPicker: boolean
}

export interface ShellSettings {
  locale: string
  downloadMirror?: string
}

export const IPC_CHANNELS = {
  runtimeSnapshot: 'runtime:snapshot-changed',
  assembleProgress: 'runtime:assemble-progress',
  logTail: 'runtime:log-tail',
  runtimeGet: 'runtime:get',
  runtimeRetry: 'runtime:retry',
  logTailGet: 'log:tail',
  diagnosticsExport: 'diagnostics:export',
  notificationShow: 'desktop:notification-show',
  traySetBadge: 'desktop:tray-set-badge',
  shortcutRegister: 'desktop:shortcut-register',
  shortcutUnregister: 'desktop:shortcut-unregister',
  contextMenuShow: 'desktop:context-menu-show',
  directoryPickerPick: 'desktop:directory-picker-pick',
  openExternal: 'desktop:open-external',
  openPath: 'desktop:open-path'
} as const

export const SPLASH_CHANNELS = {
  progress: 'splash:progress'
} as const

export const APP_CHANNELS = {
  getLocale: 'app:get-locale',
  getStageLabels: 'app:get-stage-labels'
} as const
