import type { MessageKey } from './en'

const zhCN: Record<MessageKey, string> = {
  'app.title': 'DeepSeek Harness Desktop',
  'common.loading': '加载中…',

  'stage.node-check': '检查运行时',
  'stage.node-download': '下载 Node.js',
  'stage.node-extract': '解压 Node.js',
  'stage.kernel-latest': '获取版本信息',
  'stage.kernel-download': '下载 Harness',
  'stage.kernel-extract': '解压中',
  'stage.kernel-deps': '安装依赖',
  'stage.spawn': '启动服务',
  'stage.health': '验证中',

  'progress.checkingLocal': '正在检查本地 Harness…',
  'progress.download': '正在下载 Harness {version}…',
  'progress.downloadProgress': '正在下载 Harness {version}… {received} / {total}',
  'progress.extract': '正在解压…',
  'progress.deps': '正在安装依赖…',
  'progress.depsLine': '正在安装依赖 — {line}',
  'progress.locatingNode': '正在定位 Node.js 运行时…',
  'progress.spawn': '正在启动 Harness 服务…',
  'progress.health': '正在确认服务就绪…',
  'progress.ready': '就绪',

  'phase.idle': '空闲',
  'phase.assembling': '正在准备运行环境…',
  'phase.starting': '正在启动 Harness…',
  'phase.ready': '就绪',
  'phase.degraded': 'Harness 启动失败',
  'phase.stopped': '已停止',

  'tray.tooltip': 'DeepSeek Harness Desktop',
  'tray.show': '显示主窗口',
  'tray.quit': '退出',

  'diag.title': 'Harness 启动失败',
  'diag.restarts': '重启尝试次数:{count}',
  'diag.retry': '重试',
  'diag.export': '导出诊断信息',
  'diag.exportedTo': '已保存到 {path}',
  'diag.loadingLogs': '正在加载日志…',
  'diag.exportDialog': '导出诊断信息'
}

export default zhCN
