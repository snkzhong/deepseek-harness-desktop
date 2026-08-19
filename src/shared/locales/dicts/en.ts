/**
 * 英语字典 = key 的事实源(source of truth)。
 * 新增 key 先加在这里;其他语言文件是 Record<MessageKey, string>,
 * 缺 key 会在编译期报错(tsc 即翻译完整性门禁)。
 */
const en = {
  'app.title': 'DeepSeek Harness Desktop',
  'common.loading': 'Loading…',

  'stage.node-check': 'Checking runtime',
  'stage.node-download': 'Downloading Node.js',
  'stage.node-extract': 'Extracting Node.js',
  'stage.kernel-latest': 'Fetching version',
  'stage.kernel-download': 'Downloading Harness',
  'stage.kernel-extract': 'Extracting',
  'stage.kernel-deps': 'Installing dependencies',
  'stage.spawn': 'Starting service',
  'stage.health': 'Verifying',

  'progress.checkingLocal': 'Checking local Harness…',
  'progress.download': 'Downloading Harness {version}…',
  'progress.downloadProgress': 'Downloading Harness {version}… {received} / {total}',
  'progress.extract': 'Extracting…',
  'progress.deps': 'Installing dependencies…',
  'progress.depsLine': 'Installing dependencies — {line}',
  'progress.locatingNode': 'Locating Node.js runtime…',
  'progress.spawn': 'Starting Harness service…',
  'progress.health': 'Verifying Harness is up…',
  'progress.ready': 'Ready',

  'phase.idle': 'Idle',
  'phase.assembling': 'Preparing runtime environment…',
  'phase.starting': 'Starting Harness…',
  'phase.ready': 'Ready',
  'phase.degraded': 'Harness failed',
  'phase.stopped': 'Stopped',

  'tray.tooltip': 'DeepSeek Harness Desktop',
  'tray.show': 'Show',
  'tray.quit': 'Quit',

  'diag.title': 'Harness failed to start',
  'diag.restarts': 'Restart attempts: {count}',
  'diag.retry': 'Retry',
  'diag.export': 'Export diagnostics',
  'diag.exportedTo': 'Saved to {path}',
  'diag.loadingLogs': 'Loading logs…',
  'diag.exportDialog': 'Export diagnostics'
} as const

export type MessageKey = keyof typeof en
export default en
