import type { MessageKey } from './en'

const zhTW: Record<MessageKey, string> = {
  'app.title': 'DeepSeek Harness Desktop',
  'common.loading': '載入中…',

  'stage.node-check': '檢查執行時',
  'stage.node-download': '下載 Node.js',
  'stage.node-extract': '解壓縮 Node.js',
  'stage.kernel-latest': '取得版本資訊',
  'stage.kernel-download': '下載 Harness',
  'stage.kernel-extract': '解壓縮中',
  'stage.kernel-deps': '安裝依賴',
  'stage.spawn': '啟動服務',
  'stage.health': '驗證中',

  'progress.checkingLocal': '正在檢查本地 Harness…',
  'progress.download': '正在下載 Harness {version}…',
  'progress.downloadProgress': '正在下載 Harness {version}… {received} / {total}',
  'progress.extract': '正在解壓縮…',
  'progress.deps': '正在安裝依賴…',
  'progress.depsLine': '正在安裝依賴 — {line}',
  'progress.locatingNode': '正在定位 Node.js 執行時…',
  'progress.spawn': '正在啟動 Harness 服務…',
  'progress.health': '正在確認服務就緒…',
  'progress.ready': '就緒',

  'phase.idle': '閒置',
  'phase.assembling': '正在準備執行環境…',
  'phase.starting': '正在啟動 Harness…',
  'phase.ready': '就緒',
  'phase.degraded': 'Harness 啟動失敗',
  'phase.stopped': '已停止',

  'tray.tooltip': 'DeepSeek Harness Desktop',
  'tray.show': '顯示主視窗',
  'tray.quit': '結束',

  'diag.title': 'Harness 啟動失敗',
  'diag.restarts': '重新啟動嘗試次數:{count}',
  'diag.retry': '重試',
  'diag.export': '匯出診斷資訊',
  'diag.exportedTo': '已儲存到 {path}',
  'diag.loadingLogs': '正在載入日誌…',
  'diag.exportDialog': '匯出診斷資訊'
}

export default zhTW
