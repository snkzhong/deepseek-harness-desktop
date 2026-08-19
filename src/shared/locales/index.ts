/**
 * i18n 公共层:注册表 + 回退链 + 插值。
 *
 * 新增语言 = dicts/ 下加一个文件(Record<MessageKey, string>,编译期强制全量)
 *          + 在 REGISTRY 注册一行(声明父语言)。不改任何核心代码。
 */
import en, { type MessageKey } from './dicts/en'
import zhCN from './dicts/zh-CN'
import zhTW from './dicts/zh-TW'

export type Locale = 'en' | 'zh-CN' | 'zh-TW'
export type { MessageKey }
export type LocaleDict = Record<MessageKey, string>

interface RegistryEntry {
  dict: LocaleDict
  /** 父语言(缺 key 时回退);en 为根。 */
  parent: Locale | null
}

const REGISTRY: Record<Locale, RegistryEntry> = {
  en: { dict: en as unknown as LocaleDict, parent: null },
  'zh-CN': { dict: zhCN, parent: 'en' },
  'zh-TW': { dict: zhTW, parent: 'zh-CN' }
}

/** 支持的语言列表(设置界面/语言选择器用)。 */
export const LOCALES: Locale[] = Object.keys(REGISTRY) as Locale[]

export function isLocale(value: string): value is Locale {
  return (LOCALES as string[]).includes(value)
}

/** 沿父链逐级补齐缺失 key(全量字典下是双保险,允许未来 Partial 字典)。 */
export function resolveDict(locale: Locale): LocaleDict {
  const merged: Partial<LocaleDict> = { ...REGISTRY[locale].dict }
  let next = REGISTRY[locale].parent
  while (next !== null) {
    for (const [key, value] of Object.entries(REGISTRY[next].dict) as Array<[MessageKey, string]>) {
      if (merged[key] === undefined) merged[key] = value
    }
    next = REGISTRY[next].parent
  }
  return merged as LocaleDict
}

/**
 * 系统 locale 归一化:zh-Hant/zh-TW/zh-HK → zh-TW,其余 zh* → zh-CN,非中文 → en。
 * 未收录语言(如 ja-JP)回落 en;支持该语言时只需注册字典,此函数无需改动
 * (或扩展为精确前缀映射表)。
 */
export function normalizeLocale(systemLocale: string): Locale {
  const lower = systemLocale.toLowerCase()
  if (lower.startsWith('zh')) {
    if (lower.includes('tw') || lower.includes('hk') || lower.includes('hant')) return 'zh-TW'
    return 'zh-CN'
  }
  const exact = LOCALES.find((locale) => lower === locale.toLowerCase())
  return exact ?? 'en'
}

/** `{placeholder}` 插值;未提供的占位符原样保留(便于发现调用遗漏)。 */
export function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    params[name] !== undefined ? String(params[name]) : match
  )
}

export type Translator = (key: MessageKey, params?: Record<string, string | number>) => string

export function createTranslator(locale: Locale): Translator {
  const dict = resolveDict(locale)
  return (key, params) => (params === undefined ? dict[key] : interpolate(dict[key], params))
}
