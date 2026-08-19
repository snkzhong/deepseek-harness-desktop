import { useEffect, useState } from 'react'
import type { RuntimeSnapshot } from '../../../shared/contracts'
import { createTranslator, type Locale } from '../../../shared/locales'

export function Wizard({ snapshot }: { snapshot: RuntimeSnapshot }): React.JSX.Element {
  const [locale, setLocale] = useState<Locale>('en')

  useEffect(() => {
    void window.dshDesktop.app.getLocale().then(setLocale)
  }, [])

  const t = createTranslator(locale)
  return (
    <main className="wizard">
      <div className="logo">D</div>
      <h1>{t('app.title')}</h1>
      <p className="phase">{t(`phase.${snapshot.phase}`)}</p>
      <p className="message">{snapshot.message}</p>
    </main>
  )
}
