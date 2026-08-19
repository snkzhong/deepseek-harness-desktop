import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ShellSettings } from '../../shared/contracts'

const DEFAULTS: ShellSettings = { locale: 'system' }
export function settingsPath(userDataPath: string): string {
  return join(userDataPath, 'settings.json')
}

export function loadSettings(userDataPath: string): ShellSettings {
  const path = settingsPath(userDataPath)
  if (!existsSync(path)) return { ...DEFAULTS }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<ShellSettings>
    return {
      ...DEFAULTS,
      ...raw,
      locale: typeof raw.locale === 'string' ? raw.locale : DEFAULTS.locale
    }
  } catch {
    return { ...DEFAULTS }
  }
}

