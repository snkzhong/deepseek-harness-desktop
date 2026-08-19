import { describe, it, expect } from 'vitest'
import { isChinaTimezone, nodeDistMirrorBases, nodeDistArchiveName } from '../src/main/env/node-resolver'

describe('node-resolver#region detection', () => {
  it('recognizes mainland China timezones (incl. legacy aliases)', () => {
    expect(isChinaTimezone('Asia/Shanghai')).toBe(true)
    expect(isChinaTimezone('Asia/Urumqi')).toBe(true)
    expect(isChinaTimezone('Asia/Chongqing')).toBe(true)
    expect(isChinaTimezone('PRC')).toBe(true)
  })

  it('rejects non-China timezones and undefined', () => {
    expect(isChinaTimezone('Asia/Tokyo')).toBe(false)
    expect(isChinaTimezone('America/New_York')).toBe(false)
    expect(isChinaTimezone('Asia/Hong_Kong')).toBe(false)
    expect(isChinaTimezone(undefined)).toBe(false)
  })
})

describe('node-resolver#mirror ordering', () => {
  it('puts npmmirror first for China users', () => {
    const bases = nodeDistMirrorBases(undefined, true)
    expect(bases[0]).toContain('npmmirror')
    expect(bases).toHaveLength(2)
  })

  it('puts official dist first for global users with mirror fallback', () => {
    const bases = nodeDistMirrorBases(undefined, false)
    expect(bases[0]).toBe('https://nodejs.org/dist')
    expect(bases[1]).toContain('npmmirror')
  })

  it('honors custom mirror first without duplicates', () => {
    const bases = nodeDistMirrorBases('https://mirror.internal/node/')
    expect(bases[0]).toBe('https://mirror.internal/node')
    expect(bases).toHaveLength(3)
    expect(new Set(bases).size).toBe(bases.length)
  })

  it('skips empty custom mirror', () => {
    expect(nodeDistMirrorBases('  ', false)).toHaveLength(2)
  })
})

describe('node-resolver#archive name', () => {
  it('builds platform-correct archive names', () => {
    expect(nodeDistArchiveName('darwin', 'arm64')).toMatch(/^node-v[\d.]+-darwin-arm64\.tar\.gz$/)
    expect(nodeDistArchiveName('win32', 'x64')).toMatch(/^node-v[\d.]+-win-x64\.zip$/)
    expect(nodeDistArchiveName('linux', 'x64')).toMatch(/^node-v[\d.]+-linux-x64\.tar\.gz$/)
  })
})
