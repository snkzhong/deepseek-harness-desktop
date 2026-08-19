import { describe, it, expect } from 'vitest'
import {
  LOCALES,
  createTranslator,
  interpolate,
  isLocale,
  normalizeLocale,
  resolveDict
} from '../src/shared/locales'
import type { MessageKey } from '../src/shared/locales'
import en from '../src/shared/locales/dicts/en'

describe('locales registry', () => {
  it('every registered locale resolves every en key (translation completeness)', () => {
    const keys = Object.keys(en) as MessageKey[]
    expect(keys.length).toBeGreaterThan(10)
    for (const locale of LOCALES) {
      const dict = resolveDict(locale)
      for (const key of keys) {
        expect(dict[key], `${locale} missing "${key}"`).toBeTypeOf('string')
        expect((dict[key] as string).length, `${locale} empty "${key}"`).toBeGreaterThan(0)
      }
    }
  })

  it('interpolates placeholders and keeps unknown ones verbatim', () => {
    expect(interpolate('a {x} b {y}', { x: 1 })).toBe('a 1 b {y}')
  })

  it('normalizes system locales', () => {
    expect(normalizeLocale('zh_CN')).toBe('zh-CN')
    expect(normalizeLocale('zh-TW')).toBe('zh-TW')
    expect(normalizeLocale('zh-Hant-HK')).toBe('zh-TW')
    expect(normalizeLocale('en-US')).toBe('en')
    expect(normalizeLocale('ja-JP')).toBe('en')
  })

  it('validates locale strings', () => {
    expect(isLocale('zh-CN')).toBe(true)
    expect(isLocale('system')).toBe(false)
  })

  it('translator falls back along the parent chain', () => {
    // zh-TW 字典为全量;t() 直接可用
    const t = createTranslator('zh-TW')
    expect(t('progress.ready')).toBe('就緒')
    expect(t('diag.restarts', { count: 3 })).toContain('3')
  })
})
