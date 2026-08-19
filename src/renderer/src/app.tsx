import { useEffect, useState } from 'react'
import type { RuntimeSnapshot } from '../../shared/contracts'
import { Diagnostics } from './diagnostics/diagnostics'
import { Wizard } from './wizard/wizard'

export function App(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot | null>(null)

  useEffect(() => {
    void window.dshDesktop.runtime.get().then(setSnapshot)
    return window.dshDesktop.runtime.onSnapshotChanged(setSnapshot)
  }, [])

  if (snapshot === null) return <div className="boot">Loading…</div>
  if (snapshot.phase === 'degraded') return <Diagnostics snapshot={snapshot} />
  return <Wizard snapshot={snapshot} />
}
