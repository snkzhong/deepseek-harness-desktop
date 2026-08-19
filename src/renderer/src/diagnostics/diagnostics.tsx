import { useEffect, useState } from 'react'
import type { RuntimeSnapshot, LogTail } from '../../../shared/contracts'
import { createTranslator, type Locale } from '../../../shared/locales'

export function Diagnostics({ snapshot }: { snapshot: RuntimeSnapshot }): React.JSX.Element {
  const [tail, setTail] = useState<LogTail | null>(null)
  const [exportedPath, setExportedPath] = useState<string | null>(null)
  const [locale, setLocale] = useState<Locale>('en')

  useEffect(() => {
    void window.dshDesktop.app.getLocale().then(setLocale)
    void window.dshDesktop.logs.tail().then(setTail)
  }, [])

  const t = createTranslator(locale)

  async function handleRetry(): Promise<void> {
    await window.dshDesktop.runtime.retry()
  }

  async function handleExport(): Promise<void> {
    const path = await window.dshDesktop.diagnostics.export()
    setExportedPath(path)
  }

  return (
    <main className="diagnostics">
      <h1>{t('diag.title')}</h1>
      <p className="message">{snapshot.message}</p>
      <p className="restarts">{t('diag.restarts', { count: snapshot.restartCount })}</p>
      <pre className="logs">{tail?.lines.slice(-30).join('\n') ?? t('diag.loadingLogs')}</pre>
      <div className="actions">
        <button onClick={() => void handleRetry()}>{t('diag.retry')}</button>
        <button onClick={() => void handleExport()}>{t('diag.export')}</button>
      </div>
      {exportedPath !== null && <p className="exported">{t('diag.exportedTo', { path: exportedPath })}</p>}
    </main>
  )
}
